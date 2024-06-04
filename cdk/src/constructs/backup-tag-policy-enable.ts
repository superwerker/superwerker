import * as path from 'path';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { aws_iam as iam, CustomResource, Duration, Stack, aws_lambda as lambda } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class BackupTagPolicyEnable extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: BackupTagPolicyEnableProvider.getOrCreate(this).provider.serviceToken,
    });
  }
}

class BackupTagPolicyEnableProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.backup-tag-policy-enable-provider';
    const provider = (stack.node.tryFindChild(id) as BackupTagPolicyEnableProvider) || new BackupTagPolicyEnableProvider(stack, id);
    return provider;
  }

  public readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const tagPolicyFn = new PythonFunction(this, 'backup-tag-policy-enable-on-event', {
      entry: path.join(__dirname, '..', 'functions', 'backup-tag-policy-enable'),
      handler: 'enable_tag_policies',
      runtime: Runtime.PYTHON_3_9,
      timeout: Duration.seconds(200),
      initialPolicy: [
        new iam.PolicyStatement({
          resources: ['*'],
          actions: ['organizations:EnablePolicyType', 'organizations:DisablePolicyType', 'organizations:ListRoots'],
        }),
      ],
      bundling: {
        assetExcludes: ['__pycache__', 'tests', '.pytest_cache', '.venv'],
      },
    });
    (tagPolicyFn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('TagPolicyEnableHandlerFunction');

    this.provider = new cr.Provider(this, 'backup-tag-policy-enable-provider', {
      onEventHandler: tagPolicyFn,
    });
  }
}
