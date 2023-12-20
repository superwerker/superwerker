import 'aws-sdk-client-mock-jest';
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import {
  SSMClient,
  PutParameterCommand,
} from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';


const putSpy = jest.fn();

jest.mock('axios', () => ({
  put: putSpy,
}));

import { handler } from '../../src/functions/superwerker-bootstrap-function';


var ssmClientMock = mockClient(SSMClient);
var eventBridgeClientMock = mockClient(EventBridgeClient);


describe('superwerker bootstrap function', () => {

  beforeEach(() => {
    ssmClientMock.reset();
    eventBridgeClientMock.reset();
    process.env.SIGNAL_URL = 'test-url';
  });

  afterEach(() => {
    delete process.env.SIGNAL_URL;
  });

  it('puts parameters for each account and sends events', async () => {

    ssmClientMock
      .on(PutParameterCommand)
      .resolves({});

    eventBridgeClientMock
      .on(PutEventsCommand)
      .resolves({});

    const event = {
      accounts: [{
        accountName: 'test account name',
        accountId: 'test account id',
      }, {
        accountName: 'test account name 2',
        accountId: 'test account id 2',
      }],
    };
    await handler(
      event,
      {},
    );

    expect(ssmClientMock).toHaveReceivedCommandTimes(PutParameterCommand, event.accounts.length);
    expect(ssmClientMock).toHaveReceivedNthCommandWith(1, PutParameterCommand, {
      Name: '/superwerker/account_id_testaccountname',
      Value: event.accounts[0].accountId,
      Overwrite: true,
      Type: 'String',
    });
    expect(ssmClientMock).toHaveReceivedNthCommandWith(2, PutParameterCommand, {
      Name: '/superwerker/account_id_testaccountname2',
      Value: event.accounts[1].accountId,
      Overwrite: true,
      Type: 'String',
    });

    expect(putSpy).toHaveBeenCalledWith('test-url', {
      Status: 'SUCCESS',
      Reason: 'Control Tower Setup completed',
      UniqueId: 'doesthisreallyhavetobeunique',
      Data: 'Control Tower Setup completed',
    });

    expect(eventBridgeClientMock).toHaveReceivedCommandWith(PutEventsCommand, {
      Entries: [
        {
          DetailType: 'superwerker-event',
          Detail: JSON.stringify(
            {
              eventName: 'LandingZoneSetupOrUpdateFinished',
            },
          ),
          Source: 'superwerker',
        },
      ],
    });
  });
});
