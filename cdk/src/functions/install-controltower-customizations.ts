// eslint-disable-next-line import/no-unresolved
import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import AWS from 'aws-sdk';
import Fs from 'fs';
import unzipper from 'unzipper';
import { downloadFile } from './utils/download-file';

const CONTROL_TOWER_CUSTOMIZATIONS_VERSION = '2.7.0';
const CLOUDFORMATION_URL = `https://github.com/aws-solutions/aws-control-tower-customizations/archive/refs/tags/v${CONTROL_TOWER_CUSTOMIZATIONS_VERSION}.zip`;
const STACK_NAME = 'customizations-for-aws-control-tower';
const ZIP_NAME = `aws-control-tower-customizations-${CONTROL_TOWER_CUSTOMIZATIONS_VERSION}`;
const FILE_NAME = `${STACK_NAME}.template`;

const s3 = new AWS.S3();
const cloudformation = new AWS.CloudFormation();
const ssm = new AWS.SSM();

export interface HandlerResponse {
  email: string;
}

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  const stackId = event.StackId;
  const accountId = stackId.split(':')[4];
  const region = stackId.split(':')[3];

  const BUCKET_NAME = `superwerker-cfct-deployment-bucket-${accountId}-${region}`;
  const SNS_NOTIFICATIONS_ARN = event.ResourceProperties.SNS_NOTIFICATIONS_ARN;
  const CONTROLTOWER_CUSTOMIZATIONS_DONE_SSM_PARAMETER = event.ResourceProperties.CONTROLTOWER_CUSTOMIZATIONS_DONE_SSM_PARAMETER;

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
            },
            {
              ParameterKey: 'PipelineApprovalEmail',
              ParameterValue: 'no-email@needed.com',
            },
            {
              ParameterKey: 'CodePipelineSource',
              ParameterValue: 'AWS CodeCommit',
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
      try {
        await s3
          .deleteObject({
            Bucket: BUCKET_NAME,
            Key: FILE_NAME,
          })
          .promise();
      } catch (err) {
        console.log('Control Tower Customizations S3 file cloud not be deleted, maybe it was already deleted');
      }

      console.log('Delete S3 Deployment Bucket');
      try {
        await s3
          .deleteBucket({
            Bucket: BUCKET_NAME,
          })
          .promise();
      } catch (err) {
        console.log('Control Tower Customizations S3 Deployment Bucket could not be deleted, maybe it was already deleted');
      }

      try {
        console.log('Delete SSM Parameter');
        await ssm
          .deleteParameter({
            Name: CONTROLTOWER_CUSTOMIZATIONS_DONE_SSM_PARAMETER,
          })
          .promise();
      } catch (err) {
        console.log('SSM Parameter could not be deleted, maybe it was already deleted');
      }

      return {
        Status: 'SUCCESS',
      };
  }
}
