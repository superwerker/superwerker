import { CdkCustomResourceEvent, CdkCustomResourceResponse, Context } from 'aws-lambda';
export const PROP_DOMAIN = 'Domain';
export const PROP_PARAM_NAME = 'PropagationParamName';

export async function handler(event: CdkCustomResourceEvent, _context: Context): Promise<CdkCustomResourceResponse> {
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
