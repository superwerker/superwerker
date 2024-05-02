import * as path from 'path';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { aws_iam as iam, CustomResource, Duration, Stack, aws_lambda as lambda } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

interface BackupTagPolicyProps {
  readonly policy: string;
  readonly attach: boolean;
}

export class BackupTagPolicy extends Construct {
  constructor(scope: Construct, id: string, props: BackupTagPolicyProps) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: BackupTagPolicyProvider.getOrCreate(this).provider.serviceToken,
      resourceType: 'Custom::BackupTagPolicy',
      properties: {
        Policy: props.policy,
        Attach: props.attach,
      },
    });
  }
}

class BackupTagPolicyProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.backup-tag-policy-provider';
    const provider = (stack.node.tryFindChild(id) as BackupTagPolicyProvider) || new BackupTagPolicyProvider(stack, id);
    return provider;
  }

  public readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const tagPolicyFn = new PythonFunction(this, 'backup-tag-policy-on-event', {
      entry: path.join(__dirname, '..', 'functions', 'backup-tag-policy'),
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
    (tagPolicyFn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('TagPolicyCustomResource');

    this.provider = new cr.Provider(this, 'backup-tag-policy-provider', {
      onEventHandler: tagPolicyFn,
    });
  }
}
