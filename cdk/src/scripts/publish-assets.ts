import { execSync } from 'child_process';
import * as path from 'path';
import retry from 'async-retry';

const REGIONS = [
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ca-central-1',
  'eu-central-1',
  'eu-north-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'sa-east-1',
  'us-east-1',
  'us-east-2',
  'us-west-2',
];

const REGIONS_DEV = [
  'eu-central-1',
];

const retries = 20;
const regions = process.env.NODE_ENV != 'development' ? REGIONS : REGIONS_DEV;


// Publish assets into all regional buckets
// e.g. superwerker-assets-eu-central-1 etc.
const main = async () => {
  const assetManifestPath = path.resolve(__dirname, '..', '..', 'cdk.out', 'SuperwerkerStack.assets.json');
  for (const region of regions) {
    const command = `AWS_REGION=${region} yarn cdk-assets publish -p ${assetManifestPath}`;
    console.log(command);
    await retry(async (_, attempt) => {
      console.log(`Attempt ${attempt} of ${retries} in region ${region}`);
      const execResult = await execSync(command);
      console.log(execResult.toString());
    }, {
      retries: retries,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 30000,
    });
  }
};

// top level await madness
(async () => { await main(); })().catch(e => {
  console.log(e);
});

