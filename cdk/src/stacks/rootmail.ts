import {
  Duration,
  aws_iam as iam,
  aws_route53 as r53,
  aws_s3 as s3,
  aws_ssm as ssm,
  CfnResource,
  IAspect,
  RemovalPolicy,
  Aspects,
  NestedStack,
  NestedStackProps,
  Stack,
} from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import { HostedZoneDkim } from '../constructs/rootmail-hosted-zone-dkim';
import * as cdk from 'aws-cdk-lib';
import Fs from 'fs';

export interface RootmailProps extends NestedStackProps {
  /**
   * Domain used for root mail feature.
   */
  readonly domain: string;

  /**
   * Subdomain used for root mail feature.
   *
   * @default 'aws'
   */
  readonly subdomain?: string;

  /**
   * The total time to wait for the DNS records to be available/wired.
   *
   * @default Duration.hours(2)
   */
  readonly totalTimeToWireDNS?: Duration;

  /**
   * SSM Param name for DNS propagation status. Value is either "pending" or "done".
   */
  readonly propagationParamName: string;

  /**
   * SSM Param name for hosted zone NS servers
   */
  readonly hostedZoneParamName: string;

  /**
   * Whether to set all removal policies to DESTROY. This is useful for integration testing purposes.
   *
   * @default false
   */
  readonly setDestroyPolicyToAllResources?: boolean;
}

export class RootmailStack extends NestedStack {
  public readonly hostedZoneParameterName: string;
  public readonly propagationParameterName: string;
  public readonly emailBucket: s3.Bucket;
  public readonly domain: string;
  public readonly subdomain: string;

  constructor(scope: Construct, id: string, props: RootmailProps) {
    super(scope, id, props);

    this.hostedZoneParameterName = props.hostedZoneParamName;
    this.propagationParameterName = props.propagationParamName;
    this.domain = props.domain;
    this.subdomain = props.subdomain ?? 'aws';
    const totalTimeToWireDNS = Duration.hours(2); // TODO
    const setDestroyPolicyToAllResources = props.setDestroyPolicyToAllResources ?? false; //TODO

    // Email bucket
    this.emailBucket = new s3.Bucket(this, 'EmailBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    this.emailBucket.grantPut(new iam.ServicePrincipal('ses.amazonaws.com'), 'RootMail/*');

    // Hosted zone
    const hostedZone = new r53.HostedZone(this, 'HostedZone', {
      zoneName: `${this.subdomain}.${this.domain}`,
    });

    const hostedZoneSSMParameter = new ssm.StringListParameter(this, 'HostedZoneSSMParameter', {
      parameterName: this.hostedZoneParameterName,
      stringListValue: hostedZone.hostedZoneNameServers || [],
    });

    const propagationParameter = new ssm.StringParameter(this, 'PropagationParameter', {
      parameterName: this.propagationParameterName,
      stringValue: 'pending',
    });

    new HostedZoneDkim(this, 'HostedZoneDkim', {
      domain: this.domain,
      subdomain: this.subdomain,
      hostedZone: hostedZone,
      hostedZoneSSMParameter: hostedZoneSSMParameter,
      propagationParameter: propagationParameter,
      totalTimeToWireDNS: totalTimeToWireDNS,
    });

    const stackSetExecutionRole = new iam.Role(this, 'SESStackSetExecutionRole', {
      assumedBy: new iam.AccountPrincipal(Stack.of(this).account),
      path: '/',
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });

    const stackSetAdminRole = new iam.Role(this, 'SESStackSetAdminRole', {
      assumedBy: new iam.ServicePrincipal('cloudformation.amazonaws.com'),
      path: '/',
      inlinePolicies: {
        AWSCloudFormationStackSetExecutionRole: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['sts:AssumeRole'],
              resources: [stackSetExecutionRole.roleArn],
            }),
          ],
        }),
      },
    });

    new cdk.CfnStackSet(this, 'Rootmail-ReceiveStack', {
      permissionModel: 'SELF_MANAGED',
      stackSetName: 'Rootmail-ReceiveStack',
      administrationRoleArn: stackSetAdminRole.roleArn,
      capabilities: ['CAPABILITY_IAM'],
      executionRoleName: stackSetExecutionRole.roleName,
      stackInstancesGroup: [
        {
          deploymentTargets: {
            accounts: [Stack.of(this).account],
          },
          regions: ['eu-west-1'],
        },
      ],
      templateBody: cdk.Fn.sub(Fs.readFileSync('./src/stacks/rootmail-ses-receive-stackset.yaml').toString(), {
        Domain: this.domain,
        Subdomain: this.subdomain,
        EmailBucket: this.emailBucket.bucketName,
        EmailBucketArn: this.emailBucket.bucketArn,
      }),
    });

    // If Destroy Policy Aspect is present:
    if (setDestroyPolicyToAllResources) {
      Aspects.of(this).add(new ApplyDestroyPolicyAspect());
    }
  }
}

/**
 * Aspect for setting all removal policies to DESTROY
 *
 * TODO : do we want this?
 */
class ApplyDestroyPolicyAspect implements IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof CfnResource) {
      node.applyRemovalPolicy(RemovalPolicy.DESTROY);
    }
  }
}
