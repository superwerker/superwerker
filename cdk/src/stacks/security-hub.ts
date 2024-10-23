import path from 'path';
import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
import { Construct } from 'constructs';

export class SecurityHubStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);
    new CfnInclude(this, 'SuperwerkerTemplate', {
      templateFile: path.join(__dirname, '..', '..', '..', 'templates', 'security-hub.yaml'),
    });
  }
}

// Security Hub Activation with Custom Resource still flacky due to AWS APIs
// using for now old SSM based Approach

/*
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
*/
