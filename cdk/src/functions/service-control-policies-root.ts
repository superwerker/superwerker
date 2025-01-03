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
} from '@aws-sdk/client-organizations';
import { Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CdkCustomResourceEvent, CdkCustomResourceResponse, Context } from 'aws-lambda';
import { throttlingBackOff } from './utils/throttle';

const denyLeavingOrganizationStatement = new PolicyStatement({
  actions: ['organizations:LeaveOrganization'],
  resources: ['*'],
  effect: Effect.DENY,
  sid: 'PreventLeavingOrganization',
});

export async function handler(event: CdkCustomResourceEvent, _context: Context): Promise<CdkCustomResourceResponse> {
  let client = new OrganizationsClient({ region: 'us-east-1' });

  const partition = event.ResourceProperties.partition;

  const secHubStatement = new PolicyStatement({
    conditions: {
      ArnNotLike: {
        'aws:PrincipalARN': `arn:${partition}:iam::*:role/AWSControlTowerExecution`,
      },
    },
    actions: [
      'securityhub:DeleteInvitations',
      'securityhub:DisableSecurityHub',
      'securityhub:DisassociateFromMasterAccount',
      'securityhub:DeleteMembers',
      'securityhub:DisassociateMembers',
    ],
    resources: ['*'],
    effect: Effect.DENY,
    sid: 'SWProtectSecurityHub',
  });

  const backupStatement = new PolicyStatement({
    conditions: {
      ArnNotLike: {
        'aws:PrincipalARN': `arn:${partition}:iam::*:role/stacksets-exec-*`,
      },
    },
    actions: [
      'iam:AttachRolePolicy',
      'iam:CreateRole',
      'iam:DeleteRole',
      'iam:DeleteRolePermissionsBoundary',
      'iam:DeleteRolePolicy',
      'iam:DetachRolePolicy',
      'iam:PutRolePermissionsBoundary',
      'iam:PutRolePolicy',
      'iam:UpdateAssumeRolePolicy',
      'iam:UpdateRole',
      'iam:UpdateRoleDescription',
    ],
    resources: [
      `arn:${partition}:iam::*:role/service-role/AWSBackupDefaultServiceRole`,
      `arn:${partition}:iam::*:role/SuperwerkerBackupTagsEnforcementRemediationRole`,
    ],
    effect: Effect.DENY,
    sid: 'SWProtectBackup',
  });

  const scpPolicyDocumentRoot = new PolicyDocument({
    statements: [denyLeavingOrganizationStatement],
  });

  if (event.ResourceProperties.includeSecHub === 'Yes') {
    scpPolicyDocumentRoot.addStatements(secHubStatement);
  }

  if (event.ResourceProperties.includeBackup === 'Yes') {
    scpPolicyDocumentRoot.addStatements(backupStatement);
  }

  switch (event.RequestType) {
    case 'Create':
      console.log('Creating Policy for: ', event.LogicalResourceId);
      try {
        let rootId = await getRootId(client);

        const commandCreatePolicy = new CreatePolicyCommand({
          Type: PolicyType.SERVICE_CONTROL_POLICY,
          Description: `superwerker - ${event.LogicalResourceId}`,
          Name: event.ResourceProperties.scpName,
          Content: JSON.stringify(scpPolicyDocumentRoot),
        });

        const responseCreatePolicy = await throttlingBackOff(() => client.send(commandCreatePolicy));

        const commandAttachPolicy = new AttachPolicyCommand({
          PolicyId: responseCreatePolicy.Policy?.PolicySummary?.Id,
          TargetId: rootId,
        });

        await throttlingBackOff(() => client.send(commandAttachPolicy));

        return { SUCCESS: 'SCPs have been successfully created for Root account' };
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
          Content: JSON.stringify(scpPolicyDocumentRoot),
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
        const rootId = await getRootId(client);

        const policyId = await getPolicyId(client, event.ResourceProperties.scpName);

        const commandDetachPolicy = new DetachPolicyCommand({
          PolicyId: policyId,
          TargetId: rootId,
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
