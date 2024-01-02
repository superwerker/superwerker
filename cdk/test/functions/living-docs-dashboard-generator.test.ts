const spySSMGetParameter = jest.fn();
const spySSM = jest.fn(() => ({ getParameter: spySSMGetParameter }));

const spyCloudWatchPutDashboard = jest.fn();
const spyCloudWatchDescribeAlarms = jest.fn();
const spyCloudWatch = jest.fn(() => ({ 
    putDashboard: spyCloudWatchPutDashboard,
    describeAlarms: spyCloudWatchDescribeAlarms 
    }));

jest.mock('aws-sdk', () => ({
  SSM: spySSM,
  CloudWatch: spyCloudWatch,
}));

import { handler } from '../../src/functions/living-docs-dashboard-generator';

describe('living-docs-dashboard-generator', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.SUPERWERKER_DOMAIN = 'example.com';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    delete process.env.SUPERWERKER_DOMAIN;
    delete process.env.AWS_REGION;
  });

  it('living-docs-dashboard-generator', async () => {

    spySSMGetParameter.mockImplementation(() => ({
      promise() {
        return {
            "Parameter": {
                    "Name": "/superwerker/domain_name_servers",
                    "Type": "StringList",
                    "Value": "ns-1538.awsdns-00.co.uk,ns-925.awsdns-51.net,ns-1209.awsdns-23.org,ns-467.awsdns-58.com",
                    "Version": 1,
                    "LastModifiedDate": "2023-03-16T17:00:14.535000+01:00",
                    "ARN": "arn:aws:ssm:eu-central-1:067464808309:parameter/superwerker/domain_name_servers",
                    "DataType": "text"
            }
        }
    }}));

    spyCloudWatchDescribeAlarms.mockImplementation(() => ({
        promise() {
          return {
            MetricAlarms: [
                  {
                    StateValue : 'OK',
                  },
          ]
        }
      }}));

    spyCloudWatchPutDashboard.mockImplementation(() => ({
        promise() {
          return Promise.resolve();
        },
      }));

    const event = {};

    await handler(
      event,
      {},
    );

    expect(spySSMGetParameter).toHaveBeenCalledTimes(1);
    expect(spySSMGetParameter).toHaveBeenNthCalledWith(1, {
        Name: '/superwerker/domain_name_servers'
    });

    expect(spyCloudWatchDescribeAlarms).toHaveBeenCalledTimes(1);
    expect(spyCloudWatchDescribeAlarms).toHaveBeenNthCalledWith(1, {
        AlarmNames: [
            'superwerker-RootMailReady',
          ],
    });

    expect(spyCloudWatchPutDashboard).toHaveBeenCalledTimes(1);
    expect(spyCloudWatchPutDashboard).toHaveBeenCalledWith(
        expect.objectContaining({DashboardName: 'superwerker', DashboardBody: expect.stringContaining("DNS configuration is set up correctly")}),
    );
})});

import { createDnsDelegationText } from '../../src/functions/living-docs-dashboard-generator';

describe('createDnsDelegationText', () => {


    it('dns ready', async () => {
    
        const result = await createDnsDelegationText(true, "example.com", ["ns-record-1", "ns-record-2"]);
        expect(result).toContain(`DNS configuration is set up correctly`);

    });

    it('dns configuration needed', async () => {
    
        const result = await createDnsDelegationText(false, "example.com", ["ns-record-1", "ns-record-2"]);
        expect(result).toContain(`DNS configuration needed`);
    });

    it('dns pending', async () => {
    
        const result = await createDnsDelegationText(false, "example.com", []);
        expect(result).toContain(`DNS Setup pending`); 

    });
});