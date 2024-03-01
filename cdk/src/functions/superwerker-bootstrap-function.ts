import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const eventBridgeClient = new EventBridgeClient();

export async function bootstap() {
  // signal Control Tower Landing Zone Setup/Update has finished
  const putEventsCommand = new PutEventsCommand({
    Entries: [
      {
        DetailType: 'superwerker-event',
        Detail: JSON.stringify({
          eventName: 'LandingZoneSetupOrUpdateFinished',
        }),
        Source: 'superwerker',
      },
    ],
  });

  const response = await eventBridgeClient.send(putEventsCommand);
  return response;
}

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  switch (event.RequestType) {
    case 'Create':
      console.log('Triggering enablement of superwerker features...');
      return bootstap();
    case 'Delete':
    case 'Update':
      console.log('Stack is being deleted or updated, doing nothing');
      return {};
  }
}
