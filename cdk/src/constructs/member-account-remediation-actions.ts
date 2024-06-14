import * as path from 'path';
import { CustomResource, Duration, Stack, aws_lambda as lambda } from 'aws-cdk-lib';
import { Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

interface MemberAccountRemediationActionsProps {
  readonly loggingAccountId: string;

  readonly auditAccountId: string;

  readonly crossAccountRoleName: string;
}

export class MemberAccountRemediationActions extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: MemberAccountRemediationActionsProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::SecurityHubMemberRemediations';

    const resource = new CustomResource(this, 'SecurityHubMemberRemediationsCustomResource', {
      serviceToken: MemberAccountRemediationActionsProvider.getOrCreate(this, props),
      resourceType: RESOURCE_TYPE,
    });

    this.id = resource.ref;
  }
}

class MemberAccountRemediationActionsProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct, props: MemberAccountRemediationActionsProps) {
    const stack = Stack.of(scope);
    const id = 'superwerker.SecurityHubMemberRemediations';
    const x =
      (stack.node.tryFindChild(id) as MemberAccountRemediationActionsProvider) ||
      new MemberAccountRemediationActionsProvider(stack, id, props);
    return x.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string, props: MemberAccountRemediationActionsProps) {
    super(scope, id);

    console.log(props); //TODO delete

    const onEventHandlerFunc = new NodejsFunction(this, 'on-event-handler', {
      entry: path.join(__dirname, '..', 'functions', 'member-account-remediation.on-event-handler.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      logRetention: 3,
      timeout: Duration.seconds(30),
      environment: {
        homeRegion: Stack.of(this).region,
        loggingAccountId: props.loggingAccountId,
        auditAccountId: props.auditAccountId,
        crossAccountRoleName: props.crossAccountRoleName,
      },
    });

    onEventHandlerFunc.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'iam:UpdateAccountPasswordPolicy',
          'ec2:EnableEbsEncryptionByDefault',
          'ec2:DeleteInternetGateway',
          'ec2:DetachInternetGateway',
          'ec2:DeleteNetworkAcl',
          'ec2:DeleteRoute',
          'ec2:DeleteSecurityGroup',
          'ec2:DeleteSubnet',
          'ec2:DeleteVpc',
          'ec2:DescribeInternetGateways',
          'ec2:DescribeNetworkAcls',
          'ec2:DescribeRouteTables',
          'ec2:DescribeSecurityGroups',
          'ec2:DescribeSubnets',
          'ec2:DescribeVpcs',
          'organizations:DescribeAccount',
        ],
        resources: ['*'],
        effect: iam.Effect.ALLOW,
      }),
    );

    onEventHandlerFunc.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'SecurityHubConfiguration',
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:aws:iam::${props.auditAccountId}:role/${props.crossAccountRoleName}`,
          `arn:aws:iam::${props.loggingAccountId}:role/${props.crossAccountRoleName}`,
          'arn:aws:iam::*:role/AWSControlTowerExecution',
        ],
      }),
    );

    const createMemberEventRule = new Rule(this, 'CreateMemberEventRule', {
      eventPattern: {
        source: ['aws.controltower'],
        detailType: ['AWS Service Event via CloudTrail'],
        detail: {
          eventName: ['CreateManagedAccount'],
        },
      },
    });

    createMemberEventRule.addTarget(new LambdaFunction(onEventHandlerFunc));

    onEventHandlerFunc.addPermission('allowEventsInvocation', {
      principal: new ServicePrincipal('events.amazonaws.com'),
      sourceArn: createMemberEventRule.ruleArn,
    });

    this.provider = new cr.Provider(this, 'member-account-remediation-actions-provider', {
      onEventHandler: onEventHandlerFunc,
      logRetention: 3,
      providerFunctionName: 'MemberAccountRemediationsCustomResource',
    });
  }
}
