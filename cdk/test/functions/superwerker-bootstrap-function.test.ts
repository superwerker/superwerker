const spySSMPutParameter = jest.fn();
const spySSM = jest.fn(() => ({ putParameter: spySSMPutParameter }));

const spyEventBridgePutEvents = jest.fn();
const spyEventBridge = jest.fn(() => ({ putEvents: spyEventBridgePutEvents }));

jest.mock('aws-sdk', () => ({
  SSM: spySSM,
  EventBridge: spyEventBridge,
}));

const putSpy = jest.fn();

jest.mock('axios', () => ({
  put: putSpy,
}));

import { handler } from '../../src/functions/superwerker-bootstrap-function';

describe('superwerker bootstrap function', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.SIGNAL_URL = 'test-url';
  });

  afterEach(() => {
    delete process.env.SIGNAL_URL;
  });

  it('puts parameters for each account and sends events', async () => {
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

    expect(spySSMPutParameter).toHaveBeenCalledTimes(event.accounts.length);
    expect(spySSMPutParameter).toHaveBeenNthCalledWith(1, {
      Name: '/superwerker/account_id_testaccountname',
      Value: event.accounts[0].accountId,
      Overwrite: true,
      Type: 'String',
    });
    expect(spySSMPutParameter).toHaveBeenNthCalledWith(2, {
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

    expect(spyEventBridgePutEvents).toHaveBeenCalledTimes(1);
    expect(spyEventBridgePutEvents).toHaveBeenCalledWith({
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
