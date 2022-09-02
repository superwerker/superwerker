import * as path from 'path';
import AWS from 'aws-sdk';
import { AssetManifest, AssetPublishing, DefaultAwsClient } from 'cdk-assets';

const main = async () => {
  const assetManifestPath = path.resolve(__dirname, '..', '..', 'cdk.out', 'SuperwerkerStack.assets.json');
  const manifest = AssetManifest.fromPath(assetManifestPath);
  console.log(`Loaded manifest from ${assetManifestPath}: ${manifest.entries.length} assets found`);

  // Fetch all enabled regions from EC2
  // In our master account we have enabled all regions
  const ec2Client = new AWS.EC2({ region: 'eu-central-1' });
  const regions = (await ec2Client.describeRegions().promise()).Regions!.map((r) => r.RegionName);

  for (const region of regions) {
    console.log('Publishing to region:', region);
    const awsClient = new DefaultAwsClient();
    // @ts-ignore
    awsClient.AWS.config.update({ region });
    const pub = new AssetPublishing(manifest, {
      aws: awsClient,
      throwOnError: true,
    });
    await pub.publish();
  }
};

// top level await madness
(async () => {await main();})().catch(e => {
  console.log(e);
});

