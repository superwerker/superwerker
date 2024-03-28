import {
  SecurityHub,
  CreateConfigurationPolicyCommand,
  UpdateConfigurationPolicyCommand,
  DeleteConfigurationPolicyCommand,
  ListConfigurationPoliciesCommand,
  UpdateConfigurationPolicyCommandInput,
} from '@aws-sdk/client-securityhub';
import { STS } from '@aws-sdk/client-sts';
import { getCredsFromAssumeRole } from '../utils/assume-role';
import { throttlingBackOff } from '../utils/throttle';

export const SUPERWERKER_CONFIGRUATION_POLICY_NAME = 'superwerker-securityhub-configuration';

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const region = event.ResourceProperties.region;
  const secHubCrossAccountRoleArn = event.ResourceProperties.role;

  // TODO make configurable via SSM parameter that user can override

  const stsClient = new STS();
  const creds = await getCredsFromAssumeRole(stsClient, secHubCrossAccountRoleArn, 'SecurityHubConfigurationPolicy');
  const securityHubClient = new SecurityHub({ credentials: creds });

  // check if superwerker configuration policy exists
  const listPoliciesResult = await throttlingBackOff(() => securityHubClient.send(new ListConfigurationPoliciesCommand({})));

  let superwerkerConfigurationPolicyId = '';
  if (listPoliciesResult.ConfigurationPolicySummaries!.length > 0) {
    console.log('List of policies:', listPoliciesResult.ConfigurationPolicySummaries);
    for (const policy of listPoliciesResult.ConfigurationPolicySummaries!) {
      if (policy.Name === SUPERWERKER_CONFIGRUATION_POLICY_NAME) {
        superwerkerConfigurationPolicyId = policy.Id!;
      }
    }
  }

  const enabledStandardIdentifiers = [`arn:aws:securityhub:${region}::standards/aws-foundational-security-best-practices/v/1.0.0`];

  const superwerkerConfigruationPolicy = {
    Name: SUPERWERKER_CONFIGRUATION_POLICY_NAME,
    Description: 'superwerker securityhub configuration policy applied to all accounts in organisation',
    ConfigurationPolicy: {
      SecurityHub: {
        ServiceEnabled: true,
        EnabledStandardIdentifiers: enabledStandardIdentifiers,
        SecurityControlsConfiguration: {
          DisabledSecurityControlIdentifiers: [
            // all controls are enabled except the following
            'CloudFormation.1',
            'S3.11',
            'Macie.1',
            //'EC2.10',
          ],
        },
      },
    },
    Tags: {
      Name: 'superwerker',
    },
  };

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (superwerkerConfigurationPolicyId) {
        console.log('Existing configuration policy found, updating policy', superwerkerConfigurationPolicyId);
        try {
          let superwerkerConfigruationPolicyUpdate: UpdateConfigurationPolicyCommandInput = {
            ...superwerkerConfigruationPolicy,
            Identifier: superwerkerConfigurationPolicyId,
          };
          await throttlingBackOff(() => securityHubClient.send(new UpdateConfigurationPolicyCommand(superwerkerConfigruationPolicyUpdate)));
        } catch (error) {
          console.log(error);
          throw new Error('Failed to update Security Hub configuration policy: ' + error);
        }
        return { Status: 'Success', StatusCode: 200 };
      }

      console.log('Create new configuration policy');
      try {
        await throttlingBackOff(() => securityHubClient.send(new CreateConfigurationPolicyCommand(superwerkerConfigruationPolicy)));
      } catch (error) {
        console.log(error);
        throw new Error('Failed to create Security Hub configuration policy: ' + error);
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      console.log('Delete configuration policy', superwerkerConfigurationPolicyId);
      try {
        await throttlingBackOff(() =>
          securityHubClient.send(new DeleteConfigurationPolicyCommand({ Identifier: superwerkerConfigurationPolicyId })),
        );
      } catch (error) {
        throw new Error('Failed to delete Security Hub configuration policy: ' + error);
      }
      return { Status: 'Success', StatusCode: 200 };
  }
}
