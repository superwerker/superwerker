import {
  GetAccountSendingEnabledCommand,
  GetIdentityDkimAttributesCommand,
  GetIdentityNotificationAttributesCommand,
  GetIdentityVerificationAttributesCommand,
  SESClient,
} from '@aws-sdk/client-ses';
import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { OnEventRequest } from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import 'aws-sdk-client-mock-jest';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../src/functions/hosted-zone-dkim-propagation.is-complete-handler';

const sesClientMock = mockClient(SESClient);
const ssmClientMock = mockClient(SSMClient);

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
    PropagationParamName: '/superwerker/propagation_status',
  },
} as unknown as OnEventRequest;

describe('hosted-zone-dkim-propagation.is-complete-handler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sesClientMock.reset();
    ssmClientMock.reset();

    sesClientMock.on(GetAccountSendingEnabledCommand).resolves({ Enabled: true });
    sesClientMock.on(GetIdentityVerificationAttributesCommand).resolves({
      VerificationAttributes: {
        'aws.testdomain.com': {
          VerificationStatus: 'Success',
        },
      },
    });
    sesClientMock.on(GetIdentityDkimAttributesCommand).resolves({
      DkimAttributes: {
        'aws.testdomain.com': {
          DkimVerificationStatus: 'Success',
          DkimEnabled: true,
        },
      },
    });
    sesClientMock.on(GetIdentityNotificationAttributesCommand).resolves({
      NotificationAttributes: {
        'aws.testdomain.com': {
          ForwardingEnabled: true,
          BounceTopic: '',
          ComplaintTopic: '',
          DeliveryTopic: '',
        },
      },
    });
  });

  it('puts SSM parameter on "create" event when propagation is verified', async () => {
    ssmClientMock.on(PutParameterCommand).resolves({});

    await handler(event);

    expect(ssmClientMock).toReceiveCommandWith(PutParameterCommand, {
      Name: '/superwerker/propagation_status',
      Value: 'done',
      Overwrite: true,
    });
  });

  it('returns true on "create" event when propagation is verified', async () => {
    ssmClientMock.on(PutParameterCommand).resolves({});

    const res = await handler(event);

    expect(res).toMatchObject({ IsComplete: true });
  });

  it('does not update SSM parameter on "create" event when propagation is not verified', async () => {
    sesClientMock.on(GetAccountSendingEnabledCommand).resolves({ Enabled: false });
    ssmClientMock.on(PutParameterCommand).resolves({});

    await handler(event);

    expect(ssmClientMock).not.toHaveReceivedCommand(PutParameterCommand);
  });

  it('returns false on "create" event when propagation is not verified', async () => {
    sesClientMock.on(GetAccountSendingEnabledCommand).resolves({ Enabled: false });
    ssmClientMock.on(PutParameterCommand).resolves({});

    const res = await handler(event);

    expect(res).toMatchObject({ IsComplete: false });
  });

  it('returns true on "delete" event', async () => {
    const deleteEvent = {
      RequestType: 'Delete',
      ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
      ResponseURL: '...',
      StackId: 'arn:aws:cloudformation:eu-central-1:123123:stack/xxx',
      RequestId: 'myRequestId123123',
      LogicalResourceId: 'HostedZoneDkimHostedZoneDKIMAndVerificationRecords123',
      ResourceType: 'Custom::HostedZoneDKIMAndVerificationRecords',
      ResourceProperties: {
        ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
        Domain: 'aws.testdomain.com',
        PropagationParamName: '/superwerker/propagation_status',
      },
    } as unknown as OnEventRequest;

    const res = await handler(deleteEvent);
    expect(res).toMatchObject({ IsComplete: true });
  });

  it('returns true on "update" event', async () => {
    const updateEvent = {
      RequestType: 'Update',
      ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
      ResponseURL: '...',
      StackId: 'arn:aws:cloudformation:eu-central-1:123123:stack/xxx',
      RequestId: 'myRequestId123123',
      LogicalResourceId: 'HostedZoneDkimHostedZoneDKIMAndVerificationRecords123',
      ResourceType: 'Custom::HostedZoneDKIMAndVerificationRecords',
      ResourceProperties: {
        ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
        Domain: 'aws.testdomain.com',
        PropagationParamName: '/superwerker/propagation_status',
      },
    } as unknown as OnEventRequest;

    const res = await handler(updateEvent);
    expect(res).toMatchObject({ IsComplete: true });
  });

  it('returns false if VerificationStatus is failed', async () => {
    sesClientMock.on(GetIdentityVerificationAttributesCommand).resolves({
      VerificationAttributes: {
        'aws.testdomain.com': {
          VerificationStatus: 'Failed',
        },
      },
    });
    const res = await handler(event);
    expect(res).toMatchObject({ IsComplete: false });
  });

  it('returns false if DKIM Verification is failed', async () => {
    sesClientMock.on(GetIdentityDkimAttributesCommand).resolves({
      DkimAttributes: {
        'aws.testdomain.com': {
          DkimVerificationStatus: 'Failed',
          DkimEnabled: true,
        },
      },
    });
    const res = await handler(event);
    expect(res).toMatchObject({ IsComplete: false });
  });

  it('returns false if forwarding enabled is false', async () => {
    sesClientMock.on(GetIdentityNotificationAttributesCommand).resolves({
      NotificationAttributes: {
        'aws.testdomain.com': {
          ForwardingEnabled: false,
          BounceTopic: '',
          ComplaintTopic: '',
          DeliveryTopic: '',
        },
      },
    });
    const res = await handler(event);
    expect(res).toMatchObject({ IsComplete: false });
  });
});
