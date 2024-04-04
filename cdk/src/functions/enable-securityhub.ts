import { OrganizationsClient } from '@aws-sdk/client-organizations';
import { SecurityHubClient } from '@aws-sdk/client-securityhub';
import { STS } from '@aws-sdk/client-sts';
import { createFindingAggregator, deleteFindingAggregator } from './securityhub/create-finding-aggregator';
import { SecurityHubMemberMgmt } from './securityhub/create-members';
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

  const organizationsClientManagementAccount = new OrganizationsClient({ region: 'us-east-1' });
  const securityHubClientManagementAccount = new SecurityHubClient();

  const stsClient = new STS();
  const creds = await getCredsFromAssumeRole(stsClient, secHubCrossAccountRoleArn, 'EnableSecurityHub');
  const organizationsClientAuditAccount = new OrganizationsClient({ region: 'us-east-1', credentials: creds });
  const securityHubClientAuditAccount = new SecurityHubClient({ credentials: creds });
  const securityHubMemberMgmt = new SecurityHubMemberMgmt(organizationsClientAuditAccount, securityHubClientAuditAccount);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await enableOrganisationAdmin(securityHubClientManagementAccount, adminAccountId, homeRegion);
      await createFindingAggregator(securityHubClientAuditAccount);
      await securityHubMemberMgmt.createMembers();
      await enableStandards(securityHubClientAuditAccount, standardsToEnable);
      return { Status: 'Success', StatusCode: 200 };
    case 'Delete':
      await disableStandards(securityHubClientAuditAccount);
      await securityHubMemberMgmt.deleteMembers();
      await deleteFindingAggregator(securityHubClientAuditAccount);
      await disableOrganisationAdmin(securityHubClientManagementAccount, organizationsClientManagementAccount, adminAccountId, homeRegion);
      return { Status: 'Success', StatusCode: 200 };
  }
}
