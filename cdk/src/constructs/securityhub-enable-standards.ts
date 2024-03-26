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

interface SecurityHubStandardsProps {
  /**
   * Cross Account Role for configuring Security Hub in audit account
   */
  readonly secHubCrossAccountRoleArn: string;
  /**
   * Reference to previous stack for enforcing order of stack creation
   */
  readonly previousRef: string;
}

export class SecurityHubStandards extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: SecurityHubStandardsProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::SecurityHubStandards';

    const resource = new CustomResource(this, 'Resource', {
      serviceToken: SecurityHubStandardsProvider.getOrCreate(this, props),
      resourceType: RESOURCE_TYPE,
      properties: {
        role: props.secHubCrossAccountRoleArn,
        previousRef: props.previousRef,
      },
    });

    this.id = resource.ref;
  }
}

class SecurityHubStandardsProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct, props: SecurityHubStandardsProps) {
    const stack = Stack.of(scope);
    const id = 'superwerker.SecurityHubStandardsProvider';
    const x = (stack.node.tryFindChild(id) as SecurityHubStandardsProvider) || new SecurityHubStandardsProvider(stack, id, props);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string, props: SecurityHubStandardsProps) {
    super(scope, id);

    this.provider = new cr.Provider(this, 'SecurityHubStandardsProvider', {
      onEventHandler: new lambda.NodejsFunction(this, 'SecurityHubStandardsProvider-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'securityhub-enable-standards.ts'),
        runtime: Runtime.NODEJS_20_X,
        timeout: Duration.seconds(180),
        initialPolicy: [
          new iam.PolicyStatement({
            sid: 'SecurityHubModifyRegionAggregation',
            actions: [
              'securityhub:BatchDisableStandards',
              'securityhub:BatchEnableStandards',
              'securityhub:DescribeStandards',
              'securityhub:DescribeStandardsControls',
              'securityhub:GetEnabledStandards',
              'securityhub:UpdateStandardsControl',
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
