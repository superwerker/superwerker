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
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

interface SecurityHubRegionAggregationProps {
  /**
   * Cross Account Role for configuring Security Hub in audit account
   */
  readonly secHubCrossAccountRoleArn: string;
  /**
   * Reference to previous stack for enforcing order of stack creation
   */
  readonly previousRef: string;
}

export class SecurityHubRegionAggregation extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: SecurityHubRegionAggregationProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::SecurityHubRegionAggregation';

    const resource = new CustomResource(this, 'Resource', {
      serviceToken: SecurityHubRegionAggregationProvider.getOrCreate(this, props),
      resourceType: RESOURCE_TYPE,
      properties: {
        role: props.secHubCrossAccountRoleArn,
        previousRef: props.previousRef,
      },
    });

    this.id = resource.ref;
  }
}

class SecurityHubRegionAggregationProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct, props: SecurityHubRegionAggregationProps) {
    const stack = Stack.of(scope);
    const id = 'superwerker.SecurityHubRegionAggregationProvider';
    const x =
      (stack.node.tryFindChild(id) as SecurityHubRegionAggregationProvider) || new SecurityHubRegionAggregationProvider(stack, id, props);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string, props: SecurityHubRegionAggregationProps) {
    super(scope, id);

    this.provider = new cr.Provider(this, 'SecurityHubRegionAggregationProvider', {
      onEventHandler: new lambda.NodejsFunction(this, 'SecurityHubRegionAggregationProvider-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'securityhub-region-aggregation.ts'),
        runtime: Runtime.NODEJS_20_X,
        timeout: Duration.seconds(180),
        initialPolicy: [
          new iam.PolicyStatement({
            sid: 'SecurityHubModifyRegionAggregation',
            actions: [
              'securityhub:CreateFindingAggregator',
              'securityhub:UpdateFindingAggregator',
              'securityhub:DeleteFindingAggregator',
              'securityhub:ListFindingAggregators',
              'securityhub:GetFindingAggregator',
              'securityhub:DescribeHub',
            ],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            sid: 'SecurityHubConfiguration',
            actions: ['sts:AssumeRole'],
            resources: [props.secHubCrossAccountRoleArn],
          }),
        ],
      }),
    });
  }
}
