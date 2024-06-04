import * as path from 'path';
import { CfnResource, CustomResource, Duration, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class ServiceControlPoliciesStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    //Backup
    const backupStatement = new PolicyStatement({
      conditions: {
        ArnNotLike: {
          'aws:PrincipalARN': `arn:${Stack.of(this).partition}:iam::*:role/stacksets-exec-*`,
        },
      },
      actions: [
        'iam:AttachRolePolicy',
        'iam:CreateRole',
        'iam:DeleteRole',
        'iam:DeleteRolePermissionsBoundary',
        'iam:DeleteRolePolicy',
        'iam:DetachRolePolicy',
        'iam:PutRolePermissionsBoundary',
        'iam:PutRolePolicy',
        'iam:UpdateAssumeRolePolicy',
        'iam:UpdateRole',
        'iam:UpdateRoleDescription',
      ],
      resources: [
        `arn:${Stack.of(this).partition}:iam::*:role/service-role/AWSBackupDefaultServiceRole`,
        `arn:${Stack.of(this).partition}:iam::*:role/SuperwerkerBackupTagsEnforcementRemediationRole`,
      ],
      effect: Effect.DENY,
      sid: 'SWProtectBackup',
    });

    //Deny Leaving Organization
    const denyLeavingOrganizationStatement = new PolicyStatement({
      actions: ['organizations:LeaveOrganization'],
      resources: ['*'],
      effect: Effect.DENY,
      sid: 'PreventLeavingOrganization',
    });

    const scpPolicyDocumentRoot = new PolicyDocument({
      statements: [denyLeavingOrganizationStatement, backupStatement],
    });

    const scpRoot = new CustomResource(this, 'SCPRoot', {
      serviceToken: ServiceControlPolicyRootProvider.getOrCreate(this),
      properties: {
        policy: JSON.stringify(scpPolicyDocumentRoot),
        scpName: 'superwerker-root',
      },
    });

    (scpRoot.node.defaultChild as CfnResource).overrideLogicalId('SCPRoot');
  }
}

class ServiceControlPolicyRootProvider extends Construct {
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.service-control-policy-root-provider';
    const x = (stack.node.tryFindChild(id) as ServiceControlPolicyRootProvider) || new ServiceControlPolicyRootProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const scpRootFn = new NodejsFunction(this, 'service-control-policy-root-on-event', {
      entry: path.join(__dirname, '..', 'functions', 'service-control-policies-root.ts'),
      runtime: Runtime.NODEJS_20_X,
      initialPolicy: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: [
            'organizations:CreatePolicy',
            'organizations:UpdatePolicy',
            'organizations:DeletePolicy',
            'organizations:AttachPolicy',
            'organizations:DetachPolicy',
            'organizations:ListRoots',
            'organizations:ListPolicies',
            'organizations:ListPoliciesForTarget',
            'organizations:EnablePolicyType',
            'organizations:DisablePolicyType',
          ],
        }),
      ],
      timeout: Duration.seconds(300),
    });

    this.provider = new Provider(this, 'service-control-policy-root-provider', {
      onEventHandler: scpRootFn,
    });
  }
}
