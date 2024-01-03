import Fs from 'fs';
import { CloudFormationClient, CreateStackCommand } from '@aws-sdk/client-cloudformation';
import { S3Client, CreateBucketCommand, PutObjectCommand, DeleteObjectCommand, DeleteBucketCommand } from '@aws-sdk/client-s3';
import { SSMClient, DeleteParameterCommand } from '@aws-sdk/client-ssm';
import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import unzipper from 'unzipper';
import { downloadFile } from './utils/download-file';

const s3 = new S3Client();
const cloudformation = new CloudFormationClient();
const ssm = new SSMClient();

export interface HandlerResponse {
  email: string;
}

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  const stackId = event.StackId;
  const accountId = stackId.split(':')[4];
  const region = stackId.split(':')[3];

  const BUCKET_NAME = `superwerker-cfct-deployment-bucket-${accountId}-${region}`;

  const CONTROLTOWER_CUSTOMIZATIONS_VERSION = event.ResourceProperties.CONTROLTOWER_CUSTOMIZATIONS_VERSION;
  const SNS_NOTIFICATIONS_ARN = event.ResourceProperties.SNS_NOTIFICATIONS_ARN;
  const CONTROLTOWER_CUSTOMIZATIONS_DONE_SSM_PARAMETER = event.ResourceProperties.CONTROLTOWER_CUSTOMIZATIONS_DONE_SSM_PARAMETER;

  const CLOUDFORMATION_URL = `https://github.com/aws-solutions/aws-control-tower-customizations/archive/refs/tags/v${CONTROLTOWER_CUSTOMIZATIONS_VERSION}.zip`;
  const STACK_NAME = 'customizations-for-aws-control-tower';
  const ZIP_NAME = `aws-control-tower-customizations-${CONTROLTOWER_CUSTOMIZATIONS_VERSION}`;
  const FILE_NAME = `${STACK_NAME}.template`;

  switch (event.RequestType) {
    case 'Create':
      console.log('Installing Control Tower Customizations');

      const prefix = '/tmp';
      const localFilePathZip = `${prefix}/${ZIP_NAME}.zip`;
      const localFilePath = `${prefix}/${ZIP_NAME}/${FILE_NAME}`;

      console.log('Downloading newest Control Tower Customizations');
      await downloadFile(CLOUDFORMATION_URL, localFilePathZip);

      console.log('Unzipping Control Tower Customizations');
      Fs.createReadStream(localFilePathZip).pipe(unzipper.Extract({ path: prefix }));

      console.log('Creating deployment S3 Bucket');
      const createBucketCommand = new CreateBucketCommand({ Bucket: BUCKET_NAME });
      await s3.send(createBucketCommand);

      console.log('Uploading Control Tower Customizations to S3');
      const putObjectCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: FILE_NAME,
        Body: Fs.readFileSync(localFilePath),
      });
      await s3.send(putObjectCommand);

      console.log('Creating Control Tower Customizations Stack');
      const command = new CreateStackCommand({
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
      });
      await cloudformation.send(command);

      return {
        Status: 'SUCCESS',
      };
    case 'Update':
      console.log('Updating Control Tower Customizations Stack does nothing, update if necessary manually');
      return {};
    case 'Delete':
      console.log('Delete Control Tower Customizations S3 file');
      try {
        const deleteObjectCommand = new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: FILE_NAME,
        });
        await s3.send(deleteObjectCommand);
      } catch (err) {
        console.log('Control Tower Customizations S3 file cloud not be deleted, maybe it was already deleted');
      }

      console.log('Delete S3 Deployment Bucket');
      try {
        const deleteBucketCommand = new DeleteBucketCommand({ Bucket: BUCKET_NAME });
        await s3.send(deleteBucketCommand);
      } catch (err) {
        console.log('Control Tower Customizations S3 Deployment Bucket could not be deleted, maybe it was already deleted');
      }

      try {
        console.log('Delete SSM Parameter');
        const deleteParameterCommand = new DeleteParameterCommand({
          Name: CONTROLTOWER_CUSTOMIZATIONS_DONE_SSM_PARAMETER,
        });
        await ssm.send(deleteParameterCommand);
      } catch (err) {
        console.log('SSM Parameter could not be deleted, maybe it was already deleted');
      }

      return {
        Status: 'SUCCESS',
      };
  }
}
