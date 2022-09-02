import { App, CliCredentialsStackSynthesizer } from 'aws-cdk-lib';
import { SuperwerkerStack } from './stacks/superwerker';

const app = new App();

new SuperwerkerStack(app, 'SuperwerkerStack', {
  synthesizer: new CliCredentialsStackSynthesizer({
    fileAssetsBucketName: 'superwerker-assets-${AWS::Region}',
  }),
});

app.synth();
