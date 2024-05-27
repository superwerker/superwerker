import 'aws-sdk-client-mock-jest';
import {
  OrganizationsClient,
  CreateOrganizationCommand,
  AlreadyInOrganizationException,
  AccountOwnerNotVerifiedException,
} from '@aws-sdk/client-organizations';
import { ParameterAlreadyExists, ParameterLimitExceeded, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import {
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
  Context,
} from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import axios from 'axios';
import { handler } from '../../src/functions/./prepare-account';

const organizationsClientMock = mockClient(OrganizationsClient);
const ssmClientMock = mockClient(SSMClient);

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('create organizations function', () => {
  beforeEach(() => {
    organizationsClientMock.reset();
    mockedAxios.put.mockImplementation(() => Promise.resolve({ data: {} }));
  });

  it('create organization', async () => {
    organizationsClientMock.on(CreateOrganizationCommand).resolves({
      Organization: {
        Id: 'org-id',
      },
    });
    ssmClientMock.on(PutParameterCommand).resolves({});

    const response = await handler(
      {
        RequestType: 'Create',
        ResourceProperties: {
          SIGNAL_URL: 'https://example.com',
          ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:custom-resource-handler',
        },
      } as unknown as CloudFormationCustomResourceCreateEvent,
      {} as Context,
    );

    expect(response).toMatchObject({ PhysicalResourceId: 'org-id' });

    expect(organizationsClientMock).toHaveReceivedCommandWith(CreateOrganizationCommand, { FeatureSet: 'ALL' });
  });

  it('skip create organization ', async () => {
    organizationsClientMock
      .on(CreateOrganizationCommand)
      .rejects(new AlreadyInOrganizationException({ message: 'Organization already exists', $metadata: {} }));

    ssmClientMock.on(PutParameterCommand).resolves({});

    const response = await handler(
      {
        RequestType: 'Create',
        ResourceProperties: {
          SIGNAL_URL: 'https://example.com',
          ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:custom-resource-handler',
        },
      } as unknown as CloudFormationCustomResourceCreateEvent,
      {} as Context,
    );

    expect(response).toMatchObject({ PhysicalResourceId: 'organisationalreadyexists' });

    expect(organizationsClientMock).toHaveReceivedCommandWith(CreateOrganizationCommand, { FeatureSet: 'ALL' });
  });

  it('throw on unexpected org error', async () => {
    organizationsClientMock
      .on(CreateOrganizationCommand)
      .rejects(new AccountOwnerNotVerifiedException({ message: 'dummy message', $metadata: {} }));

    try {
      await handler(
        {
          RequestType: 'Create',
          ResourceProperties: {
            SIGNAL_URL: 'https://example.com',
            ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:custom-resource-handler',
          },
        } as unknown as CloudFormationCustomResourceCreateEvent,
        {} as Context,
      );
    } catch (e) {
      expect(e).toMatchObject(new Error('Unexpected error while creating organization: AccountOwnerNotVerifiedException: dummy message'));
    }
  });

  it('ignore ssm already existing', async () => {
    organizationsClientMock.on(CreateOrganizationCommand).resolves({
      Organization: {
        Id: 'org-id',
      },
    });
    ssmClientMock.on(PutParameterCommand).rejects(new ParameterAlreadyExists({ message: 'dummy message', $metadata: {} }));

    const response = await handler(
      {
        RequestType: 'Create',
        ResourceProperties: {
          SIGNAL_URL: 'https://example.com',
          ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:custom-resource-handler',
        },
      } as unknown as CloudFormationCustomResourceCreateEvent,
      {} as Context,
    );

    expect(response).toMatchObject({ PhysicalResourceId: 'org-id' });

    expect(organizationsClientMock).toHaveReceivedCommandWith(CreateOrganizationCommand, { FeatureSet: 'ALL' });
  });

  it('throw on unexpected ssm error', async () => {
    organizationsClientMock.on(CreateOrganizationCommand).resolves({
      Organization: {
        Id: 'org-id',
      },
    });

    ssmClientMock.on(PutParameterCommand).rejects(new ParameterLimitExceeded({ message: 'dummy message', $metadata: {} }));

    try {
      await handler(
        {
          RequestType: 'Create',
          ResourceProperties: {
            SIGNAL_URL: 'https://example.com',
            SECURITY_OU_SSM_PARAMETER: 'Security',
            SANDBOX_OU_SSM_PARAMETER: 'Sandbox',
            ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:custom-resource-handler',
          },
        } as unknown as CloudFormationCustomResourceCreateEvent,
        {} as Context,
      );
    } catch (e) {
      expect(e).toMatchObject(new Error('Unexpected error while creating SSM Parameter: ParameterLimitExceeded: dummy message'));
    }
  });

  it('Return response when cloudformation wait condition signal request fails', async () => {
    mockedAxios.put.mockImplementation(() => Promise.reject(403));

    organizationsClientMock.on(CreateOrganizationCommand).resolves({
      Organization: {
        Id: 'org-id',
      },
    });

    ssmClientMock.on(PutParameterCommand).rejects(new ParameterAlreadyExists({ message: 'dummy message', $metadata: {} }));

    const response = await handler(
      {
        RequestType: 'Update',
        ResourceProperties: {
          SIGNAL_URL: 'https://example.com',
          SECURITY_OU_SSM_PARAMETER: 'Security',
          SANDBOX_OU_SSM_PARAMETER: 'Sandbox',
          ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:custom-resource-handler',
        },
      } as unknown as CloudFormationCustomResourceUpdateEvent,
      {} as Context,
    );

    expect(response).toMatchObject({ PhysicalResourceId: 'org-id' });
  });

  it('Custom Resource Update', async () => {
    organizationsClientMock.on(CreateOrganizationCommand).resolves({
      Organization: {
        Id: 'org-id',
      },
    });

    ssmClientMock.on(PutParameterCommand).rejects(new ParameterLimitExceeded({ message: 'dummy message', $metadata: {} }));

    try {
      await handler(
        {
          RequestType: 'Update',
          ResourceProperties: {
            SIGNAL_URL: 'https://example.com',
            SECURITY_OU_SSM_PARAMETER: 'Security',
            SANDBOX_OU_SSM_PARAMETER: 'Sandbox',
            ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:custom-resource-handler',
          },
        } as unknown as CloudFormationCustomResourceUpdateEvent,
        {} as Context,
      );
    } catch (e) {
      expect(e).toMatchObject(new Error('Unexpected error while creating SSM Parameter: ParameterLimitExceeded: dummy message'));
    }
  });

  it('Custom Resource Delete', async () => {
    const result = await handler(
      {
        RequestType: 'Delete',
        ResourceProperties: {
          SIGNAL_URL: 'https://example.com',
          SECURITY_OU_SSM_PARAMETER: 'Security',
          SANDBOX_OU_SSM_PARAMETER: 'Sandbox',
          ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:custom-resource-handler',
        },
      } as unknown as CloudFormationCustomResourceDeleteEvent,
      {} as Context,
    );

    expect(organizationsClientMock).not.toHaveReceivedCommand(CreateOrganizationCommand);

    expect(result).toMatchObject({});
  });
});
