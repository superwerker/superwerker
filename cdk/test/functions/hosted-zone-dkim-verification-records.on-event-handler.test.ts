import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handler } from '../../src/functions/hosted-zone-dkim-verification-records.on-event-handler';
import { DeleteIdentityCommand, SESClient, VerifyDomainDkimCommand, VerifyDomainIdentityCommand } from '@aws-sdk/client-ses';

const sesClientMock = mockClient(SESClient);

describe('hosted-zone-dkim-verification-records.on-event-handler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sesClientMock.reset();
  });

  it('returns the information for SES verification when receiving "create" event', async () => {
    sesClientMock
      .on(VerifyDomainIdentityCommand, {
        Domain: 'aws.testdomain.com',
      })
      .resolves({
        VerificationToken: 'myVerificationToken',
      });

    sesClientMock
      .on(VerifyDomainDkimCommand, {
        Domain: 'aws.testdomain.com',
      })
      .resolves({
        DkimTokens: ['token1', 'token2', 'token3'],
      });

    const event = {
      RequestType: 'Create',
      ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
      ResponseURL: '...',
      StackId: 'arn:aws:cloudformation:eu-central-1:123123:stack/xxx',
      RequestId: 'myRequestId123123',
      LogicalResourceId: 'HostedZoneDkimHostedZoneDKIMAndVerificationRecords123',
      ResourceType: 'Custom::HostedZoneDKIMAndVerificationRecords',
      ResourceProperties: {
        ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
        Domain: 'aws.testdomain.com',
      },
    } as unknown as AWSLambda.CloudFormationCustomResourceEvent;

    const result = await handler(event);

    expect(sesClientMock).toReceiveCommandWith(VerifyDomainDkimCommand, {
      Domain: 'aws.testdomain.com',
    });

    expect(sesClientMock).toReceiveCommandWith(VerifyDomainIdentityCommand, {
      Domain: 'aws.testdomain.com',
    });

    expect(result).toMatchObject({
      PhysicalResourceId: 'myRequestId123123',
      Data: {
        VerificationToken: 'myVerificationToken',
        DkimTokens: ['token1', 'token2', 'token3'],
      },
    });
  });

  it('does not delete SES identity when receiving "delete" event', async () => {
    sesClientMock.on(DeleteIdentityCommand, { Identity: 'aws.testdomain.com' }).resolves({});

    const event = {
      RequestType: 'Delete',
      ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
      ResponseURL: '...',
      StackId: 'arn:aws:cloudformation:eu-central-1:123123:stack/xxx',
      RequestId: 'myRequestId123123',
      PhysicalResourceId: 'myPhysicalResourceId',
      LogicalResourceId: 'HostedZoneDkimHostedZoneDKIMAndVerificationRecords123',
      ResourceType: 'Custom::HostedZoneDKIMAndVerificationRecords',
      ResourceProperties: {
        ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
        Domain: 'aws.testdomain.com',
      },
    } as unknown as AWSLambda.CloudFormationCustomResourceEvent;

    const result = await handler(event);

    expect(sesClientMock).not.toHaveReceivedCommand(DeleteIdentityCommand);

    expect(result).toMatchObject({
      PhysicalResourceId: 'myPhysicalResourceId',
    });
  });
});
