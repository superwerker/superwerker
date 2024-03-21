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

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const region = event.ResourceProperties.region;
  const secHubCrossAccountRoleArn = event.ResourceProperties.role;

  const stsClient = new STS();
  const creds = await getCredsFromAssumeRole(stsClient, secHubCrossAccountRoleArn, 'SecurityHubConfigurationPolicy');
  const securityHubClient = new SecurityHub({ credentials: creds });

  const superwerkerConfigruationPolicyName = 'superwerker-configuration-policy';

  // check if superwerker configuration policy exists
  const result = await throttlingBackOff(() => securityHubClient.send(new ListConfigurationPoliciesCommand({})));

  let superwerkerConfigurationPolicyArn = '';
  if (result.ConfigurationPolicySummaries!.length > 0) {
    for (const policy of result.ConfigurationPolicySummaries!) {
      if (policy.Name === superwerkerConfigruationPolicyName) {
        superwerkerConfigurationPolicyArn = policy.Arn!;
      }
    }
  }

  const enabledStandardIdentifiers = [`arn:aws:securityhub:${region}::standards/aws-foundational-security-best-practices/v/1.0.0`];

  const superwerkerConfigruationPolicy = {
    Name: 'superwerker-securityhub-configuration',
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
            'EC2.10',
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
      //don't try to create configuration policy if it exists
      if (superwerkerConfigurationPolicyArn) {
        console.log('Existing superwerker configuration policy found, skipping creation', superwerkerConfigurationPolicyArn);
      } else {
        console.log('Create superwerker configuration policy');
        try {
          await throttlingBackOff(() => securityHubClient.send(new CreateConfigurationPolicyCommand(superwerkerConfigruationPolicy)));
        } catch (error) {
          console.log(error);
          return { Status: 'Failure', StatusCode: 400 };
        }
      }
      return { Status: 'Success', StatusCode: 200 };
    case 'Update':
      console.log('Update superwerker configuration policy', superwerkerConfigurationPolicyArn);
      try {
        let superwerkerConfigruationPolicyUpdate: UpdateConfigurationPolicyCommandInput = {
          ...superwerkerConfigruationPolicy,
          Identifier: superwerkerConfigurationPolicyArn,
        };
        await throttlingBackOff(() => securityHubClient.send(new UpdateConfigurationPolicyCommand(superwerkerConfigruationPolicyUpdate)));
      } catch (error) {
        console.log(error);
        return { Status: 'Failure', StatusCode: 400 };
      }
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      console.log('Delete superwerker configuration policy', superwerkerConfigurationPolicyArn);
      try {
        await throttlingBackOff(() =>
          securityHubClient.send(new DeleteConfigurationPolicyCommand({ Identifier: superwerkerConfigurationPolicyArn })),
        );
      } catch (error) {
        console.log(error);
        return { Status: 'Failure', StatusCode: 400 };
      }
      return { Status: 'Success', StatusCode: 200 };
  }
}
