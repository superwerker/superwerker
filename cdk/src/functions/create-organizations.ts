import {
  OrganizationsClient,
  CreateOrganizationCommand,
  CreateOrganizationCommandOutput,
  AlreadyInOrganizationException,
} from '@aws-sdk/client-organizations';
import { SSMClient, PutParameterCommand, ParameterType, PutParameterCommandOutput, ParameterAlreadyExists } from '@aws-sdk/client-ssm';
import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import axios from 'axios';

const CONTROL_TOWER_VERSION = '3.3';
const SECURITY_OU_NAME = 'Security';
const SANDBOX_OU_NAME = 'Sandbox';
const HOME_REGION = process.env.AWS_REGION;
const BUCKET_RETENTION_LOGGING = '90';
const BUCKET_RETENTION_ACCESS_LOGGING = '365';

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  console.log(event);
  switch (event.RequestType) {
    case 'Create':
      const cfnSignal = event.ResourceProperties.SIGNAL_URL;
      const controlTowerVersionParameterName = event.ResourceProperties.CONTROL_TOWER_VERSION;
      const controlTowerRegionsParameterName = event.ResourceProperties.CONTROL_TOWER_REGIONS;
      const securityOuSsmParameterName = event.ResourceProperties.SECURITY_OU_SSM_PARAMETER;
      const sandboxOuSsmParameterName = event.ResourceProperties.SANDBOX_OU_SSM_PARAMETER;
      const bucketRetetionLoggingParameterName = event.ResourceProperties.BUCKET_RETENTION_LOGGING;
      const bucketRetetionAccessLoggingParameterName = event.ResourceProperties.BUCKET_RETENTION_ACCESS_LOGGING;

      console.log('Creating organizations...');
      let physicalResourceId;
      try {
        const organization = await createOrganizations();
        physicalResourceId = organization.Organization!.Id;
      } catch (e) {
        if (e instanceof AlreadyInOrganizationException) {
          console.log('Organization already exists, skipping creation');
          physicalResourceId = 'organisationalreadyexists';
        } else {
          throw new Error('Unexpected error while creating organization: ' + e);
        }
      }

      console.log('Creating SSM parameters...');
      const ssmClient = new SSMClient();
      const parameterExistsMessage = 'SSM Parameter already exists, skipping creation';
      const unexpectedErrorMessage = 'Unexpected error while creating SSM Parameter: ';

      // due to legacy reasons, we need to create a parameter to allow custom names for the Security and Sandbox Organisation Units
      // AWS changed the default naming convention for the OUs in Control Tower, so we need to create a parameter to allow custom names
      // We also provide hereby an option for end users to customize their Control Tower LZ without having these option in the main cloudformation template

      try {
        await createSsmParameter(
          ssmClient,
          securityOuSsmParameterName,
          SECURITY_OU_NAME,
          `(superwerker) Control Tower name of ${SECURITY_OU_NAME} OU (SHOULD NOT BE CHANGED AFTER FIRST INSTALL)`,
        );

        await createSsmParameter(
          ssmClient,
          sandboxOuSsmParameterName,
          SANDBOX_OU_NAME,
          `(superwerker) Control Tower name of ${SANDBOX_OU_NAME} OU (SHOULD NOT BE CHANGED AFTER FIRST INSTALL)`,
        );

        await createSsmParameter(ssmClient, controlTowerVersionParameterName, CONTROL_TOWER_VERSION, '(superwerker) Control Tower version');

        await createSsmParameter(
          ssmClient,
          controlTowerRegionsParameterName,
          `${HOME_REGION}`,
          '(superwerker) Control Tower governed regions',
          ParameterType.STRING_LIST,
        );

        await createSsmParameter(
          ssmClient,
          bucketRetetionLoggingParameterName,
          BUCKET_RETENTION_LOGGING,
          '(superwerker) Control Tower bucket retention for logging ',
        );

        await createSsmParameter(
          ssmClient,
          bucketRetetionAccessLoggingParameterName,
          BUCKET_RETENTION_ACCESS_LOGGING,
          '(superwerker) Control Tower bucket retention for access logging ',
        );
      } catch (e) {
        if (e instanceof ParameterAlreadyExists) {
          console.log(parameterExistsMessage);
        } else {
          throw new Error(unexpectedErrorMessage + e);
        }
      }

      // signal cloudformation stack that control tower setup is complete
      console.log('Signaling cloudformation stack', cfnSignal);
      await axios.put(cfnSignal, {
        Status: 'SUCCESS',
        Reason: 'Organization creation completed',
        UniqueId: 'doesthisreallyhavetobeunique',
        Data: 'Organization creation completed',
      });

      return { PhysicalResourceId: physicalResourceId };

    case 'Update':
    case 'Delete':
      console.log('received update/delete event, doing nothing');
      return {};
  }
}

export async function createSsmParameter(
  ssmClient: SSMClient,
  parameterName: string,
  parameterValue: string,
  parameterDescription: string,
  parameterType: ParameterType = ParameterType.STRING,
): Promise<PutParameterCommandOutput> {
  console.log(`creating ssm parameter for Control Tower: ${parameterName}`);

  const param = {
    Name: parameterName,
    Description: parameterDescription,
    Value: parameterValue,
    Type: parameterType,
    Overwrite: false,
  };
  const putParameterCommand = new PutParameterCommand(param);
  return ssmClient.send(putParameterCommand);
}

export async function createOrganizations(): Promise<CreateOrganizationCommandOutput> {
  const client = new OrganizationsClient({ region: 'us-east-1' });
  const command = new CreateOrganizationCommand({ FeatureSet: 'ALL' });
  return client.send(command);
}
