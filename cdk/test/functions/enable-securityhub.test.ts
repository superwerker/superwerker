import { ControlTowerClient, GetLandingZoneCommand, ListLandingZonesCommand } from '@aws-sdk/client-controltower';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../src/functions/enable-securityhub';
import { SecurityHubAggregatorMgmt } from '../../src/functions/securityhub/create-finding-aggregator';
import { SecurityHubMemberMgmt } from '../../src/functions/securityhub/create-members';
import { SecurityHubOrganizationMgmt } from '../../src/functions/securityhub/enable-org-admin';
import { SecurityHubStandardsMgmt } from '../../src/functions/securityhub/enable-standards';

const controlTowerClientMock = mockClient(ControlTowerClient);
const stsClientMock = mockClient(STSClient);

describe('handler', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = {
      ...originalEnv,
      homeRegion: 'us-west-2',
      adminAccountId: '11223344556677',
      role: 'security-hub-role-arn',
    };

    stsClientMock.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: 'accessKeyId',
        SecretAccessKey: 'secretAccessKey',
        SessionToken: 'sessionToken',
        Expiration: new Date(),
      },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should enable Security Hub for audit account', async () => {
    const enableOrganisationAdmin = jest.spyOn(SecurityHubOrganizationMgmt.prototype, 'enableOrganisationAdmin');
    enableOrganisationAdmin.mockImplementation();
    const createFindingAggregator = jest.spyOn(SecurityHubAggregatorMgmt.prototype, 'createFindingAggregator');
    createFindingAggregator.mockImplementation();
    const createMembers = jest.spyOn(SecurityHubMemberMgmt.prototype, 'createMembers');
    createMembers.mockImplementation();
    const enableStandards = jest.spyOn(SecurityHubStandardsMgmt.prototype, 'enableStandards');
    enableStandards.mockImplementation();

    controlTowerClientMock.on(ListLandingZonesCommand).resolves({
      landingZones: [
        {
          arn: 'landingZoneArn',
        },
      ],
    });

    controlTowerClientMock.on(GetLandingZoneCommand).resolves({
      landingZone: {
        version: '1.2.3',
        manifest: {
          governedRegions: ['us-west-1', 'us-west-2'],
        },
      },
    });

    const event = {
      RequestType: 'Create',
    } as AWSLambda.CloudFormationCustomResourceEvent;

    const result = await handler(event);
    expect(result).toEqual({ Status: 'Success', StatusCode: 200 });

    expect(enableOrganisationAdmin).toHaveBeenCalledWith('us-west-2');
    expect(createFindingAggregator).toHaveBeenCalled();
    expect(createMembers).toHaveBeenCalled();
    expect(enableStandards).toHaveBeenCalledWith(expect.any(Array));
  });

  it('should disable Security Hub for audit account', async () => {
    const disableOrganisationAdmin = jest.spyOn(SecurityHubOrganizationMgmt.prototype, 'disableOrganisationAdmin');
    disableOrganisationAdmin.mockImplementation();
    const deleteFindingAggregator = jest.spyOn(SecurityHubAggregatorMgmt.prototype, 'deleteFindingAggregator');
    deleteFindingAggregator.mockImplementation();
    const deleteMembers = jest.spyOn(SecurityHubMemberMgmt.prototype, 'deleteMembers');
    deleteMembers.mockImplementation();
    const disableStandards = jest.spyOn(SecurityHubStandardsMgmt.prototype, 'disableStandards');
    disableStandards.mockImplementation();

    const event = {
      RequestType: 'Delete',
    } as AWSLambda.CloudFormationCustomResourceEvent;
    const result = await handler(event);
    expect(result).toEqual({ Status: 'Success', StatusCode: 200 });

    expect(disableStandards).toHaveBeenCalled();
    expect(deleteMembers).toHaveBeenCalled();
    expect(deleteFindingAggregator).toHaveBeenCalled();
    expect(disableOrganisationAdmin).toHaveBeenCalledWith('us-west-2');
  });

  it('should execute update when invoked manually or via eventbridge', async () => {
    const enableOrganisationAdmin = jest.spyOn(SecurityHubOrganizationMgmt.prototype, 'enableOrganisationAdmin');
    enableOrganisationAdmin.mockImplementation();
    const createFindingAggregator = jest.spyOn(SecurityHubAggregatorMgmt.prototype, 'createFindingAggregator');
    createFindingAggregator.mockImplementation();
    const createMembers = jest.spyOn(SecurityHubMemberMgmt.prototype, 'createMembers');
    createMembers.mockImplementation();
    const enableStandards = jest.spyOn(SecurityHubStandardsMgmt.prototype, 'enableStandards');
    enableStandards.mockImplementation();

    const event = {} as AWSLambda.CloudFormationCustomResourceEvent;

    const result = await handler(event);
    expect(result).toEqual({ Status: 'Success', StatusCode: 200 });

    expect(enableOrganisationAdmin).toHaveBeenCalledWith('us-west-2');
    expect(createFindingAggregator).toHaveBeenCalled();
    expect(createMembers).toHaveBeenCalled();
    expect(enableStandards).toHaveBeenCalledWith(expect.any(Array));
  });

  it('should fail when env params missing', async () => {
    process.env = {
      ...originalEnv,
    };

    try {
      await handler({
        RequestType: 'Create',
      } as AWSLambda.CloudFormationCustomResourceEvent);
    } catch (e) {
      expect(e).toMatchObject(new Error('homeRegion, adminAccountId and role env variable is required'));
    }
  });

  it('should fail when no lz found', async () => {
    controlTowerClientMock.on(ListLandingZonesCommand).resolves({
      landingZones: [],
    });

    try {
      await handler({
        RequestType: 'Create',
      } as AWSLambda.CloudFormationCustomResourceEvent);
    } catch (e) {
      expect(e).toMatchObject(new Error('No landing zones found'));
    }
  });

  it('should fail when more than one lz found', async () => {
    controlTowerClientMock.on(ListLandingZonesCommand).resolves({
      landingZones: [
        {
          arn: 'landingZoneArn',
        },
        {
          arn: 'landingZoneArn2',
        },
      ],
    });

    try {
      await handler({
        RequestType: 'Create',
      } as AWSLambda.CloudFormationCustomResourceEvent);
    } catch (e) {
      expect(e).toMatchObject(new Error('More than one landing zone found'));
    }
  });

  it('should fail when no landingzone manifest', async () => {
    controlTowerClientMock.on(ListLandingZonesCommand).resolves({
      landingZones: [
        {
          arn: 'landingZoneArn',
        },
      ],
    });

    controlTowerClientMock.on(GetLandingZoneCommand).resolves({});

    try {
      await handler({
        RequestType: 'Create',
      } as AWSLambda.CloudFormationCustomResourceEvent);
    } catch (e) {
      expect(e).toMatchObject(new Error('Failed to get landingzone manifest'));
    }
  });

  it('should fail when governed regions cannot be read, there must be at least one', async () => {
    controlTowerClientMock.on(ListLandingZonesCommand).resolves({
      landingZones: [
        {
          arn: 'landingZoneArn',
        },
      ],
    });

    controlTowerClientMock.on(GetLandingZoneCommand).resolves({
      landingZone: {
        version: '1.2.3',
        manifest: {},
      },
    });

    try {
      await handler({
        RequestType: 'Create',
      } as AWSLambda.CloudFormationCustomResourceEvent);
    } catch (e) {
      expect(e).toMatchObject(new Error('Failed to read control tower regions from landingzone manifest'));
    }
  });
});
