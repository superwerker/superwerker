// eslint-disable-next-line import/no-unresolved
import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import * as AWS from 'aws-sdk';
export const PROP_EMAILBUCKET_NAME = 'EmailBucketName';

const s3 = new AWS.S3();
const fileKey = 'RootMail/AMAZON_SES_SETUP_NOTIFICATION';

export interface IsCompleteHandlerResponse {
  IsComplete: boolean;
}

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<IsCompleteHandlerResponse> {
  const emailBucketName = event.ResourceProperties[PROP_EMAILBUCKET_NAME];

  switch (event.RequestType) {
    case 'Create':
      console.log(`Testing if '${fileKey}' file is present in the S3 bucket: ${emailBucketName}`);
      // RootMail/AMAZON_SES_SETUP_NOTIFICATION mail in the S3 bucket
      // and the test run the setup being complete.
      const result = await s3
        .headObject({
          Bucket: emailBucketName,
          Key: fileKey,
        })
        .promise();

      // check if file is present
      if (result.$response.error) {
        console.log(`File ${fileKey} NOT found. IsComplete: false`);
        return {
          IsComplete: false,
        };
      }

      console.log(`File ${fileKey} found. SES setup complete. Proceeding`);
      return {
        IsComplete: true,
      };
    case 'Update':
    case 'Delete':
      return {
        IsComplete: true,
      };
  }
}
