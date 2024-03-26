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
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface SecurityHubOrganizationalAdminProps {
  /**
   * Delegated admin account id
   */
  readonly adminAccountId: string;
}

export class SecurityHubOrganizationAdmin extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: SecurityHubOrganizationalAdminProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::SecurityHubEnableOrganizationAdmin';

    const resource = new CustomResource(this, 'Resource', {
      serviceToken: SecurityHubOrganizationAdminProvider.getOrCreate(this),
      resourceType: RESOURCE_TYPE,
      properties: {
        region: cdk.Stack.of(this).region,
        adminAccountId: props.adminAccountId,
      },
    });

    this.id = resource.ref;
  }
}

class SecurityHubOrganizationAdminProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.SecurityHubOrganizationAdminProvider';
    const x = (stack.node.tryFindChild(id) as SecurityHubOrganizationAdminProvider) || new SecurityHubOrganizationAdminProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.provider = new cr.Provider(this, 'SecurityHubOrganizationAdminProvider', {
      onEventHandler: new lambda.NodejsFunction(this, 'SecurityHubOrganizationAdminProvider-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'securityhub-enable-organization-admin.ts'),
        runtime: Runtime.NODEJS_20_X,
        timeout: Duration.seconds(180),
        initialPolicy: [
          new iam.PolicyStatement({
            sid: 'SecurityHubEnableOrganizationAdminTaskOrganizationActions',
            actions: ['organizations:DescribeOrganization', 'organizations:ListAccounts', 'organizations:ListDelegatedAdministrators'],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            actions: ['organizations:EnableAWSServiceAccess'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'organizations:ServicePrincipal': 'securityhub.amazonaws.com',
              },
            },
          }),
          new iam.PolicyStatement({
            actions: ['organizations:RegisterDelegatedAdministrator', 'organizations:DeregisterDelegatedAdministrator'],
            resources: [`arn:${cdk.Stack.of(this).partition}:organizations::*:account/o-*/*`],
            conditions: {
              StringEquals: {
                'organizations:ServicePrincipal': 'securityhub.amazonaws.com',
              },
            },
          }),
          new iam.PolicyStatement({
            sid: 'SecurityHubCreateMembersTaskIamAction',
            actions: ['iam:CreateServiceLinkedRole'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'iam:AWSServiceName': 'securityhub.amazonaws.com',
              },
            },
          }),
          new iam.PolicyStatement({
            sid: 'SecurityHubEnableOrganizationAdminAccountTaskSecurityHubActions',
            actions: [
              'securityhub:DisableOrganizationAdminAccount',
              'securityhub:EnableOrganizationAdminAccount',
              'securityhub:EnableSecurityHub',
              'securityhub:ListOrganizationAdminAccounts',
            ],
            resources: ['*'],
          }),
        ],
      }),
    });
  }
}
