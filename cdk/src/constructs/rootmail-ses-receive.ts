import {
  Arn,
  ArnFormat,
  Aspects,
  CfnResource,
  Duration,
  IAspect,
  RemovalPolicy,
  Stack,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_s3 as s3,
} from 'aws-cdk-lib';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct, IConstruct } from 'constructs';
import { SESReceiptRuleSetActivation } from './ses-receipt-ruleset-activation';
import * as path from 'path';

export interface SESReceiveProps {
  /**
   * Domain used for root mail feature.
   */
  readonly domain: string;

  /**
   * Subdomain used for root mail feature.
   */
  readonly subdomain: string;

  /**
   * S3 bucket to store received emails
   */
  readonly emailbucket: s3.Bucket;

  /**
   * Whether to set all removal policies to DESTROY. This is useful for integration testing purposes.
   */
  readonly setDestroyPolicyToAllResources?: boolean;
}

export class SESReceive extends Construct {
  constructor(scope: Construct, id: string, props: SESReceiveProps) {
    super(scope, id);

    // const deployRegion = Stack.of(this).region;
    // if (!isSESEnabledRegion(deployRegion)) {
    //   throw new Error(`SES is not available in region ${deployRegion}. Use one of the following regions: ${sesEnabledRegions.join(', ')}`);
    // }

    const opsSantaFunctionSESPermissions = new iam.ServicePrincipal('ses.amazonaws.com');
    const opsSantaFunctionRole = new iam.Role(this, 'OpsSantaFunctionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
      inlinePolicies: {
        OpsSantaFunctionRolePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3:GetObject'],
              resources: [props.emailbucket.arnForObjects('RootMail/*')],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['ssm:CreateOpsItem'],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['ssm:PutParameter'],
              resources: [
                // arn:${AWS::Partition}:ssm:${AWS::Region}:${AWS::AccountId}:parameter/rootmail/*
                // arn:{partition}:{service}:{region}:{account}:{resource}{sep}{resource-name}
                Arn.format(
                  {
                    partition: Stack.of(this).partition,
                    service: 'ssm',
                    region: Stack.of(this).region,
                    account: Stack.of(this).account,
                    resource: 'parameter',
                    arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
                    resourceName: 'rootmail/*',
                  },
                  Stack.of(this),
                ),
              ],
            }),
          ],
        }),
      },
    });

    const opsSantaFunction = new NodejsFunction(this, 'ops-santa-handler', {
      entry: path.join(__dirname, '..', 'functions', 'ses-receive.ops-santa-handler.ts'),
      handler: 'handler',
      role: opsSantaFunctionRole,
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: Duration.seconds(60),
      logRetention: 3,
      environment: {
        EMAIL_BUCKET: props.emailbucket.bucketName,
        EMAIL_BUCKET_ARN: props.emailbucket.bucketArn,
        ROOTMAIL_DEPLOY_REGION: Stack.of(this).region,
      },
    });

    opsSantaFunction.addPermission('OpsSantaFunctionSESPermissions', {
      principal: opsSantaFunctionSESPermissions,
      action: 'lambda:InvokeFunction',
      sourceAccount: Stack.of(this).account,
    });

    // CR to activate SES receipt rule set
    new SESReceiptRuleSetActivation(this, 'SESReceiptRuleSetActivation', {
      domain: props.domain,
      subdomain: props.subdomain,
      emailbucket: props.emailbucket,
      opsSantaFunctionArn: opsSantaFunction.functionArn,
    });

    // If Destroy Policy Aspect is present:
    if (props.setDestroyPolicyToAllResources) {
      Aspects.of(this).add(new ApplyDestroyPolicyAspect());
    }
  }
}

/**
 * Aspect for setting all removal policies to DESTROY
 */
class ApplyDestroyPolicyAspect implements IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof CfnResource) {
      node.applyRemovalPolicy(RemovalPolicy.DESTROY);
    }
  }
}
