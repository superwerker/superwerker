import { CloudWatchClient, PutDashboardCommand } from '@aws-sdk/client-cloudwatch';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

const ssmClientMock = mockClient(SSMClient);
const cwClientMock = mockClient(CloudWatchClient);

import { handler, createDnsDelegationText } from '../../src/functions/living-docs-dashboard-generator';

describe('living-docs-dashboard-generator', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    ssmClientMock.reset();
    cwClientMock.reset();
    process.env.SUPERWERKER_DOMAIN = 'example.com';
    process.env.AWS_REGION = 'us-east-1';
    process.env.HOSTEDZONE_PARAM_NAME = '/superwerker/domain_name_servers';
    process.env.PROPAGATION_PARAM_NAME = '/superwerker/propagation_status';
  });

  afterEach(() => {
    delete process.env.SUPERWERKER_DOMAIN;
    delete process.env.AWS_REGION;
    delete process.env.HOSTEDZONE_PARAM_NAME;
    delete process.env.PROPAGATION_PARAM_NAME;
  });

  it('living-docs-dashboard-generator', async () => {
    ssmClientMock.on(GetParameterCommand, { Name: '/superwerker/domain_name_servers' }).resolves({
      Parameter: {
        Name: '/superwerker/domain_name_servers',
        Type: 'StringList',
        Value: 'ns-1538.awsdns-00.co.uk,ns-925.awsdns-51.net,ns-1209.awsdns-23.org,ns-467.awsdns-58.com',
        Version: 1,
        LastModifiedDate: new Date('2023-03-16T17:00:14.535000+01:00'),
        ARN: 'arn:aws:ssm:eu-central-1:067464808309:parameter/superwerker/domain_name_servers',
        DataType: 'text',
      },
    });

    ssmClientMock.on(GetParameterCommand, { Name: '/superwerker/propagation_status' }).resolves({
      Parameter: {
        Name: '/superwerker/propagation_status',
        Type: 'String',
        Value: 'done',
        Version: 2,
        LastModifiedDate: new Date('2023-03-16T17:00:14.535000+01:00'),
        ARN: 'arn:aws:ssm:eu-central-1:123123:parameter/superwerker/propagation_status',
        DataType: 'text',
      },
    });

    cwClientMock.on(PutDashboardCommand).resolves({});

    const event = {};

    await handler(event, {});

    expect(ssmClientMock).toReceiveCommandWith(GetParameterCommand, {
      Name: '/superwerker/domain_name_servers',
    });

    expect(ssmClientMock).toReceiveCommandWith(GetParameterCommand, {
      Name: '/superwerker/propagation_status',
    });

    expect(cwClientMock).toReceiveCommandTimes(PutDashboardCommand, 1);

    expect(cwClientMock).toReceiveCommandWith(PutDashboardCommand, {
      DashboardName: 'superwerker',
      DashboardBody: expect.stringContaining('DNS configuration is set up correctly'),
    });
  });
});

describe('createDnsDelegationText', () => {
  it('dns ready', async () => {
    const result = await createDnsDelegationText(true, 'example.com', ['ns-record-1', 'ns-record-2']);
    expect(result).toContain('DNS configuration is set up correctly');
  });

  it('dns configuration needed', async () => {
    const result = await createDnsDelegationText(false, 'example.com', ['ns-record-1', 'ns-record-2']);
    expect(result).toContain('DNS configuration needed');
  });

  it('dns pending', async () => {
    const result = await createDnsDelegationText(false, 'example.com', []);
    expect(result).toContain('DNS Setup pending');
  });
});
