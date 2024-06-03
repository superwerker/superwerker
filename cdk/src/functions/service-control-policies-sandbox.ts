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
      return 'error';
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
    return 'error';
  } catch (error) {
    console.error('Error getting sandbox account', error);
    return 'error';
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

  return 'error';
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
          Description: `superwerker - ${event.LogicalResourceId}`,
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
        const rootId = await getSandboxId(client);

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
