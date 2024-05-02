import {
  AttachPolicyCommand,
  CreatePolicyCommand,
  DeletePolicyCommand,
  DetachPolicyCommand,
  ListRootsCommand,
  OrganizationsClient,
  PolicyType,
  UpdatePolicyCommand,
  ListPoliciesCommand,
} from '@aws-sdk/client-organizations';
import { CdkCustomResourceEvent, CdkCustomResourceResponse, Context } from 'aws-lambda';

async function getRootId(organizationClient: OrganizationsClient): Promise<string | undefined> {
  let id = '';
  try {
    const command = new ListRootsCommand({});
    const response = await organizationClient.send(command);

    if (!response.Roots || response.Roots.length === 0) {
      console.warn('No roots found in the organization');
      return 'No roots';
    }

    const root = response.Roots[0];
    id = root.Id || '';
    return id;
  } catch (error) {
    console.error(`Error getting root accounts for ${id}`, error);
    return `Error: ${error}`;
  }
}

async function getPolicyId(organizationClient: OrganizationsClient, policyName: string) {
  const commandListPolicies = new ListPoliciesCommand({
    Filter: PolicyType.SERVICE_CONTROL_POLICY,
  });

  const response = await organizationClient.send(commandListPolicies);

  if (response.Policies?.length) {
    response.Policies.forEach((policy) => {
      if (policy.Name && policy.Name == policyName) {
        return policy.Id;
      }
    });
  }

  return '';
}

export async function handler(event: CdkCustomResourceEvent, _context: Context): Promise<CdkCustomResourceResponse> {
  let client = new OrganizationsClient({ region: 'us-east-1' });

  switch (event.RequestType) {
    case 'Create':
      console.log('Creating Policy for : ', event.LogicalResourceId);
      try {
        let rootId = await getRootId(client);

        const commandCreatePolicyRoot = new CreatePolicyCommand({
          Type: PolicyType.SERVICE_CONTROL_POLICY,
          Description: `superwerker - ${event.LogicalResourceId}`,
          Name: event.ResourceProperties.scpName,
          Content: event.ResourceProperties.policy,
        });

        const responseCreatePolicyRoot = await client.send(commandCreatePolicyRoot);

        const commandAttachPolicyRoot = new AttachPolicyCommand({
          PolicyId: responseCreatePolicyRoot.Policy?.PolicySummary?.Id || '',
          TargetId: rootId,
        });

        await client.send(commandAttachPolicyRoot);

        return { SUCCESS: 'SCPs have been successfully created for Root account' };
      } catch (e) {
        console.log('Error during Creating Policy: ', e);
        return { ErrorMessage: `Error during creating policy: ${e}` };
      }

    case 'Update':
      console.log('Updating Policy: ', event.LogicalResourceId);
      const commandUpdatePolicy = new UpdatePolicyCommand({
        PolicyId: await getPolicyId(client, event.ResourceProperties.scpName),
        Description: `superwerker - ${event.LogicalResourceId}`,
        Name: event.ResourceProperties.scpName,
        Content: event.ResourceProperties.policy,
      });

      const responseUpdatePolicy = await client.send(commandUpdatePolicy);
      return responseUpdatePolicy;

    case 'Delete':
      console.log('Deleting Policy: ', event.LogicalResourceId);

      const commandDetachPolicy = new DetachPolicyCommand({
        PolicyId: await getPolicyId(client, event.ResourceProperties.scpName),
        TargetId: await getRootId(client),
      });

      await client.send(commandDetachPolicy);

      const commandDeletePolicy = new DeletePolicyCommand({
        PolicyId: event.PhysicalResourceId,
      });

      const responseDeletePolicy = await client.send(commandDeletePolicy);
      return responseDeletePolicy;
  }
}
