import {
  OrganizationsClient,
  CreateOrganizationCommand,
  CreateOrganizationCommandOutput,
  DescribeOrganizationCommand,
  DescribeOrganizationCommandOutput,
  AlreadyInOrganizationException,
} from '@aws-sdk/client-organizations';

import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';

export async function createOrganizations(): Promise<CreateOrganizationCommandOutput | DescribeOrganizationCommandOutput | undefined> {
  const client = new OrganizationsClient({ region: 'us-east-1' });
  const command = new CreateOrganizationCommand({ FeatureSet: 'ALL' });
  let response;
  try {
    response = await client.send(command);
  } catch (e) {
    if (e instanceof AlreadyInOrganizationException) {
      response = await client.send(new DescribeOrganizationCommand({}));
    }
  }
  return response;
}

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  switch (event.RequestType) {
    case 'Create':
      console.log('Creating organizations...');
      try {
        const organizations = await createOrganizations();
        return {
          PhysicalResourceId: organizations!.Organization!.Id,
        };
      } catch (e) {
        //this means the describe organizations call failed, so we return undefined to continue the stack creation
        return {
          PhysicalResourceId: 'undefined',
        };
      }
    case 'Update':
    case 'Delete':
      console.log('Received Update/Delete Event, doing nothing');
      return {};
  }
}
