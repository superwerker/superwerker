import * as path from 'path';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { CustomResource, Duration, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class ServiceControlPoliciesStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const scpPolicyDocumentRoot = new PolicyDocument();
    //Backup
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
        'arn:${Stack.of(this).partition}:iam::*:role/service-role/AWSBackupDefaultServiceRole',
        'arn:${Stack.of(this).partition}:iam::*:role/SuperwerkerBackupTagsEnforcementRemediationRole',
      ],
      effect: Effect.DENY,
      sid: 'SWProtectBackup',
    });

    scpPolicyDocumentRoot.addStatements(backupStatement);

    new CustomResource(this, 'CreateSCP', {
      serviceToken: ServiceControlPolicyRootProvider.getOrCreate(this),
      resourceType: 'Custom::SCPRoot',
      properties: {
        Policy: JSON.stringify(scpPolicyDocumentRoot),
        Attach: 'true',
      },
    });

    new CustomResource(this, 'EnableSCP', {
      serviceToken: ServiceControlPolicySandboxProvider.getOrCreate(this),
      resourceType: 'Custom::SCPSandbox',
    });
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
      onEventHandler: new PythonFunction(this, 'service-control-policy-root-on-event', {
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
        timeout: Duration.seconds(200),
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
      onEventHandler: new PythonFunction(this, 'service-control-policy-sandbox-on-event', {
        timeout: Duration.seconds(200),
        entry: path.join(__dirname, '..', 'functions', 'scp-enable-setup'),
        runtime: Runtime.PYTHON_3_9,
        initialPolicy: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            resources: ['*'],
            actions: ['organizations:EnablePolicyType', 'organizations:DisablePolicyType', 'organizations:ListRoots'],
          }),
        ],
      }),
    });
  }
}
