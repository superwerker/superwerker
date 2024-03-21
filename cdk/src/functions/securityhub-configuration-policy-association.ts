import { ListRootsCommand, Organizations } from '@aws-sdk/client-organizations';
import {
  SecurityHub,
  StartConfigurationPolicyAssociationCommand,
  ListConfigurationPolicyAssociationsCommand,
  StartConfigurationPolicyDisassociationCommand,
} from '@aws-sdk/client-securityhub';
import { throttlingBackOff } from '../utils/throttle';

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const region = event.ResourceProperties.region;
  // TODO switch to Audit Account

  const securityHubClient = new SecurityHub();
  const organizationsClient = new Organizations({ region: 'us-east-1' });

  const rootId = await getOrganisationRoot(organizationsClient);

  // check if superwerker configuration policy exists
  const result = await throttlingBackOff(() => securityHubClient.send(new ListConfigurationPolicyAssociationsCommand({})));

  let configurationPolicyId = '';
  if (result.ConfigurationPolicyAssociationSummaries!.length > 0) {
    configurationPolicyId = result.ConfigurationPolicyAssociationSummaries![0].ConfigurationPolicyId!;

    // TODO check if policy can be mapped to superwerker
    for (const policy of result.ConfigurationPolicyAssociationSummaries!) {
      console.log(policy);
    }
  }

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      //don't try to associate configuration policy if its already associated
      if (configurationPolicyId) {
        console.log('Existing superwerker configuration policy association found, skipping association', configurationPolicyId);
      } else {
        console.log('Associate superwerker configuration policy');
        try {
          await throttlingBackOff(() =>
            securityHubClient.send(
              new StartConfigurationPolicyAssociationCommand({
                ConfigurationPolicyIdentifier: configurationPolicyId,
                Target: {
                  RootId: rootId,
                },
              }),
            ),
          );
        } catch (error) {
          console.log(error);
          return { Status: 'Failure', StatusCode: 400 };
        }
      }
      return { Status: 'Success', StatusCode: 200 };
    case 'Delete':
      console.log('Dissasociate superwerker configuration policy', configurationPolicyId);
      try {
        await throttlingBackOff(() =>
          securityHubClient.send(
            new StartConfigurationPolicyDisassociationCommand({ ConfigurationPolicyIdentifier: configurationPolicyId }),
          ),
        );
      } catch (error) {
        console.log(error);
        return { Status: 'Failure', StatusCode: 400 };
      }
      return { Status: 'Success', StatusCode: 200 };
  }
}

async function getOrganisationRoot(organizationsClient: Organizations): Promise<string> {
  const response = await organizationsClient.send(new ListRootsCommand({}));
  if (response.Roots) {
    return response.Roots[0].Id!;
  }
  throw new Error('No root found in organization');
}
