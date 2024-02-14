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
  CfnParameter,
} from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import { HostedZoneDkim } from '../constructs/rootmail-hosted-zone-dkim';
import { SESReceive } from '../constructs/rootmail-ses-receive';

export class RootmailStack extends NestedStack {
  public readonly hostedZoneParameterName: string;
  public readonly emailBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    this.hostedZoneParameterName = '/superwerker/domain_name_servers';
    const setDestroyPolicyToAllResources = false; //TODO

    // Parameters

    const domain = new CfnParameter(this, 'Domain', {
      type: 'String',
      description: 'Domain used for root mail feature.',
    });

    const subdomain = new CfnParameter(this, 'Subdomain', {
      type: 'String',
      description: 'Subdomain used for root mail feature.',
      default: 'aws',
    });

    const totalTimeToWireDNS = new CfnParameter(this, 'TotalTimeToWireDNS', {
      type: 'Number',
      description: 'Total time in MINUTES to wire the DNS.',
      default: 120,
      minValue: 5,
      maxValue: 480,
    });

    // Email bucket

    this.emailBucket = new s3.Bucket(this, 'EmailBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    this.emailBucket.grantPut(new iam.ServicePrincipal('ses.amazonaws.com'), 'RootMail/*');

    // Hosted zone

    const hostedZone = new r53.HostedZone(this, 'HostedZone', {
      zoneName: `${subdomain}.${domain}`,
    });

    const hostedZoneSSMParameter = new ssm.StringListParameter(this, 'HostedZoneSSMParameter', {
      parameterName: this.hostedZoneParameterName,
      stringListValue: hostedZone.hostedZoneNameServers || [],
    });

    new HostedZoneDkim(this, 'HostedZoneDkim', {
      domain: domain.valueAsString,
      subdomain: subdomain.valueAsString,
      hostedZone: hostedZone,
      hostedZoneSSMParameter: hostedZoneSSMParameter,
      totalTimeToWireDNS: Duration.minutes(totalTimeToWireDNS.valueAsNumber),
    });

    new SESReceive(this, 'SESReceive', {
      domain: domain.valueAsString,
      subdomain: subdomain.valueAsString,
      emailbucket: this.emailBucket,
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
