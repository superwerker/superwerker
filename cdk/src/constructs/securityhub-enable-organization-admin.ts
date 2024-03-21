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

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, '..', 'functions', 'securityhub-enable-organization-admin.ts'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(180),
      policyStatements: [
        {
          Sid: 'SecurityHubEnableOrganizationAdminTaskOrganizationActions',
          Effect: 'Allow',
          Action: ['organizations:DescribeOrganization', 'organizations:ListAccounts', 'organizations:ListDelegatedAdministrators'],
          Resource: '*',
        },
        {
          Effect: 'Allow',
          Action: 'organizations:EnableAWSServiceAccess',
          Resource: '*',
          Condition: {
            StringEquals: {
              'organizations:ServicePrincipal': 'securityhub.amazonaws.com',
            },
          },
        },
        {
          Effect: 'Allow',
          Action: ['organizations:RegisterDelegatedAdministrator', 'organizations:DeregisterDelegatedAdministrator'],
          Resource: `arn:${cdk.Stack.of(this).partition}:organizations::*:account/o-*/*`,
          Condition: {
            StringEquals: {
              'organizations:ServicePrincipal': 'securityhub.amazonaws.com',
            },
          },
        },
        {
          Sid: 'SecurityHubCreateMembersTaskIamAction',
          Effect: 'Allow',
          Action: ['iam:CreateServiceLinkedRole'],
          Resource: '*',
          Condition: {
            StringLike: {
              'iam:AWSServiceName': ['securityhub.amazonaws.com'],
            },
          },
        },
        {
          Sid: 'SecurityHubEnableOrganizationAdminAccountTaskSecurityHubActions',
          Effect: 'Allow',
          Action: [
            'securityhub:DisableOrganizationAdminAccount',
            'securityhub:EnableOrganizationAdminAccount',
            'securityhub:EnableSecurityHub',
            'securityhub:ListOrganizationAdminAccounts',
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
        adminAccountId: props.adminAccountId,
      },
    });

    this.id = resource.ref;
  }
}
