import { App, Aspects, CliCredentialsStackSynthesizer, Stack } from 'aws-cdk-lib';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { SuperwerkerStack } from './stacks/superwerker';

const app = new App();

// Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

const superwerkerVersion = process.env.SUPERWERKER_VERSION || '0.0.0-DEVELOPMENT';

const superwerkerStack = new SuperwerkerStack(app, 'SuperwerkerStack', {
  version: superwerkerVersion,
  synthesizer: new CliCredentialsStackSynthesizer({
    fileAssetsBucketName: 'superwerker-resources-${AWS::Region}',
    bucketPrefix: `${superwerkerVersion}/`,
  }),
});

NagSuppressions.addStackSuppressions(
  Stack.of(superwerkerStack),
  [
    { id: 'AwsSolutions-L1', reason: 'Custom resource lambdas are not using latest runtime' },
    {
      id: 'AwsSolutions-IAM4',
      reason:
        'Superwerker makes extensive usage of managed policies. Even Lambda Basic execution role added by custom resources triggers this.',
    },
    { id: 'AwsSolutions-IAM5', reason: 'Superwerker makes extensive usage of wildcard often required to make organization wide changes.' },
    {
      id: 'AwsSolutions-SNS2',
      reason:
        'Encryption-at-rest for SNS topics has been removed as a control for the AWS Foundational Security Best Practices (FSBP) standard in April 2024, https://docs.aws.amazon.com/securityhub/latest/userguide/sns-controls.html#sns-1',
    },
    {
      id: 'AwsSolutions-SF1',
      reason: 'Tracing for Stepfunction is not necessary in our case',
    },
  ],
  true,
);

app.synth();
