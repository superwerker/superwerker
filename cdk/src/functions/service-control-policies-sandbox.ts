import {
  AttachPolicyCommand,
  CreatePolicyCommand,
  DeletePolicyCommand,
  DetachPolicyCommand,
  ListAccountsForParentCommand,
  ListRootsCommand,
  OrganizationsClient,
  PolicyType,
  UpdatePolicyCommand,
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

async function getSandboxId(organizationClient: OrganizationsClient): Promise<string | undefined> {
  let root = await getRootId(organizationClient);

  try {
    const command = new ListAccountsForParentCommand({ ParentId: root });
    const response = await organizationClient.send(command);

    const accounts = response.Accounts || [];

    for (const account of accounts) {
      if (account.Name == 'Sandbox') {
        return account.Id;
      }
    }
    return '';
  } catch (e) {
    return '';
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
        let sandboxId = await getSandboxId(client);

        if (sandboxId?.includes('Error') || sandboxId?.includes('No root')) {
          return { Error: sandboxId };
        }

        const commandCreatePolicySandbox = new CreatePolicyCommand({
          Type: PolicyType.SERVICE_CONTROL_POLICY,
          Description: `superwerker - sandbox - ${event.LogicalResourceId}`,
          Name: event.ResourceProperties.scpNameRoot,
          Content: event.ResourceProperties.policySandbox,
        });

        const responseCreatePolicySandbox = await client.send(commandCreatePolicySandbox);
        console.log('Create Policy Response Sandbox: ', responseCreatePolicySandbox);

        if (responseCreatePolicySandbox.Policy) {
          const commandAttachPolicySandbox = new AttachPolicyCommand({
            PolicyId: responseCreatePolicySandbox.Policy?.PolicySummary?.Id || '',
            TargetId: sandboxId,
          });

          await client.send(commandAttachPolicySandbox);

          return { SUCESS: 'SCPs have been successfully created for Sandbox account' };
        }
        return { Error: responseCreatePolicySandbox };
      } catch (e) {
        console.log('Error during Creating Policy for Sandbox account: ', e);
        return { ErrorMessage: `Error during creating policy for Sandbox account: ${e}` };
      }

    case 'Update':
      console.log('Updating Policy: ', event.LogicalResourceId);
      const commandUpdatePolicy = new UpdatePolicyCommand({
        PolicyId: event.PhysicalResourceId,
        Description: `superwerker - ${event.LogicalResourceId}`,
        Name: event.ResourceProperties.scpName,
        Content: event.ResourceProperties.policy,
      });

      const responseUpdatePolicy = await client.send(commandUpdatePolicy);
      return responseUpdatePolicy;

    case 'Delete':
      console.log('Deleting Policy: ', event.LogicalResourceId);

      const commandDetachPolicy = new DetachPolicyCommand({
        PolicyId: event.PhysicalResourceId,
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
