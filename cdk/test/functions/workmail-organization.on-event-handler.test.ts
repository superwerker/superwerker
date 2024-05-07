import { Route53Client } from '@aws-sdk/client-route-53';
import { SESClient, CreateReceiptRuleSetCommand, DeleteReceiptRuleSetCommand, SetActiveReceiptRuleSetCommand } from '@aws-sdk/client-ses';
import { WorkMailClient, CreateOrganizationCommand, ListOrganizationsCommand, DeleteOrganizationCommand } from '@aws-sdk/client-workmail';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handler } from '../../src/functions/workmail-organization.on-event-handler';

const workmailClientMock = mockClient(WorkMailClient);
const route53ClientMock = mockClient(Route53Client);
const sesClientMock = mockClient(SESClient);
jest.mock('uuid', () => ({ v4: () => '123123123' }));

describe('workmail-organization.on-event-handler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    workmailClientMock.reset();
    route53ClientMock.reset();
  });

  it('creates workmail organization and SES ruleset on "create" event', async () => {
    workmailClientMock.on(CreateOrganizationCommand).resolves({ OrganizationId: 'orgid123' });
    sesClientMock.on(CreateReceiptRuleSetCommand).resolves({});

    const event = {
      RequestType: 'Create',
      ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
      ResponseURL: '...',
      StackId: 'arn:aws:cloudformation:eu-central-1:123123:stack/xxx',
      RequestId: 'myRequestId123123',
      LogicalResourceId: 'WorkmailOrganization123',
      ResourceType: 'Custom::WorkmailOrganization',
      ResourceProperties: {
        ServiceToken: 'arn:aws:lambda:eu-central-1:123123:function:xxx',
        Domain: 'aws.testdomain.com',
        PropagationParamName: '/superwerker/propagation_status',
        HostedZoneId: 'hostedzoneid123',
      },
    } as unknown as AWSLambda.CloudFormationCustomResourceEvent;

    const result = await handler(event);

    expect(sesClientMock).toHaveReceivedCommandWith(CreateReceiptRuleSetCommand, {
      RuleSetName: 'RootMail-v2',
    });

    expect(sesClientMock).toHaveReceivedCommandWith(SetActiveReceiptRuleSetCommand, {
      RuleSetName: 'RootMail-v2',
    });

    expect(workmailClientMock).toHaveReceivedCommandWith(CreateOrganizationCommand, {
      Alias: '123123123',
      Domains: [
        {
          DomainName: 'aws.testdomain.com',
          HostedZoneId: 'hostedzoneid123',
        },
      ],
      EnableInteroperability: false,
    });

    expect(result).toMatchObject({
      PhysicalResourceId: 'orgid123',
      Data: {
        workmailOrgId: 'orgid123',
      },
    });
  });

  it('deletes workmail organization & DNS records when receiving "delete" event', async () => {
    workmailClientMock.on(DeleteOrganizationCommand).resolves({});
    sesClientMock.on(DeleteReceiptRuleSetCommand).resolves({});

    const event = {
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
    } as unknown as AWSLambda.CloudFormationCustomResourceDeleteEvent;

    const result = await handler(event);

    expect(sesClientMock).toHaveReceivedCommandWith(DeleteReceiptRuleSetCommand, {
      RuleSetName: 'RootMail-v2',
    });

    expect(workmailClientMock).toHaveReceivedCommandWith(DeleteOrganizationCommand, {
      OrganizationId: event.PhysicalResourceId,
      DeleteDirectory: true,
      ForceDelete: false,
    });

    expect(result).toMatchObject({
      PhysicalResourceId: event.PhysicalResourceId,
    });
  });

  it('execution does not fail when delete workmail fails', async () => {
    workmailClientMock.on(DeleteOrganizationCommand).rejects('OrganizationNotFoundException');
    sesClientMock.on(DeleteReceiptRuleSetCommand).rejects('CannotDeleteException');

    const event = {
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
    } as unknown as AWSLambda.CloudFormationCustomResourceDeleteEvent;

    const result = await handler(event);

    expect(workmailClientMock).toHaveReceivedCommandWith(DeleteOrganizationCommand, {
      OrganizationId: event.PhysicalResourceId,
      DeleteDirectory: true,
      ForceDelete: false,
    });

    expect(sesClientMock).toHaveReceivedCommandWith(DeleteReceiptRuleSetCommand, {
      RuleSetName: 'RootMail-v2',
    });

    expect(result).toMatchObject({
      PhysicalResourceId: event.PhysicalResourceId,
    });
  });

  it('does not do anything on "update" event when user exists', async () => {
    workmailClientMock.on(ListOrganizationsCommand).resolves({
      OrganizationSummaries: [
        {
          OrganizationId: 'orgid123',
          Alias: '123123',
          DefaultMailDomain: 'aws.testdomain.com',
        },
      ],
    });

    const event = {
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
    } as unknown as AWSLambda.CloudFormationCustomResourceEvent;

    await handler(event);

    expect(workmailClientMock).not.toHaveReceivedCommand(CreateOrganizationCommand);
  });
});
