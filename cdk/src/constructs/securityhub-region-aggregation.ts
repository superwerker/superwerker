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

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SecurityHubRegionAggregation extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::SecurityHubRegionAggregation';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, '..', 'functions', 'securityhub-region-aggregation.ts'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(180),
      policyStatements: [
        {
          Sid: 'SecurityHubModifyRegionAggregation',
          Effect: 'Allow',
          Action: [
            'securityhub:CreateFindingAggregator',
            'securityhub:UpdateFindingAggregator',
            'securityhub:DeleteFindingAggregator',
            'securityhub:ListFindingAggregators',
            'securityhub:GetFindingAggregator',
            'securityhub:DescribeHub',
          ],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        region: cdk.Stack.of(this).region,
        partition: cdk.Aws.PARTITION,
      },
    });

    this.id = resource.ref;
  }
}
