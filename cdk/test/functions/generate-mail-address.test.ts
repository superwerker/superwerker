const spyOrganizationsListAccounts = jest.fn();
const spyOrganizationsListRoots = jest.fn();
const spyListOrganizationalUnitsForParent = jest.fn();
const spyListAccountsForParent = jest.fn();
const spyOrganizations = jest.fn(() => ({ 
  listAccounts: spyOrganizationsListAccounts,
  listRoots: spyOrganizationsListRoots,
  listOrganizationalUnitsForParent: spyListOrganizationalUnitsForParent,
  listAccountsForParent: spyListAccountsForParent
}));

jest.mock('aws-sdk', () => ({
  Organizations: spyOrganizations,
}));

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

    spyOrganizationsListRoots.mockImplementation(() => ({
      promise() {
        return Promise.resolve({ Roots: [{'Id': 'r-2ts2'}] });
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

    spyOrganizationsListRoots.mockImplementation(() => ({
      promise() {
        return Promise.resolve({ Roots: [{'Id': 'r-2ts2'}] });
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

  it ('returns email address for existing account AND not in suspended OU', async () => {
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

    spyOrganizationsListRoots.mockImplementation(() => ({
      promise() {
        return Promise.resolve({ Roots: [{'Id': 'r-2ts2'}] });
      },
    }));

    spyListOrganizationalUnitsForParent.mockImplementation(() => ({
      promise() {
        return Promise.resolve({ 
          OrganizationalUnits: [ 
            { 
              "Arn": "arn:aws:organizations::111111111111:ou/o-exampleorgid/ou-examplerootid111-exampleouid111",
              "Name": "NotSuspended"
            }
       ] });
      },
    }));

    // accounts in NotSuspended OU
    spyListAccountsForParent.mockImplementation(() => ({
      promise() {
        return Promise.resolve({
          Accounts: [
            {
              Email: 'root+some-other-account@aws.superluminar.io',
              Id: '222222222222',
              Name: 'example-two',
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

    await expect(result).resolves.toHaveProperty('Data.Email', 'root+this-is-what-we-need@aws.superluminar.io');

    // query accounts and OUs but dont query children of OU since not Suspended OU
    expect(spyOrganizationsListRoots).toHaveBeenCalledTimes(1);
    expect(spyListOrganizationalUnitsForParent).toHaveBeenCalledTimes(1);
    expect(spyListAccountsForParent).toHaveBeenCalledTimes(0);
  
  });

  it('generate new mail if account with same mail in suspended OU', async () => {
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

    spyOrganizationsListRoots.mockImplementation(() => ({
      promise() {
        return Promise.resolve({ Roots: [{'Id': 'r-2ts2'}] });
      },
    }));

    spyListOrganizationalUnitsForParent.mockImplementation(() => ({
      promise() {
        return Promise.resolve({ 
          OrganizationalUnits: [ 
            { 
              "Arn": "arn:aws:organizations::111111111111:ou/o-exampleorgid/ou-examplerootid111-exampleouid111",
              "Name": "Suspended"
            }
       ] });
      },
    }));

    spyListAccountsForParent.mockImplementation(() => ({
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

    await expect(result).resolves.toMatchObject(
      { Data: { Email: expect.stringMatching(/root\+[0-9a-f\-]*@aws.superluminar.io/) } },
    );

    expect(spyOrganizationsListRoots).toHaveBeenCalledTimes(1);
    expect(spyListOrganizationalUnitsForParent).toHaveBeenCalledTimes(1);
    expect(spyListAccountsForParent).toHaveBeenCalledTimes(1);
  
  });

  it('returns email address for existing account: Suspended OU exists but no relevance', async () => {
    spyOrganizationsListAccounts.mockImplementation(() => ({
      promise() {
        return Promise.resolve({
          Accounts: [
            {
              Email: 'root+this-is-what-we-need@aws.superluminar.io',
              Id: '333333333333',
              Name: 'example-one',
            },
          ],
        });
      },
    }));

    spyOrganizationsListRoots.mockImplementation(() => ({
      promise() {
        return Promise.resolve({ Roots: [{'Id': 'r-2ts2'}] });
      },
    }));

    spyListOrganizationalUnitsForParent.mockImplementation(() => ({
      promise() {
        return Promise.resolve({ 
          OrganizationalUnits: [ 
            { 
              "Arn": "arn:aws:organizations::111111111111:ou/o-exampleorgid/ou-examplerootid111-exampleouid111",
              "Name": "Suspended"
            }
       ] });
      },
    }));

    spyListAccountsForParent.mockImplementation(() => ({
      promise() {
        return Promise.resolve({
          Accounts: [
            {
              Email: 'root+some-other-account@aws.superluminar.io',
              Id: '222222222222',
              Name: 'example-two',
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
          Name: 'example-one',
        },
      } as unknown as OnEventRequest,
    );

    await expect(result).resolves.toHaveProperty('Data.Email', 'root+this-is-what-we-need@aws.superluminar.io');

    expect(spyOrganizationsListRoots).toHaveBeenCalledTimes(1);
    expect(spyListOrganizationalUnitsForParent).toHaveBeenCalledTimes(1);
    expect(spyListAccountsForParent).toHaveBeenCalledTimes(1);
  
  });

  it('cannot generate email address for long domain names', async () => {
    spyOrganizationsListAccounts.mockImplementation(() => ({
      promise() {
        return Promise.resolve({
          Accounts: [],
        });
      },
    }));

    spyOrganizationsListRoots.mockImplementation(() => ({
      promise() {
        return Promise.resolve({ Roots: [{'Id': 'r-2ts2'}] });
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

  it('Custom Resource Delete', async () => {

    const result = handler(
      {
        RequestType: 'Delete',
        ResourceProperties: {
          Domain: 'aws.superluminar.io',
          Name: '',
        },
      } as unknown as OnEventRequest,
    );

    await expect(result).resolves.toMatchObject({});
  });

});
