const spyOrganizationsListAccounts = jest.fn();
const spyOrganizations = jest.fn(() => ({ listAccounts: spyOrganizationsListAccounts }));

jest.mock('aws-sdk', () => ({
  Organizations: spyOrganizations,
}));

// eslint-disable-next-line import/no-unresolved
import { OnEventRequest } from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
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
        RequestType: 'Create',
        ResourceProperties: {
          Domain: 'aws.superluminar.io',
          Name: 'sbstjn-example',
        },
      } as unknown as OnEventRequest,
    );

    expect(spyOrganizationsListAccounts).toHaveBeenCalledTimes(1);

    await expect(result).resolves.toMatchObject(
      { Data: { Email: expect.stringMatching(/root\+[0-9a-f\-]*@aws.superluminar.io/) } },
    );
  });

  it('generates new address if account is not part of organizations yet', async () => {
    spyOrganizationsListAccounts.mockImplementation(() => ({
      promise() {
        const error = new Error();
        // @ts-ignore
        error.code = 'AWSOrganizationsNotInUseException';
        throw error;
      },
    }));

    const result = handler(
      {
        RequestType: 'Create',
        ResourceProperties: {
          Domain: 'aws.superluminar.io',
          Name: 'sbstjn-example',
        },
      } as unknown as OnEventRequest,
    );

    expect(spyOrganizationsListAccounts).toHaveBeenCalledTimes(1);

    await expect(result).resolves.toMatchObject(
      { Data: { Email: expect.stringMatching(/root\+[0-9a-f\-]*@aws.superluminar.io/) } },
    );
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
        RequestType: 'Create',
        ResourceProperties: {
          Domain: 'aws.superluminar.io',
          Name: 'sbstjn-example',
        },
      } as unknown as OnEventRequest,
    );

    expect(spyOrganizationsListAccounts).toHaveBeenCalledTimes(1);

    await expect(result).resolves.toHaveProperty('Data.Email', 'root+this-is-what-we-need@aws.superluminar.io');
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
        RequestType: 'Create',
        ResourceProperties: {
          Domain: 'aws.this-company-name-is-way-too-long-for-aws-control-tower.io',
          Name: 'sbstjn-example',
        },
      } as unknown as OnEventRequest,
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
        RequestType: 'Create',
        ResourceProperties: {
          Domain: '',
          Name: 'sbstjn-example',
        },
      } as unknown as OnEventRequest,
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
        RequestType: 'Create',
        ResourceProperties: {
          Domain: 'aws.superluminar.io',
          Name: '',
        },
      } as unknown as OnEventRequest,
    );

    await expect(result).rejects.toStrictEqual(new Error('Missing name'));
  });
});
