import { OrganizationsClient } from '@aws-sdk/client-organizations';
import { SecurityHubClient } from '@aws-sdk/client-securityhub';
import { STS } from '@aws-sdk/client-sts';
import { SecurityHubAggregatorMgmt } from './securityhub/create-finding-aggregator';
import { SecurityHubMemberMgmt } from './securityhub/create-members';
import { SecurityHubOrganizationMgmt } from './securityhub/enable-org-admin';
import { SecurityHubStandardsMgmt } from './securityhub/enable-standards';
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

  const securityHubOrganizationMgmt = new SecurityHubOrganizationMgmt(
    adminAccountId,
    organizationsClientManagementAccount,
    securityHubClientManagementAccount,
  );
  const securityHubAggregatorMgmt = new SecurityHubAggregatorMgmt(securityHubClientAuditAccount);
  const securityHubMemberMgmt = new SecurityHubMemberMgmt(organizationsClientAuditAccount, securityHubClientAuditAccount);
  const securityHubStandardsMgmt = new SecurityHubStandardsMgmt(securityHubClientAuditAccount);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await securityHubOrganizationMgmt.enableOrganisationAdmin(homeRegion);
      await securityHubAggregatorMgmt.createFindingAggregator();
      await securityHubMemberMgmt.createMembers();
      await securityHubStandardsMgmt.enableStandards(standardsToEnable);
      return { Status: 'Success', StatusCode: 200 };
    case 'Delete':
      await securityHubStandardsMgmt.disableStandards();
      await securityHubMemberMgmt.deleteMembers();
      await securityHubAggregatorMgmt.deleteFindingAggregator();
      await securityHubOrganizationMgmt.disableOrganisationAdmin(homeRegion);
      return { Status: 'Success', StatusCode: 200 };
  }
}
