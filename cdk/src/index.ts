import { App, CliCredentialsStackSynthesizer } from 'aws-cdk-lib';
import { SuperwerkerStack } from './stacks/superwerker';

const app = new App();

const superwerkerVersion = process.env.SUPERWERKER_VERSION || '0.0.0-DEVELOPMENT';

new SuperwerkerStack(app, 'SuperwerkerStack', {
  version: superwerkerVersion,
  synthesizer: new CliCredentialsStackSynthesizer({
    fileAssetsBucketName: 'superwerker-assets-${AWS::Region}',
    bucketPrefix: `${superwerkerVersion}/`,
  }),
});

app.synth();
