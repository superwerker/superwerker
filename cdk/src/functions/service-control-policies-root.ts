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
  const command = new ListRootsCommand({});
  const response = await organizationClient.send(command);

  if (!response.Roots || response.Roots.length === 0) {
    console.warn('No roots found in the organization');
    return 'error';
  }

  const root = response.Roots[0];
  id = root.Id || '';
  return id;
}

async function getPolicyId(organizationClient: OrganizationsClient, policyName: string) {
  const commandListPolicies = new ListPoliciesCommand({
    Filter: PolicyType.SERVICE_CONTROL_POLICY,
  });

  const response = await organizationClient.send(commandListPolicies);

  let policyId = 'error'; //set to error. Update if superwerker-root SCP is found.

  response.Policies?.forEach((policy) => {
    if (policy.Name === policyName) {
      policyId = policy.Id;
    }
  });

  return policyId;
}

export async function handler(event: CdkCustomResourceEvent, _context: Context): Promise<CdkCustomResourceResponse> {
  let client = new OrganizationsClient({ region: 'us-east-1' });

  switch (event.RequestType) {
    case 'Create':
      console.log('Creating Policy for : ', event.LogicalResourceId);
      try {
        let rootId = await getRootId(client);

        const commandCreatePolicy = new CreatePolicyCommand({
          Type: PolicyType.SERVICE_CONTROL_POLICY,
          Description: `superwerker - ${event.LogicalResourceId}`,
          Name: event.ResourceProperties.scpName,
          Content: event.ResourceProperties.policy,
        });

        const responseCreatePolicy = await client.send(commandCreatePolicy);

        const commandAttachPolicy = new AttachPolicyCommand({
          PolicyId: responseCreatePolicy.Policy?.PolicySummary?.Id || '',
          TargetId: rootId,
        });

        await client.send(commandAttachPolicy);

        return { SUCCESS: 'SCPs have been successfully created for Root account' };
      } catch (e) {
        console.log('Error during Creating Policy: ', e);
        return { ErrorMessage: `Error during creating policy: ${e}` };
      }

    case 'Update':
      console.log('Updating Policy: ', event.LogicalResourceId);
      console.log('Updating Policy: ', event.ResourceProperties.scpName);
      console.log('Policy ID: ', await getPolicyId(client, event.ResourceProperties.scpName));
      try {
        const policyId = await getPolicyId(client, event.ResourceProperties.scpName);

        if (policyId == 'error') {
          return { ErrorMessage: `Error during Update. No Policy ID found for the policy: ${event.ResourceProperties.scpName}` };
        }

        const commandUpdatePolicy = new UpdatePolicyCommand({
          PolicyId: policyId,
          Description: `superwerker - ${event.LogicalResourceId}`,
          Name: event.ResourceProperties.scpName,
          Content: event.ResourceProperties.policy,
        });

        const responseUpdatePolicy = await client.send(commandUpdatePolicy);
        return responseUpdatePolicy;
      } catch (e) {
        console.log('Error during Updating Policy: ', e);
        return { ErrorMessage: `Error during updating policy: ${e}` };
      }

    case 'Delete':
      console.log('Deleting Policy: ', event.LogicalResourceId);

      try {
        const rootId = await getRootId(client);

        if (rootId == 'error') {
          return { ErrorMessage: `Error during Delete. No Root ID found for the policy: ${event.ResourceProperties.scpName}` };
        }

        const policyId = await getPolicyId(client, event.ResourceProperties.scpName);

        if (policyId == 'error') {
          return { ErrorMessage: `Error during Delete. No Policy ID found for the policy: ${event.ResourceProperties.scpName}` };
        }

        const commandDetachPolicy = new DetachPolicyCommand({
          PolicyId: policyId,
          TargetId: rootId,
        });

        await client.send(commandDetachPolicy);

        const commandDeletePolicy = new DeletePolicyCommand({
          PolicyId: await getPolicyId(client, event.ResourceProperties.scpName),
        });

        const responseDeletePolicy = await client.send(commandDeletePolicy);
        return responseDeletePolicy;
      } catch (e) {
        console.log('Error during Deleting Policy: ', e);
        return { ErrorMessage: `Error during deleting policy: ${e}` };
      }
  }
}
