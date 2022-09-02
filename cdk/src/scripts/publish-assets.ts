import { exec } from 'child_process';
import * as path from 'path';
import AWS from 'aws-sdk';

const main = async () => {
  const assetManifestPath = path.resolve(__dirname, '..', '..', 'cdk.out', 'SuperwerkerStack.assets.json');

  // Fetch all enabled regions from EC2
  // In our master account we have enabled all regions
  const ec2Client = new AWS.EC2({ region: 'eu-central-1' });
  const regions = (await ec2Client.describeRegions().promise()).Regions!.map((r) => r.RegionName);

  for (const region of regions) {
    const command = `AWS_REGION=${region} yarn cdk-assets publish -p ${assetManifestPath}`;
    console.log(command);
    await exec(command, (err, stdout, stderr) => {
      if (err) {
        console.log(stdout);
        console.log(stderr);
        throw new Error(err.message);
      }
    });
  }
};

// top level await madness
(async () => {await main();})().catch(e => {
  console.log(e);
});

