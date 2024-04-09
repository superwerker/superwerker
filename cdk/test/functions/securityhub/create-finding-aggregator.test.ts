import { OrganizationsClient } from '@aws-sdk/client-organizations';
import {
  CreateFindingAggregatorCommand,
  DeleteFindingAggregatorCommand,
  ListFindingAggregatorsCommand,
  SecurityHubClient,
  UpdateFindingAggregatorCommand,
} from '@aws-sdk/client-securityhub';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { SecurityHubAggregatorMgmt } from '../../../src/functions/securityhub/create-finding-aggregator';

const securityHubClientMock = mockClient(SecurityHubClient);
const organizationsClientMock = mockClient(OrganizationsClient);

describe('SecurityHubAggregatorMgmt', () => {
  beforeEach(() => {
    securityHubClientMock.reset();
    organizationsClientMock.reset();
  });

  describe('createFindingAggregator', () => {
    it('should create a new Finding Aggregator if none exists & regions not empty', async () => {
      const regions = ['us-west-2', 'eu-west-1'];
      const securityHubMemberMgmt = new SecurityHubAggregatorMgmt(new SecurityHubClient(), regions);

      securityHubClientMock.on(ListFindingAggregatorsCommand).resolves({ FindingAggregators: [], NextToken: undefined });

      await securityHubMemberMgmt.createFindingAggregator();

      expect(securityHubClientMock).toHaveReceivedCommandWith(CreateFindingAggregatorCommand, {
        RegionLinkingMode: 'SPECIFIED_REGIONS',
        Regions: regions,
      });
      expect(securityHubClientMock).not.toHaveReceivedCommand(UpdateFindingAggregatorCommand);
    });

    it('should not create a new Finding Aggregator if none exists because regions are empty', async () => {
      const regions: string[] = [];
      const securityHubMemberMgmt = new SecurityHubAggregatorMgmt(new SecurityHubClient(), regions);

      securityHubClientMock.on(ListFindingAggregatorsCommand).resolves({ FindingAggregators: [], NextToken: undefined });

      await securityHubMemberMgmt.createFindingAggregator();

      expect(securityHubClientMock).not.toHaveReceivedCommand(CreateFindingAggregatorCommand);
      expect(securityHubClientMock).not.toHaveReceivedCommand(UpdateFindingAggregatorCommand);
      expect(securityHubClientMock).not.toHaveReceivedCommand(DeleteFindingAggregatorCommand);
    });

    it('should update the existing Finding Aggregator if one exists & regions not empty', async () => {
      const regions = ['us-west-2', 'eu-west-1'];
      const securityHubMemberMgmt = new SecurityHubAggregatorMgmt(new SecurityHubClient(), regions);

      securityHubClientMock.on(ListFindingAggregatorsCommand).resolves({
        FindingAggregators: [{ FindingAggregatorArn: 'arn:finding-aggregator' }],
        NextToken: undefined,
      });

      await securityHubMemberMgmt.createFindingAggregator();

      expect(securityHubClientMock).toHaveReceivedCommandWith(UpdateFindingAggregatorCommand, {
        FindingAggregatorArn: 'arn:finding-aggregator',
        RegionLinkingMode: 'SPECIFIED_REGIONS',
        Regions: ['us-west-2', 'eu-west-1'],
      });
      expect(securityHubClientMock).not.toHaveReceivedCommand(CreateFindingAggregatorCommand);
      expect(securityHubClientMock).not.toHaveReceivedCommand(DeleteFindingAggregatorCommand);
    });

    it('should delete Finding Aggregator if one exists because not needed when regions are empty', async () => {
      const regions: string[] = [];
      const securityHubMemberMgmt = new SecurityHubAggregatorMgmt(new SecurityHubClient(), regions);

      securityHubClientMock
        .on(ListFindingAggregatorsCommand)
        .resolves({ FindingAggregators: [{ FindingAggregatorArn: 'arn:finding-aggregator' }], NextToken: undefined });

      await securityHubMemberMgmt.createFindingAggregator();

      expect(securityHubClientMock).toHaveReceivedCommandWith(DeleteFindingAggregatorCommand, {
        FindingAggregatorArn: 'arn:finding-aggregator',
      });

      expect(securityHubClientMock).not.toHaveReceivedCommand(CreateFindingAggregatorCommand);
      expect(securityHubClientMock).not.toHaveReceivedCommand(UpdateFindingAggregatorCommand);
    });

    it('throw error when create fails', async () => {
      const regions = ['us-west-2', 'eu-west-1'];
      const securityHubMemberMgmt = new SecurityHubAggregatorMgmt(new SecurityHubClient(), regions);

      securityHubClientMock.on(ListFindingAggregatorsCommand).resolves({
        FindingAggregators: [],
        NextToken: undefined,
      });

      securityHubClientMock.on(CreateFindingAggregatorCommand).rejects('Internal Error');

      await expect(securityHubMemberMgmt.createFindingAggregator()).rejects.toThrow(
        'Failed to create Finding Aggregator: Error: Internal Error',
      );

      expect(securityHubClientMock).toHaveReceivedCommand(CreateFindingAggregatorCommand);
      expect(securityHubClientMock).not.toHaveReceivedCommand(UpdateFindingAggregatorCommand);
      expect(securityHubClientMock).not.toHaveReceivedCommand(DeleteFindingAggregatorCommand);
    });

    it('throw error when update fails', async () => {
      const regions = ['us-west-2', 'eu-west-1'];
      const securityHubMemberMgmt = new SecurityHubAggregatorMgmt(new SecurityHubClient(), regions);

      securityHubClientMock.on(ListFindingAggregatorsCommand).resolves({
        FindingAggregators: [{ FindingAggregatorArn: 'arn:finding-aggregator' }],
        NextToken: undefined,
      });

      securityHubClientMock.on(UpdateFindingAggregatorCommand).rejects('Internal Error');

      await expect(securityHubMemberMgmt.createFindingAggregator()).rejects.toThrow(
        'Failed to update Finding Aggregator: Error: Internal Error',
      );

      expect(securityHubClientMock).toHaveReceivedCommand(UpdateFindingAggregatorCommand);
      expect(securityHubClientMock).not.toHaveReceivedCommand(CreateFindingAggregatorCommand);
      expect(securityHubClientMock).not.toHaveReceivedCommand(DeleteFindingAggregatorCommand);
    });
  });

  describe('deleteFindingAggregator', () => {
    it('should delete the existing Finding Aggregator if one exists', async () => {
      const regions = ['us-west-2', 'eu-west-1'];
      const securityHubMemberMgmt = new SecurityHubAggregatorMgmt(new SecurityHubClient(), regions);

      securityHubClientMock.on(ListFindingAggregatorsCommand).resolves({
        FindingAggregators: [{ FindingAggregatorArn: 'arn:finding-aggregator' }],
        NextToken: undefined,
      });

      await securityHubMemberMgmt.deleteFindingAggregator();

      expect(securityHubClientMock).toHaveReceivedCommandWith(DeleteFindingAggregatorCommand, {
        FindingAggregatorArn: 'arn:finding-aggregator',
      });
      expect(securityHubClientMock).not.toHaveReceivedCommand(CreateFindingAggregatorCommand);
      expect(securityHubClientMock).not.toHaveReceivedCommand(UpdateFindingAggregatorCommand);
    });

    it('should skip to delete when there is no finding aggregator in place', async () => {
      const regions = ['us-west-2', 'eu-west-1'];
      const securityHubMemberMgmt = new SecurityHubAggregatorMgmt(new SecurityHubClient(), regions);

      securityHubClientMock.on(ListFindingAggregatorsCommand).resolves({ FindingAggregators: [], NextToken: undefined });

      await securityHubMemberMgmt.deleteFindingAggregator();

      expect(securityHubClientMock).not.toHaveReceivedCommand(DeleteFindingAggregatorCommand);
      expect(securityHubClientMock).not.toHaveReceivedCommand(CreateFindingAggregatorCommand);
      expect(securityHubClientMock).not.toHaveReceivedCommand(UpdateFindingAggregatorCommand);
    });

    it('throw error when delete fails', async () => {
      const regions = ['us-west-2', 'eu-west-1'];
      const securityHubMemberMgmt = new SecurityHubAggregatorMgmt(new SecurityHubClient(), regions);

      securityHubClientMock.on(ListFindingAggregatorsCommand).resolves({
        FindingAggregators: [{ FindingAggregatorArn: 'arn:finding-aggregator' }],
        NextToken: undefined,
      });

      securityHubClientMock.on(DeleteFindingAggregatorCommand).rejects('Internal Error');

      await expect(securityHubMemberMgmt.deleteFindingAggregator()).rejects.toThrow(
        'Failed to delete Finding Aggregator: Error: Internal Error',
      );

      expect(securityHubClientMock).toHaveReceivedCommand(DeleteFindingAggregatorCommand);
      expect(securityHubClientMock).not.toHaveReceivedCommand(CreateFindingAggregatorCommand);
      expect(securityHubClientMock).not.toHaveReceivedCommand(UpdateFindingAggregatorCommand);
    });
  });
});
