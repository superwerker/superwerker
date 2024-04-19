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
    { id: 'AwsSolutions-IAM4', reason: 'Superwerker requires wildcard permssions for some resources' },
    { id: 'AwsSolutions-IAM5', reason: 'Even Lambda Basic execution role triggers this' },
    { id: 'AwsSolutions-S1', reason: 'S3 server access logging not always required' },
  ],
  true,
);

app.synth();
