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
  DuplicatePolicyException,
} from '@aws-sdk/client-organizations';
import { CdkCustomResourceEvent, CdkCustomResourceResponse, Context } from 'aws-lambda';
import { throttlingBackOff } from './utils/throttle';

async function getRootId(organizationClient: OrganizationsClient): Promise<string | undefined> {
  const command = new ListRootsCommand({});
  const response = await throttlingBackOff(() => organizationClient.send(command));

  if (!response.Roots || response.Roots.length === 0) {
    console.warn('No root account found in the organization');
    throw new Error('No root account found in the organization');
  }

  return response.Roots[0].Id;
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

async function createPolicy(
  organizationClient: OrganizationsClient,
  event: CdkCustomResourceEvent,
  _context: Context,
): Promise<CdkCustomResourceResponse> {
  console.log('Creating Policy for : ', event.LogicalResourceId);
  try {
    let rootId = await getRootId(organizationClient);

    const commandCreatePolicy = new CreatePolicyCommand({
      Type: PolicyType.SERVICE_CONTROL_POLICY,
      Description: `superwerker - ${event.LogicalResourceId}`,
      Name: event.ResourceProperties.scpName,
      Content: event.ResourceProperties.policy,
    });

    const responseCreatePolicy = await throttlingBackOff(() => organizationClient.send(commandCreatePolicy));

    const commandAttachPolicy = new AttachPolicyCommand({
      PolicyId: responseCreatePolicy.Policy?.PolicySummary?.Id,
      TargetId: rootId,
    });

    await throttlingBackOff(() => organizationClient.send(commandAttachPolicy));

    return { SUCCESS: 'SCPs have been successfully created for Root account' };
  } catch (e) {
    if (e instanceof DuplicatePolicyException) {
      return updatePolicy(organizationClient, event, _context);
    } else {
      console.log('Error during Creating Policy: ', e);
      throw e;
    }
  }
}

async function updatePolicy(
  organizationClient: OrganizationsClient,
  event: CdkCustomResourceEvent,
  _context: Context,
): Promise<CdkCustomResourceResponse> {
  try {
    const policyId = await getPolicyId(organizationClient, event.ResourceProperties.scpName);

    const commandUpdatePolicy = new UpdatePolicyCommand({
      PolicyId: policyId,
      Description: `superwerker - ${event.LogicalResourceId}`,
      Name: event.ResourceProperties.scpName,
      Content: event.ResourceProperties.policy,
    });

    const responseUpdatePolicy = await throttlingBackOff(() => organizationClient.send(commandUpdatePolicy));
    return responseUpdatePolicy;
  } catch (e) {
    console.log('Error during Updating Policy: ', e);
    throw e;
  }
}

async function deletePolicy(
  organizationClient: OrganizationsClient,
  event: CdkCustomResourceEvent,
  _context: Context,
): Promise<CdkCustomResourceResponse> {
  console.log('Deleting Policy: ', event.LogicalResourceId);

  try {
    const rootId = await getRootId(organizationClient);

    const policyId = await getPolicyId(organizationClient, event.ResourceProperties.scpName);

    const commandDetachPolicy = new DetachPolicyCommand({
      PolicyId: policyId,
      TargetId: rootId,
    });

    await throttlingBackOff(() => organizationClient.send(commandDetachPolicy));

    const commandDeletePolicy = new DeletePolicyCommand({
      PolicyId: await getPolicyId(organizationClient, event.ResourceProperties.scpName),
    });

    const responseDeletePolicy = await throttlingBackOff(() => organizationClient.send(commandDeletePolicy));
    return responseDeletePolicy;
  } catch (e) {
    console.log('Error during Deleting Policy: ', e);
    throw e;
  }
}

export async function handler(event: CdkCustomResourceEvent, _context: Context): Promise<CdkCustomResourceResponse> {
  let client = new OrganizationsClient({ region: 'us-east-1' });

  switch (event.RequestType) {
    case 'Create':
      return createPolicy(client, event, _context);

    case 'Update':
      return updatePolicy(client, event, _context);

    case 'Delete':
      return deletePolicy(client, event, _context);
  }
}
