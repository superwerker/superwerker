import { SecurityHub, DescribeOrganizationConfigurationCommand, UpdateOrganizationConfigurationCommand } from '@aws-sdk/client-securityhub';
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

      // The API is a bit flaky and sometimes works after multiple retries
      // API returns 200 even if the configuration is not updated
      // So we need to check the configuration after the update
      let counter = 0;
      while (counter < 5) {
        const respone = await throttlingBackOff(() =>
          securityHubClient.send(
            new UpdateOrganizationConfigurationCommand({
              AutoEnable: false,
              AutoEnableStandards: 'NONE',
              OrganizationConfiguration: { ConfigurationType: 'CENTRAL' },
            }),
          ),
        );
        console.log(respone);
        await new Promise((resolve) => setTimeout(resolve, 10000));

        const organsiationConfig = await throttlingBackOff(() => securityHubClient.send(new DescribeOrganizationConfigurationCommand()));
        if (organsiationConfig.OrganizationConfiguration?.ConfigurationType === 'CENTRAL') {
          return { Status: 'Success', StatusCode: 200 };
        }

        counter++;
      }
      throw new Error('Failed to update Security Hub Organization Configuration to CENTRAL');

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
        throw new Error('Failed to reset Security Hub Organization Configuration to LOCAL: ' + error);
      }
      return { Status: 'Success', StatusCode: 200 };
  }
}
