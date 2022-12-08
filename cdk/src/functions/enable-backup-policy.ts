import AWS from 'aws-sdk';

const organizations = new AWS.Organizations();

const CREATE = 'Create';
const BACKUP_POLICY = 'BACKUP_POLICY';


async function root() {
  return (await organizations.listRoots().promise()).Roots![0];
}


export async function rootId(): Promise<string> {
  return (await root()).Id!;
}


async function backupPolicyEnabled(): Promise<boolean> {
  const enabledPolicies = (await root()).PolicyTypes;
  return enabledPolicies?.some((e) => e.Type === BACKUP_POLICY && e.Status === 'ENABLED') ?? false;
}


export async function handler(event: any, _context: any) {
  const requestType = event.RequestType;
  if (requestType == CREATE && !(await backupPolicyEnabled())) {
    const rId = await rootId();
    console.log(`Enable TAG_POLICY for root: ${rId}`);
    await organizations.enablePolicyType({
      RootId: rId,
      PolicyType: BACKUP_POLICY,
    }).promise();
  }
}
