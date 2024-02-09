import {
  OrganizationsClient,
  CreateOrganizationCommand,
  CreateOrganizationCommandOutput,
  AlreadyInOrganizationException,
} from '@aws-sdk/client-organizations';
import { SSMClient, PutParameterCommand, ParameterType, PutParameterCommandOutput, ParameterAlreadyExists } from '@aws-sdk/client-ssm';
import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';
import axios from 'axios';

export async function createSsmParameter(
  ssmClient: SSMClient,
  parameterName: string,
  parameterValue: string,
): Promise<PutParameterCommandOutput> {
  console.log(`creating ssm parameters for Control Tower ${parameterValue} OU`);

  const param = {
    Name: parameterName,
    Description: `(superwerker) name of ${parameterValue} ou`,
    Value: parameterValue,
    Type: ParameterType.STRING,
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

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  switch (event.RequestType) {
    case 'Create':
      const cfnSignal = event.ResourceProperties.SIGNAL_URL;
      const securityOuSsmParameterName = event.ResourceProperties.SECURITY_OU_SSM_PARAMETER;
      const sandboxOuSsmParameterName = event.ResourceProperties.SANDBOX_OU_SSM_PARAMETER;

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

      // due to legacy reasons, we need to create a parameter to allow custom names for the Security and Sandbox Organisation Units
      // AWS changed the default naming convention for the OUs in Control Tower, so we need to create a parameter to allow custom names
      console.log('Creating SSM parameters...');
      const ssmClient = new SSMClient();
      const parameterExistsMessage = 'SSM Parameter already exists, skipping creation';
      const unexpectedErrorMessage = 'Unexpected error while creating SSM Parameter: ';
      try {
        await createSsmParameter(ssmClient, securityOuSsmParameterName, 'Security');
      } catch (e) {
        if (e instanceof ParameterAlreadyExists) {
          console.log(parameterExistsMessage);
        } else {
          throw new Error(unexpectedErrorMessage + e);
        }
      }

      try {
        await createSsmParameter(ssmClient, sandboxOuSsmParameterName, 'Sandbox');
      } catch (e) {
        if (e instanceof ParameterAlreadyExists) {
          console.log(parameterExistsMessage);
        } else {
          throw new Error(unexpectedErrorMessage + e);
        }
      }

      // signal cloudformation stack that control tower setup is complete
      console.log('Signaling cloudformation stack', cfnSignal);
      await new Promise((resolve) => setTimeout(resolve, 30000));
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
