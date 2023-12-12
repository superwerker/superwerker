import {mockClient} from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import {
  ListAccountsCommand,
  ListOrganizationalUnitsForParentCommand,
  ListRootsCommand,
  ListAccountsForParentCommand,
  OrganizationsClient,
  AWSOrganizationsNotInUseException
} from '@aws-sdk/client-organizations'
import { OnEventRequest } from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import { handler } from '../../src/functions/generate-mail-address';


var orgClientMock = mockClient(OrganizationsClient);



describe('generate-mail-address', () => {

  beforeEach(() => {
    orgClientMock.reset();
  });

  it('generates new address if no matching account is found', async () => {


    orgClientMock
    .on(ListAccountsCommand)
    .resolves({
       Accounts: []
    });

    orgClientMock
    .on(ListRootsCommand)
    .resolves({
        Roots: [{'Id': 'r-2ts2'}] ,
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

    expect(orgClientMock).toHaveReceivedCommandTimes(ListAccountsCommand, 2);
  });

  it('generates new address if account is not part of organizations yet', async () => {


    orgClientMock
    .on(ListAccountsCommand)
    .rejects(new AWSOrganizationsNotInUseException({} as any))


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

    expect(orgClientMock).toHaveReceivedCommandTimes(ListAccountsCommand, 2);

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
        },
      ],
    });


    orgClientMock
    .on(ListRootsCommand)
    .resolves({
        Roots: [{'Id': 'r-2-d2'}] ,
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

    expect(orgClientMock).toHaveReceivedCommandTimes(ListAccountsCommand, 2);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListRootsCommand, 1);
  });

  it ('returns email address for existing account AND not in suspended OU', async () => {

    orgClientMock
    .on(ListAccountsCommand)
    .resolves({
      Accounts: [
        {
          Email: 'root+this-is-what-we-need@aws.superluminar.io',
          Id: '333333333333',
          Name: 'sbstjn-example',
        },
      ],
    });


    orgClientMock
    .on(ListRootsCommand)
    .resolves({
        Roots: [{'Id': 'r-444'}] ,
    });


    orgClientMock
    .on(ListOrganizationalUnitsForParentCommand)
    .resolves({
      OrganizationalUnits: [ 
        { 
          "Arn": "arn:aws:organizations::111111111111:ou/o-exampleorgid/ou-examplerootid111-exampleouid111",
          "Name": "NotSuspended"
        }
      ]
    });

    // accounts in NotSuspended OU
    orgClientMock
    .on(ListAccountsForParentCommand)
    .resolves({
      Accounts: [
        {
          Email: 'root+some-other-account@aws.superluminar.io',
          Id: '222222222222',
          Name: 'example-two',
        },
      ]
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

    // query accounts and OUs but dont query children of OU since not Suspended OU
    expect(orgClientMock).toHaveReceivedCommandTimes(ListRootsCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListOrganizationalUnitsForParentCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListAccountsForParentCommand, 0);
  
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
        },
      ],
    });


    orgClientMock
    .on(ListRootsCommand)
    .resolves({
        Roots: [{'Id': 'r-ftrs'}] ,
    });


    orgClientMock
    .on(ListOrganizationalUnitsForParentCommand)
    .resolves({
      OrganizationalUnits: [ 
        { 
          "Arn": "arn:aws:organizations::111111111111:ou/o-exampleorgid/ou-examplerootid111-exampleouid111",
          "Name": "Suspended"
        }
      ]
    });

 
    orgClientMock
    .on(ListAccountsForParentCommand)
    .resolves({
      Accounts: [
        {
          Email: 'root+this-is-what-we-need@aws.superluminar.io',
          Id: '333333333333',
          Name: 'sbstjn-example',
        },
      ]
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
          Name: 'example-one',
        },
      ],
    });

    orgClientMock
    .on(ListRootsCommand)
    .resolves({
        Roots: [{'Id': 'r-2ts2'}] ,
    });

    orgClientMock
    .on(ListOrganizationalUnitsForParentCommand)
    .resolves({
      OrganizationalUnits: [ 
        { 
          "Arn": "arn:aws:organizations::111111111111:ou/o-exampleorgid/ou-examplerootid111-exampleouid111",
          "Name": "Suspended"
        }
      ]
    });

    orgClientMock
    .on(ListAccountsForParentCommand)
    .resolves({
      Accounts: [
        {
          Email: 'root+some-other-account@aws.superluminar.io',
          Id: '222222222222',
          Name: 'example-two',
        },
      ]
    });

    const result = await handler(
      {
        RequestType: 'Create',
        ResourceProperties: {
          Domain: 'aws.superluminar.io',
          Name: 'example-one',
        },
      } as unknown as OnEventRequest,
    );

    expect(result).toHaveProperty('Data.Email', 'root+this-is-what-we-need@aws.superluminar.io');

    expect(orgClientMock).toHaveReceivedCommandTimes(ListRootsCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListOrganizationalUnitsForParentCommand, 1);
    expect(orgClientMock).toHaveReceivedCommandTimes(ListAccountsForParentCommand, 1);
  
  });

  it('cannot generate email address for long domain names', async () => {


    orgClientMock
    .on(ListAccountsCommand)
    .resolves({
      Accounts: []
    });


    orgClientMock
    .on(ListRootsCommand)
    .resolves({
        Roots: [{'Id': 'r-2ts2'}] ,
    });

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
    orgClientMock
    .on(ListAccountsCommand)
    .resolves({
      Accounts: []
    });

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
    orgClientMock
    .on(ListAccountsCommand)
    .resolves({
      Accounts: []
    });

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
