import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handler } from '../../src/functions/notification-opsitem-created';

const snsClientMock = mockClient(SNSClient);
const ops_item_id = 'ops_item_id_123';
const title = 'test_message_title';
const description = 'test_message_description';

describe('notifications_opsitems', () => {

  beforeEach(() => {
    jest.resetAllMocks();
    snsClientMock.reset();
    process.env.AWS_REGION = 'us-east-1';
    process.env.TOPIC_ARN = 'no arn';
  });

  afterEach(() => {
    delete process.env.AWS_REGION;
    delete process.env.TOPIC_ARN;
  });

  it('notifications_opsitems_create', async () => {
    snsClientMock
      .on(PublishCommand)
      .resolves({});

    await handler({
      detail: {
        responseElements: {
          opsItemId: ops_item_id,
        },
        requestParameters: {
          description: description,
          title: title,
        },
      },
    }, {});

    expect(snsClientMock).toReceiveCommandTimes(PublishCommand, 1);
  });
});
