import {
  AttachPolicyCommand,
  CreatePolicyCommand,
  DeletePolicyCommand,
  DetachPolicyCommand,
  ListOrganizationalUnitsForParentCommand,
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
    console.error('Error getting root account', error);
    return `Error: ${error}`;
  }
}

export async function handler(event: CdkCustomResourceEvent, _context: Context): Promise<CdkCustomResourceResponse> {
  let client = new OrganizationsClient({ region: 'us-east-1' });

  switch (event.RequestType) {
    case 'Create':
      console.log('Creating Policy for : ', event.LogicalResourceId);
      try {
        //Attach SCP to Sandbox Account
        let sandboxId = await getSandboxId(client);

        if (!sandboxId) {
          return { Error: sandboxId };
        }

        const commandCreatePolicySandbox = new CreatePolicyCommand({
          Type: PolicyType.SERVICE_CONTROL_POLICY,
          Description: `superwerker - sandbox - ${event.LogicalResourceId}`,
          Name: event.ResourceProperties.scpName,
          Content: event.ResourceProperties.policy,
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
