import { execSync } from 'child_process';
import * as path from 'path';
import retry from 'async-retry';

const REGIONS = [
  'eu-central-1'
];

const retries = 20;

// Publish assets into all regional buckets
// e.g. superwerker-assets-eu-central-1 etc.
const main = async () => {
  const assetManifestPath = path.resolve(__dirname, '..', '..', 'cdk.out', 'SuperwerkerStack.assets.json');
  for (const region of REGIONS) {
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

