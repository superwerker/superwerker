import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handler } from '../../src/functions/workmail-organization.on-event-handler';
import {
  WorkMailClient,
  CreateOrganizationCommand,
  GetMailDomainCommand,
  ListOrganizationsCommand,
  DeleteOrganizationCommand,
} from '@aws-sdk/client-workmail';
import { Route53Client, ChangeResourceRecordSetsCommand } from '@aws-sdk/client-route-53';

const workmailClientMock = mockClient(WorkMailClient);
const route53ClientMock = mockClient(Route53Client);
jest.mock('uuid', () => ({ v4: () => '123123123' }));

describe('workmail-organization.on-event-handler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    workmailClientMock.reset();
    route53ClientMock.reset();
  });

  it('creates workmail organization on "create" event', async () => {
    workmailClientMock.on(CreateOrganizationCommand).resolves({ OrganizationId: 'orgid123' });

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
    workmailClientMock.on(GetMailDomainCommand).resolves({
      Records: [
        {
          Hostname: 'aws.testdomain.com.',
          Type: 'MX',
          Value: '10 inbound-smtp.eu-west-1.amazonaws.com.',
        },
        {
          Hostname: '_amazonses.aws.testdomain.com.',
          Type: 'TXT',
          Value: '1231231231x6rUfvSKmuxr9ahK+8BMLT49/QWY=',
        },
        {
          Hostname: 'autodiscover.aws.testdomain.com.',
          Type: 'CNAME',
          Value: 'autodiscover.mail.eu-west-1.awsapps.com.',
        },
        {
          Hostname: '123123123._domainkey.aws.testdomain.com.',
          Type: 'CNAME',
          Value: '123123123.dkim.amazonses.com.',
        },
        {
          Hostname: 'abcabc._domainkey.aws.testdomain.com.',
          Type: 'CNAME',
          Value: 'abcabc.dkim.amazonses.com.',
        },
        {
          Hostname: 'xyzxyz._domainkey.aws.testdomain.com.',
          Type: 'CNAME',
          Value: 'xyzxyz.dkim.amazonses.com.',
        },
        {
          Hostname: 'aws.testdomain.com.',
          Type: 'TXT',
          Value: 'v=spf1 include:amazonses.com ~all',
        },
        {
          Hostname: '_dmarc.aws.testdomain.com.',
          Type: 'TXT',
          Value: 'v=DMARC1;p=quarantine;pct=100;fo=1',
        },
      ],
    });

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

    expect(route53ClientMock).toHaveReceivedCommandWith(ChangeResourceRecordSetsCommand, {
      HostedZoneId: 'hostedzoneid123',
      ChangeBatch: {
        Comment: 'Delete records from Workmail / SES',
        Changes: [
          {
            Action: 'DELETE',
            ResourceRecordSet: {
              Name: 'aws.testdomain.com.',
              Type: 'MX',
              TTL: 600,
              ResourceRecords: [
                {
                  Value: '10 inbound-smtp.eu-west-1.amazonaws.com.',
                },
              ],
            },
          },
          {
            Action: 'DELETE',
            ResourceRecordSet: {
              Name: '_amazonses.aws.testdomain.com.',
              Type: 'TXT',
              TTL: 600,
              ResourceRecords: [
                {
                  Value: '"1231231231x6rUfvSKmuxr9ahK+8BMLT49/QWY="',
                },
              ],
            },
          },
          {
            Action: 'DELETE',
            ResourceRecordSet: {
              Name: 'autodiscover.aws.testdomain.com.',
              Type: 'CNAME',
              TTL: 600,
              ResourceRecords: [
                {
                  Value: 'autodiscover.mail.eu-west-1.awsapps.com.',
                },
              ],
            },
          },
          {
            Action: 'DELETE',
            ResourceRecordSet: {
              Name: '123123123._domainkey.aws.testdomain.com.',
              Type: 'CNAME',
              TTL: 600,
              ResourceRecords: [
                {
                  Value: '123123123.dkim.amazonses.com.',
                },
              ],
            },
          },
          {
            Action: 'DELETE',
            ResourceRecordSet: {
              Name: 'abcabc._domainkey.aws.testdomain.com.',
              Type: 'CNAME',
              TTL: 600,
              ResourceRecords: [
                {
                  Value: 'abcabc.dkim.amazonses.com.',
                },
              ],
            },
          },
          {
            Action: 'DELETE',
            ResourceRecordSet: {
              Name: 'xyzxyz._domainkey.aws.testdomain.com.',
              Type: 'CNAME',
              TTL: 600,
              ResourceRecords: [
                {
                  Value: 'xyzxyz.dkim.amazonses.com.',
                },
              ],
            },
          },
        ],
      },
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
