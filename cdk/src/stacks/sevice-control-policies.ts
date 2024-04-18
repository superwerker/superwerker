import { CfnParameter, CustomResource, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Provider } from 'aws-cdk-lib/custom-resources';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

export class ServiceControlPoliciesStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const includeBackup = new CfnParameter(this, 'IncludeBackup', {
      type: 'String',
    });

    const includeSecurityHub = new CfnParameter(this, 'IncludeSecurityHub', {
      type: 'String',
    });

    let initialPolicy = [];

    if (includeBackup.valueAsString == 'true') {
      initialPolicy.push(
        new PolicyStatement({
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
        }),
      );
    }

    if (includeSecurityHub.valueAsString == 'true') {
      initialPolicy.push(
        new PolicyStatement({
          conditions: {
            ArnNotLike: {
              'aws:PrincipalARN': 'arn:${AWS::Partition}:iam::*:role/AWSControlTowerExecution',
            },
          },
          actions: [
            'securityhub:DeleteInvitations',
            'securityhub:DisableSecurityHub',
            'securityhub:DisassociateFromMasterAccount',
            'securityhub:DeleteMembers',
            'securityhub:DisassociateMembers',
          ],
          resources: [
            'arn:${AWS::Partition}:iam::*:role/service-role/AWSBackupDefaultServiceRole',
            'arn:${AWS::Partition}:iam::*:role/SuperwerkerBackupTagsEnforcementRemediationRole',
          ],
          effect: Effect.DENY,
        }),
      );
    }

    // Create the IAM Policy document
    const scpPolicyDocument = new PolicyDocument({
      assignSids: true, // Ensures statements have unique identifiers
      statements: initialPolicy,
    });

    new CustomResource(this, 'Resource', {
      serviceToken: ServiceControlPolicyProvider.getOrCreate(this),
      resourceType: 'Custom::SCPBaseline',
      properties: {
        policyId: '', //check how this will be passed on delete command.
        policyDocument: scpPolicyDocument,
        type: 'SERVICE_CONTROL_POLICY',
        attach: 'true',
        description: 'superwerker - service-control-policy',
      },
    });
  }
}

class ServiceControlPolicyProvider extends Construct {
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'superwerker.service-control-policy-provider';
    const x = (stack.node.tryFindChild(id) as ServiceControlPolicyProvider) || new ServiceControlPolicyProvider(stack, id);
    return x.provider.serviceToken;
  }

  private readonly provider: Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.provider = new Provider(this, 'service-control-policy-provider', {
      onEventHandler: new lambda.NodejsFunction(this, 'service-control-policy-on-event', {
        entry: path.join(__dirname, '..', 'functions', 'create-service-control-policies-baseline.ts'),
        runtime: Runtime.NODEJS_20_X,
        initialPolicy: [
          new PolicyStatement({
            resources: ['*'],
            actions: [
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
