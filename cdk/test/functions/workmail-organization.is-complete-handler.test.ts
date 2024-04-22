import { mockClient } from 'aws-sdk-client-mock';
import { handler, isCompleteEvent } from '../../src/functions/workmail-organization.is-complete-handler';
import 'aws-sdk-client-mock-jest';
import {
  WorkMailClient,
  DescribeOrganizationCommand,
  GetMailDomainCommand,
  UpdateDefaultMailDomainCommand,
} from '@aws-sdk/client-workmail';
import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const workmailClientMock = mockClient(WorkMailClient);
const ssmClientMock = mockClient(SSMClient);

const event = {
  RequestType: 'Create',
  ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
  ResponseURL: '...',
  StackId: 'arn:aws:cloudformation:eu-central-1:123123:stack/xxx',
  RequestId: 'myRequestId123123',
  PhysicalResourceId: 'orgid123',
  LogicalResourceId: 'WorkmailOrganization123',
  ResourceType: 'Custom::WorkmailOrganization',
  ResourceProperties: {
    ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
    Domain: 'aws.testdomain.com',
    PropagationParamName: '/superwerker/propagation_status',
    HostedZoneId: 'hostedzoneid123',
  },
} as isCompleteEvent;

describe('workmail-organization.is-complete-handler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    workmailClientMock.reset();
    ssmClientMock.reset();

    workmailClientMock
      .on(DescribeOrganizationCommand, {
        OrganizationId: 'orgid123',
      })
      .resolves({
        State: 'Active',
      });

    workmailClientMock.on(GetMailDomainCommand).resolves({
      OwnershipVerificationStatus: 'VERIFIED',
      DkimVerificationStatus: 'VERIFIED',
    });
  });

  it('puts SSM parameter on "create" event when domain is verified', async () => {
    await handler(event);

    expect(ssmClientMock).toHaveReceivedCommandWith(PutParameterCommand, {
      Name: '/superwerker/propagation_status',
      Value: 'done',
      Overwrite: true,
    });
  });

  it('sets the custom domain as default when domain is verified', async () => {
    await handler(event);

    expect(workmailClientMock).toHaveReceivedCommandWith(UpdateDefaultMailDomainCommand, {
      OrganizationId: 'orgid123',
      DomainName: 'aws.testdomain.com',
    });
  });

  it('returns true on "create" event when domain is verified', async () => {
    const result = await handler(event);

    expect(result).toMatchObject({ IsComplete: true });
  });

  it('returns false when workmail organization is not in "active" state', async () => {
    workmailClientMock
      .on(DescribeOrganizationCommand, {
        OrganizationId: 'orgid123',
      })
      .resolves({
        State: 'Pending',
      });

    const result = await handler(event);

    expect(result).toMatchObject({ IsComplete: false });
    expect(ssmClientMock).not.toHaveReceivedCommand(PutParameterCommand);
  });

  it('returns false when domain ownership is not verified', async () => {
    workmailClientMock.on(GetMailDomainCommand).resolves({
      OwnershipVerificationStatus: 'PENDING',
      DkimVerificationStatus: 'VERIFIED',
    });

    const result = await handler(event);

    expect(result).toMatchObject({ IsComplete: false });
    expect(ssmClientMock).not.toHaveReceivedCommand(PutParameterCommand);
  });

  it('returns false when domain DKIM is not verified', async () => {
    workmailClientMock.on(GetMailDomainCommand).resolves({
      OwnershipVerificationStatus: 'VERIFIED',
      DkimVerificationStatus: 'PENDING',
    });

    const result = await handler(event);

    expect(result).toMatchObject({ IsComplete: false });
    expect(ssmClientMock).not.toHaveReceivedCommand(PutParameterCommand);
  });

  it('returns true on "delete" event', async () => {
    const deleteEvent = {
      RequestType: 'Delete',
      ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
      ResponseURL: '...',
      StackId: 'arn:aws:cloudformation:eu-central-1:123123:stack/xxx',
      RequestId: 'myRequestId123123',
      PhysicalResourceId: 'orgid123',
      LogicalResourceId: 'WorkmailOrganization123',
      ResourceType: 'Custom::WorkmailOrganization',
      ResourceProperties: {
        ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
        Domain: 'aws.testdomain.com',
        PropagationParamName: '/superwerker/propagation_status',
        HostedZoneId: 'hostedzoneid123',
      },
    } as isCompleteEvent;

    const result = await handler(deleteEvent);

    expect(result).toMatchObject({ IsComplete: true });
  });

  it('returns true on "update" event', async () => {
    const deleteEvent = {
      RequestType: 'Update',
      ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
      ResponseURL: '...',
      StackId: 'arn:aws:cloudformation:eu-central-1:123123:stack/xxx',
      RequestId: 'myRequestId123123',
      PhysicalResourceId: 'orgid123',
      LogicalResourceId: 'WorkmailOrganization123',
      ResourceType: 'Custom::WorkmailOrganization',
      ResourceProperties: {
        ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
        Domain: 'aws.testdomain.com',
        PropagationParamName: '/superwerker/propagation_status',
        HostedZoneId: 'hostedzoneid123',
      },
    } as isCompleteEvent;

    const result = await handler(deleteEvent);

    expect(result).toMatchObject({ IsComplete: true });
  });
});
