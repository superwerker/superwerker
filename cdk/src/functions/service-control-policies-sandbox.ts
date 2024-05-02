import {
  AttachPolicyCommand,
  CreatePolicyCommand,
  DeletePolicyCommand,
  DetachPolicyCommand,
  ListOrganizationalUnitsForParentCommand,
  ListPoliciesCommand,
  ListRootsCommand,
  OrganizationsClient,
  PolicyType,
  UpdatePolicyCommand,
} from '@aws-sdk/client-organizations';
import { CdkCustomResourceEvent, CdkCustomResourceResponse, Context } from 'aws-lambda';

async function getSandboxId(organizationClient: OrganizationsClient): Promise<string | undefined> {
  try {
    const commandListRoots = new ListRootsCommand({});
    const responseListRoots = await organizationClient.send(commandListRoots);

    if (responseListRoots.Roots?.length == 0) {
      return `Error getting root account ${responseListRoots}`;
    }

    const rootId = responseListRoots.Roots[0].Id;

    const commandListOUs = new ListOrganizationalUnitsForParentCommand({ ParentId: rootId });
    const responseListOUs = await organizationClient.send(commandListOUs);

    const oUnits = responseListOUs.OrganizationalUnits || [];

    for (const oUnit of oUnits) {
      if (oUnit.Name == 'Sandbox') {
        return oUnit.Id;
      }
    }
    return '';
  } catch (error) {
    console.error('Error getting sandbox account', error);
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
        //Attach SCP to Sandbox Account

        const commandCreatePolicySandbox = new CreatePolicyCommand({
          Type: PolicyType.SERVICE_CONTROL_POLICY,
          Description: `superwerker - sandbox - ${event.LogicalResourceId}`,
          Name: event.ResourceProperties.scpName,
          Content: event.ResourceProperties.policy,
        });

        const responseCreatePolicySandbox = await client.send(commandCreatePolicySandbox);

        if (responseCreatePolicySandbox.Policy) {
          const commandAttachPolicySandbox = new AttachPolicyCommand({
            PolicyId: responseCreatePolicySandbox.Policy?.PolicySummary?.Id || '',
            TargetId: await getSandboxId(client),
          });

          const responseAttachPolicy = await client.send(commandAttachPolicySandbox);

          return { SUCESS: `SCPs have been successfully created for Sandbox account. ${responseAttachPolicy}` };
        }
        return { Error: responseCreatePolicySandbox };
      } catch (e) {
        console.log('Error during Creating Policy for Sandbox account: ', e);
        return { ErrorMessage: `Error during creating policy for Sandbox account: ${e}` };
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
        TargetId: await getSandboxId(client),
      });

      await client.send(commandDetachPolicy);

      const commandDeletePolicy = new DeletePolicyCommand({
        PolicyId: event.PhysicalResourceId,
      });

      const responseDeletePolicy = await client.send(commandDeletePolicy);
      return responseDeletePolicy;
  }
}
