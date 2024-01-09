import 'aws-sdk-client-mock-jest';
import {
  ListAccountsCommand,
  OrganizationsClient,
  AWSOrganizationsNotInUseException,
  ListRootsCommand,
  ListAccountsForParentCommand,
  ListOrganizationalUnitsForParentCommand,
} from '@aws-sdk/client-organizations';
import { OnEventRequest } from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import { mockClient } from 'aws-sdk-client-mock';
import { handler, generateEmail } from '../../src/functions/generate-mail-address';


var orgClientMock = mockClient(OrganizationsClient);


describe('generate-mail-address', () => {

  beforeEach(() => {
    orgClientMock.reset();
  });

  it('generates new address if no matching account is found', async () => {


    orgClientMock
      .on(ListAccountsCommand)
      .resolves({
        Accounts: [],
      });

    const result = await handler(
      {
        RequestType: 'Create',
        ResourceProperties: {
          Domain: 'aws.superluminar.io',
          Name: 'sbstjn-example',
        },
      } as unknown as OnEventRequest,
    );

    expect(result).toMatchObject(
      { Data: { Email: expect.stringMatching(/root\+[0-9a-f\-]*@aws.superluminar.io/) } },
    );

    expect(orgClientMock).toHaveReceivedCommandTimes(ListAccountsCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListRootsCommand, 1);
  });

  it('generates new address if account is not part of organizations yet', async () => {


    orgClientMock
      .on(ListAccountsCommand)
      .rejects(new AWSOrganizationsNotInUseException({} as any));

    orgClientMock
      .on(ListRootsCommand)
      .rejects(new AWSOrganizationsNotInUseException({} as any));


    const result = await handler(
      {
        RequestType: 'Create',
        ResourceProperties: {
          Domain: 'aws.superluminar.io',
          Name: 'sbstjn-example',
        },
      } as unknown as OnEventRequest,
    );


    expect(result).toMatchObject(
      { Data: { Email: expect.stringMatching(/root\+[0-9a-f\-]*@aws.superluminar.io/) } },
    );

    expect(orgClientMock).toHaveReceivedCommandTimes(ListAccountsCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListRootsCommand, 1);
  });

  it('returns email address for existing account', async () => {

    orgClientMock
      .on(ListAccountsCommand)
      .resolves({
        Accounts: [
          {
            Email: 'root+this-is-what-we-need@aws.superluminar.io',
            Id: '333333333333',
            Name: 'sbstjn-example',
            Status: 'ACTIVE',
          },
          {
            Email: 'root+some-other-account@aws.superluminar.io',
            Id: '222222222222',
            Name: 'example-two',
            Status: 'SUSPENDED',
          },
          {
            Email: 'root+another-account@aws.superluminar.io',
            Id: '777777777777',
            Name: 'example-three',
            Status: 'PENDING_CLOSURE',
          },
          {
            Email: 'root+yet-another-account@aws.superluminar.io',
            Id: '44444444444',
            Name: 'example-four',
            Status: 'ACTIVE',
          },
          {
            Email: 'root+otre-account@aws.superluminar.io',
            Id: '555555555555',
            Name: 'example-five',
            Status: 'SUSPENDED',
          },
        ],
      });

    orgClientMock
      .on(ListRootsCommand)
      .resolves({ Roots: [{ Id: 'r-2ts2' }] },
      );

    orgClientMock
      .on(ListOrganizationalUnitsForParentCommand)
      .resolves({
        OrganizationalUnits: [],
      },
      );

    const result = await handler(
      {
        RequestType: 'Create',
        ResourceProperties: {
          Domain: 'aws.superluminar.io',
          Name: 'sbstjn-example',
        },
      } as unknown as OnEventRequest,
    );


    expect(result).toHaveProperty('Data.Email', 'root+this-is-what-we-need@aws.superluminar.io');

    expect(orgClientMock).toHaveReceivedCommandTimes(ListAccountsCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListRootsCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListOrganizationalUnitsForParentCommand, 1);
  });


  it('generate new mail if account with same name is suspended', async () => {

    orgClientMock
      .on(ListAccountsCommand)
      .resolves({
        Accounts: [
          {
            Email: 'root+this-is-what-we-need@aws.superluminar.io',
            Id: '333333333333',
            Name: 'sbstjn-example',
            Status: 'SUSPENDED',
          },
          {
            Email: 'root+two@aws.superluminar.io',
            Id: '777777777777',
            Name: 'example-two',
            Status: 'ACTIVE',
          },
          {
            Email: 'root+some-other-account@aws.superluminar.io',
            Id: '222222222222',
            Name: 'example-three',
            Status: 'SUSPENDED',
          },
          {
            Email: 'root+another-account@aws.superluminar.io',
            Id: '777777777777',
            Name: 'example-seven',
            Status: 'PENDING_CLOSURE',
          },
          {
            Email: 'root+yet-another-account@aws.superluminar.io',
            Id: '44444444444',
            Name: 'example-four',
            Status: 'ACTIVE',
          },
        ],
      });

    orgClientMock
      .on(ListRootsCommand)
      .resolves({ Roots: [{ Id: 'r-2ts2' }] },
      );

    orgClientMock
      .on(ListOrganizationalUnitsForParentCommand)
      .resolves({
        OrganizationalUnits: [],
      },
      );


    const result = await handler(
      {
        RequestType: 'Create',
        ResourceProperties: {
          Domain: 'aws.superluminar.io',
          Name: 'sbstjn-example',
        },
      } as unknown as OnEventRequest,
    );

    expect(result).toMatchObject(
      { Data: { Email: expect.stringMatching(/root\+[0-9a-f\-]*@aws.superluminar.io/) } },
    );

    expect(orgClientMock).toHaveReceivedCommandTimes(ListAccountsCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListRootsCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListOrganizationalUnitsForParentCommand, 1);
  });

  it('generate new mail if account with same mail in suspended OU', async () => {
    orgClientMock
      .on(ListAccountsCommand)
      .resolves({
        Accounts: [
          {
            Email: 'root+this-is-what-we-need@aws.superluminar.io',
            Id: '333333333333',
            Name: 'sbstjn-example',
            Status: 'ACTIVE',
          },
        ],
      });

    orgClientMock
      .on(ListRootsCommand)
      .resolves({ Roots: [{ Id: 'r-2ts2' }] },
      );

    orgClientMock
      .on(ListOrganizationalUnitsForParentCommand)
      .resolves({
        OrganizationalUnits: [
          {
            Arn: 'arn:aws:organizations::111111111111:ou/o-exampleorgid/ou-examplerootid111-exampleouid111',
            Name: 'Suspended',
          },
        ],
      },
      );


    orgClientMock
      .on(ListAccountsForParentCommand)
      .resolves({
        Accounts: [
          {
            Email: 'root+this-is-what-we-need@aws.superluminar.io',
            Id: '333333333333',
            Name: 'sbstjn-example',
            Status: 'ACTIVE',
          },
        ],
      });

    const result = await handler(
      {
        RequestType: 'Create',
        ResourceProperties: {
          Domain: 'aws.superluminar.io',
          Name: 'sbstjn-example',
        },
      } as unknown as OnEventRequest,
    );

    expect(result).toMatchObject(
      { Data: { Email: expect.stringMatching(/root\+[0-9a-f\-]*@aws.superluminar.io/) } },
    );
    expect(orgClientMock).toHaveReceivedCommandTimes(ListAccountsCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListRootsCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListOrganizationalUnitsForParentCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListAccountsForParentCommand, 1);
  });

  it('returns email address for existing account: Suspended OU exists but no relevance', async () => {
    orgClientMock
      .on(ListAccountsCommand)
      .resolves({
        Accounts: [
          {
            Email: 'root+this-is-what-we-need@aws.superluminar.io',
            Id: '333333333333',
            Name: 'sbstjn-example',
            Status: 'ACTIVE',
          },
        ],
      });

    orgClientMock
      .on(ListRootsCommand)
      .resolves({ Roots: [{ Id: 'r-2ts2' }] },
      );

    orgClientMock
      .on(ListOrganizationalUnitsForParentCommand)
      .resolves({
        OrganizationalUnits: [
          {
            Arn: 'arn:aws:organizations::111111111111:ou/o-exampleorgid/ou-examplerootid111-exampleouid111',
            Name: 'Suspended',
          },
        ],
      },
      );


    orgClientMock
      .on(ListAccountsForParentCommand)
      .resolves({
        Accounts: [
          {
            Email: 'root+some-other-account@aws.superluminar.io',
            Id: '222222222222',
            Name: 'example-two',
            Status: 'ACTIVE',
          },
        ],
      });


    const result = await handler(
      {
        RequestType: 'Create',
        ResourceProperties: {
          Domain: 'aws.superluminar.io',
          Name: 'sbstjn-example',
        },
      } as unknown as OnEventRequest,
    );

    expect(result).toHaveProperty('Data.Email', 'root+this-is-what-we-need@aws.superluminar.io');

    expect(orgClientMock).toHaveReceivedCommandTimes(ListAccountsCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListRootsCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListOrganizationalUnitsForParentCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListAccountsForParentCommand, 1);
  });


  it('cannot generate email address for long domain names', async () => {


    expect(() => generateEmail('aws.this-company-name-is-way-too-long-for-aws-control-tower.io')).toThrowError(
      new Error('Unable to generate email address with more than 64 characters (Control Tower requirement)'),
    );
  });

  it('cannot generate email address if no domain is provided', async () => {

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

    const result = await handler(
      {
        RequestType: 'Delete',
        ResourceProperties: {
          Domain: 'aws.superluminar.io',
          Name: '',
        },
      } as unknown as OnEventRequest,
    );

    expect(result).toMatchObject({});
  });

});
