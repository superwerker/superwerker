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
  SecurityHub,
  CreateFindingAggregatorCommand,
  ListFindingAggregatorsCommand,
  UpdateFindingAggregatorCommand,
  DeleteFindingAggregatorCommand,
  ResourceConflictException,
  EnableSecurityHubCommand,
  ListOrganizationAdminAccountsCommand,
  EnableOrganizationAdminAccountCommand,
  DisableOrganizationAdminAccountCommand,
  UpdateOrganizationConfigurationCommand,
  DescribeOrganizationConfigurationCommand,
  ListConfigurationPoliciesCommand,
  UpdateConfigurationPolicyCommandInput,
  UpdateConfigurationPolicyCommand,
  CreateConfigurationPolicyCommand,
  DeleteConfigurationPolicyCommand,
  StartConfigurationPolicyAssociationCommand,
  StartConfigurationPolicyDisassociationCommand,
} from '@aws-sdk/client-securityhub';
import { STS } from '@aws-sdk/client-sts';
import { getCredsFromAssumeRole } from '../utils/assume-role';
import { delay, throttlingBackOff } from '../utils/throttle';

const SUPERWERKER_CONFIGRUATION_POLICY_NAME = 'superwerker-securityhub-configuration';

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const homeRegion = event.ResourceProperties.region;
  const adminAccountId = event.ResourceProperties.adminAccountId;
  const secHubCrossAccountRoleArn = event.ResourceProperties.role;
  const ctGovernedRegions = event.ResourceProperties.ctGovernedRegions;
  console.log('event:', event);
  const additionalAggregationRegions = getAdditionalRegions(ctGovernedRegions, homeRegion);

  const organizationsClientManagementAccount = new Organizations({ region: 'us-east-1' });
  const securityHubClientManagementAccount = new SecurityHub();

  const stsClient = new STS();
  const creds = await getCredsFromAssumeRole(stsClient, secHubCrossAccountRoleArn, 'EnableSecurityHub');
  const organizationsClientAuditAccount = new Organizations({ region: 'us-east-1', credentials: creds });
  const securityHubClientAuditAccount = new SecurityHub({ credentials: creds });

  switch (event.RequestType) {
    case 'Create':
      await enableOrganisationAdmin(securityHubClientManagementAccount, adminAccountId, homeRegion);
      await createFindingAggregator(securityHubClientAuditAccount, additionalAggregationRegions);
      await enableCentralOrganizationConfiguration(securityHubClientAuditAccount);
      await createConfigurationPolicy(securityHubClientAuditAccount, homeRegion);
      await startConfigurationPolicyAssociation(securityHubClientAuditAccount, organizationsClientAuditAccount);
      return { Status: 'Success', StatusCode: 200 };
    case 'Update':
      // Updating some parts requires to delete and recreate configuration parts and brings LOTS of complexity with it
      // e.g. changing aggregation regions requires to disable central configuration first, this however..
      // requires to dissociate all polcies and delete all configuration first and afterwards re-create/associate everything again
      console.log('Do nothing on update');
      return { Status: 'Success', StatusCode: 200 };
    case 'Delete':
      await startConfigurationPolicyDissociation(securityHubClientAuditAccount, organizationsClientAuditAccount);
      await deleteConfigurationPolicy(securityHubClientAuditAccount);
      await disableCentralOrganizationConfiguration(securityHubClientAuditAccount);
      await deleteFindingAggregator(securityHubClientAuditAccount);
      await disableOrganisationAdmin(securityHubClientManagementAccount, organizationsClientManagementAccount, adminAccountId, homeRegion);
      return { Status: 'Success', StatusCode: 200 };
  }
}

function getAdditionalRegions(ctGovernedRegions: string[], homeRegion: string): string[] {
  let additionalRegions: string[] = ctGovernedRegions;
  if (ctGovernedRegions.length < 1) {
    throw new Error('Governed regions cannot be empty, must at least include home region');
  }

  if (ctGovernedRegions[0] !== homeRegion) {
    throw new Error('Governed regions must include home region as first region');
  }

  if (ctGovernedRegions.length === 1) {
    return [];
  }

  // remove first item in array (home region)
  additionalRegions.shift();
  return additionalRegions;
}

async function startConfigurationPolicyAssociation(securityHubClient: SecurityHub, organizationsClient: Organizations) {
  const rootId = await getOrganisationRoot(organizationsClient);

  const listPoliciesResult = await throttlingBackOff(() => securityHubClient.send(new ListConfigurationPoliciesCommand({})));

  let superwerkerConfigurationPolicyId = '';
  if (listPoliciesResult.ConfigurationPolicySummaries!.length > 0) {
    console.log('List of policies:', listPoliciesResult.ConfigurationPolicySummaries);
    for (const policy of listPoliciesResult.ConfigurationPolicySummaries!) {
      if (policy.Name === SUPERWERKER_CONFIGRUATION_POLICY_NAME) {
        superwerkerConfigurationPolicyId = policy.Id!;
      }
    }
  }

  if (superwerkerConfigurationPolicyId === '') {
    throw new Error('Cannot associate configuration policy, superwerker configuration policy not found');
  }

  console.log('Associate superwerker configuration policy');
  try {
    await throttlingBackOff(() =>
      securityHubClient.send(
        new StartConfigurationPolicyAssociationCommand({
          ConfigurationPolicyIdentifier: superwerkerConfigurationPolicyId,
          Target: {
            RootId: rootId,
          },
        }),
      ),
    );
    // TODO if Suspended OU exists then set to SELF_MANAGED_SECURITY_HUB?
  } catch (error) {
    console.log(error);
    throw new Error('Failed to associate configuration policy: ' + error);
  }
}

async function startConfigurationPolicyDissociation(securityHubClient: SecurityHub, organizationsClient: Organizations) {
  const rootId = await getOrganisationRoot(organizationsClient);

  const listPoliciesResult = await throttlingBackOff(() => securityHubClient.send(new ListConfigurationPoliciesCommand({})));

  let superwerkerConfigurationPolicyId = '';
  if (listPoliciesResult.ConfigurationPolicySummaries!.length > 0) {
    console.log('List of policies:', listPoliciesResult.ConfigurationPolicySummaries);
    for (const policy of listPoliciesResult.ConfigurationPolicySummaries!) {
      if (policy.Name === SUPERWERKER_CONFIGRUATION_POLICY_NAME) {
        superwerkerConfigurationPolicyId = policy.Id!;
      }
    }
  }

  console.log('Dissasociate configuration policy', superwerkerConfigurationPolicyId);
  if (superwerkerConfigurationPolicyId) {
    try {
      await throttlingBackOff(() =>
        securityHubClient.send(
          new StartConfigurationPolicyDisassociationCommand({
            ConfigurationPolicyIdentifier: superwerkerConfigurationPolicyId,
            Target: {
              RootId: rootId,
            },
          }),
        ),
      );
    } catch (error) {
      throw new Error('Failed to dissasociate configuration policy: ' + error);
    }
  } else {
    console.log('No configuration policy found, nothing to dissasociate');
    return;
  }
}

async function createConfigurationPolicy(securityHubClient: SecurityHub, region: string) {
  const enabledStandardIdentifiers = [`arn:aws:securityhub:${region}::standards/aws-foundational-security-best-practices/v/1.0.0`];

  const superwerkerConfigruationPolicy = {
    Name: SUPERWERKER_CONFIGRUATION_POLICY_NAME,
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
  const listPoliciesResult = await throttlingBackOff(() => securityHubClient.send(new ListConfigurationPoliciesCommand({})));

  let superwerkerConfigurationPolicyId = '';
  if (listPoliciesResult.ConfigurationPolicySummaries!.length > 0) {
    console.log('List of policies:', listPoliciesResult.ConfigurationPolicySummaries);
    for (const policy of listPoliciesResult.ConfigurationPolicySummaries!) {
      if (policy.Name === SUPERWERKER_CONFIGRUATION_POLICY_NAME) {
        superwerkerConfigurationPolicyId = policy.Id!;
      }
    }
  }

  if (superwerkerConfigurationPolicyId) {
    console.log('Existing configuration policy found, updating policy', superwerkerConfigurationPolicyId);
    try {
      let superwerkerConfigruationPolicyUpdate: UpdateConfigurationPolicyCommandInput = {
        ...superwerkerConfigruationPolicy,
        Identifier: superwerkerConfigurationPolicyId,
      };
      await throttlingBackOff(() => securityHubClient.send(new UpdateConfigurationPolicyCommand(superwerkerConfigruationPolicyUpdate)));
    } catch (error) {
      console.log(error);
      throw new Error('Failed to update Security Hub configuration policy: ' + error);
    }
    return;
  }

  console.log('Create new configuration policy');
  try {
    await throttlingBackOff(() => securityHubClient.send(new CreateConfigurationPolicyCommand(superwerkerConfigruationPolicy)));
  } catch (error) {
    console.log(error);
    throw new Error('Failed to create Security Hub configuration policy: ' + error);
  }
}

async function deleteConfigurationPolicy(securityHubClient: SecurityHub) {
  const listPoliciesResult = await throttlingBackOff(() => securityHubClient.send(new ListConfigurationPoliciesCommand({})));

  let superwerkerConfigurationPolicyId = '';
  if (listPoliciesResult.ConfigurationPolicySummaries!.length > 0) {
    console.log('List of policies:', listPoliciesResult.ConfigurationPolicySummaries);
    for (const policy of listPoliciesResult.ConfigurationPolicySummaries!) {
      if (policy.Name === SUPERWERKER_CONFIGRUATION_POLICY_NAME) {
        superwerkerConfigurationPolicyId = policy.Id!;
      }
    }
  }

  console.log('Delete configuration policy', superwerkerConfigurationPolicyId);
  if (superwerkerConfigurationPolicyId) {
    try {
      await throttlingBackOff(() =>
        securityHubClient.send(new DeleteConfigurationPolicyCommand({ Identifier: superwerkerConfigurationPolicyId })),
      );
    } catch (error) {
      throw new Error('Failed to delete Security Hub configuration policy: ' + error);
    }
  } else {
    console.log('No configuration policy found, nothing to delete');
  }
}

async function enableCentralOrganizationConfiguration(securityHubClient: SecurityHub) {
  console.log('Update Security Hub Organization Configuration to CENTRAL');

  // The API is a bit flaky and sometimes works after multiple retries
  // API returns 200 even if the configuration is not updated
  // So we need to check the configuration after the update
  let counter = 0;
  while (counter < 5) {
    const respone = await throttlingBackOff(() =>
      securityHubClient.send(
        new UpdateOrganizationConfigurationCommand({
          AutoEnable: false,
          AutoEnableStandards: 'NONE',
          OrganizationConfiguration: { ConfigurationType: 'CENTRAL' },
        }),
      ),
    );
    console.log(respone);
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const organsiationConfig = await throttlingBackOff(() => securityHubClient.send(new DescribeOrganizationConfigurationCommand()));
    if (organsiationConfig.OrganizationConfiguration?.ConfigurationType === 'CENTRAL') {
      return;
    }

    counter++;
  }
  throw new Error('Failed to update Security Hub Organization Configuration to CENTRAL');
}

async function disableCentralOrganizationConfiguration(securityHubClient: SecurityHub) {
  console.log('Resetting Security Hub Organization Configuration to LOCAL');
  try {
    await throttlingBackOff(() =>
      securityHubClient.send(
        new UpdateOrganizationConfigurationCommand({
          AutoEnable: false,
          AutoEnableStandards: 'NONE',
          OrganizationConfiguration: { ConfigurationType: 'LOCAL' },
        }),
      ),
    );
  } catch (error) {
    throw new Error('Failed to reset Security Hub Organization Configuration to LOCAL: ' + error);
  }
}

async function createFindingAggregator(securityHubClient: SecurityHub, regions: string[]) {
  // if (regions.length < 1) {
  //   console.log('No regions to aggregate findings, skipping');
  //   return;
  // }

  const result = await throttlingBackOff(() => securityHubClient.send(new ListFindingAggregatorsCommand({})));
  let findingAggregatorArn = '';
  if (result.FindingAggregators!.length > 0) {
    findingAggregatorArn = result.FindingAggregators![0].FindingAggregatorArn!;
  }

  if (findingAggregatorArn) {
    console.log('Existing Finding Aggregator found, updating', findingAggregatorArn);
    try {
      await throttlingBackOff(() =>
        securityHubClient.send(
          new UpdateFindingAggregatorCommand({
            FindingAggregatorArn: findingAggregatorArn,
            RegionLinkingMode: 'ALL_REGIONS',
          }),
        ),
      );
    } catch (error) {
      console.log(error);
      throw new Error('Failed to update Finding Aggregator: ' + error);
    }
    return;
  }

  console.log('Create new Finding Aggreggation');
  try {
    await throttlingBackOff(() => securityHubClient.send(new CreateFindingAggregatorCommand({ RegionLinkingMode: 'ALL_REGIONS' })));
  } catch (error) {
    console.log(error);
    throw new Error('Failed to create Finding Aggregator: ' + error);
  }
}

async function deleteFindingAggregator(securityHubClient: SecurityHub) {
  const result = await throttlingBackOff(() => securityHubClient.send(new ListFindingAggregatorsCommand({})));

  let findingAggregatorArn = '';
  if (result.FindingAggregators!.length > 0) {
    findingAggregatorArn = result.FindingAggregators![0].FindingAggregatorArn!;
  }

  console.log('Delete Finding Aggregator Arn');
  if (findingAggregatorArn) {
    try {
      await throttlingBackOff(() =>
        securityHubClient.send(new DeleteFindingAggregatorCommand({ FindingAggregatorArn: findingAggregatorArn })),
      );
    } catch (error) {
      throw new Error('Failed to delete Finding Aggregator: ' + error);
    }
  } else {
    console.log('No Finding Aggregator found, nothing to delete');
  }
}

async function enableOrganisationAdmin(securityHubClient: SecurityHub, adminAccountId: string, region: string) {
  const securityHubAdminAccount = await getSecurityHubDelegatedAccount(securityHubClient, adminAccountId);

  if (securityHubAdminAccount.status) {
    if (securityHubAdminAccount.accountId === adminAccountId) {
      console.log(
        `SecurityHub admin account ${securityHubAdminAccount.accountId} is already an admin account as status is ${securityHubAdminAccount.status}, in ${region} region. No action needed`,
      );
    } else {
      throw new Error(
        `SecurityHub delegated admin is already set to ${securityHubAdminAccount.accountId} account can not assign another delegated account`,
      );
    }
    return;
  }

  // Enable security hub in management account before creating delegation admin account
  await enableSecurityHub(securityHubClient);
  console.log(`Started enableOrganizationAdminAccount in ${region} region for account ${adminAccountId}`);
  let retries = 0;
  while (retries < 10) {
    await delay(retries ** 2 * 1000);
    try {
      await throttlingBackOff(() => securityHubClient.send(new EnableOrganizationAdminAccountCommand({ AdminAccountId: adminAccountId })));
      break;
    } catch (error) {
      console.log(error);
      retries = retries + 1;
    }
  }
}

async function disableOrganisationAdmin(
  securityHubClient: SecurityHub,
  organizationsClient: Organizations,
  adminAccountId: string,
  region: string,
) {
  const securityHubAdminAccount = await getSecurityHubDelegatedAccount(securityHubClient, adminAccountId);
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
    console.info(`SecurityHub delegation is not configured for account ${securityHubAdminAccount.accountId}, no action performed`);
  }
}

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
      console.info('SecurityHub already enabled, nothing to do');
      return;
    }
    throw new Error(`Enabling SecurityHub failed: ${e}`);
  }
}

async function getOrganisationRoot(organizationsClient: Organizations) {
  const response = await organizationsClient.send(new ListRootsCommand({}));
  if (response.Roots) {
    return response.Roots[0].Id!;
  }
  throw new Error('No root found in organization');
}
