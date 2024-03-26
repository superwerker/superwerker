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
  SecurityHub,
  CreateFindingAggregatorCommand,
  ListFindingAggregatorsCommand,
  UpdateFindingAggregatorCommand,
  DeleteFindingAggregatorCommand,
} from '@aws-sdk/client-securityhub';
import { STS } from '@aws-sdk/client-sts';
import { getCredsFromAssumeRole } from '../utils/assume-role';
import { throttlingBackOff } from '../utils/throttle';

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const secHubCrossAccountRoleArn = event.ResourceProperties.role;

  const stsClient = new STS();
  const securityHubClient = new SecurityHub({
    credentials: await getCredsFromAssumeRole(stsClient, secHubCrossAccountRoleArn, 'SecurityHubRegionAggregation'),
  });

  // check if existing finding aggregator exists
  const result = await throttlingBackOff(() => securityHubClient.send(new ListFindingAggregatorsCommand({})));

  let findingAggregatorArn = '';
  if (result.FindingAggregators!.length > 0) {
    findingAggregatorArn = result.FindingAggregators![0].FindingAggregatorArn!;
  }

  switch (event.RequestType) {
    case 'Create':
      //don't try to create finding aggregator if it exists
      if (findingAggregatorArn) {
        console.log('Existing Finding Aggregator found, skipping creation', findingAggregatorArn);
      } else {
        console.log('Enable Finding Aggreggation');
        try {
          await throttlingBackOff(() => securityHubClient.send(new CreateFindingAggregatorCommand({ RegionLinkingMode: 'ALL_REGIONS' })));
        } catch (error) {
          console.log(error);
          throw new Error('Failed to create Finding Aggregator: ' + error);
        }
      }
      return { Status: 'Success', StatusCode: 200 };
    case 'Update':
      console.log('Update Finding Aggregator Arn', findingAggregatorArn);
      try {
        await throttlingBackOff(() =>
          securityHubClient.send(
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
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      console.log('Delete Finding Aggregator Arn', findingAggregatorArn);
      try {
        await throttlingBackOff(() =>
          securityHubClient.send(new DeleteFindingAggregatorCommand({ FindingAggregatorArn: findingAggregatorArn })),
        );
      } catch (error) {
        console.log(error);
        throw new Error('Failed to delete Finding Aggregator: ' + error);
      }
      return { Status: 'Success', StatusCode: 200 };
  }
}
