import { OnEventRequest } from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import 'aws-sdk-client-mock-jest';
import { handler } from '../../src/functions/hosted-zone-dkim-propagation.on-event-handler';

describe('hosted-zone-dkim-propagation.on-event-handler', () => {
  it('returns the correct PhysicalResourceId when receiving "create" event', async () => {
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

    const result = await handler(event);

    expect(result).toMatchObject({
      PhysicalResourceId: 'myRequestId123123',
    });
  });

  it('returns the correct PhysicalResourceId when receiving "delete" event', async () => {
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
    } as unknown as OnEventRequest;

    const result = await handler(event);

    expect(result).toMatchObject({
      PhysicalResourceId: 'myPhysicalResourceId',
    });
  });

  it('returns the correct PhysicalResourceId when receiving "update" event', async () => {
    const event = {
      RequestType: 'Update',
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
    } as unknown as OnEventRequest;

    const result = await handler(event);

    expect(result).toMatchObject({
      PhysicalResourceId: 'myPhysicalResourceId',
    });
  });
});
