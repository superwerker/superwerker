import * as path from 'path';
import { CfnParameter, CustomResource, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class ServiceControlPoliciesStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const denyLeavingOrganizationStatement = new PolicyStatement({
      sid: 'PreventLeavingOrganization',
      effect: Effect.DENY,
      actions: ['organizations:LeaveOrganization'],
      resources: ['*'],
    });

    const scpPolicyDocumentRoot = new PolicyDocument({
      statements: [denyLeavingOrganizationStatement],
    });

    //Backup
    const includeBackup = new CfnParameter(this, 'IncludeBackup', {
      type: 'String',
      description: 'Enable automated backups',
      allowedValues: ['true', 'false'],
      default: 'true',
    });

    //Backup
    const includeSecurityHub = new CfnParameter(this, 'IncludeSecurityHub', {
      type: 'String',
      description: 'Enable security hub',
      allowedValues: ['true', 'false'],
      default: 'true',
    });

    console.log(includeSecurityHub);

    if (includeBackup.valueAsString == 'true') {
      const backupStatement = new PolicyStatement({
        conditions: {
          ArnNotLike: {
            'aws:PrincipalARN': 'arn:${AWS::Partition}:iam::*:role/stacksets-exec-*',
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
          'arn:${AWS::Partition}:iam::*:role/service-role/AWSBackupDefaultServiceRole',
          'arn:${AWS::Partition}:iam::*:role/SuperwerkerBackupTagsEnforcementRemediationRole',
        ],
        effect: Effect.DENY,
        sid: 'SWProtectBackup',
      });
      scpPolicyDocumentRoot.addStatements(backupStatement);
    }

    new CustomResource(this, 'SCPRoot', {
      serviceToken: ServiceControlPolicyRootProvider.getOrCreate(this),
      resourceType: 'Custom::SCPRoot',
      properties: {
        policy: JSON.stringify(scpPolicyDocumentRoot),
        scpName: 'superwerker-root',
      },
    });

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

    new CustomResource(this, 'SCPSandbox', {
      serviceToken: ServiceControlPolicySandboxProvider.getOrCreate(this),
      resourceType: 'Custom::SCPSandbox',
      properties: {
        policy: JSON.stringify(scpPolicyDocumentSandbox),
        scpName: 'superwerker-sandbox',
      },
    });

    this.addMetadata('cfn - lint', { config: { ignore_checks: ['E9007', 'EPolicyWildcardPrincipal'] } });
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

    this.provider = new Provider(this, 'service-control-policy-root-provider', {
      onEventHandler: new lambda.NodejsFunction(this, 'service-control-policy-root-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'service-control-policies-root.ts'),
        runtime: Runtime.NODEJS_20_X,
        initialPolicy: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            resources: ['*'],
            actions: [
              'organizations:EnablePolicyType',
              'organizations:DisablePolicyType',
              'organizations:ListRoots',
              'organizations:CreatePolicy',
              'organizations:UpdatePolicy',
              'organizations:DeletePolicy',
              'organizations:AttachPolicy',
              'organizations:DetachPolicy',
              'organizations:ListRoots',
              'organizations:ListPolicies',
              'organizations:ListPoliciesForTarget',
            ],
          }),
        ],
      }),
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

    this.provider = new Provider(this, 'service-control-policy-sandbox-provider', {
      onEventHandler: new lambda.NodejsFunction(this, 'service-control-policy-sandbox-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'service-control-policies-sandbox.ts'),
        runtime: Runtime.NODEJS_20_X,
        initialPolicy: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            resources: ['*'],
            actions: [
              'organizations:EnablePolicyType',
              'organizations:DisablePolicyType',
              'organizations:ListRoots',
              'organizations:CreatePolicy',
              'organizations:UpdatePolicy',
              'organizations:DeletePolicy',
              'organizations:AttachPolicy',
              'organizations:DetachPolicy',
              'organizations:ListRoots',
              'organizations:ListPolicies',
              'organizations:ListPoliciesForTarget',
            ],
          }),
        ],
      }),
    });
  }
}
