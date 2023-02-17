import AWS from 'aws-sdk';
import { Root } from 'aws-sdk/clients/organizations';

const organizations = new AWS.Organizations();


const CREATE = 'Create';
export const SCP = 'SERVICE_CONTROL_POLICY';


async function root(): Promise<Root> {
  const roots = await organizations.listRoots().promise();
  return roots.Roots![0];
}

export async function getRootId() {
  return (await root()).Id!;
}

async function scpEnabled() {
  const enabledPolicies = (await root()).PolicyTypes ?? [];
  return enabledPolicies.some((e) => e.Type === SCP && e.Status === 'ENABLED');
}


export async function enableServiceControlPolicies(event: any, _context: any) {
  const requestType = event.RequestType;
  if (requestType == CREATE && !(await scpEnabled())) {
    const rootId = await getRootId();
    console.log(`Enable SCP for root: ${rootId}`);
    await organizations.enablePolicyType({
      RootId: rootId,
      PolicyType: SCP,
    }).promise();
  }
}
