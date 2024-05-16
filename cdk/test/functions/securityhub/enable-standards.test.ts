import { OrganizationsClient } from '@aws-sdk/client-organizations';
import {
  BatchDisableStandardsCommand,
  BatchEnableStandardsCommand,
  DescribeStandardsCommand,
  DescribeStandardsControlsCommand,
  GetEnabledStandardsCommand,
  SecurityHubClient,
  UpdateStandardsControlCommand,
} from '@aws-sdk/client-securityhub';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { standardsToEnable } from '../../../src/functions/enable-securityhub';
import { SecurityHubStandardsMgmt } from '../../../src/functions/securityhub/enable-standards';

const securityHubClientMock = mockClient(SecurityHubClient);
const organizationsClientMock = mockClient(OrganizationsClient);

const securityHubStandardsMgmt = new SecurityHubStandardsMgmt(new SecurityHubClient());

export const secHubStandards = [
  {
    Name: 'AWS Foundational Security Best Practices v1.0.0',
    StandardsArn: 'arn:aws:securityhub:eu-central-1::standards/aws-foundational-security-best-practices/v/1.0.0',
    EnabledByDefault: true,
  },
  {
    Name: 'CIS AWS Foundations Benchmark v1.2.0',
    StandardsArn: 'arn:aws:securityhub:::ruleset/cis-aws-foundations-benchmark/v/1.2.0',
    EnabledByDefault: true,
  },
];

describe('enableStandards', () => {
  beforeEach(() => {
    securityHubClientMock.reset();
    organizationsClientMock.reset();

    jest.useFakeTimers();
  });

  it('fresh install enable specified standards', async () => {
    securityHubClientMock.on(DescribeStandardsCommand).resolves({
      Standards: secHubStandards,
      NextToken: undefined,
    });

    securityHubClientMock
      .on(GetEnabledStandardsCommand)
      .resolvesOnce({
        StandardsSubscriptions: [],
        NextToken: undefined,
      })
      .resolves({
        StandardsSubscriptions: [
          {
            StandardsSubscriptionArn:
              'arn:aws:securityhub:eu-central-1:11223344556677:subscription/aws-foundational-security-best-practices/v/1.0.0',
            StandardsArn: secHubStandards[0].StandardsArn,
            StandardsInput: {},
            StandardsStatus: 'READY',
          },
        ],
        NextToken: undefined,
      });

    securityHubClientMock.on(DescribeStandardsControlsCommand).resolves({
      Controls: [
        {
          StandardsControlArn:
            'arn:aws:securityhub:eu-central-1:11223344556677:control/aws-foundational-security-best-practices/v/1.0.0/ACM.1',
          ControlStatus: 'ENABLED',
          ControlId: 'ACM.1',
        },
      ],
      NextToken: undefined,
    });

    await securityHubStandardsMgmt.enableStandards(standardsToEnable);

    expect(securityHubClientMock).toHaveReceivedCommandWith(BatchEnableStandardsCommand, {
      StandardsSubscriptionRequests: [{ StandardsArn: secHubStandards[0].StandardsArn }],
    });
    expect(securityHubClientMock).not.toHaveReceivedCommand(BatchDisableStandardsCommand);
  });

  it('fail when standard does not reach READY state', async () => {
    securityHubClientMock.on(DescribeStandardsCommand).resolves({
      Standards: secHubStandards,
      NextToken: undefined,
    });

    securityHubClientMock
      .on(GetEnabledStandardsCommand)
      .resolvesOnce({
        StandardsSubscriptions: [],
        NextToken: undefined,
      })
      .resolves({
        StandardsSubscriptions: [
          {
            StandardsSubscriptionArn:
              'arn:aws:securityhub:eu-central-1:11223344556677:subscription/aws-foundational-security-best-practices/v/1.0.0',
            StandardsArn: secHubStandards[0].StandardsArn,
            StandardsInput: {},
            StandardsStatus: 'PENDING',
          },
        ],
        NextToken: undefined,
      });

    await expect(securityHubStandardsMgmt.enableStandards(standardsToEnable)).rejects.toThrow(
      `Standard ${standardsToEnable[0].name} could not be enabled`,
    );

    expect(securityHubClientMock).toHaveReceivedCommandWith(BatchEnableStandardsCommand, {
      StandardsSubscriptionRequests: [{ StandardsArn: secHubStandards[0].StandardsArn }],
    });
    expect(securityHubClientMock).not.toHaveReceivedCommand(BatchDisableStandardsCommand);
  });

  it('disable all enabled standards when none provided', async () => {
    const noStandardToEnable: { name: string; enable: boolean; controlsToDisable: string[] | undefined }[] = [];

    securityHubClientMock.on(DescribeStandardsCommand).resolves({
      Standards: secHubStandards,
      NextToken: undefined,
    });

    securityHubClientMock.on(GetEnabledStandardsCommand).resolves({
      StandardsSubscriptions: [
        {
          StandardsSubscriptionArn:
            'arn:aws:securityhub:eu-central-1:11223344556677:subscription/aws-foundational-security-best-practices/v/1.0.0',
          StandardsArn: secHubStandards[0].StandardsArn,
          StandardsInput: {},
          StandardsStatus: 'READY',
        },
        {
          StandardsSubscriptionArn: 'arn:aws:securityhub:eu-central-1:11223344556677:subscription/cis-aws-foundations-benchmark/v/1.2.',
          StandardsArn: secHubStandards[1].StandardsArn,
          StandardsInput: {},
          StandardsStatus: 'READY',
        },
      ],
      NextToken: undefined,
    });

    await securityHubStandardsMgmt.enableStandards(noStandardToEnable);

    expect(securityHubClientMock).not.toHaveReceivedCommand(BatchEnableStandardsCommand);
    expect(securityHubClientMock).toHaveReceivedCommandWith(BatchDisableStandardsCommand, {
      StandardsSubscriptionArns: [
        'arn:aws:securityhub:eu-central-1:11223344556677:subscription/aws-foundational-security-best-practices/v/1.0.0',
        'arn:aws:securityhub:eu-central-1:11223344556677:subscription/cis-aws-foundations-benchmark/v/1.2.',
      ],
    });
  });

  it('enable missing standards', async () => {
    const enableMissingStandard = [
      {
        name: 'AWS Foundational Security Best Practices v1.0.0',
        enable: true,
        controlsToDisable: [],
      },
      {
        name: 'CIS AWS Foundations Benchmark v1.2.0',
        enable: true,
        controlsToDisable: [],
      },
    ];

    securityHubClientMock.on(DescribeStandardsCommand).resolves({
      Standards: secHubStandards,
      NextToken: undefined,
    });

    securityHubClientMock
      .on(GetEnabledStandardsCommand)
      .resolvesOnce({
        StandardsSubscriptions: [
          {
            StandardsSubscriptionArn:
              'arn:aws:securityhub:eu-central-1:11223344556677:subscription/aws-foundational-security-best-practices/v/1.0.0',
            StandardsArn: secHubStandards[0].StandardsArn,
            StandardsInput: {},
            StandardsStatus: 'READY',
          },
        ],
        NextToken: undefined,
      })
      .resolves({
        StandardsSubscriptions: [
          {
            StandardsSubscriptionArn:
              'arn:aws:securityhub:eu-central-1:11223344556677:subscription/aws-foundational-security-best-practices/v/1.0.0',
            StandardsArn: secHubStandards[0].StandardsArn,
            StandardsInput: {},
            StandardsStatus: 'READY',
          },
          {
            StandardsSubscriptionArn: 'arn:aws:securityhub:eu-central-1:11223344556677:subscription/cis-aws-foundations-benchmark/v/1.2.',
            StandardsArn: secHubStandards[1].StandardsArn,
            StandardsInput: {},
            StandardsStatus: 'READY',
          },
        ],
        NextToken: undefined,
      });

    securityHubClientMock.on(DescribeStandardsControlsCommand).resolves({
      Controls: [
        {
          StandardsControlArn:
            'arn:aws:securityhub:eu-central-1:11223344556677:control/aws-foundational-security-best-practices/v/1.0.0/ACM.1',
          ControlStatus: 'ENABLED',
          ControlId: 'ACM.1',
        },
      ],
      NextToken: undefined,
    });

    await securityHubStandardsMgmt.enableStandards(enableMissingStandard);

    expect(securityHubClientMock).toHaveReceivedCommandWith(BatchEnableStandardsCommand, {
      StandardsSubscriptionRequests: [{ StandardsArn: secHubStandards[1].StandardsArn }],
    });
    expect(securityHubClientMock).not.toHaveReceivedCommand(BatchDisableStandardsCommand);
  });

  it('enable missing control', async () => {
    const enableMissingStandard = [
      {
        name: 'AWS Foundational Security Best Practices v1.0.0',
        enable: true,
        controlsToDisable: [],
      },
    ];

    securityHubClientMock.on(DescribeStandardsCommand).resolves({
      Standards: secHubStandards,
      NextToken: undefined,
    });

    securityHubClientMock.on(GetEnabledStandardsCommand).resolves({
      StandardsSubscriptions: [
        {
          StandardsSubscriptionArn:
            'arn:aws:securityhub:eu-central-1:11223344556677:subscription/aws-foundational-security-best-practices/v/1.0.0',
          StandardsArn: secHubStandards[0].StandardsArn,
          StandardsInput: {},
          StandardsStatus: 'READY',
        },
      ],
      NextToken: undefined,
    });

    securityHubClientMock.on(DescribeStandardsControlsCommand).resolves({
      Controls: [
        {
          StandardsControlArn:
            'arn:aws:securityhub:eu-central-1:11223344556677:control/aws-foundational-security-best-practices/v/1.0.0/ACM.1',
          ControlStatus: 'DISABLED',
          ControlId: 'ACM.1',
        },
      ],
      NextToken: undefined,
    });

    await securityHubStandardsMgmt.enableStandards(enableMissingStandard);

    expect(securityHubClientMock).not.toHaveReceivedCommand(BatchEnableStandardsCommand);
    expect(securityHubClientMock).not.toHaveReceivedCommand(BatchDisableStandardsCommand);
    expect(securityHubClientMock).toHaveReceivedCommandWith(UpdateStandardsControlCommand, {
      StandardsControlArn: 'arn:aws:securityhub:eu-central-1:11223344556677:control/aws-foundational-security-best-practices/v/1.0.0/ACM.1',
      ControlStatus: 'ENABLED',
    });
  });

  it('disable control', async () => {
    const enableMissingStandard = [
      {
        name: 'AWS Foundational Security Best Practices v1.0.0',
        enable: true,
        controlsToDisable: ['ACM.1'],
      },
    ];

    securityHubClientMock.on(DescribeStandardsCommand).resolves({
      Standards: secHubStandards,
      NextToken: undefined,
    });

    securityHubClientMock.on(GetEnabledStandardsCommand).resolves({
      StandardsSubscriptions: [
        {
          StandardsSubscriptionArn:
            'arn:aws:securityhub:eu-central-1:11223344556677:subscription/aws-foundational-security-best-practices/v/1.0.0',
          StandardsArn: secHubStandards[0].StandardsArn,
          StandardsInput: {},
          StandardsStatus: 'READY',
        },
      ],
      NextToken: undefined,
    });

    securityHubClientMock.on(DescribeStandardsControlsCommand).resolves({
      Controls: [
        {
          StandardsControlArn:
            'arn:aws:securityhub:eu-central-1:11223344556677:control/aws-foundational-security-best-practices/v/1.0.0/ACM.1',
          ControlStatus: 'ENABLED',
          ControlId: 'ACM.1',
        },
      ],
      NextToken: undefined,
    });

    await securityHubStandardsMgmt.enableStandards(enableMissingStandard);

    expect(securityHubClientMock).not.toHaveReceivedCommand(BatchEnableStandardsCommand);
    expect(securityHubClientMock).not.toHaveReceivedCommand(BatchDisableStandardsCommand);
    expect(securityHubClientMock).toHaveReceivedCommandWith(UpdateStandardsControlCommand, {
      StandardsControlArn: 'arn:aws:securityhub:eu-central-1:11223344556677:control/aws-foundational-security-best-practices/v/1.0.0/ACM.1',
      ControlStatus: 'DISABLED',
    });
  });

  it('configure sechub with standards set to enable=false', async () => {
    const standardsSetToDisabled = [
      {
        name: 'AWS Foundational Security Best Practices v1.0.0',
        enable: false,
        controlsToDisable: [],
      },
      {
        name: 'CIS AWS Foundations Benchmark v1.2.0',
        enable: false,
        controlsToDisable: [],
      },
    ];

    securityHubClientMock.on(DescribeStandardsCommand).resolves({
      Standards: secHubStandards,
      NextToken: undefined,
    });

    securityHubClientMock.on(GetEnabledStandardsCommand).resolves({
      StandardsSubscriptions: [
        {
          StandardsSubscriptionArn:
            'arn:aws:securityhub:eu-central-1:11223344556677:subscription/aws-foundational-security-best-practices/v/1.0.0',
          StandardsArn: secHubStandards[0].StandardsArn,
          StandardsInput: {},
          StandardsStatus: 'READY',
        },
        {
          StandardsSubscriptionArn: 'arn:aws:securityhub:eu-central-1:11223344556677:subscription/cis-aws-foundations-benchmark/v/1.2.',
          StandardsArn: secHubStandards[1].StandardsArn,
          StandardsInput: {},
          StandardsStatus: 'READY',
        },
      ],
      NextToken: undefined,
    });

    securityHubClientMock.on(DescribeStandardsControlsCommand).resolves({
      Controls: [
        {
          StandardsControlArn:
            'arn:aws:securityhub:eu-central-1:11223344556677:control/aws-foundational-security-best-practices/v/1.0.0/ACM.1',
          ControlStatus: 'ENABLED',
          ControlId: 'ACM.1',
        },
      ],
      NextToken: undefined,
    });

    await securityHubStandardsMgmt.enableStandards(standardsSetToDisabled);

    expect(securityHubClientMock).not.toHaveReceivedCommand(BatchEnableStandardsCommand);
    expect(securityHubClientMock).toHaveReceivedCommandWith(BatchDisableStandardsCommand, {
      StandardsSubscriptionArns: [
        'arn:aws:securityhub:eu-central-1:11223344556677:subscription/aws-foundational-security-best-practices/v/1.0.0',
        'arn:aws:securityhub:eu-central-1:11223344556677:subscription/cis-aws-foundations-benchmark/v/1.2.',
      ],
    });
  });
});

describe('disableStandards', () => {
  beforeEach(() => {
    securityHubClientMock.reset();
    organizationsClientMock.reset();
  });

  it('disable standards', async () => {
    securityHubClientMock.on(DescribeStandardsCommand).resolves({
      Standards: secHubStandards,
      NextToken: undefined,
    });

    securityHubClientMock.on(GetEnabledStandardsCommand).resolves({
      StandardsSubscriptions: [
        {
          StandardsSubscriptionArn:
            'arn:aws:securityhub:eu-central-1:11223344556677:subscription/aws-foundational-security-best-practices/v/1.0.0',
          StandardsArn: secHubStandards[0].StandardsArn,
          StandardsInput: {},
          StandardsStatus: 'READY',
        },
        {
          StandardsSubscriptionArn: 'arn:aws:securityhub:eu-central-1:11223344556677:subscription/cis-aws-foundations-benchmark/v/1.2.',
          StandardsArn: secHubStandards[1].StandardsArn,
          StandardsInput: {},
          StandardsStatus: 'READY',
        },
      ],
      NextToken: undefined,
    });

    securityHubClientMock.on(DescribeStandardsControlsCommand).resolves({
      Controls: [
        {
          StandardsControlArn:
            'arn:aws:securityhub:eu-central-1:11223344556677:control/aws-foundational-security-best-practices/v/1.0.0/ACM.1',
          ControlStatus: 'ENABLED',
          ControlId: 'ACM.1',
        },
      ],
      NextToken: undefined,
    });

    await securityHubStandardsMgmt.disableStandards();

    expect(securityHubClientMock).not.toHaveReceivedCommand(BatchEnableStandardsCommand);
    expect(securityHubClientMock).toHaveReceivedCommandWith(BatchDisableStandardsCommand, {
      StandardsSubscriptionArns: [
        'arn:aws:securityhub:eu-central-1:11223344556677:subscription/aws-foundational-security-best-practices/v/1.0.0',
        'arn:aws:securityhub:eu-central-1:11223344556677:subscription/cis-aws-foundations-benchmark/v/1.2.',
      ],
    });
  });
});
