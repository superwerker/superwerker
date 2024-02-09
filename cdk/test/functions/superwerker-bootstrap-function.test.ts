import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { OnEventRequest } from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handler } from '../../src/functions/superwerker-bootstrap-function';

var eventBridgeClientMock = mockClient(EventBridgeClient);

describe('superwerker bootstrap function', () => {
  beforeEach(() => {
    eventBridgeClientMock.reset();
    process.env.SIGNAL_URL = 'test-url';
  });

  afterEach(() => {
    delete process.env.SIGNAL_URL;
  });

  it('puts parameters for each account and sends events', async () => {
    eventBridgeClientMock.on(PutEventsCommand).resolves({});

    await handler({
      RequestType: 'Create',
    } as unknown as OnEventRequest);

    expect(eventBridgeClientMock).toHaveReceivedCommandWith(PutEventsCommand, {
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
  });

  it('Custom Resource Update', async () => {
    const result = await handler({
      RequestType: 'Update',
    } as unknown as OnEventRequest);

    expect(eventBridgeClientMock).not.toHaveReceivedCommand(PutEventsCommand);

    expect(result).toMatchObject({});
  });

  it('Custom Resource Delete', async () => {
    const result = await handler({
      RequestType: 'Delete',
    } as unknown as OnEventRequest);

    expect(eventBridgeClientMock).not.toHaveReceivedCommand(PutEventsCommand);

    expect(result).toMatchObject({});
  });
});
