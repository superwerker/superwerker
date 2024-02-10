import 'aws-sdk-client-mock-jest';
import {
  OrganizationsClient,
  CreateOrganizationCommand,
  AlreadyInOrganizationException,
  AccountOwnerNotVerifiedException,
} from '@aws-sdk/client-organizations';
import { ParameterAlreadyExists, ParameterLimitExceeded, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { OnEventRequest } from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import { mockClient } from 'aws-sdk-client-mock';
import axios from 'axios';
import { handler } from '../../src/functions/create-organizations';

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

    const response = await handler({
      RequestType: 'Create',
      ResourceProperties: {
        SIGNAL_URL: 'https://example.com',
      },
    } as unknown as OnEventRequest);

    expect(response).toMatchObject({ PhysicalResourceId: 'org-id' });

    expect(organizationsClientMock).toHaveReceivedCommandWith(CreateOrganizationCommand, { FeatureSet: 'ALL' });
  });

  it('skip create organization ', async () => {
    organizationsClientMock
      .on(CreateOrganizationCommand)
      .rejects(new AlreadyInOrganizationException({ message: 'Organization already exists', $metadata: {} }));

    ssmClientMock.on(PutParameterCommand).resolves({});

    const response = await handler({
      RequestType: 'Create',
      ResourceProperties: {
        SIGNAL_URL: 'https://example.com',
      },
    } as unknown as OnEventRequest);

    expect(response).toMatchObject({ PhysicalResourceId: 'organisationalreadyexists' });

    expect(organizationsClientMock).toHaveReceivedCommandWith(CreateOrganizationCommand, { FeatureSet: 'ALL' });
  });

  it('throw on unexpected org error', async () => {
    organizationsClientMock
      .on(CreateOrganizationCommand)
      .rejects(new AccountOwnerNotVerifiedException({ message: 'dummy message', $metadata: {} }));

    try {
      await handler({
        RequestType: 'Create',
        ResourceProperties: {
          SIGNAL_URL: 'https://example.com',
        },
      } as unknown as OnEventRequest);
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

    const response = await handler({
      RequestType: 'Create',
      ResourceProperties: {
        SIGNAL_URL: 'https://example.com',
      },
    } as unknown as OnEventRequest);

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
      await handler({
        RequestType: 'Create',
        ResourceProperties: {
          SIGNAL_URL: 'https://example.com',
          SECURITY_OU_SSM_PARAMETER: 'Security',
          SANDBOX_OU_SSM_PARAMETER: 'Sandbox',
        },
      } as unknown as OnEventRequest);
    } catch (e) {
      expect(e).toMatchObject(new Error('Unexpected error while creating SSM Parameter: ParameterLimitExceeded: dummy message'));
    }
  });

  it('Custom Resource Update', async () => {
    const result = await handler({
      RequestType: 'Update',
    } as unknown as OnEventRequest);

    expect(organizationsClientMock).not.toHaveReceivedCommand(CreateOrganizationCommand);

    expect(result).toMatchObject({});
  });

  it('Custom Resource Delete', async () => {
    const result = await handler({
      RequestType: 'Delete',
    } as unknown as OnEventRequest);

    expect(organizationsClientMock).not.toHaveReceivedCommand(CreateOrganizationCommand);

    expect(result).toMatchObject({});
  });
});
