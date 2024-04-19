import { EnablePolicyTypeCommand, ListRootsCommand, OrganizationsClient, PolicyType, Root } from '@aws-sdk/client-organizations';
import * as AWSCDKAsyncCustomResource from 'aws-cdk-lib/custom-resources/lib/provider-framework/types';

async function getRootId(client: OrganizationsClient): Promise<string | undefined> {
  try {
    const command = new ListRootsCommand({});
    const response = await client.send(command);

    if (!response.Roots?.length) {
      console.warn('No roots found in the organization');
      return '';
    }

    const root: Root = response.Roots[0];

    return root.Id;
  } catch (error) {
    console.error('Error getting root accounts', error);
    return '';
  }
}

async function checkSCPStatus(client: OrganizationsClient): Promise<boolean> {
  try {
    const command = new ListRootsCommand({});
    const response = await client.send(command);

    if (!response.Roots?.length) {
      console.warn('No roots found in the organization');
      return false;
    }

    const firstRoot: Root = response.Roots[0];

    const policyTypes = firstRoot.PolicyTypes;

    policyTypes?.forEach((element) => {
      if (element.Type == 'SERVICE_CONTROL_POLICY' && element.Status == 'ENABLED') {
        return true;
      }
    });

    return false;
  } catch (error) {
    console.error('Error getting root policy types:', error);
    return false;
  }
}

export async function handler(event: AWSCDKAsyncCustomResource.OnEventRequest): Promise<AWSCDKAsyncCustomResource.OnEventResponse> {
  const organizationClient = new OrganizationsClient({ region: 'us-east-1' });

  let rootId = '';

  getRootId(organizationClient)
    .then((returnedId) => {
      if (returnedId) {
        rootId = rootId;
      }
    })
    .catch((error) => {
      console.error('Error occurred during root listing:', error);
      // Handle errors appropriately (e.g., retry, log to monitoring)
    });

  if (event.RequestType == 'Create' && (await checkSCPStatus(organizationClient)) == false) {
    const inputEnablePolicyType = {
      // EnablePolicyTypeRequest
      RootId: rootId,
      PolicyType: PolicyType.SERVICE_CONTROL_POLICY,
    };

    const response = organizationClient.send(new EnablePolicyTypeCommand(inputEnablePolicyType));
    return response;
  }

  return {};
}
