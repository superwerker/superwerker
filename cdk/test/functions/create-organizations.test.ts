import 'aws-sdk-client-mock-jest';
import { OrganizationsClient, CreateOrganizationCommand } from '@aws-sdk/client-organizations';
import { OnEventRequest } from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../src/functions/create-organizations';

var organizationsClientMock = mockClient(OrganizationsClient);

describe('create organizations function', () => {
  beforeEach(() => {
    organizationsClientMock.reset();
  });

  it('create organization if it does not exist', async () => {
    organizationsClientMock.on(CreateOrganizationCommand).resolves({
      Organization: {
        Id: 'org-id',
      },
    });

    const response = await handler({
      RequestType: 'Create',
      ResourceProperties: {
        SIGNAL_URL: 'https://example.com',
      },
    } as unknown as OnEventRequest);
    console.log(response);

    expect(response).toMatchObject({ PhysicalResourceId: 'org-id' });

    expect(organizationsClientMock).toHaveReceivedCommandWith(CreateOrganizationCommand, { FeatureSet: 'ALL' });
  });

  it('fetch organization if it already exist', async () => {
    organizationsClientMock.on(CreateOrganizationCommand).rejects();

    const response = await handler({
      RequestType: 'Create',
    } as unknown as OnEventRequest);
    expect(response).toMatchObject({ PhysicalResourceId: 'undefined' });

    expect(organizationsClientMock).toHaveReceivedCommandWith(CreateOrganizationCommand, { FeatureSet: 'ALL' });
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
