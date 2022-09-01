import { Context } from 'aws-lambda';

const spyOrganizationsListAccounts = jest.fn();
const spyOrganizations = jest.fn(() => ({ listAccounts: spyOrganizationsListAccounts }));

jest.mock('aws-sdk', () => ({
  Organizations: spyOrganizations,
}));

import { handler } from '../../src/functions/generate-mail-address';

describe('generate-mail-address', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('generates new address if no matching account is found', async () => {
    spyOrganizationsListAccounts.mockImplementation(() => ({
      promise() {
        return Promise.resolve({ Accounts: [] });
      },
    }));

    const result = handler(
      {
        domain: 'aws.superluminar.io',
        name: 'sbstjn-example',
      },
      {} as Context,
      () => {},
    );

    expect(spyOrganizationsListAccounts).toHaveBeenCalledTimes(1);

    await expect(result).resolves.toHaveProperty('email');
    await expect(result).resolves.not.toHaveProperty('email', 'root+sbstjn-example@aws.superluminar.io');
  });

  it('returns email address for existing account', async () => {
    spyOrganizationsListAccounts.mockImplementation(() => ({
      promise() {
        return Promise.resolve({
          Accounts: [
            {
              Email: 'root+this-is-what-we-need@aws.superluminar.io',
              Id: '333333333333',
              Name: 'sbstjn-example',
            },
          ],
        });
      },
    }));

    const result = handler(
      {
        domain: 'aws.superluminar.io',
        name: 'sbstjn-example',
      },
      {} as Context,
      () => {},
    );

    expect(spyOrganizationsListAccounts).toHaveBeenCalledTimes(1);

    await expect(result).resolves.toHaveProperty('email');
    await expect(result).resolves.toHaveProperty('email', 'root+this-is-what-we-need@aws.superluminar.io');
  });

  it('cannot generate email address for long domain names', async () => {
    spyOrganizationsListAccounts.mockImplementation(() => ({
      promise() {
        return Promise.resolve({
          Accounts: [],
        });
      },
    }));

    const result = handler(
      {
        domain: 'aws.this-company-name-is-way-too-long-for-aws-control-tower.io',
        name: 'sbstjn-example',
      },
      {} as Context,
      () => {},
    );

    await expect(result).rejects.toStrictEqual(
      new Error('Unable to generate email address with less than 64 characters (Control Tower requirement)'),
    );
  });

  it('cannot generate email address if no domain is provided', async () => {
    spyOrganizationsListAccounts.mockImplementation(() => ({
      promise() {
        return Promise.resolve({
          Accounts: [],
        });
      },
    }));

    const result = handler(
      {
        domain: '',
        name: 'sbstjn-example',
      },
      {} as Context,
      () => {},
    );

    await expect(result).rejects.toStrictEqual(new Error('Missing domain'));
  });

  it('cannot generate email address if no name is provided', async () => {
    spyOrganizationsListAccounts.mockImplementation(() => ({
      promise() {
        return Promise.resolve({
          Accounts: [],
        });
      },
    }));

    const result = handler(
      {
        domain: 'aws.superluminar.io',
        name: '',
      },
      {} as Context,
      () => {},
    );

    await expect(result).rejects.toStrictEqual(new Error('Missing name'));
  });
});
