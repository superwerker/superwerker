// eslint-disable-next-line import/no-unresolved
import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
export const PROP_DOMAIN = 'Domain';

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  switch (event.RequestType) {
    case 'Create':
      console.log(`${event.RequestType} DKIM propagation. PhysicalResourceId: ${event.RequestId}`);
      return {
        PhysicalResourceId: event.RequestId,
      };
    case 'Update':
    case 'Delete':
      console.log(`${event.RequestType} DKIM propagation, doing nothing. PhysicalResourceId: ${event.PhysicalResourceId}`);
      return {
        PhysicalResourceId: event.PhysicalResourceId,
      };
  }
}
