import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handler } from '../../src/functions/notification-opsitem-created';

const snsClientMock = mockClient(SNSClient);
const opsItemId = 'message_123';
const title = 'test_message_title';
const titleLong = 'test_message_title_longer_than_100_characters_which_should_be_cut_off_so_it_has_to_be_very_long';
const titleLongCutOff = 'test_message_title_longer_than_100_characters_which_should_be_cut_off_so_it_has_to_b...';
const description = 'test_message_description';
const region = 'us-east-1';
const url = `https://${region}.console.aws.amazon.com/systems-manager/opsitems/${opsItemId}`;

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
            opsItemId: opsItemId,
          },
          requestParameters: {
            description: description,
            title: title,
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

  it('notifications_opsitems_create_cut_off_long_title', async () => {
    snsClientMock.on(PublishCommand).resolves({
      MessageId: 'Message_123',
    });

    await handler(
      {
        detail: {
          responseElements: {
            opsItemId: opsItemId,
          },
          requestParameters: {
            description: description,
            title: titleLong,
          },
        },
      },
      {},
    );

    expect(snsClientMock).toReceiveCommandTimes(PublishCommand, 1);
    expect(snsClientMock).toReceiveCommandWith(PublishCommand, {
      Message: `${description}\n\n${url}`,
      Subject: `New OpsItem: ${titleLongCutOff}`,
      TopicArn: process.env.TOPIC_ARN,
    });
  });
});
