import Fs from 'fs';
import {
  Duration,
  aws_iam as iam,
  aws_route53 as r53,
  aws_s3 as s3,
  aws_ssm as ssm,
  CfnResource,
  RemovalPolicy,
  NestedStack,
  NestedStackProps,
  Stack,
  CfnParameter,
} from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { CfnRole } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { HostedZoneDkim } from '../constructs/rootmail-hosted-zone-dkim';

export class RootmailStack extends NestedStack {
  public readonly emailBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const domain = new CfnParameter(this, 'Domain', {
      type: 'String',
    });

    const subdomain = new CfnParameter(this, 'Subdomain', {
      type: 'String',
      default: 'aws',
    });

    const totalTimeToWireDNS = new CfnParameter(this, 'TotalTimeToWireDNS', {
      type: 'Number',
      default: 480,
      minValue: 5,
      maxValue: 480, // 8 hours
    });

    const propagationParameterName = new CfnParameter(this, 'PropagationParameterName', {
      type: 'String',
      default: '/superwerker/propagation_status',
    });

    const hostedZoneParameterName = new CfnParameter(this, 'HostedZoneParameterName', {
      type: 'String',
      default: '/superwerker/domain_name_servers',
    });

    // Email bucket
    this.emailBucket = new s3.Bucket(this, 'EmailBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });
    (this.emailBucket.node.defaultChild as CfnResource).overrideLogicalId('EmailBucket');
    this.emailBucket.applyRemovalPolicy(RemovalPolicy.RETAIN);

    this.emailBucket.grantPut(new iam.ServicePrincipal('ses.amazonaws.com'), 'RootMail/*');
    (this.emailBucket.policy!.node.defaultChild as CfnResource).overrideLogicalId('EmailBucketPolicy');

    // Hosted zone
    const hostedZone = new r53.HostedZone(this, 'HostedZone', {
      zoneName: `${subdomain.valueAsString}.${domain.valueAsString}`,
      comment: 'Created by superwerker',
      addTrailingDot: false,
    });
    (hostedZone.node.defaultChild as CfnResource).overrideLogicalId('HostedZone');

    const hostedZoneSSMParameter = new ssm.StringListParameter(this, 'HostedZoneSSMParameter', {
      parameterName: hostedZoneParameterName.valueAsString,
      stringListValue: hostedZone.hostedZoneNameServers!,
      simpleName: false,
    });
    (hostedZoneSSMParameter.node.defaultChild as CfnResource).overrideLogicalId('HostedZoneSSMParameter');

    const propagationParameter = new ssm.StringParameter(this, 'PropagationParameter', {
      parameterName: propagationParameterName.valueAsString,
      stringValue: 'pending',
      simpleName: false,
    });

    new HostedZoneDkim(this, 'HostedZoneDkim', {
      domain: domain.valueAsString,
      subdomain: subdomain.valueAsString,
      hostedZone: hostedZone,
      hostedZoneSSMParameter: hostedZoneSSMParameter,
      propagationParameter: propagationParameter,
      totalTimeToWireDNS: Duration.minutes(totalTimeToWireDNS.valueAsNumber),
    });

    const stackSetExecutionRole = new iam.Role(this, 'StackSetExecutionRole', {
      assumedBy: new iam.AccountPrincipal(Stack.of(this).account),
      path: '/',
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });
    (stackSetExecutionRole.node.defaultChild as CfnRole).overrideLogicalId('StackSetExecutionRole');

    const stackSetAdminRole = new iam.Role(this, 'StackSetAdministrationRole', {
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
    (stackSetAdminRole.node.defaultChild as CfnRole).overrideLogicalId('StackSetAdministrationRole');

    new cdk.CfnStackSet(this, 'SESReceiveStack', {
      permissionModel: 'SELF_MANAGED',
      stackSetName: Stack.of(this).stackName + '-ReceiveStack',
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
        Domain: domain.valueAsString,
        Subdomain: subdomain.valueAsString,
        EmailBucket: this.emailBucket.bucketName,
        EmailBucketArn: this.emailBucket.bucketArn,
      }),
    });
  }
}
