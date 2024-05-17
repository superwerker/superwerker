import * as path from 'path';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { CustomResource, Duration, Stack, aws_iam as iam, aws_lambda as lambda } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class BackupPolicyEnable extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: BackupPolicyEnableProvider.getOrCreate(this).provider.serviceToken,
    });
  }
}

class BackupPolicyEnableProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.backup-policy-enable-provider';
    const provider = (stack.node.tryFindChild(id) as BackupPolicyEnableProvider) || new BackupPolicyEnableProvider(stack, id);
    return provider;
  }

  public readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const backupPolicyEnableFn = new PythonFunction(this, 'backup-policy-enable-on-event', {
      entry: path.join(__dirname, '..', 'functions', 'backup-policy-enable'),
      handler: 'index.enable_tag_policies',
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
    (backupPolicyEnableFn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('BackupPolicyEnableHandlerFunction');

    this.provider = new cr.Provider(this, 'backup-policy-enable-provider', {
      onEventHandler: backupPolicyEnableFn,
    });
  }
}
