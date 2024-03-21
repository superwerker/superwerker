import { SecurityHub, UpdateOrganizationConfigurationCommand } from '@aws-sdk/client-securityhub';
import { STS } from '@aws-sdk/client-sts';
import { getCredsFromAssumeRole } from '../utils/assume-role';
import { throttlingBackOff } from '../utils/throttle';

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const secHubCrossAccountRoleArn = event.ResourceProperties.role;

  const stsClient = new STS();
  const securityHubClient = new SecurityHub({
    credentials: await getCredsFromAssumeRole(stsClient, secHubCrossAccountRoleArn, 'SecurityHubCentralOrganizationConfiguration'),
  });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('Update Security Hub Organization Configuration to CENTRAL');
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
