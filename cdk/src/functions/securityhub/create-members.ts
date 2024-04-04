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

import { ListAccountsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import {
  CreateMembersCommand,
  DeleteMembersCommand,
  DisassociateMembersCommand,
  ListMembersCommand,
  SecurityHubClient,
  UpdateOrganizationConfigurationCommand,
} from '@aws-sdk/client-securityhub';
import { throttlingBackOff } from '../utils/throttle';

export class SecurityHubMemberMgmt {
  organizationsClient: OrganizationsClient;
  securityHubClient: SecurityHubClient;

  constructor(organizationsClientAuditAccount: OrganizationsClient, securityHubClientAuditAccount: SecurityHubClient) {
    this.organizationsClient = organizationsClientAuditAccount;
    this.securityHubClient = securityHubClientAuditAccount;
  }

  async createMembers() {
    const allAccounts: { AccountId: string; Email: string | undefined }[] = [];
    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() => this.organizationsClient.send(new ListAccountsCommand({ NextToken: nextToken })));
      for (const account of page.Accounts ?? []) {
        if (account.Status === 'ACTIVE') {
          allAccounts.push({ AccountId: account.Id!, Email: account.Email });
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);

    console.log('Create Security Hub Members');

    // initally invite all accounts to be members
    await throttlingBackOff(() => this.securityHubClient.send(new CreateMembersCommand({ AccountDetails: allAccounts })));

    // for all accounts that are added later automatically enable security hub for them
    await throttlingBackOff(() => this.securityHubClient.send(new UpdateOrganizationConfigurationCommand({ AutoEnable: true })));
  }

  async deleteMembers() {
    const existingMemberAccountIds: string[] = [];
    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() => this.securityHubClient.send(new ListMembersCommand({ NextToken: nextToken })));
      for (const member of page.Members ?? []) {
        console.log(member);
        existingMemberAccountIds.push(member.AccountId!);
      }
      nextToken = page.NextToken;
    } while (nextToken);

    if (existingMemberAccountIds.length > 0) {
      console.log('Disassociate & Delete Security Hub Members');
      await throttlingBackOff(() => this.securityHubClient.send(new DisassociateMembersCommand({ AccountIds: existingMemberAccountIds })));

      await throttlingBackOff(() => this.securityHubClient.send(new DeleteMembersCommand({ AccountIds: existingMemberAccountIds })));
    }
  }
}
