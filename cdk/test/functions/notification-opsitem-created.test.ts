import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handler } from '../../src/functions/notification-opsitem-created';

const snsClientMock = mockClient(SNSClient);
const ops_item_id = 'message_123';
const title = 'test_message_title';
const description = 'test_message_description';
const region = 'us-east-1';
const url = `https://${region}.console.aws.amazon.com/systems-manager/opsitems/${ops_item_id}`;

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
    snsClientMock.on(PublishCommand).resolves({
      MessageId: 'Message_123',
    });

    await handler(
      {
        detail: {
          responseElements: {
            OpsItemId: ops_item_id,
          },
          requestParameters: {
            Description: description,
            Title: title,
          },
        },
      },
      {},
    );

    expect(snsClientMock).toReceiveCommandTimes(PublishCommand, 1);
    expect(snsClientMock).toReceiveCommandWith(PublishCommand, {
      Message: `${description}\n\n${url}`,
      Subject: `New OpsItem: ${title}`,
      TopicArn: process.env.TOPIC_ARN,
    });
  });
});
