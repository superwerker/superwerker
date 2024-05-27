import { ControlTowerClient, GetLandingZoneCommand, ListLandingZonesCommand } from '@aws-sdk/client-controltower';
import { OrganizationsClient } from '@aws-sdk/client-organizations';
import { SecurityHubClient } from '@aws-sdk/client-securityhub';
import { STS } from '@aws-sdk/client-sts';
import { SecurityHubAggregatorMgmt } from './securityhub/create-finding-aggregator';
import { SecurityHubMemberMgmt } from './securityhub/create-members';
import { SecurityHubOrganizationMgmt } from './securityhub/enable-org-admin';
import { SecurityHubStandardsMgmt } from './securityhub/enable-standards';
import { getCredsFromAssumeRole } from './utils/assume-role';
import { throttlingBackOff } from './utils/throttle';

export const standardsToEnable = [
  {
    name: 'AWS Foundational Security Best Practices v1.0.0',
    enable: true,
    controlsToDisable: ['Macie.1'],
  },
  {
    name: 'CIS AWS Foundations Benchmark v1.2.0',
    enable: false,
    controlsToDisable: [],
  },
];

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const homeRegion = process.env.homeRegion!;
  const adminAccountId = process.env.adminAccountId!;
  const secHubCrossAccountRoleArn = process.env.role!;

  if (!adminAccountId || !secHubCrossAccountRoleArn || !homeRegion) {
    throw new Error('homeRegion, adminAccountId and role env variable is required');
  }

  let eventType = event.RequestType;
  if (!eventType) {
    // setting RequestType to Create or Update since lambda is not invoked by CloudFormation
    eventType = 'Update';
  }

  const controlTowerClient = new ControlTowerClient({ region: homeRegion });
  const organizationsClientManagementAccount = new OrganizationsClient({ region: 'us-east-1' });
  const securityHubClientManagementAccount = new SecurityHubClient();

  const stsClient = new STS();
  const creds = await getCredsFromAssumeRole(stsClient, secHubCrossAccountRoleArn, 'EnableSecurityHub');
  const organizationsClientAuditAccount = new OrganizationsClient({ region: 'us-east-1', credentials: creds });
  const securityHubClientAuditAccount = new SecurityHubClient({ credentials: creds });

  let controlTowerRegions = await getControlTowerRegions(controlTowerClient);
  console.log('control tower regions:', controlTowerRegions);
  //remove home region from the list
  controlTowerRegions = controlTowerRegions.filter((region: string) => region !== homeRegion).map((region: any) => region);
  console.log('control tower regions without home:', controlTowerRegions);

  const securityHubOrganizationMgmt = new SecurityHubOrganizationMgmt(
    adminAccountId,
    organizationsClientManagementAccount,
    securityHubClientManagementAccount,
  );
  const securityHubAggregatorMgmt = new SecurityHubAggregatorMgmt(securityHubClientAuditAccount, controlTowerRegions);
  const securityHubMemberMgmt = new SecurityHubMemberMgmt(organizationsClientAuditAccount, securityHubClientAuditAccount);
  const securityHubStandardsMgmt = new SecurityHubStandardsMgmt(securityHubClientAuditAccount);

  switch (eventType) {
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

async function getControlTowerRegions(controlTowerClient: ControlTowerClient) {
  // there should be no more than one landing zone
  const landingzones = await throttlingBackOff(() =>
    controlTowerClient.send(new ListLandingZonesCommand({ maxResults: 1, nextToken: undefined })),
  );

  if (!landingzones.landingZones || landingzones.landingZones.length === 0) {
    throw new Error('No landing zones found');
  }

  if (landingzones.landingZones.length > 1) {
    throw new Error('More than one landing zone found');
  }

  const landingzoneArn = landingzones.landingZones[0].arn!;

  const response = await throttlingBackOff(() =>
    controlTowerClient.send(new GetLandingZoneCommand({ landingZoneIdentifier: landingzoneArn })),
  );

  if (!response.landingZone || !response.landingZone.manifest) {
    throw new Error('Failed to get landingzone manifest');
  }

  // cannot access the object directly, need to stringify and parse again..
  const strResponse = JSON.stringify(response);
  const objResponse = JSON.parse(strResponse);
  const regions = objResponse.landingZone.manifest.governedRegions;

  if (!regions) {
    throw new Error('Failed to read control tower regions from landingzone manifest');
  }

  return regions;
}
