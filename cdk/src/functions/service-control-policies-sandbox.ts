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
  ListOrganizationalUnitsForParentCommand,
} from '@aws-sdk/client-organizations';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { CdkCustomResourceEvent, CdkCustomResourceResponse, Context } from 'aws-lambda';
import { throttlingBackOff } from './utils/throttle';

async function getSandboxId(organizationClient: OrganizationsClient): Promise<string | undefined> {
  const command = new ListRootsCommand({});
  const response = await throttlingBackOff(() => organizationClient.send(command));

  if (!response.Roots || response.Roots.length === 0) {
    console.warn('No root account found in the organization');
    throw new Error('No root account found in the organization');
  }

  const rootId = response.Roots[0].Id;

  const commandListOUs = new ListOrganizationalUnitsForParentCommand({ ParentId: rootId });
  const responseListOUs = await organizationClient.send(commandListOUs);

  const oUnits = responseListOUs.OrganizationalUnits || [];

  const ssmClient = new SSMClient();

  const input = {
    Name: '/superwerker/controltower/sandbox_ou_name',
  };
  const getParameterCommand = new GetParameterCommand(input);
  const getParameterResponse = await ssmClient.send(getParameterCommand);

  for (const oUnit of oUnits) {
    if (oUnit.Name == getParameterResponse.Parameter?.Value) {
      return oUnit.Id;
    }
  }

  throw new Error('Sandbox OU not found');
}

async function getPolicyId(organizationClient: OrganizationsClient, policyName: string): Promise<string | undefined> {
  const commandListPolicies = new ListPoliciesCommand({
    Filter: PolicyType.SERVICE_CONTROL_POLICY,
  });

  const response = await throttlingBackOff(() => organizationClient.send(commandListPolicies));

  // Check if there are any policies
  if (response.Policies?.length) {
    // Iterate through each policy object
    for (const policy of response.Policies) {
      if (policy.Name === policyName) {
        return policy.Id;
      }
    }
  }

  throw new Error(`No SCP Policy found for the name: ${policyName}`);
}

export async function handler(event: CdkCustomResourceEvent, _context: Context): Promise<CdkCustomResourceResponse> {
  let client = new OrganizationsClient({ region: 'us-east-1' });

  switch (event.RequestType) {
    case 'Create':
      console.log('Creating Policy for : ', event.LogicalResourceId);
      try {
        let sandboxId = await getSandboxId(client);

        const commandCreatePolicy = new CreatePolicyCommand({
          Type: PolicyType.SERVICE_CONTROL_POLICY,
          Description: `superwerker - ${event.LogicalResourceId}`,
          Name: event.ResourceProperties.scpName,
          Content: event.ResourceProperties.policy,
        });

        const responseCreatePolicy = await throttlingBackOff(() => client.send(commandCreatePolicy));

        const commandAttachPolicy = new AttachPolicyCommand({
          PolicyId: responseCreatePolicy.Policy?.PolicySummary?.Id,
          TargetId: sandboxId,
        });

        await throttlingBackOff(() => client.send(commandAttachPolicy));

        return { SUCCESS: 'SCPs have been successfully created for Sandbox account' };
      } catch (e) {
        console.log('Error during Creating Policy: ', e);
        throw e;
      }

    case 'Update':
      try {
        const policyId = await getPolicyId(client, event.ResourceProperties.scpName);

        const commandUpdatePolicy = new UpdatePolicyCommand({
          PolicyId: policyId,
          Description: `superwerker - ${event.LogicalResourceId}`,
          Name: event.ResourceProperties.scpName,
          Content: event.ResourceProperties.policy,
        });

        const responseUpdatePolicy = await throttlingBackOff(() => client.send(commandUpdatePolicy));
        return responseUpdatePolicy;
      } catch (e) {
        console.log('Error during Updating Policy: ', e);
        throw e;
      }

    case 'Delete':
      console.log('Deleting Policy: ', event.LogicalResourceId);

      try {
        const sandboxId = await getSandboxId(client);

        const policyId = await getPolicyId(client, event.ResourceProperties.scpName);

        const commandDetachPolicy = new DetachPolicyCommand({
          PolicyId: policyId,
          TargetId: sandboxId,
        });

        await throttlingBackOff(() => client.send(commandDetachPolicy));

        const commandDeletePolicy = new DeletePolicyCommand({
          PolicyId: await getPolicyId(client, event.ResourceProperties.scpName),
        });

        const responseDeletePolicy = await throttlingBackOff(() => client.send(commandDeletePolicy));
        return responseDeletePolicy;
      } catch (e) {
        console.log('Error during Deleting Policy: ', e);
        throw e;
      }
  }
}
