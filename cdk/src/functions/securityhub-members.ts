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

import { ListAccountsCommand, Organizations } from '@aws-sdk/client-organizations';
import {
  SecurityHub,
  CreateMembersCommand,
  UpdateOrganizationConfigurationCommand,
  ListMembersCommand,
  DeleteMembersCommand,
  DisassociateMembersCommand,
} from '@aws-sdk/client-securityhub';
import { STS } from '@aws-sdk/client-sts';
import { getCredsFromAssumeRole } from '../utils/assume-role';
import { throttlingBackOff } from '../utils/throttle';

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const region = event.ResourceProperties.region;
  const secHubCrossAccountRoleArn = event.ResourceProperties.role;

  const stsClient = new STS();
  const creds = await getCredsFromAssumeRole(stsClient, secHubCrossAccountRoleArn, 'SecurityHubMembers');
  const securityHubClient = new SecurityHub({
    credentials: creds,
    region: region,
  });
  const organizationsClient = new Organizations({ credentials: creds, region: 'us-east-1' });

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

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('Create Security Hub Members');

      // initally invite all accounts to be members
      await throttlingBackOff(() => securityHubClient.send(new CreateMembersCommand({ AccountDetails: allAccounts })));

      // for all accounts that are added later automatically enable security hub for them
      await throttlingBackOff(() => securityHubClient.send(new UpdateOrganizationConfigurationCommand({ AutoEnable: true })));

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const existingMemberAccountIds: string[] = [];
      do {
        const page = await throttlingBackOff(() => securityHubClient.send(new ListMembersCommand({ NextToken: nextToken })));
        for (const member of page.Members ?? []) {
          console.log(member);
          existingMemberAccountIds.push(member.AccountId!);
        }
        nextToken = page.NextToken;
      } while (nextToken);

      if (existingMemberAccountIds.length > 0) {
        await throttlingBackOff(() => securityHubClient.send(new DisassociateMembersCommand({ AccountIds: existingMemberAccountIds })));

        await throttlingBackOff(() => securityHubClient.send(new DeleteMembersCommand({ AccountIds: existingMemberAccountIds })));
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}
