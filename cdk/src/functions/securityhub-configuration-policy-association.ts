import { ListRootsCommand, Organizations } from '@aws-sdk/client-organizations';
import {
  SecurityHub,
  StartConfigurationPolicyAssociationCommand,
  StartConfigurationPolicyDisassociationCommand,
  ListConfigurationPoliciesCommand,
} from '@aws-sdk/client-securityhub';
import { STS } from '@aws-sdk/client-sts';
import { SUPERWERKER_CONFIGRUATION_POLICY_NAME } from './securityhub-configuration-policy';
import { getCredsFromAssumeRole } from '../utils/assume-role';
import { throttlingBackOff } from '../utils/throttle';

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const secHubCrossAccountRoleArn = event.ResourceProperties.role;

  const stsClient = new STS();
  const creds = await getCredsFromAssumeRole(stsClient, secHubCrossAccountRoleArn, 'SecurityHubConfigurationPolicyAssociation');
  const securityHubClient = new SecurityHub({ credentials: creds });
  const organizationsClient = new Organizations({ region: 'us-east-1', credentials: creds });

  const rootId = await getOrganisationRoot(organizationsClient);
  console.log('RootId:', rootId);

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

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (superwerkerConfigurationPolicyId === '') {
        throw new Error('Cannot associate configuration policy, superwerker configuration policy not found');
      }

      console.log('Associate superwerker configuration policy');
      try {
        await throttlingBackOff(() =>
          securityHubClient.send(
            new StartConfigurationPolicyAssociationCommand({
              ConfigurationPolicyIdentifier: superwerkerConfigurationPolicyId,
              Target: {
                RootId: rootId,
              },
            }),
          ),
        );
        // TODO if Suspended OU exists then set to SELF_MANAGED_SECURITY_HUB?
      } catch (error) {
        console.log(error);
        throw new Error('Failed to associate configuration policy: ' + error);
      }

      return { Status: 'Success', StatusCode: 200 };
    case 'Delete':
      console.log('Dissasociate configuration policy', superwerkerConfigurationPolicyId);
      try {
        await throttlingBackOff(() =>
          securityHubClient.send(
            new StartConfigurationPolicyDisassociationCommand({
              ConfigurationPolicyIdentifier: superwerkerConfigurationPolicyId,
              Target: {
                RootId: rootId,
              },
            }),
          ),
        );
      } catch (error) {
        throw new Error('Failed to dissasociate configuration policy: ' + error);
      }
      return { Status: 'Success', StatusCode: 200 };
  }
}

async function getOrganisationRoot(organizationsClient: Organizations) {
  const response = await organizationsClient.send(new ListRootsCommand({}));
  if (response.Roots) {
    return response.Roots[0].Id!;
  }
  throw new Error('No root found in organization');
}
