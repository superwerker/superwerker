import { AccountStatus, ListAccountsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import {
  SecurityHubClient,
  CreateMembersCommand,
  UpdateOrganizationConfigurationCommand,
  ListMembersCommand,
  DisassociateMembersCommand,
  DeleteMembersCommand,
} from '@aws-sdk/client-securityhub';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { SecurityHubMemberMgmt } from '../../../src/functions/securityhub/create-members';

const securityHubClientMock = mockClient(SecurityHubClient);
const organizationsClientMock = mockClient(OrganizationsClient);

const securityHubMemberMgmt = new SecurityHubMemberMgmt(new OrganizationsClient(), new SecurityHubClient());

describe('createMembers', () => {
  beforeEach(() => {
    securityHubClientMock.reset();
    organizationsClientMock.reset();
  });

  it('should create members and enable security hub for new accounts', async () => {
    const allAccounts = [
      { Id: 'account1', Email: 'email1@example.com', Status: AccountStatus.ACTIVE },
      { Id: 'account2', Email: 'email2@example.com', Status: AccountStatus.ACTIVE },
    ];

    organizationsClientMock.on(ListAccountsCommand).resolves({ Accounts: allAccounts, NextToken: undefined });
    await securityHubMemberMgmt.createMembers();

    expect(organizationsClientMock).toHaveReceivedAnyCommand();
    expect(securityHubClientMock).toHaveReceivedCommandWith(CreateMembersCommand, {
      AccountDetails: [
        { AccountId: 'account1', Email: 'email1@example.com' },
        { AccountId: 'account2', Email: 'email2@example.com' },
      ],
    });
    expect(securityHubClientMock).toHaveReceivedCommandWith(UpdateOrganizationConfigurationCommand, { AutoEnable: true });
  });

  it('should skip creating members when there are no accounts returned, but still auto enable', async () => {
    organizationsClientMock.on(ListAccountsCommand).resolves({ NextToken: undefined });

    await securityHubMemberMgmt.createMembers();

    expect(securityHubClientMock).not.toHaveReceivedCommandWith(CreateMembersCommand, { AccountDetails: [] });
    expect(securityHubClientMock).toHaveReceivedCommandWith(UpdateOrganizationConfigurationCommand, { AutoEnable: true });
  });

  it('should not create members for inactive accounts', async () => {
    const allAccounts = [
      {
        Id: 'account1',
        Email: 'email1@example.com',
        Status: AccountStatus.SUSPENDED,
      },
      { Id: 'account2', Email: 'email2@example.com', Status: AccountStatus.ACTIVE },
    ];

    organizationsClientMock.on(ListAccountsCommand).resolves({
      Accounts: allAccounts,
      NextToken: undefined,
    });

    await securityHubMemberMgmt.createMembers();

    expect(organizationsClientMock).toHaveReceivedCommandTimes(ListAccountsCommand, 1);
    expect(securityHubClientMock).toHaveReceivedCommandWith(CreateMembersCommand, {
      AccountDetails: [{ AccountId: 'account2', Email: 'email2@example.com' }],
    });
    expect(securityHubClientMock).toHaveReceivedCommandWith(UpdateOrganizationConfigurationCommand, { AutoEnable: true });
  });
});

describe('deleteMembers', () => {
  beforeEach(() => {
    securityHubClientMock.reset();
  });

  it('should disassociate and delete existing members', async () => {
    const existingMembers = [
      { AccountId: 'account1', Email: 'email1@example.com' },
      { AccountId: 'account2', Email: 'email2@example.com' },
    ];

    securityHubClientMock.on(ListMembersCommand).resolves({ Members: existingMembers, NextToken: undefined });

    await securityHubMemberMgmt.deleteMembers();

    expect(securityHubClientMock).toHaveReceivedCommandWith(ListMembersCommand, { NextToken: undefined });
    expect(securityHubClientMock).toHaveReceivedCommandWith(DisassociateMembersCommand, { AccountIds: ['account1', 'account2'] });
    expect(securityHubClientMock).toHaveReceivedCommandWith(DeleteMembersCommand, { AccountIds: ['account1', 'account2'] });
  });

  it('should skip disassociate and delete existing members when there are no members', async () => {
    securityHubClientMock.on(ListMembersCommand).resolves({ NextToken: undefined });

    await securityHubMemberMgmt.deleteMembers();

    expect(securityHubClientMock).toHaveReceivedCommandWith(ListMembersCommand, { NextToken: undefined });
    expect(securityHubClientMock).not.toHaveReceivedCommandWith(DisassociateMembersCommand, { AccountIds: [] });
    expect(securityHubClientMock).not.toHaveReceivedCommandWith(DeleteMembersCommand, { AccountIds: [] });
  });

  it('should not disassociate and delete members if there are no existing members', async () => {
    securityHubClientMock.on(ListMembersCommand).resolves({ Members: [], NextToken: undefined });

    await securityHubMemberMgmt.deleteMembers();

    expect(securityHubClientMock).toHaveReceivedCommandWith(ListMembersCommand, { NextToken: undefined });
    expect(securityHubClientMock).not.toHaveReceivedCommand(DisassociateMembersCommand);
    expect(securityHubClientMock).not.toHaveReceivedCommand(DeleteMembersCommand);
  });
});
