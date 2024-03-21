/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import {
  DeregisterDelegatedAdministratorCommand,
  EnableAWSServiceAccessCommandOutput,
  ListDelegatedAdministratorsCommand,
  ListRootsCommand,
  Organizations,
} from '@aws-sdk/client-organizations';
import {
  CreateConfigurationPolicyCommand,
  DisableOrganizationAdminAccountCommand,
  EnableOrganizationAdminAccountCommand,
  EnableSecurityHubCommand,
  ListOrganizationAdminAccountsCommand,
  ResourceConflictException,
  SecurityHub,
  StartConfigurationPolicyAssociationCommand,
  UpdateOrganizationConfigurationCommand,
} from '@aws-sdk/client-securityhub';
import { delay, throttlingBackOff } from '../utils/throttle';

// Precondition: config must be enabled in all accounts > done by Control Tower?
// Security Hub with Central Configuration
// https://docs.aws.amazon.com/securityhub/latest/userguide/central-configuration-intro.html
// Steps
// 0. Enable security hub in management account
// https://docs.aws.amazon.com/cli/latest/reference/securityhub/enable-security-hub.html
// 1. Enable delegated security admin in audit account
// https://docs.aws.amazon.com/cli/latest/reference/securityhub/enable-organization-admin-account.html

// EVERYTHING BELOW CAN ONLY BE DONE IN DELEGATED ADMIN ACCOUNT
// 2. Update organisation configuration to CENTRAL
// https://docs.aws.amazon.com/cli/latest/reference/securityhub/update-organization-configuration.html

// 3. Create SecHub Configuration Policy for Organization
// https://docs.aws.amazon.com/cli/latest/reference/securityhub/create-configuration-policy.html

// 4. Start SecHub Configuration Association with Organization root
// https://docs.aws.amazon.com/cli/latest/reference/securityhub/start-configuration-policy-association.html

// TODO Use regions from control tower ssm parameter, only enable AWS Foundational Security Best Practices

// Reverse Steps for Delete
// Dissociate SecHub Configuration Policy from Organization root
// Delete SecHub Configuration Policy
// Set organization configuration to LOCAL
// Disable delegated security admin in audit account

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const region = event.ResourceProperties.region;
  const adminAccountId = event.ResourceProperties.adminAccountId;

  const organizationsClient = new Organizations({ region: 'us-east-1' });
  const securityHubClient = new SecurityHub({ region: region });

  const rootId = await getOrganisationRoot(organizationsClient);
  const securityHubAdminAccount = await getSecurityHubDelegatedAccount(securityHubClient, adminAccountId);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await enableOrganizationAdminAccount(securityHubClient, event.ResourceProperties.region, adminAccountId, securityHubAdminAccount);
      await enableCentralConfiguration(securityHubClient);
      await createSecurityHubConfiguration(securityHubClient, rootId, region);
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      await disableCentralConfiguration(securityHubClient);
      await disableOrganizationAdminAccount(
        organizationsClient,
        securityHubClient,
        event.ResourceProperties.region,
        adminAccountId,
        securityHubAdminAccount,
      );
      return { Status: 'Success', StatusCode: 200 };
  }
}

async function enableOrganizationAdminAccount(
  securityHubClient: SecurityHub,
  region: string,
  adminAccountId: string,
  securityHubAdminAccount: { accountId: string | undefined; status: string | undefined },
): Promise<void> {
  if (securityHubAdminAccount.status) {
    if (securityHubAdminAccount.accountId === adminAccountId) {
      console.warn(
        `SecurityHub admin account ${securityHubAdminAccount.accountId} is already an admin account as status is ${securityHubAdminAccount.status}, in ${region} region. No action needed`,
      );
    } else {
      console.warn(
        `SecurityHub delegated admin is already set to ${securityHubAdminAccount.accountId} account can not assign another delegated account`,
      );
    }
  } else {
    // Enable security hub in management account before creating delegation admin account
    await enableSecurityHub(securityHubClient);
    console.log(`Started enableOrganizationAdminAccount function in ${region} region for account ${adminAccountId}`);
    let retries = 0;
    while (retries < 10) {
      await delay(retries ** 2 * 1000);
      try {
        await throttlingBackOff(() =>
          securityHubClient.send(new EnableOrganizationAdminAccountCommand({ AdminAccountId: adminAccountId })),
        );
        break;
      } catch (error) {
        console.log(error);
        retries = retries + 1;
      }
    }
  }
}

async function disableOrganizationAdminAccount(
  organizationsClient: Organizations,
  securityHubClient: SecurityHub,
  region: string,
  adminAccountId: string,
  securityHubAdminAccount: { accountId: string | undefined; status: string | undefined },
): Promise<void> {
  if (securityHubAdminAccount.accountId) {
    if (securityHubAdminAccount.accountId === adminAccountId) {
      console.log(`Started disableOrganizationAdminAccount function in ${region} region for account ${adminAccountId}`);
      await throttlingBackOff(() => securityHubClient.send(new DisableOrganizationAdminAccountCommand({ AdminAccountId: adminAccountId })));
      const response = await throttlingBackOff(() =>
        organizationsClient.send(new ListDelegatedAdministratorsCommand({ ServicePrincipal: 'securityhub.amazonaws.com' })),
      );

      if (response.DelegatedAdministrators!.length > 0) {
        console.log(`Started deregisterDelegatedAdministrator function in ${region} region for account ${adminAccountId}`);
        await throttlingBackOff(() =>
          organizationsClient.send(
            new DeregisterDelegatedAdministratorCommand({ AccountId: adminAccountId, ServicePrincipal: 'securityhub.amazonaws.com' }),
          ),
        );
      } else {
        console.warn(`Account ${securityHubAdminAccount.accountId} is not registered as delegated administrator account`);
      }
    }
  } else {
    console.warn(`SecurityHub delegation is not configured for account ${securityHubAdminAccount.accountId}, no action performed`);
  }
}

async function enableCentralConfiguration(securityHubClient: SecurityHub): Promise<void> {
  await securityHubClient.send(
    new UpdateOrganizationConfigurationCommand({
      AutoEnable: false,
      AutoEnableStandards: 'NONE',
      OrganizationConfiguration: { ConfigurationType: 'CENTRAL' },
    }),
  );
}

async function disableCentralConfiguration(securityHubClient: SecurityHub): Promise<void> {
  await securityHubClient.send(
    new UpdateOrganizationConfigurationCommand({
      AutoEnable: false,
      AutoEnableStandards: 'NONE',
      OrganizationConfiguration: { ConfigurationType: 'LOCAL' },
    }),
  );
}

async function createSecurityHubConfiguration(securityHubClient: SecurityHub, rootId: string, region: string): Promise<void> {
  const enabledStandardIdentifiers = [`arn:aws:securityhub:${region}::standards/aws-foundational-security-best-practices/v/1.0.0`];
  const input = {
    Name: 'superwerker-securityhub-configuration',
    Description: 'superwerker securityhub configuration policy applied to all accounts in organisation',
    ConfigurationPolicy: {
      SecurityHub: {
        ServiceEnabled: true,
        EnabledStandardIdentifiers: enabledStandardIdentifiers,
        SecurityControlsConfiguration: {
          DisabledSecurityControlIdentifiers: [
            // all controls are enabled except the following
            'CloudFormation.1',
            'S3.11',
            'Macie.1',
            'EC2.10',
          ],
        },
      },
    },
    Tags: {
      Name: 'superwerker',
    },
  };
  const command = new CreateConfigurationPolicyCommand(input);
  const respone = await securityHubClient.send(command);

  const policyId = respone.Id;

  // The StartConfigurationPolicyAssociation API returns a field called AssociationStatus.
  // This field tells you whether a policy association is pending or in a state of success or failure.
  // It can take up to 24 hours for the status to change from PENDING to SUCCESS or FAILURE
  const policyAssociationResponse = await securityHubClient.send(
    new StartConfigurationPolicyAssociationCommand({
      ConfigurationPolicyIdentifier: policyId,
      Target: {
        RootId: rootId,
      },
    }),
  );
}

async function deleteSecurityHubConfiguration(securityHubClient: SecurityHub, rootId: string, region: string): Promise<void> {
  const enabledStandardIdentifiers = [`arn:aws:securityhub:${region}::standards/aws-foundational-security-best-practices/v/1.0.0`];
  const input = {
    Name: 'superwerker-securityhub-configuration',
    Description: 'superwerker securityhub configuration policy applied to all accounts in organisation',
    ConfigurationPolicy: {
      SecurityHub: {
        ServiceEnabled: true,
        EnabledStandardIdentifiers: enabledStandardIdentifiers,
        SecurityControlsConfiguration: {
          DisabledSecurityControlIdentifiers: [
            // all controls are enabled except the following
            'CloudFormation.1',
            'S3.11',
            'Macie.1',
            'EC2.10',
          ],
        },
      },
    },
    Tags: {
      Name: 'superwerker',
    },
  };
  const command = new CreateConfigurationPolicyCommand(input);
  const respone = await securityHubClient.send(command);

  const policyId = respone.Id;

  // The StartConfigurationPolicyAssociation API returns a field called AssociationStatus.
  // This field tells you whether a policy association is pending or in a state of success or failure.
  // It can take up to 24 hours for the status to change from PENDING to SUCCESS or FAILURE
  const policyAssociationResponse = await securityHubClient.send(
    new StartConfigurationPolicyAssociationCommand({
      ConfigurationPolicyIdentifier: policyId,
      Target: {
        RootId: rootId,
      },
    }),
  );
}

/**
 * Find SecurityHub delegated account Id
 * @param securityHubClient
 * @param adminAccountId
 */
async function getSecurityHubDelegatedAccount(
  securityHubClient: SecurityHub,
  adminAccountId: string,
): Promise<{ accountId: string | undefined; status: string | undefined }> {
  const adminAccounts = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() => securityHubClient.send(new ListOrganizationAdminAccountsCommand({ NextToken: nextToken })));
    for (const account of page.AdminAccounts ?? []) {
      adminAccounts.push(account);
    }
    nextToken = page.NextToken;
  } while (nextToken);

  if (adminAccounts.length === 0) {
    return { accountId: undefined, status: undefined };
  }
  if (adminAccounts.length > 1) {
    throw new Error('Multiple admin accounts for SecurityHub in organization');
  }

  if (adminAccounts[0].AccountId === adminAccountId && adminAccounts[0].Status === 'DISABLE_IN_PROGRESS') {
    throw new Error(`Admin account ${adminAccounts[0].AccountId} is in ${adminAccounts[0].Status}`);
  }

  return { accountId: adminAccounts[0].AccountId, status: adminAccounts[0].Status };
}

async function enableSecurityHub(securityHubClient: SecurityHub): Promise<EnableAWSServiceAccessCommandOutput | undefined> {
  try {
    return await throttlingBackOff(() => securityHubClient.send(new EnableSecurityHubCommand({ EnableDefaultStandards: false })));
  } catch (e) {
    if (e instanceof ResourceConflictException) {
      console.warn(e.name + ': ' + e.message);
      return;
    }
    throw new Error(`SecurityHub enable issue error message - ${e}`);
  }
}

async function getOrganisationRoot(organizationsClient: Organizations): Promise<string> {
  const response = await organizationsClient.send(new ListRootsCommand({}));
  if (response.Roots) {
    return response.Roots[0].Id!;
  }
  throw new Error('No root found in organization');
}
