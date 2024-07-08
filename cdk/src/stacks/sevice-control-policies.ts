import * as path from 'path';
import { Arn, CfnParameter, CfnResource, CustomResource, Duration, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { PrepareStack } from './prepare';

export class ServiceControlPoliciesStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const includeBackup = new CfnParameter(this, 'IncludeBackup', {
      type: 'String',
    });

    //Backup
    const backupStatement = new PolicyStatement({
      conditions: {
        ArnNotLike: {
          'aws:PrincipalARN': `arn:${Stack.of(this).partition}:iam::*:role/stacksets-exec-*`,
        },
      },
      actions: [
        'iam:AttachRolePolicy',
        'iam:CreateRole',
        'iam:DeleteRole',
        'iam:DeleteRolePermissionsBoundary',
        'iam:DeleteRolePolicy',
        'iam:DetachRolePolicy',
        'iam:PutRolePermissionsBoundary',
        'iam:PutRolePolicy',
        'iam:UpdateAssumeRolePolicy',
        'iam:UpdateRole',
        'iam:UpdateRoleDescription',
      ],
      resources: [
        `arn:${Stack.of(this).partition}:iam::*:role/service-role/AWSBackupDefaultServiceRole`,
        `arn:${Stack.of(this).partition}:iam::*:role/SuperwerkerBackupTagsEnforcementRemediationRole`,
      ],
      effect: Effect.DENY,
      sid: 'SWProtectBackup',
    });

    //Deny Leaving Organization
    const denyLeavingOrganizationStatement = new PolicyStatement({
      actions: ['organizations:LeaveOrganization'],
      resources: ['*'],
      effect: Effect.DENY,
      sid: 'PreventLeavingOrganization',
    });

    const scpPolicyDocumentRoot = new PolicyDocument({
      statements: [denyLeavingOrganizationStatement],
    });

    //Include Backup SCP if Backup is included
    if (includeBackup.value.toString() === 'Yes') {
      scpPolicyDocumentRoot.addStatements(backupStatement);
    }

    const scpRoot = new CustomResource(this, 'SCPRoot', {
      serviceToken: ServiceControlPolicyRootProvider.getOrCreate(this),
      properties: {
        policy: JSON.stringify(scpPolicyDocumentRoot),
        scpName: 'superwerker-root',
      },
    });

    (scpRoot.node.defaultChild as CfnResource).overrideLogicalId('SCPRoot');

    //Deny Expensive API Calls in the Sandbox OU
    const denyExpensiveAPICallsStatement = new PolicyStatement({
      sid: 'DenyExpensiveResourceCreation',
      effect: Effect.DENY,
      actions: [
        'route53domains:RegisterDomain',
        'route53domains:RenewDomain',
        'route53domains:TransferDomain',
        'ec2:ModifyReservedInstances',
        'ec2:PurchaseHostReservation',
        'ec2:PurchaseReservedInstancesOffering',
        'ec2:PurchaseScheduledInstances',
        'rds:PurchaseReservedDBInstancesOffering',
        'dynamodb:PurchaseReservedCapacityOfferings',
        's3:PutObjectRetention',
        's3:PutObjectLegalHold',
        's3:BypassGovernanceRetention',
        's3:PutBucketObjectLockConfiguration',
        'elasticache:PurchaseReservedCacheNodesOffering',
        'redshift:PurchaseReservedNodeOffering',
        'savingsplans:CreateSavingsPlan',
        'aws-marketplace:AcceptAgreementApprovalRequest',
        'aws-marketplace:Subscribe',
        'shield:CreateSubscription',
        'acm-pca:CreateCertificateAuthority',
        'es:PurchaseReservedElasticsearchInstanceOffering',
        'outposts:CreateOutpost',
        'snowball:CreateCluster',
        's3-object-lambda:PutObjectLegalHold',
        's3-object-lambda:PutObjectRetention',
        'glacier:InitiateVaultLock',
        'glacier:CompleteVaultLock',
        'es:PurchaseReservedInstanceOffering',
        'backup:PutBackupVaultLockConfiguration',
      ],
      resources: ['*'],
    });

    const scpPolicyDocumentSandbox = new PolicyDocument({
      statements: [denyExpensiveAPICallsStatement],
    });

    const scpSandbox = new CustomResource(this, 'SCPSandbox', {
      serviceToken: ServiceControlPolicySandboxProvider.getOrCreate(this),
      properties: {
        policy: JSON.stringify(scpPolicyDocumentSandbox),
        scpName: 'superwerker-sandbox',
        sandboxOUParameterPath: PrepareStack.controlTowerSandboxOuSsmParameter,
      },
    });

    (scpSandbox.node.defaultChild as CfnResource).overrideLogicalId('SCPSandbox');
  }
}

class ServiceControlPolicyRootProvider extends Construct {
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.service-control-policy-root-provider';
    const x = (stack.node.tryFindChild(id) as ServiceControlPolicyRootProvider) || new ServiceControlPolicyRootProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const scpRootFn = new NodejsFunction(this, 'service-control-policy-root-on-event', {
      entry: path.join(__dirname, '..', 'functions', 'service-control-policies-root.ts'),
      runtime: Runtime.NODEJS_20_X,
      initialPolicy: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: [
            'organizations:CreatePolicy',
            'organizations:UpdatePolicy',
            'organizations:DeletePolicy',
            'organizations:AttachPolicy',
            'organizations:DetachPolicy',
            'organizations:ListRoots',
            'organizations:ListPolicies',
          ],
        }),
      ],
      timeout: Duration.seconds(300),
    });

    this.provider = new Provider(this, 'service-control-policy-root-provider', {
      onEventHandler: scpRootFn,
    });
  }
}

class ServiceControlPolicySandboxProvider extends Construct {
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.service-control-policy-sandbox-provider';
    const x = (stack.node.tryFindChild(id) as ServiceControlPolicySandboxProvider) || new ServiceControlPolicySandboxProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const scpSandboxFn = new NodejsFunction(this, 'service-control-policy-sandbox-on-event', {
      entry: path.join(__dirname, '..', 'functions', 'service-control-policies-sandbox.ts'),
      runtime: Runtime.NODEJS_20_X,
      initialPolicy: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: [
            'organizations:CreatePolicy',
            'organizations:UpdatePolicy',
            'organizations:DeletePolicy',
            'organizations:AttachPolicy',
            'organizations:DetachPolicy',
            'organizations:ListRoots',
            'organizations:ListPolicies',
            'organizations:ListOrganizationalUnitsForParent',
          ],
        }),
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['ssm:GetParameter'],
          resources: [
            Arn.format(
              {
                service: 'ssm',
                resource: 'parameter',
                resourceName: 'superwerker/*',
              },
              Stack.of(this),
            ),
          ],
        }),
      ],
      timeout: Duration.seconds(300),
    });

    this.provider = new Provider(this, 'service-control-policy-sandbox-provider', {
      onEventHandler: scpSandboxFn,
    });
  }
}
