import {
  OrganizationsClient,
  CreateOrganizationCommand,
  CreateOrganizationCommandOutput,
  AlreadyInOrganizationException,
} from '@aws-sdk/client-organizations';
import { SSMClient, PutParameterCommand, ParameterType, PutParameterCommandOutput, ParameterAlreadyExists } from '@aws-sdk/client-ssm';
import { CdkCustomResourceEvent, CdkCustomResourceResponse, Context } from 'aws-lambda';
import axios from 'axios';

const CT_VERSION = '4.0';
const CT_SECURITY_OU_NAME = 'Security';
const CT_SANDBOX_OU_NAME = 'Sandbox';
const CT_BUCKET_RETENTION_LOGGING = '90';
const CT_BUCKET_RETENTION_ACCESS_LOGGING = '365';

export async function handler(event: CdkCustomResourceEvent, _context: Context): Promise<CdkCustomResourceResponse> {
  console.log(event);
  const CT_REGIONS = event.ResourceProperties.ServiceToken.split(':')[3];

  const cfnSignal = event.ResourceProperties.SIGNAL_URL;
  const controlTowerVersionParameterName = event.ResourceProperties.CONTROL_TOWER_VERSION_PARAMETER;
  const controlTowerRegionsParameterName = event.ResourceProperties.CONTROL_TOWER_REGIONS_PARAMETER;
  const controlTowerKmsKeyParameterName = event.ResourceProperties.CONTROL_TOWER_KMS_KEY_PARAMETER;
  const controlTowerKmsKeyArn = event.ResourceProperties.CONTROL_TOWER_KMS_KEY_ARN;
  const securityOuSsmParameterName = event.ResourceProperties.CONTROL_TOWER_SECURITY_OU_PARAMETER;
  const sandboxOuSsmParameterName = event.ResourceProperties.CONTROL_TOWER_SANDBOX_OU_PARAMETER;
  const bucketRetetionLoggingParameterName = event.ResourceProperties.CONTROL_TOWER_BUCKET_RETENTION_LOGGING_PARAMETER;
  const bucketRetetionAccessLoggingParameterName = event.ResourceProperties.CONTROL_TOWER_BUCKET_RETENTION_ACCESS_LOGGING_PARAMETER;

  switch (event.RequestType) {
    // @ts-ignore
    case 'Create':
    case 'Update':
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

      // due to legacy reasons, we need to create a parameters to allow custom values for Control Tower Settings
      // This is especially important for the OUs, as the default naming convention for the OUs in Control Tower has changed over time
      // We also provide hereby an option for end users to customize their Control Tower LZ without having these option in the main cloudformation template

      await createSsmParameter(
        ssmClient,
        securityOuSsmParameterName,
        CT_SECURITY_OU_NAME,
        `(superwerker) Control Tower name of ${CT_SECURITY_OU_NAME} OU (cannot be changed after first install)`,
      );

      await createSsmParameter(
        ssmClient,
        sandboxOuSsmParameterName,
        CT_SANDBOX_OU_NAME,
        `(superwerker) Control Tower name of ${CT_SANDBOX_OU_NAME} OU (cannot be changed after first install)`,
      );

      await createSsmParameter(ssmClient, controlTowerVersionParameterName, CT_VERSION, '(superwerker) Control Tower version');

      await createSsmParameter(
        ssmClient,
        controlTowerRegionsParameterName,
        `${CT_REGIONS}`,
        '(superwerker) Control Tower governed regions',
        ParameterType.STRING_LIST,
      );

      await createSsmParameter(
        ssmClient,
        controlTowerKmsKeyParameterName,
        controlTowerKmsKeyArn,
        '(superwerker) Control Tower KMS key arn for log encryption',
      );

      await createSsmParameter(
        ssmClient,
        bucketRetetionLoggingParameterName,
        CT_BUCKET_RETENTION_LOGGING,
        '(superwerker) Control Tower bucket retention for logging ',
      );

      await createSsmParameter(
        ssmClient,
        bucketRetetionAccessLoggingParameterName,
        CT_BUCKET_RETENTION_ACCESS_LOGGING,
        '(superwerker) Control Tower bucket retention for access logging ',
      );

      // signal cloudformation stack that control tower setup is complete
      console.log('Signaling cloudformation stack', cfnSignal);
      await axios
        .put(cfnSignal, {
          Status: 'SUCCESS',
          Reason: 'Organization creation completed',
          UniqueId: 'doesthisreallyhavetobeunique',
          Data: 'Organization creation completed',
        })
        .catch(function (error) {
          console.log('Error when sending cloudformation signal', error);
        });

      return { PhysicalResourceId: physicalResourceId };

    case 'Delete':
      return {};
  }
}

export async function createSsmParameter(
  ssmClient: SSMClient,
  parameterName: string,
  parameterValue: string,
  parameterDescription: string,
  parameterType: ParameterType = ParameterType.STRING,
): Promise<PutParameterCommandOutput | undefined> {
  const parameterExistsMessage = 'SSM Parameter already exists, skipping creation';
  const unexpectedErrorMessage = 'Unexpected error while creating SSM Parameter: ';
  try {
    console.log(`creating ssm parameter for Control Tower: ${parameterName}`);

    const param = {
      Name: parameterName,
      Description: parameterDescription,
      Value: parameterValue,
      Type: parameterType,
      Overwrite: false,
    };
    const putParameterCommand = new PutParameterCommand(param);
    return await ssmClient.send(putParameterCommand);
  } catch (e) {
    if (e instanceof ParameterAlreadyExists) {
      console.log(parameterExistsMessage);
      return undefined;
    } else {
      throw new Error(unexpectedErrorMessage + e);
    }
  }
}

export async function createOrganizations(): Promise<CreateOrganizationCommandOutput> {
  const client = new OrganizationsClient({ region: 'us-east-1' });
  const command = new CreateOrganizationCommand({ FeatureSet: 'ALL' });
  return client.send(command);
}
