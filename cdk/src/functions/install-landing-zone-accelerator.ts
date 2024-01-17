import Fs from 'fs';
import { CloudFormationClient, CreateStackCommand } from '@aws-sdk/client-cloudformation';
import {
  OrganizationsClient,
  DescribeOrganizationCommand,
  DescribeAccountCommand,
  CreateOrganizationalUnitCommand,
} from '@aws-sdk/client-organizations';
import { S3Client, CreateBucketCommand, PutObjectCommand, DeleteObjectCommand, DeleteBucketCommand } from '@aws-sdk/client-s3';
import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import { downloadFile } from './utils/download-file';

const s3 = new S3Client();
const cloudformation = new CloudFormationClient();
const organizations = new OrganizationsClient({ region: 'us-east-1' });

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  const stackId = event.StackId;
  const accountId = stackId.split(':')[4];
  const region = stackId.split(':')[3];

  const BUCKET_NAME = `superwerker-lza-deployment-bucket-${accountId}-${region}`;

  const LZA_VERSION = event.ResourceProperties.LZA_VERSION;
  const LOG_ARCHIVE_AWS_ACCOUNT_EMAIL = event.ResourceProperties.LOG_ARCHIVE_AWS_ACCOUNT_EMAIL;
  const AUDIT_AWS_ACCOUNT_EMAIL = event.ResourceProperties.AUDIT_AWS_ACCOUNT_EMAIL;

  const CLOUDFORMATION_URL = `https://s3.amazonaws.com/solutions-reference/landing-zone-accelerator-on-aws/${LZA_VERSION}/AWSAccelerator-InstallerStack.template`;
  const STACK_NAME = 'landing-zone-accelerator';
  const FILE_NAME = `${STACK_NAME}.template`;

  switch (event.RequestType) {
    case 'Create':
      console.log('Installing LZA');

      const prefix = '/tmp';
      const localFilePath = `${prefix}/${FILE_NAME}`;

      console.log('Downloading LZA Template');
      await downloadFile(CLOUDFORMATION_URL, localFilePath);

      console.log('Creating deployment S3 Bucket');
      const createBucketCommand = new CreateBucketCommand({ Bucket: BUCKET_NAME });
      await s3.send(createBucketCommand);

      console.log('Uploading LZA to S3');
      const putObjectCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: FILE_NAME,
        Body: Fs.readFileSync(localFilePath),
      });
      await s3.send(putObjectCommand);

      const describeOrganizationCommand = new DescribeOrganizationCommand({});
      const orgInfo = await organizations.send(describeOrganizationCommand);
      await createSuspendedOu(orgInfo.Organization!.Id!);
      const describeAccountCommand = new DescribeAccountCommand({ AccountId: orgInfo.Organization!.MasterAccountId });
      const masterInfo = await organizations.send(describeAccountCommand);

      const masterMail = masterInfo.Account!.Email;

      await console.log('Creating LZA Stack');
      const createStackCommand = new CreateStackCommand({
        StackName: STACK_NAME,
        TemplateURL: `https://s3.amazonaws.com/${BUCKET_NAME}/${FILE_NAME}`,
        Capabilities: ['CAPABILITY_NAMED_IAM'],
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
            ParameterValue: masterMail!.toString().toLowerCase(),
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
      });
      await cloudformation.send(createStackCommand);

      return {
        Status: 'SUCCESS',
      };
    case 'Update':
      console.log('Updating LZA Stack does nothing, update if necessary manually');
      return {};
    case 'Delete':
      console.log('Delete LZA S3 file');
      try {
        const deleteObjectCommand = new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: FILE_NAME,
        });
        await s3.send(deleteObjectCommand);
      } catch (err) {
        console.log('LZA S3 file cloud not be deleted, maybe it was already deleted');
      }

      console.log('Delete S3 Deployment Bucket');
      try {
        const deleteBucketCommand = new DeleteBucketCommand({ Bucket: BUCKET_NAME });
        await s3.send(deleteBucketCommand);
      } catch (err) {
        console.log('LZA S3 Deployment Bucket could not be deleted, maybe it was already deleted');
      }

      return {
        Status: 'SUCCESS',
      };
  }
}
async function createSuspendedOu(parentOuId: string) {
  try {
    const createOrganizationalUnitCommand = new CreateOrganizationalUnitCommand({
      ParentId: parentOuId,
      Name: 'Suspended',
    });
    await organizations.send(createOrganizationalUnitCommand);
    return;
  } catch (err) {
    console.log('Suspended OU already exists, nothing to do');
  }
}
