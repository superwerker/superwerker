// eslint-disable-next-line import/no-unresolved
import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import AWS from 'aws-sdk';
import Fs from 'fs';
import { downloadFile } from './utils/download-file';

const s3 = new AWS.S3();
const cloudformation = new AWS.CloudFormation();
const organizations = new AWS.Organizations({ region: 'us-east-1' });

export interface HandlerResponse {
  email: string;
}

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  const stackId = event.StackId;
  const accountId = stackId.split(':')[4];
  const region = stackId.split(':')[3];

  const BUCKET_NAME = `superwerker-lza-deployment-bucket-${accountId}-${region}`;

  const LZA_VERSION = event.ResourceProperties.LZA_VERSION;
  const LOG_ARCHIVE_AWS_ACCOUNT_EMAIL = event.ResourceProperties.LOG_ARCHIVE_AWS_ACCOUNT_EMAIL;
  const AUDIT_AWS_ACCOUNT_EMAIL = event.ResourceProperties.AUDIT_AWS_ACCOUNT_EMAIL;
  const SNS_NOTIFICATIONS_ARN = event.ResourceProperties.SNS_NOTIFICATIONS_ARN;

  const CLOUDFORMATION_URL = `https://s3.amazonaws.com/solutions-reference/landing-zone-accelerator-on-aws/${LZA_VERSION}/AWSAccelerator-InstallerStack.template`;
  const STACK_NAME = 'landing-zone-accelerator';
  const FILE_NAME = `${STACK_NAME}.template`;

  switch (event.RequestType) {
    case 'Create':
      console.log('Installing LZA');

      const prefix = `/tmp`;
      const localFilePath = `${prefix}/${FILE_NAME}`;

      console.log('Downloading LZA Template');
      await downloadFile(CLOUDFORMATION_URL, localFilePath);

      console.log('Creating deployment S3 Bucket');
      await s3
        .createBucket({
          Bucket: BUCKET_NAME,
        })
        .promise();

      console.log('Uploading LZA to S3');
      await s3
        .putObject({
          Bucket: BUCKET_NAME,
          Key: FILE_NAME,
          Body: Fs.readFileSync(localFilePath),
        })
        .promise();

      const orgInfo = await organizations.describeOrganization().promise();
      const masterInfo = await organizations.describeAccount({ AccountId: orgInfo.Organization!.MasterAccountId }).promise();
      const masterMail = masterInfo.Account!.Email;

      await console.log('Creating LZA Stack');
      await cloudformation
        .createStack({
          StackName: STACK_NAME,
          TemplateURL: `https://s3.amazonaws.com/${BUCKET_NAME}/${FILE_NAME}`,
          Capabilities: ['CAPABILITY_NAMED_IAM'],
          NotificationARNs: [SNS_NOTIFICATIONS_ARN],
          Parameters: [
            {
              ParameterKey: 'RepositorySource',
              ParameterValue: 'github',
            },
            {
              ParameterKey: 'EnableApprovalStage',
              ParameterValue: 'No',
            },
            {
              ParameterKey: 'ApprovalStageNotifyEmailList',
              ParameterValue: 'no-email@needed.com',
            },
            {
              ParameterKey: 'ManagementAccountEmail',
              ParameterValue: masterMail.toString().toLowerCase(),
            },
            {
              ParameterKey: 'LogArchiveAccountEmail',
              ParameterValue: LOG_ARCHIVE_AWS_ACCOUNT_EMAIL.toString().toLowerCase(),
            },
            {
              ParameterKey: 'AuditAccountEmail',
              ParameterValue: AUDIT_AWS_ACCOUNT_EMAIL.toString().toLowerCase(),
            },
            {
              ParameterKey: 'ControlTowerEnabled',
              ParameterValue: 'Yes',
            },
          ],
        })
        .promise();

      return {
        Status: 'SUCCESS',
      };
    case 'Update':
      console.log('Updating LZA Stack does nothing, update if necessary manually');
      return {};
    case 'Delete':
      console.log('Delete LZA S3 file');
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

      // TODO LZA Installer
      // delete KMS Key
      // delete S3 Buckets
      // delete Stack

      // TODO LZA Pipeline
      // delete Stack

      // console.log('Deleting LZA Stack');
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
