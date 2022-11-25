import AWS from 'aws-sdk';

const organizations = new AWS.Organizations();

const CREATE = 'Create';
const TAG_POLICY = 'TAG_POLICY';


async function root() {
  return (await organizations.listRoots().promise()).Roots![0];
}


async function rootId(): Promise<string> {
  return (await root()).Id!;
}


async function tagPolicyEnabled(): Promise<boolean> {
  const enabledPolicies = (await root()).PolicyTypes;
  return enabledPolicies?.includes({ Type: TAG_POLICY, Status: 'ENABLED' }) ?? false;
}


export async function handler(event: any, _context: any) {
  const requestType = event.RequestType;
  if (requestType == CREATE && !(await tagPolicyEnabled())) {
    const rId = await rootId();
    console.log(`Enable TAG_POLICY for root: ${rId}`);
    await organizations.enablePolicyType({ RootId: rId, PolicyType: TAG_POLICY }).promise();
  }
}
