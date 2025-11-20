import * as path from 'path';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { aws_iam as iam, CustomResource, Duration, Stack, aws_lambda as lambda, Arn } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

interface BackupTagRemediationPublicProps {
  readonly documentName: string;
}

export class BackupTagRemediationPublic extends Construct {
  public backupTagRemedationPublicFn: PythonFunction;
  constructor(scope: Construct, id: string, props: BackupTagRemediationPublicProps) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: BackupTagRemediationPublicProvider.getOrCreate(this).provider.serviceToken,
      properties: {
        DocumentName: props.documentName,
      },
    });
    this.backupTagRemedationPublicFn = BackupTagRemediationPublicProvider.getOrCreate(this).provider.onEventHandler as PythonFunction;
  }
}

class BackupTagRemediationPublicProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.backup-tag-remediation-public-provider';
    const provider =
      (stack.node.tryFindChild(id) as BackupTagRemediationPublicProvider) || new BackupTagRemediationPublicProvider(stack, id);
    return provider;
  }

  public readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const backupTagRemedationPublicFn = new PythonFunction(this, 'backup-tag-remediation-public-on-event', {
      entry: path.join(__dirname, '..', 'functions', 'backup-tag-remediation-public'),
      handler: 'handler',
      runtime: Runtime.PYTHON_3_14,
      timeout: Duration.seconds(3),
      initialPolicy: [
        new iam.PolicyStatement({
          resources: [
            Arn.format(
              {
                service: 'ssm',
                resource: 'document',
                resourceName: '*',
              },
              Stack.of(this),
            ),
          ],
          actions: ['ssm:ModifyDocumentPermission'],
        }),
      ],
      bundling: {
        assetExcludes: ['__pycache__', 'tests', '.pytest_cache', '.venv'],
      },
    });
    (backupTagRemedationPublicFn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('BackupTagRemediationPublicHandlerFunction');

    this.provider = new cr.Provider(this, 'backup-tag-remediation-public-provider', {
      onEventHandler: backupTagRemedationPublicFn,
    });
  }
}
