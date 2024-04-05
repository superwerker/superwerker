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

  constructor(organizationsClientAuditAccount: SecurityHubClient) {
    this.securityHubClient = organizationsClientAuditAccount;
  }

  async createFindingAggregator() {
    const result = await throttlingBackOff(() => this.securityHubClient.send(new ListFindingAggregatorsCommand({})));
    let findingAggregatorArn = '';
    if (result.FindingAggregators!.length > 0) {
      findingAggregatorArn = result.FindingAggregators![0].FindingAggregatorArn!;
    }

    if (findingAggregatorArn) {
      console.log('Existing Finding Aggregator found, updating', findingAggregatorArn);
      try {
        await throttlingBackOff(() =>
          this.securityHubClient.send(
            new UpdateFindingAggregatorCommand({
              FindingAggregatorArn: findingAggregatorArn,
              RegionLinkingMode: 'ALL_REGIONS',
            }),
          ),
        );
      } catch (error) {
        console.log(error);
        throw new Error('Failed to update Finding Aggregator: ' + error);
      }
      return;
    }

    console.log('Create new Finding Aggreggation');
    try {
      await throttlingBackOff(() => this.securityHubClient.send(new CreateFindingAggregatorCommand({ RegionLinkingMode: 'ALL_REGIONS' })));
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
