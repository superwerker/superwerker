import path from 'path';
import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

export class BackupStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);
    const cfnInclude = new CfnInclude(this, 'SuperwerkerTemplate', {
      templateFile: path.join(__dirname, '..', '..', '..', 'templates', 'backup.yaml'),
    });

    NagSuppressions.addResourceSuppressions(
      this,
      [{ id: 'AwsSolutions-S1', reason: 'S3 server access logging not required for organization conformance bucket' }],
      true,
    );

    cfnInclude.stack.addMetadata('cfn - lint', { config: { ignore_checks: ['E9007', 'EPolicyWildcardPrincipal', 'E1029'] } });
  }
}
