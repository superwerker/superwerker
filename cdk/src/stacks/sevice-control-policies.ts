import * as path from 'path';
import { CfnParameter, CustomResource, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class ServiceControlPoliciesStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    //Backup
    const includeBackup = new CfnParameter(this, 'IncludeBackup', {
      type: 'String',
      description: 'Enable automated backups',
      allowedValues: ['Yes', 'No'],
      default: 'Yes',
    });

    if (includeBackup.valueAsString == 'Yes') {
      const backupStatement = new PolicyStatement({
        conditions: {
          ArnNotLike: {
            'aws:PrincipalARN': 'arn:${AWS::Partition}:iam::*:role/stacksets-exec-*',
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
          'arn:${AWS::Partition}:iam::*:role/service-role/AWSBackupDefaultServiceRole',
          'arn:${AWS::Partition}:iam::*:role/SuperwerkerBackupTagsEnforcementRemediationRole',
        ],
        effect: Effect.DENY,
        sid: 'SWProtectBackup',
      });
      const scpPolicyDocumentRoot = new PolicyDocument({ statements: [backupStatement] });

      new CustomResource(this, 'SCPBaseline', {
        serviceToken: ServiceControlPolicyRootProvider.getOrCreate(this),
        resourceType: 'Custom::SCPRoot',
        properties: {
          Policy: JSON.stringify(scpPolicyDocumentRoot),
          Attach: 'true',
        },
      });

      new CustomResource(this, 'SCPEnable', {
        serviceToken: ServiceControlPolicySandboxProvider.getOrCreate(this),
        resourceType: 'Custom::SCPSandbox',
      });
    }
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

    this.provider = new Provider(this, 'service-control-policy-root-provider', {
      onEventHandler: new lambda.NodejsFunction(this, 'service-control-policy-root-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'scp-create-setup'),
        runtime: Runtime.PYTHON_3_9,
        initialPolicy: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            resources: ['*'],
            actions: [
              'organizations:EnablePolicyType',
              'organizations:DisablePolicyType',
              'organizations:ListRoots',
              'organizations:CreatePolicy',
              'organizations:UpdatePolicy',
              'organizations:DeletePolicy',
              'organizations:AttachPolicy',
              'organizations:DetachPolicy',
              'organizations:ListRoots',
              'organizations:ListPolicies',
              'organizations:ListPoliciesForTarget',
            ],
          }),
        ],
      }),
    });
  }
}

class ServiceControlPolicySandboxProvider extends Construct {
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.service-control-policy-sandbox-provider';
    const x = (stack.node.tryFindChild(id) as ServiceControlPolicySandboxProvider) || new ServiceControlPolicySandboxProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.provider = new Provider(this, 'service-control-policy-sandbox-provider', {
      onEventHandler: new lambda.NodejsFunction(this, 'service-control-policy-sandbox-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'scp-enable-setup'),
        runtime: Runtime.PYTHON_3_9,
        initialPolicy: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            resources: ['*'],
            actions: [
              'organizations:EnablePolicyType',
              'organizations:DisablePolicyType',
              'organizations:ListRoots',
              'organizations:CreatePolicy',
              'organizations:UpdatePolicy',
              'organizations:DeletePolicy',
              'organizations:AttachPolicy',
              'organizations:DetachPolicy',
              'organizations:ListRoots',
              'organizations:ListPolicies',
              'organizations:ListPoliciesForTarget',
            ],
          }),
        ],
      }),
    });
  }
}
