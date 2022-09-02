import { App, CliCredentialsStackSynthesizer } from 'aws-cdk-lib';
import { SuperwerkerStack } from './stacks/superwerker';

// for development, use account/region from cdk cli
// const devEnv = {
//   account: process.env.CDK_DEFAULT_ACCOUNT,
//   // region: process.env.CDK_DEFAULT_REGION,
// };

// const region1Env = {
//   account: process.env.CDK_DEFAULT_ACCOUNT,
//   region: 'us-east-1',
// };

// const region2Env = {
//   account: process.env.CDK_DEFAULT_ACCOUNT,
//   region: 'af-south-1',
// };

// const regions = [region1Env, region2Env];

const app = new App();

new SuperwerkerStack(app, 'SuperwerkerStack', {
  // env: devEnv,
  synthesizer: new CliCredentialsStackSynthesizer({
    fileAssetsBucketName: 'superwerker-assets-${AWS::Region}',
  }),
});

app.synth();
