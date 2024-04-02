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
  ListAccountsCommand,
  ListDelegatedAdministratorsCommand,
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
  CreateMembersCommand,
  ListMembersCommand,
  DisassociateMembersCommand,
  DeleteMembersCommand,
  DescribeStandardsControlsCommandOutput,
  DescribeStandardsControlsCommand,
  GetEnabledStandardsCommand,
  StandardsStatus,
  DescribeStandardsCommand,
  BatchEnableStandardsCommand,
  BatchDisableStandardsCommand,
  UpdateStandardsControlCommand,
} from '@aws-sdk/client-securityhub';
import { STS } from '@aws-sdk/client-sts';
import { getCredsFromAssumeRole } from '../utils/assume-role';
import { delay, throttlingBackOff } from '../utils/throttle';

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const homeRegion = event.ResourceProperties.region;
  const adminAccountId = event.ResourceProperties.adminAccountId;
  const secHubCrossAccountRoleArn = event.ResourceProperties.role;

  const organizationsClientManagementAccount = new Organizations({ region: 'us-east-1' });
  const securityHubClientManagementAccount = new SecurityHub();

  const stsClient = new STS();
  const creds = await getCredsFromAssumeRole(stsClient, secHubCrossAccountRoleArn, 'EnableSecurityHub');
  const organizationsClientAuditAccount = new Organizations({ region: 'us-east-1', credentials: creds });
  const securityHubClientAuditAccount = new SecurityHub({ credentials: creds });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await enableOrganisationAdmin(securityHubClientManagementAccount, adminAccountId, homeRegion);
      await createFindingAggregator(securityHubClientAuditAccount);
      await createMembers(securityHubClientAuditAccount, organizationsClientAuditAccount);
      await enableStandards(securityHubClientAuditAccount);
      return { Status: 'Success', StatusCode: 200 };
    case 'Delete':
      await disableStandards(securityHubClientAuditAccount);
      await deleteMembers(securityHubClientAuditAccount);
      await deleteFindingAggregator(securityHubClientAuditAccount);
      await disableOrganisationAdmin(securityHubClientManagementAccount, organizationsClientManagementAccount, adminAccountId, homeRegion);
      return { Status: 'Success', StatusCode: 200 };
  }
}

async function enableStandards(securityHubClient: SecurityHub) {
  const foundationalSecurityBestPractices = {
    name: 'AWS Foundational Security Best Practices v1.0.0',
    enable: true,
    controlsToDisable: ['CloudFormation.1', 'S3.11', 'Macie.1', 'EC2.10'],
  };
  const cisAwsFoundationsBenchmark = {
    name: 'CIS AWS Foundations Benchmark v1.2.0',
    enable: false,
    controlsToDisable: [],
  };

  const standardsToEnable: { name: string; enable: boolean; controlsToDisable: string[] | undefined }[] = [];
  standardsToEnable.push(foundationalSecurityBestPractices);
  standardsToEnable.push(cisAwsFoundationsBenchmark);

  // Get AWS defined security standards name and ARN
  const awsSecurityHubStandards: { [name: string]: string }[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() => securityHubClient.send(new DescribeStandardsCommand({ NextToken: nextToken })));
    for (const standard of page.Standards ?? []) {
      if (standard.StandardsArn && standard.Name) {
        const securityHubStandard: { [name: string]: string } = {};
        securityHubStandard[standard.Name] = standard.StandardsArn;
        awsSecurityHubStandards.push(securityHubStandard);
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  const standardsModificationList = await getStandardsModificationList(securityHubClient, standardsToEnable, awsSecurityHubStandards);

  console.log('Enabling Standards');

  // When there are standards to be enable
  if (standardsModificationList.toEnableStandardRequests.length > 0) {
    console.log('To enable:');
    console.log(standardsModificationList.toEnableStandardRequests);
    await throttlingBackOff(() =>
      securityHubClient.send(
        new BatchEnableStandardsCommand({ StandardsSubscriptionRequests: standardsModificationList.toEnableStandardRequests }),
      ),
    );
  }

  // When there are standards to be disable
  if (standardsModificationList.toDisableStandardArns!.length > 0) {
    console.log(`Disabling standard ${standardsModificationList.toDisableStandardArns!}`);
    await throttlingBackOff(() =>
      securityHubClient.send(
        new BatchDisableStandardsCommand({ StandardsSubscriptionArns: standardsModificationList.toDisableStandardArns }),
      ),
    );
  }

  // get list of controls to modify
  const controlsToModify = await getControlArnsToModify(securityHubClient, standardsToEnable, awsSecurityHubStandards);

  // Enable standard controls
  for (const controlArnToModify of controlsToModify.disableStandardControlArns) {
    await throttlingBackOff(() =>
      securityHubClient.send(
        new UpdateStandardsControlCommand({
          StandardsControlArn: controlArnToModify,
          ControlStatus: 'DISABLED',
          DisabledReason: 'Control disabled by superwerker',
        }),
      ),
    );
  }

  // Disable standard controls
  for (const controlArnToModify of controlsToModify.enableStandardControlArns) {
    await throttlingBackOff(() =>
      securityHubClient.send(new UpdateStandardsControlCommand({ StandardsControlArn: controlArnToModify, ControlStatus: 'ENABLED' })),
    );
  }
}

async function disableStandards(securityHubClient: SecurityHub) {
  const existingEnabledStandards = await getExistingEnabledStandards(securityHubClient);
  const subscriptionArns: string[] = [];
  existingEnabledStandards.forEach((standard) => {
    subscriptionArns.push(standard.StandardsSubscriptionArn);
  });

  if (subscriptionArns.length > 0) {
    console.log('Below listed standards disable during delete');
    console.log(subscriptionArns);
    await throttlingBackOff(() =>
      securityHubClient.send(new BatchDisableStandardsCommand({ StandardsSubscriptionArns: subscriptionArns })),
    );
  }
}

async function getExistingEnabledStandards(securityHubClient: SecurityHub) {
  const response = await throttlingBackOff(() => securityHubClient.send(new GetEnabledStandardsCommand({})));

  // Get list of  existing enabled standards within securityhub
  const existingEnabledStandardArns: {
    StandardsArn: string;
    StandardsInput: Record<string, string>;
    StandardsStatus: StandardsStatus;
    StandardsSubscriptionArn: string;
  }[] = [];
  response.StandardsSubscriptions!.forEach((item) => {
    existingEnabledStandardArns.push({
      StandardsArn: item.StandardsArn!,
      StandardsInput: item.StandardsInput!,
      StandardsStatus: item.StandardsStatus!,
      StandardsSubscriptionArn: item.StandardsSubscriptionArn!,
    });
  });

  return existingEnabledStandardArns;
}

/**
 * Function to provide list of control arns for standards to be enable or disable
 * @param securityHubClient
 * @param standardsToEnable
 * @param awsSecurityHubStandards
 */
async function getControlArnsToModify(
  securityHubClient: SecurityHub,
  standardsToEnable: { name: string; enable: boolean; controlsToDisable: string[] | undefined }[],
  awsSecurityHubStandards: { [name: string]: string }[],
): Promise<{ disableStandardControlArns: string[]; enableStandardControlArns: string[] }> {
  const existingEnabledStandards = await getExistingEnabledStandards(securityHubClient);
  const disableStandardControls: string[] = [];
  const enableStandardControls: string[] = [];

  let nextToken: string | undefined = undefined;
  for (const inputStandard of standardsToEnable) {
    console.log(`inputStandard: ${JSON.stringify(inputStandard)}`);
    if (inputStandard.enable) {
      for (const awsSecurityHubStandard of awsSecurityHubStandards) {
        if (awsSecurityHubStandard[inputStandard.name]) {
          console.log(`Standard Name: ${awsSecurityHubStandard[inputStandard.name]}`);
          const existingEnabledStandard = existingEnabledStandards.find(
            (item) => item.StandardsArn === awsSecurityHubStandard[inputStandard.name],
          );
          if (existingEnabledStandard) {
            console.log(`Getting controls for ${existingEnabledStandard?.StandardsSubscriptionArn} subscription`);

            const standardsControl = [];

            do {
              const page = await getDescribeStandardsControls(
                securityHubClient,
                existingEnabledStandard?.StandardsSubscriptionArn,
                nextToken,
              );
              for (const control of page.Controls ?? []) {
                standardsControl.push(control);
              }
              nextToken = page.NextToken;
            } while (nextToken);

            while (standardsControl.length === 0) {
              console.warn(`Delaying standard control retrieval by 10000 ms for ${existingEnabledStandard?.StandardsSubscriptionArn}`);
              await delay(10000);
              console.warn(`Rechecking - Getting controls for ${existingEnabledStandard?.StandardsSubscriptionArn}`);
              nextToken = undefined;
              do {
                const page = await getDescribeStandardsControls(
                  securityHubClient,
                  existingEnabledStandard?.StandardsSubscriptionArn,
                  nextToken,
                );
                for (const control of page.Controls ?? []) {
                  standardsControl.push(control);
                }
                nextToken = page.NextToken;
              } while (nextToken);
            }

            console.log(`When control list available for ${existingEnabledStandard?.StandardsSubscriptionArn}`);
            console.log(standardsControl);

            for (const control of standardsControl) {
              if (inputStandard.controlsToDisable?.includes(control.ControlId!)) {
                console.log(control.ControlId!);
                disableStandardControls.push(control.StandardsControlArn!);
              } else {
                if (control.ControlStatus == 'DISABLED') {
                  console.log('following is disabled need to be enable now');
                  console.log(control.ControlId!);
                  enableStandardControls.push(control.StandardsControlArn!);
                }
              }
            }
          }
        }
      }
    }
  }

  return { disableStandardControlArns: disableStandardControls, enableStandardControlArns: enableStandardControls };
}

/**
 * Function to be executed before event specific action starts, this function makes the list of standards to enable or disable based on the input
 * @param securityHubClient
 * @param standardsToEnable
 * @param awsSecurityHubStandards
 */
async function getStandardsModificationList(
  securityHubClient: SecurityHub,
  standardsToEnable: { name: string; enable: boolean; controlsToDisable: string[] | undefined }[],
  awsSecurityHubStandards: { [name: string]: string }[],
) {
  const existingEnabledStandards = await getExistingEnabledStandards(securityHubClient);
  const toEnableStandardRequests = [];
  const toDisableStandardArns: string[] | undefined = [];

  // if no standard provided to enable, then disable all existing enabled standards
  if (!standardsToEnable || standardsToEnable.length === 0) {
    for (const existingEnabledStandard of existingEnabledStandards) {
      toDisableStandardArns.push(existingEnabledStandard?.StandardsSubscriptionArn);
    }
  }

  // for each standard to enable, check if it is already enabled, if not then add it to enable list, else to disable list
  for (const inputStandard of standardsToEnable) {
    if (inputStandard.enable) {
      for (const awsSecurityHubStandard of awsSecurityHubStandards) {
        if (awsSecurityHubStandard[inputStandard.name]) {
          const existingEnabledStandard = existingEnabledStandards.filter(
            (item) => item.StandardsArn === awsSecurityHubStandard[inputStandard.name],
          );
          if (existingEnabledStandard.length === 0) {
            toEnableStandardRequests.push({ StandardsArn: awsSecurityHubStandard[inputStandard.name] });
          }
        }
      }
    } else {
      for (const awsSecurityHubStandard of awsSecurityHubStandards) {
        if (awsSecurityHubStandard[inputStandard.name]) {
          const existingEnabledStandard = existingEnabledStandards.find(
            (item) => item.StandardsArn === awsSecurityHubStandard[inputStandard.name],
          );

          if (existingEnabledStandard) {
            toDisableStandardArns.push(existingEnabledStandard?.StandardsSubscriptionArn);
          }
        }
      }
    }
  }

  return { toEnableStandardRequests: toEnableStandardRequests, toDisableStandardArns: toDisableStandardArns };
}

async function getDescribeStandardsControls(
  securityHubClient: SecurityHub,
  standardsSubscriptionArn: string,
  nextToken?: string,
): Promise<DescribeStandardsControlsCommandOutput> {
  return throttlingBackOff(() =>
    securityHubClient.send(
      new DescribeStandardsControlsCommand({ StandardsSubscriptionArn: standardsSubscriptionArn, NextToken: nextToken }),
    ),
  );
}

async function createMembers(securityHubClient: SecurityHub, organizationsClient: Organizations) {
  const allAccounts: { AccountId: string; Email: string | undefined }[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() => organizationsClient.send(new ListAccountsCommand({ NextToken: nextToken })));
    for (const account of page.Accounts ?? []) {
      if (account.Status === 'ACTIVE') {
        allAccounts.push({ AccountId: account.Id!, Email: account.Email });
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  console.log('Create Security Hub Members');

  // initally invite all accounts to be members
  await throttlingBackOff(() => securityHubClient.send(new CreateMembersCommand({ AccountDetails: allAccounts })));

  // for all accounts that are added later automatically enable security hub for them
  await throttlingBackOff(() => securityHubClient.send(new UpdateOrganizationConfigurationCommand({ AutoEnable: true })));
}

async function deleteMembers(securityHubClient: SecurityHub) {
  const existingMemberAccountIds: string[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() => securityHubClient.send(new ListMembersCommand({ NextToken: nextToken })));
    for (const member of page.Members ?? []) {
      console.log(member);
      existingMemberAccountIds.push(member.AccountId!);
    }
    nextToken = page.NextToken;
  } while (nextToken);

  if (existingMemberAccountIds.length > 0) {
    console.log('Disassociate & Delete Security Hub Members');
    await throttlingBackOff(() => securityHubClient.send(new DisassociateMembersCommand({ AccountIds: existingMemberAccountIds })));

    await throttlingBackOff(() => securityHubClient.send(new DeleteMembersCommand({ AccountIds: existingMemberAccountIds })));
  }
}

async function createFindingAggregator(securityHubClient: SecurityHub) {
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
