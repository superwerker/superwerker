import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ControlTowerStack } from './control-tower';
import { EnableSecurityHub } from '../constructs/enable-securityhub';

export class SecurityHubStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const auditAccountAccountId = StringParameter.fromStringParameterAttributes(this, 'AuditAccountLookup', {
      parameterName: ControlTowerStack.accountIdAuditParameter,
      forceDynamicReference: true,
    }).stringValue;

    const secHubCrossAccountRoleName = 'OrganizationAccountAccessRole';
    const secHubCrossAccountRoleArn = `arn:aws:iam::${auditAccountAccountId}:role/${secHubCrossAccountRoleName}`;

    new EnableSecurityHub(this, 'EnableSecurityHub', {
      adminAccountId: auditAccountAccountId,
      secHubCrossAccountRoleArn: secHubCrossAccountRoleArn,
    });
  }
}
