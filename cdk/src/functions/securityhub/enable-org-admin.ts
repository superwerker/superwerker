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
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import {
  DisableOrganizationAdminAccountCommand,
  EnableOrganizationAdminAccountCommand,
  EnableSecurityHubCommand,
  ListOrganizationAdminAccountsCommand,
  ResourceConflictException,
  SecurityHubClient,
} from '@aws-sdk/client-securityhub';
import { delay, throttlingBackOff } from '../utils/throttle';

export class SecurityHubOrganizationMgmt {
  private securityAdminAccountId: string;
  private organizationsClient: OrganizationsClient;
  private securityHubClient: SecurityHubClient;

  constructor(
    accountIdToMakeSecurityHubAdmin: string,
    organizationsClientManagementAccount: OrganizationsClient,
    securityHubClientManagementAccount: SecurityHubClient,
  ) {
    this.securityAdminAccountId = accountIdToMakeSecurityHubAdmin;
    this.organizationsClient = organizationsClientManagementAccount;
    this.securityHubClient = securityHubClientManagementAccount;
  }

  async enableOrganisationAdmin(region: string) {
    let securityHubAdminAccount = await this.getSecurityHubDelegatedAccount();

    if (securityHubAdminAccount.status) {
      if (securityHubAdminAccount.accountId === this.securityAdminAccountId) {
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

    console.log('Enabling security hub in management account before creating delegation admin account');
    await this.enableSecurityHub();

    console.log(`Started enableOrganizationAdminAccount in ${region} region for account ${this.securityAdminAccountId}`);
    let retries = 0;
    while (retries < 10) {
      await delay(retries ** 2 * 1000);
      try {
        await throttlingBackOff(() =>
          this.securityHubClient.send(new EnableOrganizationAdminAccountCommand({ AdminAccountId: this.securityAdminAccountId })),
        );
        securityHubAdminAccount = await this.getSecurityHubDelegatedAccount();
        if (securityHubAdminAccount.accountId !== this.securityAdminAccountId) {
          console.warn(
            `Audit Account ${this.securityAdminAccountId} has not been registered as delegated administrator account. Retrying...`,
          );
          await throttlingBackOff(() =>
            this.securityHubClient.send(new EnableOrganizationAdminAccountCommand({ AdminAccountId: this.securityAdminAccountId })),
          );
        }
        break;
      } catch (error) {
        console.log(error);
        retries = retries + 1;
      }
    }
  }

  async disableOrganisationAdmin(region: string) {
    const securityHubAdminAccount = await this.getSecurityHubDelegatedAccount();
    if (securityHubAdminAccount.accountId) {
      if (securityHubAdminAccount.accountId === this.securityAdminAccountId) {
        console.log(`Started disableOrganizationAdminAccount function in ${region} region for account ${this.securityAdminAccountId}`);
        await throttlingBackOff(() =>
          this.securityHubClient.send(new DisableOrganizationAdminAccountCommand({ AdminAccountId: this.securityAdminAccountId })),
        );
        const response = await throttlingBackOff(() =>
          this.organizationsClient.send(new ListDelegatedAdministratorsCommand({ ServicePrincipal: 'securityhub.amazonaws.com' })),
        );

        if (response.DelegatedAdministrators!.length > 0) {
          console.log(`Started deregisterDelegatedAdministrator function in ${region} region for account ${this.securityAdminAccountId}`);
          await throttlingBackOff(() =>
            this.organizationsClient.send(
              new DeregisterDelegatedAdministratorCommand({
                AccountId: this.securityAdminAccountId,
                ServicePrincipal: 'securityhub.amazonaws.com',
              }),
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

  private async getSecurityHubDelegatedAccount(): Promise<{ accountId: string | undefined; status: string | undefined }> {
    const adminAccounts = [];
    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() =>
        this.securityHubClient.send(new ListOrganizationAdminAccountsCommand({ NextToken: nextToken })),
      );
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

    if (adminAccounts[0].AccountId === this.securityAdminAccountId && adminAccounts[0].Status === 'DISABLE_IN_PROGRESS') {
      throw new Error(`Admin account ${adminAccounts[0].AccountId} is in ${adminAccounts[0].Status}`);
    }

    return { accountId: adminAccounts[0].AccountId, status: adminAccounts[0].Status };
  }

  private async enableSecurityHub(): Promise<EnableAWSServiceAccessCommandOutput | undefined> {
    try {
      return await throttlingBackOff(() => this.securityHubClient.send(new EnableSecurityHubCommand({ EnableDefaultStandards: false })));
    } catch (e) {
      if (e instanceof ResourceConflictException) {
        console.info('SecurityHub already enabled, nothing to do');
        return;
      }
      throw new Error(`Enabling SecurityHub failed: ${e}`);
    }
  }
}
