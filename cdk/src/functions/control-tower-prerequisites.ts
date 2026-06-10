import {
  IAMClient,
  GetRoleCommand,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  UpdateAssumeRolePolicyCommand,
  NoSuchEntityException,
  EntityAlreadyExistsException,
} from '@aws-sdk/client-iam';
import {
  OrganizationsClient,
  ListRootsCommand,
  ListOrganizationalUnitsForParentCommand,
  CreateOrganizationalUnitCommand,
  ListParentsCommand,
  ListOrganizationalUnitsForParentCommandOutput,
  MoveAccountCommand,
  OrganizationalUnit,
  DuplicateOrganizationalUnitException,
} from '@aws-sdk/client-organizations';
import { STS } from '@aws-sdk/client-sts';
import retry from 'async-retry';
import { CdkCustomResourceEvent, CdkCustomResourceResponse, Context } from 'aws-lambda';
import { getCredsFromAssumeRole } from './utils/assume-role';

// Property name constants (must match the keys set in the construct's `properties`).
export const PROP_AUDIT_ACCOUNT_ID = 'AUDIT_ACCOUNT_ID';
export const PROP_LOG_ARCHIVE_ACCOUNT_ID = 'LOG_ARCHIVE_ACCOUNT_ID';
export const PROP_MANAGEMENT_ACCOUNT_ID = 'MANAGEMENT_ACCOUNT_ID';
export const PROP_SECURITY_OU_NAME = 'SECURITY_OU_NAME';
export const PROP_PARTITION = 'PARTITION';

// Control Tower landing zone v4.0 expects the shared accounts to live in a "Security" OU
// directly under the org root, and to be reachable via an AWSControlTowerExecution role.
const DEFAULT_SECURITY_OU_NAME = 'Security';
const ORG_ACCESS_ROLE_NAME = 'OrganizationAccountAccessRole';
const CT_EXECUTION_ROLE_NAME = 'AWSControlTowerExecution';

// Organizations is a global service homed in us-east-1.
const ORG_REGION = 'us-east-1';

export async function handler(event: CdkCustomResourceEvent, _context: Context): Promise<CdkCustomResourceResponse> {
  console.log(JSON.stringify(event, null, 2));

  // On Delete we deliberately do nothing: removing the OU / roles could orphan the Control
  // Tower managed accounts. Return success so the stack can delete cleanly.
  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: event.PhysicalResourceId };
  }

  const auditAccountId: string = event.ResourceProperties[PROP_AUDIT_ACCOUNT_ID];
  const logArchiveAccountId: string = event.ResourceProperties[PROP_LOG_ARCHIVE_ACCOUNT_ID];
  const managementAccountId: string = event.ResourceProperties[PROP_MANAGEMENT_ACCOUNT_ID];
  const securityOuName: string = event.ResourceProperties[PROP_SECURITY_OU_NAME] || DEFAULT_SECURITY_OU_NAME;
  const partition: string = event.ResourceProperties[PROP_PARTITION] || 'aws';

  if (!auditAccountId || !logArchiveAccountId || !managementAccountId) {
    throw new Error('AUDIT_ACCOUNT_ID, LOG_ARCHIVE_ACCOUNT_ID and MANAGEMENT_ACCOUNT_ID are required');
  }

  const organizationsClient = new OrganizationsClient({ region: ORG_REGION });

  // 1. Find the organization root.
  const rootId = await getRootId(organizationsClient);
  console.log(`Organization root id: ${rootId}`);

  // 2. Ensure the Security OU exists directly under the root (idempotent).
  const securityOuId = await ensureOrganizationalUnit(organizationsClient, rootId, securityOuName);
  console.log(`Security OU "${securityOuName}" id: ${securityOuId}`);

  // 3. Move the Audit and Log Archive accounts into the Security OU (idempotent).
  await ensureAccountInOu(organizationsClient, auditAccountId, securityOuId);
  await ensureAccountInOu(organizationsClient, logArchiveAccountId, securityOuId);

  // 4. Ensure the AWSControlTowerExecution role exists (and is correct) in each shared account.
  for (const accountId of [auditAccountId, logArchiveAccountId]) {
    await ensureControlTowerExecutionRole(accountId, managementAccountId, partition);
  }

  return {
    PhysicalResourceId: `control-tower-prerequisites-${rootId}`,
    Data: {
      RootId: rootId,
      SecurityOuId: securityOuId,
    },
  };
}

async function getRootId(client: OrganizationsClient): Promise<string> {
  const response = await client.send(new ListRootsCommand({}));
  const root = response.Roots?.[0];
  if (!root || !root.Id) {
    throw new Error('Could not determine organization root');
  }
  return root.Id;
}

async function ensureOrganizationalUnit(client: OrganizationsClient, parentId: string, ouName: string): Promise<string> {
  // First look for an existing OU with the requested name under the root.
  const existing = await findOrganizationalUnitByName(client, parentId, ouName);
  if (existing?.Id) {
    console.log(`OU "${ouName}" already exists, skipping creation`);
    return existing.Id;
  }

  try {
    const created = await client.send(
      new CreateOrganizationalUnitCommand({
        ParentId: parentId,
        Name: ouName,
      }),
    );
    return created.OrganizationalUnit!.Id!;
  } catch (e) {
    // Handle the race where the OU was created concurrently between our lookup and create.
    if (e instanceof DuplicateOrganizationalUnitException) {
      console.log(`OU "${ouName}" was created concurrently, re-resolving`);
      const ou = await findOrganizationalUnitByName(client, parentId, ouName);
      if (ou?.Id) {
        return ou.Id;
      }
    }
    throw e;
  }
}

async function findOrganizationalUnitByName(
  client: OrganizationsClient,
  parentId: string,
  ouName: string,
): Promise<OrganizationalUnit | undefined> {
  let nextToken: string | undefined = undefined;
  do {
    const page: ListOrganizationalUnitsForParentCommandOutput = await client.send(
      new ListOrganizationalUnitsForParentCommand({ ParentId: parentId, NextToken: nextToken }),
    );
    const match = (page.OrganizationalUnits ?? []).find((ou) => ou.Name === ouName);
    if (match) {
      return match;
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return undefined;
}

async function ensureAccountInOu(client: OrganizationsClient, accountId: string, destinationOuId: string): Promise<void> {
  // ListParents always returns exactly one parent for an account.
  const parents = await client.send(new ListParentsCommand({ ChildId: accountId }));
  const currentParentId = parents.Parents?.[0]?.Id;

  if (!currentParentId) {
    throw new Error(`Could not determine current parent of account ${accountId}`);
  }

  if (currentParentId === destinationOuId) {
    console.log(`Account ${accountId} already in OU ${destinationOuId}, skipping move`);
    return;
  }

  console.log(`Moving account ${accountId} from ${currentParentId} to ${destinationOuId}`);
  await client.send(
    new MoveAccountCommand({
      AccountId: accountId,
      SourceParentId: currentParentId,
      DestinationParentId: destinationOuId,
    }),
  );
}

async function ensureControlTowerExecutionRole(accountId: string, managementAccountId: string, partition: string): Promise<void> {
  const orgAccessRoleArn = `arn:${partition}:iam::${accountId}:role/${ORG_ACCESS_ROLE_NAME}`;
  const administratorAccessPolicyArn = `arn:${partition}:iam::aws:policy/AdministratorAccess`;

  // The Lambda's OWN execution role assumes OrganizationAccountAccessRole (granted via the
  // construct's initialPolicy) — NOT the management-account root — so a "root cannot assume"
  // restriction is irrelevant. Freshly-created accounts can briefly lag in propagating the
  // access role, so retry the assume with backoff.
  const stsClient = new STS();
  const creds = await retry(() => getCredsFromAssumeRole(stsClient, orgAccessRoleArn, 'ControlTowerPrerequisites'), {
    retries: 6,
    minTimeout: 2000,
    maxTimeout: 20000,
  });

  const iamClient = new IAMClient({ credentials: creds });

  const assumeRolePolicyDocument = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: `arn:${partition}:iam::${managementAccountId}:root` },
        Action: 'sts:AssumeRole',
      },
    ],
  });

  let roleExists = false;
  try {
    await iamClient.send(new GetRoleCommand({ RoleName: CT_EXECUTION_ROLE_NAME }));
    roleExists = true;
    console.log(`Role ${CT_EXECUTION_ROLE_NAME} already exists in account ${accountId}, reconciling`);
  } catch (e) {
    if (!(e instanceof NoSuchEntityException)) {
      throw e;
    }
  }

  if (!roleExists) {
    try {
      await iamClient.send(
        new CreateRoleCommand({
          RoleName: CT_EXECUTION_ROLE_NAME,
          Path: '/',
          AssumeRolePolicyDocument: assumeRolePolicyDocument,
          Description: '(superwerker) Control Tower execution role for landing zone v4.0 prerequisites',
        }),
      );
      console.log(`Created role ${CT_EXECUTION_ROLE_NAME} in account ${accountId}`);
    } catch (e) {
      // Handle the race where the role was created concurrently; fall through to reconcile.
      if (!(e instanceof EntityAlreadyExistsException)) {
        throw e;
      }
      roleExists = true;
    }
  }

  // Always converge the trust policy to what Control Tower expects. This also repairs a
  // pre-existing / manually-created role whose trust may differ (the re-deploy / recovery case).
  if (roleExists) {
    await iamClient.send(
      new UpdateAssumeRolePolicyCommand({
        RoleName: CT_EXECUTION_ROLE_NAME,
        PolicyDocument: assumeRolePolicyDocument,
      }),
    );
    console.log(`Reconciled trust policy on ${CT_EXECUTION_ROLE_NAME} in account ${accountId}`);
  }

  // Always ensure AdministratorAccess is attached (idempotent no-op if already attached; also
  // fixes a pre-existing role that was missing the managed policy).
  await iamClient.send(
    new AttachRolePolicyCommand({
      RoleName: CT_EXECUTION_ROLE_NAME,
      PolicyArn: administratorAccessPolicyArn,
    }),
  );
  console.log(`Ensured ${administratorAccessPolicyArn} attached to ${CT_EXECUTION_ROLE_NAME} in account ${accountId}`);
}
