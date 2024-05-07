import * as path from 'path';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { aws_iam as iam, CustomResource, Duration, Stack, aws_lambda as lambda } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

interface BackupPolicyProps {
  readonly policy: string;
  readonly attach: boolean;
}

export class BackupPolicy extends Construct {
  constructor(scope: Construct, id: string, props: BackupPolicyProps) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: BackupPolicyProvider.getOrCreate(this).provider.serviceToken,
      properties: {
        Policy: props.policy,
        Attach: props.attach,
      },
    });
  }
}

class BackupPolicyProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.backup-policy-provider';
    const provider = (stack.node.tryFindChild(id) as BackupPolicyProvider) || new BackupPolicyProvider(stack, id);
    return provider;
  }

  public readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const backupPolicyFn = new PythonFunction(this, 'backup-policy-on-event', {
      entry: path.join(__dirname, '..', 'functions', 'backup-policy'),
      handler: 'handler',
      runtime: Runtime.PYTHON_3_9,
      timeout: Duration.seconds(200),
      initialPolicy: [
        new iam.PolicyStatement({
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
          ],
        }),
      ],
    });
    (backupPolicyFn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('BackupPolicyCustomResource');

    this.provider = new cr.Provider(this, 'backup-policy-provider', {
      onEventHandler: backupPolicyFn,
    });
  }
}
