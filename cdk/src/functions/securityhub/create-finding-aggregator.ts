/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import {
  CreateFindingAggregatorCommand,
  DeleteFindingAggregatorCommand,
  ListFindingAggregatorsCommand,
  SecurityHubClient,
  UpdateFindingAggregatorCommand,
} from '@aws-sdk/client-securityhub';
import { throttlingBackOff } from '../utils/throttle';

export class SecurityHubAggregatorMgmt {
  private securityHubClient: SecurityHubClient;
  private regions: string[];

  constructor(organizationsClientAuditAccount: SecurityHubClient, regions: string[]) {
    this.securityHubClient = organizationsClientAuditAccount;
    this.regions = regions;
  }

  async createFindingAggregator() {
    console.log('Linked Regions to aggregate findings in home region: ', this.regions);

    const result = await throttlingBackOff(() => this.securityHubClient.send(new ListFindingAggregatorsCommand({})));
    console.log(result);
    let findingAggregatorArn = '';
    if (result.FindingAggregators!.length > 0) {
      findingAggregatorArn = result.FindingAggregators![0].FindingAggregatorArn!;
    }

    if (findingAggregatorArn) {
      console.log('Existing Finding Aggregator found, updating', findingAggregatorArn);

      if (this.regions.length < 1) {
        console.log('No region aggregation required, deleting Finding Aggregator');
        await this.deleteFindingAggregator();
        return;
      }

      try {
        await throttlingBackOff(() =>
          this.securityHubClient.send(
            new UpdateFindingAggregatorCommand({
              FindingAggregatorArn: findingAggregatorArn,
              RegionLinkingMode: 'SPECIFIED_REGIONS',
              Regions: this.regions,
            }),
          ),
        );
      } catch (error) {
        console.log(error);
        throw new Error('Failed to update Finding Aggregator: ' + error);
      }
      return;
    }

    if (this.regions.length < 1) {
      console.log('No region aggregation required, skipping creation of Finding Aggregator');
      return;
    }

    console.log('Create new Finding Aggreggation');
    try {
      await throttlingBackOff(() =>
        this.securityHubClient.send(new CreateFindingAggregatorCommand({ RegionLinkingMode: 'SPECIFIED_REGIONS', Regions: this.regions })),
      );
    } catch (error) {
      console.log(error);
      throw new Error('Failed to create Finding Aggregator: ' + error);
    }
  }

  async deleteFindingAggregator() {
    const result = await throttlingBackOff(() => this.securityHubClient.send(new ListFindingAggregatorsCommand({})));

    let findingAggregatorArn = '';
    if (result.FindingAggregators!.length > 0) {
      findingAggregatorArn = result.FindingAggregators![0].FindingAggregatorArn!;
    }

    console.log('Delete Finding Aggregator Arn');
    if (findingAggregatorArn) {
      try {
        await throttlingBackOff(() =>
          this.securityHubClient.send(new DeleteFindingAggregatorCommand({ FindingAggregatorArn: findingAggregatorArn })),
        );
      } catch (error) {
        throw new Error('Failed to delete Finding Aggregator: ' + error);
      }
    } else {
      console.log('No Finding Aggregator found, nothing to delete');
    }
  }
}
