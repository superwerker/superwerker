import {
  DeregisterDelegatedAdministratorCommand,
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
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { SecurityHubOrganizationMgmt } from '../../../src/functions/securityhub/enable-org-admin';

const organizationsClientMock = mockClient(OrganizationsClient);
const securityHubClientMock = mockClient(SecurityHubClient);

const auditAccount = '11223344556677';
const otherAccount = '22334455667788';
const securityHubOrganizationMgmt = new SecurityHubOrganizationMgmt(auditAccount, new OrganizationsClient(), new SecurityHubClient());

describe('enableOrganisationAdmin', () => {
  beforeEach(() => {
    organizationsClientMock.reset();
    securityHubClientMock.reset();
  });

  it('should enable organization admin account when not already set', async () => {
    // initally no admin account set
    securityHubClientMock
      .on(ListOrganizationAdminAccountsCommand)
      .resolvesOnce({ AdminAccounts: [] })
      .resolves({ AdminAccounts: [{ AccountId: auditAccount, Status: 'ENABLED' }] });

    await securityHubOrganizationMgmt.enableOrganisationAdmin('us-west-2');

    expect(securityHubClientMock).toHaveReceivedCommandWith(EnableOrganizationAdminAccountCommand, { AdminAccountId: auditAccount });
    expect(securityHubClientMock).toHaveReceivedCommandWith(EnableSecurityHubCommand, { EnableDefaultStandards: false });

    expect(securityHubClientMock).toHaveReceivedCommandTimes(ListOrganizationAdminAccountsCommand, 2);
    expect(securityHubClientMock).toHaveReceivedCommandTimes(EnableSecurityHubCommand, 1);
    expect(securityHubClientMock).toHaveReceivedCommandTimes(EnableOrganizationAdminAccountCommand, 1);
  });

  it('should enable organization admin account when ListOrganizationAdminAccountsCommand empty response', async () => {
    // initally no admin account set
    securityHubClientMock
      .on(ListOrganizationAdminAccountsCommand)
      .resolvesOnce({ AdminAccounts: [] })
      .resolves({ AdminAccounts: [{ AccountId: auditAccount, Status: 'ENABLED' }] });

    await securityHubOrganizationMgmt.enableOrganisationAdmin('us-west-2');

    expect(securityHubClientMock).toHaveReceivedCommandWith(EnableOrganizationAdminAccountCommand, { AdminAccountId: auditAccount });
    expect(securityHubClientMock).toHaveReceivedCommandWith(EnableSecurityHubCommand, { EnableDefaultStandards: false });

    expect(securityHubClientMock).toHaveReceivedCommandTimes(ListOrganizationAdminAccountsCommand, 2);
    expect(securityHubClientMock).toHaveReceivedCommandTimes(EnableSecurityHubCommand, 1);
    expect(securityHubClientMock).toHaveReceivedCommandTimes(EnableOrganizationAdminAccountCommand, 1);
  });

  it('should retry enable organization admin account', async () => {
    // throw error once
    securityHubClientMock.on(EnableOrganizationAdminAccountCommand).rejectsOnce(new Error('Internal Error'));
    // initally no admin account set
    securityHubClientMock
      .on(ListOrganizationAdminAccountsCommand)
      .resolvesOnce({ AdminAccounts: [] })
      .resolves({ AdminAccounts: [{ AccountId: auditAccount, Status: 'ENABLED' }] });

    await securityHubOrganizationMgmt.enableOrganisationAdmin('us-west-2');

    expect(securityHubClientMock).toHaveReceivedCommandWith(EnableOrganizationAdminAccountCommand, { AdminAccountId: auditAccount });
    expect(securityHubClientMock).toHaveReceivedCommandWith(EnableSecurityHubCommand, { EnableDefaultStandards: false });

    expect(securityHubClientMock).toHaveReceivedCommandTimes(ListOrganizationAdminAccountsCommand, 2);
    expect(securityHubClientMock).toHaveReceivedCommandTimes(EnableSecurityHubCommand, 1);
    // call twice because of retry
    expect(securityHubClientMock).toHaveReceivedCommandTimes(EnableOrganizationAdminAccountCommand, 2);
  });

  it('should retry enable organization admin account even when not enabled successfully', async () => {
    // admin account also not set after enabling
    securityHubClientMock.on(ListOrganizationAdminAccountsCommand).resolves({});

    await securityHubOrganizationMgmt.enableOrganisationAdmin('us-west-2');

    expect(securityHubClientMock).toHaveReceivedCommandWith(EnableOrganizationAdminAccountCommand, { AdminAccountId: auditAccount });
    expect(securityHubClientMock).toHaveReceivedCommandWith(EnableSecurityHubCommand, { EnableDefaultStandards: false });

    expect(securityHubClientMock).toHaveReceivedCommandTimes(ListOrganizationAdminAccountsCommand, 2);
    expect(securityHubClientMock).toHaveReceivedCommandTimes(EnableSecurityHubCommand, 1);
    // call twice because of retry
    expect(securityHubClientMock).toHaveReceivedCommandTimes(EnableOrganizationAdminAccountCommand, 2);
  });

  it('should throw error when audit account sechub delegation is in status DISABLE_IN_PROGRESS', async () => {
    // no admin account set
    securityHubClientMock.on(ListOrganizationAdminAccountsCommand).resolves({
      AdminAccounts: [{ AccountId: auditAccount, Status: 'DISABLE_IN_PROGRESS' }],
      NextToken: undefined,
    });

    await expect(securityHubOrganizationMgmt.enableOrganisationAdmin('us-west-2')).rejects.toThrow(
      `Admin account ${auditAccount} is in DISABLE_IN_PROGRESS`,
    );

    expect(securityHubClientMock).toHaveReceivedCommandTimes(ListOrganizationAdminAccountsCommand, 1);
    expect(securityHubClientMock).toHaveReceivedCommandTimes(EnableSecurityHubCommand, 0);
    expect(securityHubClientMock).toHaveReceivedCommandTimes(EnableOrganizationAdminAccountCommand, 0);
  });

  it('should enable organization admin account and ignore ResourceConflictException', async () => {
    // initally no admin account set
    securityHubClientMock
      .on(ListOrganizationAdminAccountsCommand)
      .resolvesOnce({ AdminAccounts: [] })
      .resolves({ AdminAccounts: [{ AccountId: auditAccount, Status: 'ENABLED' }] });
    securityHubClientMock
      .on(EnableSecurityHubCommand)
      .rejects(new ResourceConflictException({ $metadata: {}, message: 'Security Hub is already enabled' }));

    await securityHubOrganizationMgmt.enableOrganisationAdmin('us-west-2');

    expect(securityHubClientMock).toHaveReceivedCommandWith(EnableOrganizationAdminAccountCommand, { AdminAccountId: auditAccount });
    expect(securityHubClientMock).toHaveReceivedCommandWith(EnableSecurityHubCommand, { EnableDefaultStandards: false });

    expect(securityHubClientMock).toHaveReceivedCommandTimes(ListOrganizationAdminAccountsCommand, 2);
    expect(securityHubClientMock).toHaveReceivedCommandTimes(EnableSecurityHubCommand, 1);
    expect(securityHubClientMock).toHaveReceivedCommandTimes(EnableOrganizationAdminAccountCommand, 1);
  });

  it('throw error when enabling sechub when exception is not ResourceConflictException', async () => {
    // initally no admin account set
    securityHubClientMock
      .on(ListOrganizationAdminAccountsCommand)
      .resolvesOnce({ AdminAccounts: [] })
      .resolves({ AdminAccounts: [{ AccountId: auditAccount, Status: 'ENABLED' }] });
    securityHubClientMock.on(EnableSecurityHubCommand).rejects('Internal Error');

    await expect(securityHubOrganizationMgmt.enableOrganisationAdmin('us-west-2')).rejects.toThrow(
      'Enabling SecurityHub failed: Error: Internal Error',
    );

    expect(securityHubClientMock).toHaveReceivedCommandTimes(ListOrganizationAdminAccountsCommand, 1);
    expect(securityHubClientMock).toHaveReceivedCommandTimes(EnableSecurityHubCommand, 1);
    expect(securityHubClientMock).toHaveReceivedCommandTimes(EnableOrganizationAdminAccountCommand, 0);
  });

  it('should throw an error when there are multiple admin accounts', async () => {
    securityHubClientMock.on(ListOrganizationAdminAccountsCommand).resolves({
      AdminAccounts: [
        { AccountId: auditAccount, Status: 'ENABLED' },
        { AccountId: otherAccount, Status: 'ENABLED' },
      ],
      NextToken: undefined,
    });

    await expect(securityHubOrganizationMgmt.enableOrganisationAdmin('us-west-2')).rejects.toThrow(
      'Multiple admin accounts for SecurityHub in organization',
    );
  });

  it('should throw an error when the admin account is already set to a different account', async () => {
    securityHubClientMock.on(ListOrganizationAdminAccountsCommand).resolves({
      AdminAccounts: [{ AccountId: otherAccount, Status: 'ENABLED' }],
      NextToken: undefined,
    });

    await expect(securityHubOrganizationMgmt.enableOrganisationAdmin('us-west-2')).rejects.toThrow(
      `SecurityHub delegated admin is already set to ${otherAccount} account can not assign another delegated account`,
    );
  });

  it('should not enable organization admin account when already set to the same account', async () => {
    securityHubClientMock.on(ListOrganizationAdminAccountsCommand).resolves({
      AdminAccounts: [{ AccountId: auditAccount, Status: 'ENABLED' }],
      NextToken: undefined,
    });

    await securityHubOrganizationMgmt.enableOrganisationAdmin('us-west-2');

    expect(securityHubClientMock).toHaveReceivedCommandTimes(ListOrganizationAdminAccountsCommand, 1);
    expect(securityHubClientMock).not.toHaveReceivedCommand(EnableSecurityHubCommand);
    expect(securityHubClientMock).not.toHaveReceivedCommand(EnableOrganizationAdminAccountCommand);
  });
});

describe('disableOrganisationAdmin', () => {
  beforeEach(() => {
    organizationsClientMock.reset();
    securityHubClientMock.reset();
  });

  it('should deregister organization admin account when set to audit account', async () => {
    organizationsClientMock.on(ListDelegatedAdministratorsCommand).resolves({
      DelegatedAdministrators: [{}, {}],
      NextToken: undefined,
    });
    securityHubClientMock.on(ListOrganizationAdminAccountsCommand).resolves({
      AdminAccounts: [{ AccountId: auditAccount, Status: 'ENABLED' }],
      NextToken: undefined,
    });

    await securityHubOrganizationMgmt.disableOrganisationAdmin('us-west-2');

    expect(securityHubClientMock).toHaveReceivedCommandWith(DisableOrganizationAdminAccountCommand, { AdminAccountId: auditAccount });
    expect(organizationsClientMock).toHaveReceivedCommandWith(ListDelegatedAdministratorsCommand, {
      ServicePrincipal: 'securityhub.amazonaws.com',
    });
    expect(organizationsClientMock).toHaveReceivedCommandWith(DeregisterDelegatedAdministratorCommand, {
      AccountId: auditAccount,
      ServicePrincipal: 'securityhub.amazonaws.com',
    });

    expect(securityHubClientMock).toHaveReceivedCommandTimes(ListOrganizationAdminAccountsCommand, 1);
    expect(securityHubClientMock).toHaveReceivedCommandTimes(DisableOrganizationAdminAccountCommand, 1);
    expect(organizationsClientMock).toHaveReceivedCommandTimes(ListDelegatedAdministratorsCommand, 1);
    expect(organizationsClientMock).toHaveReceivedCommandTimes(DeregisterDelegatedAdministratorCommand, 1);
  });

  it('should skip to deregister organization admin account when response empty', async () => {
    securityHubClientMock.on(ListOrganizationAdminAccountsCommand).resolves({
      AdminAccounts: [],
      NextToken: undefined,
    });

    await securityHubOrganizationMgmt.disableOrganisationAdmin('us-west-2');

    expect(securityHubClientMock).toHaveReceivedCommandTimes(ListOrganizationAdminAccountsCommand, 1);
    expect(securityHubClientMock).toHaveReceivedCommandTimes(DisableOrganizationAdminAccountCommand, 0);
    expect(organizationsClientMock).toHaveReceivedCommandTimes(ListDelegatedAdministratorsCommand, 0);
    expect(organizationsClientMock).toHaveReceivedCommandTimes(DeregisterDelegatedAdministratorCommand, 0);
  });

  it('should skip to deregister organization admin account when there is not org admin', async () => {
    organizationsClientMock.on(ListDelegatedAdministratorsCommand).resolves({
      DelegatedAdministrators: [],
      NextToken: undefined,
    });
    securityHubClientMock.on(ListOrganizationAdminAccountsCommand).resolves({
      AdminAccounts: [{ AccountId: auditAccount, Status: 'ENABLED' }],
      NextToken: undefined,
    });

    await securityHubOrganizationMgmt.disableOrganisationAdmin('us-west-2');

    expect(securityHubClientMock).toHaveReceivedCommandWith(DisableOrganizationAdminAccountCommand, { AdminAccountId: auditAccount });
    expect(organizationsClientMock).toHaveReceivedCommandWith(ListDelegatedAdministratorsCommand, {
      ServicePrincipal: 'securityhub.amazonaws.com',
    });

    expect(securityHubClientMock).toHaveReceivedCommandTimes(ListOrganizationAdminAccountsCommand, 1);
    expect(securityHubClientMock).toHaveReceivedCommandTimes(DisableOrganizationAdminAccountCommand, 1);
    expect(organizationsClientMock).toHaveReceivedCommandTimes(ListDelegatedAdministratorsCommand, 1);
    expect(organizationsClientMock).toHaveReceivedCommandTimes(DeregisterDelegatedAdministratorCommand, 0);
  });

  it('should not deregister organization admin account when set to a different account than audit', async () => {
    securityHubClientMock
      .on(ListOrganizationAdminAccountsCommand)
      .resolves({ AdminAccounts: [{ AccountId: otherAccount, Status: 'ENABLED' }], NextToken: undefined });

    await securityHubOrganizationMgmt.disableOrganisationAdmin('us-west-2');

    expect(securityHubClientMock).toHaveReceivedCommandTimes(ListOrganizationAdminAccountsCommand, 1);
    expect(securityHubClientMock).not.toHaveReceivedCommand(DisableOrganizationAdminAccountCommand);
    expect(organizationsClientMock).not.toHaveReceivedCommand(ListDelegatedAdministratorsCommand);
    expect(organizationsClientMock).not.toHaveReceivedCommand(DeregisterDelegatedAdministratorCommand);
  });
});
