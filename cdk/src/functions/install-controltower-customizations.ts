// eslint-disable-next-line import/no-unresolved
import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import AWS from 'aws-sdk';
import Fs from 'fs';
import Https from 'https';
import unzipper from 'unzipper';

const CONTROL_TOWER_CUSTOMIZATIONS_VERSION = '2.6.0';
const CLOUDFORMATION_URL = `https://github.com/aws-solutions/aws-control-tower-customizations/archive/refs/tags/v${CONTROL_TOWER_CUSTOMIZATIONS_VERSION}.zip`;
const STACK_NAME = 'customizations-for-aws-control-tower';
const ZIP_NAME = `aws-control-tower-customizations-${CONTROL_TOWER_CUSTOMIZATIONS_VERSION}`;
const FILE_NAME = `${STACK_NAME}.template`;

const s3 = new AWS.S3();
const cloudformation = new AWS.CloudFormation();

export interface HandlerResponse {
  email: string;
}

/**
 * Download a file from the given `url` into the `targetFile`.
 *
 * @param {String} url
 * @param {String} targetFile
 *
 * @returns {Promise<void>}
 */
async function downloadFile(url: string, targetFile: string) {
  return await new Promise((resolve, reject) => {
    Https.get(url, (response) => {
      const code = response.statusCode ?? 0;

      if (code >= 400) {
        return reject(new Error(response.statusMessage));
      }

      // handle redirects
      if (code > 300 && code < 400 && !!response.headers.location) {
        return resolve(downloadFile(response.headers.location, targetFile));
      }

      // save the file to disk
      const fileWriter = Fs.createWriteStream(targetFile).on('finish', () => {
        resolve({});
      });

      response.pipe(fileWriter);
    }).on('error', (error) => {
      reject(error);
    });
  });
}

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  const stackId = event.StackId;
  const accountId = stackId.split(':')[4];
  const region = stackId.split(':')[3];

  const BUCKET_NAME = `superwerker-deployment-bucket-${accountId}-${region}`;
  const SNS_NOTIFICATIONS_ARN = event.ResourceProperties.SNS_NOTIFICATIONS_ARN;

  switch (event.RequestType) {
    case 'Create':
      console.log('Installing Control Tower Customizations');

      const prefix = `/tmp`;
      const localFilePathZip = `${prefix}/${ZIP_NAME}.zip`;
      const localFilePath = `${prefix}/${ZIP_NAME}/${FILE_NAME}`;

      console.log('Downloading newest Control Tower Customizations');
      await downloadFile(CLOUDFORMATION_URL, localFilePathZip);

      console.log('Unzipping Control Tower Customizations');
      Fs.createReadStream(localFilePathZip).pipe(unzipper.Extract({ path: prefix }));

      console.log('Creating deployment S3 Bucket');
      await s3
        .createBucket({
          Bucket: BUCKET_NAME,
        })
        .promise();

      console.log('Uploading Control Tower Customizations to S3');
      await s3
        .putObject({
          Bucket: BUCKET_NAME,
          Key: FILE_NAME,
          Body: Fs.readFileSync(localFilePath),
        })
        .promise();

      console.log('Creating Control Tower Customizations Stack');
      await cloudformation
        .createStack({
          StackName: STACK_NAME,
          TemplateURL: `https://s3.amazonaws.com/${BUCKET_NAME}/${FILE_NAME}`,
          Capabilities: ['CAPABILITY_NAMED_IAM'],
          NotificationARNs: [SNS_NOTIFICATIONS_ARN],
          Parameters: [
            {
              ParameterKey: 'PipelineApprovalStage',
              ParameterValue: 'No',
              UsePreviousValue: true,
            },
            {
              ParameterKey: 'PipelineApprovalEmail',
              ParameterValue: 'dummy@example.com',
              UsePreviousValue: true,
            },
            {
              ParameterKey: 'CodePipelineSource',
              ParameterValue: 'AWS CodeCommit',
              UsePreviousValue: true,
            },
          ],
        })
        .promise();

      return {
        Status: 'SUCCESS',
      };
    case 'Update':
      console.log('Updating Control Tower Customizations Stack does nothing, update if necessary manually');
      return {};
    case 'Delete':
      console.log('Delete Control Tower Customizations S3 file');
      await s3
        .deleteObject({
          Bucket: BUCKET_NAME,
          Key: FILE_NAME,
        })
        .promise();

      console.log('Delete S3 Deployment Bucket');
      await s3
        .deleteBucket({
          Bucket: BUCKET_NAME,
        })
        .promise();

      // console.log('Deleting Control Tower Customizations Stack');
      // await cloudformation
      //   .deleteStack({
      //     StackName: STACK_NAME,
      //   })
      //   .promise();

      return {
        Status: 'SUCCESS',
      };
  }
}
