import { SecurityHub, UpdateOrganizationConfigurationCommand } from '@aws-sdk/client-securityhub';
import { throttlingBackOff } from '../utils/throttle';

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  // TODO switch to aduit account

  const securityHubClient = new SecurityHub();

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('Update Security Hub Organization Configuration tp CENTRAL');
      try {
        await throttlingBackOff(() =>
          securityHubClient.send(
            new UpdateOrganizationConfigurationCommand({
              AutoEnable: false,
              AutoEnableStandards: 'NONE',
              OrganizationConfiguration: { ConfigurationType: 'CENTRAL' },
            }),
          ),
        );
      } catch (error) {
        console.log(error);
        return { Status: 'Failure', StatusCode: 400 };
      }
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      console.log('Reset Security Hub Organization Configuration to LOCAL');
      try {
        await throttlingBackOff(() =>
          securityHubClient.send(
            new UpdateOrganizationConfigurationCommand({
              AutoEnable: false,
              AutoEnableStandards: 'NONE',
              OrganizationConfiguration: { ConfigurationType: 'LOCAL' },
            }),
          ),
        );
      } catch (error) {
        console.log(error);
        return { Status: 'Failure', StatusCode: 400 };
      }
      return { Status: 'Success', StatusCode: 200 };
  }
}
