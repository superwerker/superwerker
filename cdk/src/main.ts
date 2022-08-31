import { App, CliCredentialsStackSynthesizer } from 'aws-cdk-lib';
import { SuperwerkerStack } from './superwerker';

// export class SuperwerkerStack extends Stack {
//   constructor(scope: Construct, id: string, props: StackProps) {
//     super(scope, id, props);
//
//     new CfnInclude(this, 'SuperwerkerTemplate', {
//       templateFile: path.join(__dirname, '..', '..', 'templates', 'superwerker.template.yaml'),
//     });
//   }
// }

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new SuperwerkerStack(app, 'SuperwerkerStack', {
  env: devEnv,
  synthesizer: new CliCredentialsStackSynthesizer(
    {
      fileAssetsBucketName: 'superwerker-assets12123-bucket',
      bucketPrefix: 'example',
    },
  ),
});

app.synth();
