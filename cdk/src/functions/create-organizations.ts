import {
  OrganizationsClient,
  CreateOrganizationCommand,
  CreateOrganizationCommandOutput,
  DescribeOrganizationCommand,
  DescribeOrganizationCommandOutput,
} from '@aws-sdk/client-organizations';

import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';

export async function createOrganizations(): Promise<CreateOrganizationCommandOutput | DescribeOrganizationCommandOutput> {
  const client = new OrganizationsClient({});
  const command = new CreateOrganizationCommand({ FeatureSet: 'ALL' });
  let response;
  try {
    response = client.send(command);
  } catch (AlreadyInOrganizationException) {
    response = client.send(new DescribeOrganizationCommand({}));
  }
  return response;
}

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  switch (event.RequestType) {
    case 'Create':
      console.log('Creating organizations...');
      const organizations = await createOrganizations();
      return {
        PhysicalResourceId: organizations.Organization?.Id,
      };
    case 'Update':
    case 'Delete':
      console.log('Received Update/Delete Event, doing nothing');
      return {};
  }
}
