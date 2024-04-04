import { Organizations } from '@aws-sdk/client-organizations';
import { SecurityHub } from '@aws-sdk/client-securityhub';
import { STS } from '@aws-sdk/client-sts';
import { createFindingAggregator, deleteFindingAggregator } from './securityhub/create-finding-aggregator';
import { createMembers, deleteMembers } from './securityhub/create-members';
import { disableOrganisationAdmin, enableOrganisationAdmin } from './securityhub/enable-org-admin';
import { disableStandards, enableStandards } from './securityhub/enable-standards';
import { getCredsFromAssumeRole } from './utils/assume-role';

const standardsToEnable = [
  {
    name: 'AWS Foundational Security Best Practices v1.0.0',
    enable: true,
    controlsToDisable: ['CloudFormation.1', 'S3.11', 'Macie.1', 'EC2.10'],
  },
  {
    name: 'CIS AWS Foundations Benchmark v1.2.0',
    enable: false,
    controlsToDisable: [],
  },
];

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const homeRegion = event.ResourceProperties.region;
  const adminAccountId = event.ResourceProperties.adminAccountId;
  const secHubCrossAccountRoleArn = event.ResourceProperties.role;

  const organizationsClientManagementAccount = new Organizations({ region: 'us-east-1' });
  const securityHubClientManagementAccount = new SecurityHub();

  const stsClient = new STS();
  const creds = await getCredsFromAssumeRole(stsClient, secHubCrossAccountRoleArn, 'EnableSecurityHub');
  const organizationsClientAuditAccount = new Organizations({ region: 'us-east-1', credentials: creds });
  const securityHubClientAuditAccount = new SecurityHub({ credentials: creds });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await enableOrganisationAdmin(securityHubClientManagementAccount, adminAccountId, homeRegion);
      await createFindingAggregator(securityHubClientAuditAccount);
      await createMembers(securityHubClientAuditAccount, organizationsClientAuditAccount);
      await enableStandards(securityHubClientAuditAccount, standardsToEnable);
      return { Status: 'Success', StatusCode: 200 };
    case 'Delete':
      await disableStandards(securityHubClientAuditAccount);
      await deleteMembers(securityHubClientAuditAccount);
      await deleteFindingAggregator(securityHubClientAuditAccount);
      await disableOrganisationAdmin(securityHubClientManagementAccount, organizationsClientManagementAccount, adminAccountId, homeRegion);
      return { Status: 'Success', StatusCode: 200 };
  }
}
