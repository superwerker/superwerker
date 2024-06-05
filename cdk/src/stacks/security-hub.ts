import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import * as securityhub from 'aws-cdk-lib/aws-securityhub';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ControlTowerStack } from './control-tower';
import { EnableSecurityHub } from '../constructs/enable-securityhub';
import { MemberAccountRemediationActions } from '../constructs/member-account-remediation-actions';

export class SecurityHubStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const auditAccountAccountId = StringParameter.fromStringParameterAttributes(this, 'AuditAccountLookup', {
      parameterName: ControlTowerStack.accountIdAuditParameter,
      forceDynamicReference: true,
    }).stringValue;

    const loggingAccountAccountId = StringParameter.fromStringParameterAttributes(this, 'LoggingAccountLookup', {
      parameterName: ControlTowerStack.accountIdLogArchiveParameter,
      forceDynamicReference: true,
    }).stringValue;

    const secHubCrossAccountRoleName = 'OrganizationAccountAccessRole';
    const secHubCrossAccountRoleArn = `arn:aws:iam::${auditAccountAccountId}:role/${secHubCrossAccountRoleName}`;

    new EnableSecurityHub(this, 'EnableSecurityHub', {
      adminAccountId: auditAccountAccountId,
      secHubCrossAccountRoleArn: secHubCrossAccountRoleArn,
    });

    //const memberStack = new MemberAccountRemediationStackSetStack(this, 'MemberAccountRemediation');

    //const stackSetStack = new StackSetStack(memberStack, 'MemberAccountRemediationStackSet');

    // new StackSet(memberStack, 'StackSet', {
    //   target: StackSetTarget.fromOrganizationalUnits({
    //     regions: ['eu-central-1'],
    //     organizationalUnits: ['Security']
    //   }),
    //   template: StackSetTemplate.fromStackSetStack(memberStack),
    //   deploymentType: DeploymentType.serviceManaged()
    // });

    new MemberAccountRemediationActions(this, 'MemberAccountRemediations', {
      crossAccountRoleName: secHubCrossAccountRoleName,
      auditAccountId: auditAccountAccountId,
      loggingAccountId: loggingAccountAccountId,
    });

    new securityhub.CfnAutomationRule(this, 'SecHubS3LoggingAutomationRule', {
      ruleName: 'Suppress S3 Logging Bucket finding',
      ruleOrder: 1,
      description: 'Suppress S3 logging bucket',
      isTerminal: false,
      ruleStatus: 'ENABLED',
      criteria: {
        awsAccountId: [
          {
            comparison: 'EQUALS',
            value: '730335592869',
          },
        ],
        title: [
          {
            comparison: 'EQUALS',
            value: 'S3 general purpose buckets should have server access logging enabled',
          },
        ],
        resourceId: [
          {
            comparison: 'CONTAINS',
            value: 's3-access-logs',
          },
        ],
      },
      actions: [
        {
          type: 'FINDING_FIELDS_UPDATE',
          findingFieldsUpdate: {
            workflow: { status: 'SUPPRESSED' },
          },
        },
      ],
    });
  }
}
