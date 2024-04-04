import { ListAccountsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import {
  SecurityHubClient,
  CreateMembersCommand,
  UpdateOrganizationConfigurationCommand,
  ListMembersCommand,
  DisassociateMembersCommand,
  DeleteMembersCommand,
  SecurityHub,
} from '@aws-sdk/client-securityhub';
import { mockClient } from 'aws-sdk-client-mock';
import { createMembers, deleteMembers } from '../../../src/functions/securityhub/create-members';

describe('createMembers', () => {
  const securityHubClientMock = mockClient(SecurityHub);
  const organizationsClientMock = mockClient(OrganizationsClient);

  beforeEach(() => {
    securityHubClientMock.reset();
    organizationsClientMock.reset();
  });

  it('should create members and enable security hub for new accounts', async () => {
    const allAccounts = [
      { AccountId: 'account1', Email: 'email1@example.com' },
      { AccountId: 'account2', Email: 'email2@example.com' },
    ];

    organizationsClientMock.on(ListAccountsCommand).resolves({ Accounts: allAccounts, NextToken: undefined });
    securityHubClientMock.on(CreateMembersCommand).resolves({});

    await createMembers(securityHubClientMock, organizationsClientMock);

    expect(organizationsClientMock).toHaveBeenCalled();
    expect(securityHubClientMock).toHaveBeenCalledWith(new CreateMembersCommand({ AccountDetails: allAccounts }));
    expect(securityHubClientMock).toHaveBeenCalledWith(new UpdateOrganizationConfigurationCommand({ AutoEnable: true }));
  });

  it('should not create members for inactive accounts', async () => {
    const allAccounts = [
      { AccountId: 'account1', Email: 'email1@example.com', Status: 'SUSPENDED' },
      { AccountId: 'account2', Email: 'email2@example.com', Status: 'ACTIVE' },
    ];

    organizationsClientMock.on(ListAccountsCommand).resolves({
      Accounts: allAccounts,
      NextToken: undefined,
    });

    await createMembers(securityHubClientMock, organizationsClientMock);

    expect(organizationsClientMock).toHaveBeenCalledTimes(1);
    expect(securityHubClientMock).toHaveBeenCalledWith(new CreateMembersCommand({ AccountDetails: allAccounts }));
    expect(securityHubClientMock).toHaveBeenCalledWith(new UpdateOrganizationConfigurationCommand({ AutoEnable: true }));
  });
});

describe('deleteMembers', () => {
  const securityHubClientMock = mockClient(SecurityHubClient);

  beforeEach(() => {
    securityHubClientMock.reset();
  });

  it('should disassociate and delete existing members', async () => {
    const existingMembers = [
      { AccountId: 'account1', Email: 'email1@example.com' },
      { AccountId: 'account2', Email: 'email2@example.com' },
    ];

    securityHubClientMock.on(ListMembersCommand).resolves({ Members: existingMembers, NextToken: undefined });

    await deleteMembers(securityHubClientMock);

    expect(securityHubClientMock).toHaveBeenCalledWith(new ListMembersCommand({ NextToken: undefined }));
    expect(securityHubClientMock).toHaveBeenCalledWith(new DisassociateMembersCommand({ AccountIds: ['account1', 'account2'] }));
    expect(securityHubClientMock).toHaveBeenCalledWith(new DeleteMembersCommand({ AccountIds: ['account1', 'account2'] }));
  });

  it('should not disassociate and delete members if there are no existing members', async () => {
    securityHubClientMock.on(ListMembersCommand).resolves({ Members: [], NextToken: undefined });

    await deleteMembers(securityHubClientMock);

    expect(securityHubClientMock).toHaveBeenCalledWith(new ListMembersCommand({ NextToken: undefined }));
    expect(securityHubClientMock).not.toHaveBeenCalledWith(new DisassociateMembersCommand());
    expect(securityHubClientMock).not.toHaveBeenCalledWith(new DeleteMembersCommand());
  });
});
