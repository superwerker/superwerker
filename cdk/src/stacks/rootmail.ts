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
} from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import { HostedZoneDkim } from '../constructs/rootmail-hosted-zone-dkim';
import { SESReceive } from '../constructs/rootmail-ses-receive';

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
   * Whether to set all removal policies to DESTROY. This is useful for integration testing purposes.
   *
   * @default false
   */
  readonly setDestroyPolicyToAllResources?: boolean;
}

export class RootmailStack extends NestedStack {
  public readonly hostedZoneParameterName: string;
  public readonly emailBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: RootmailProps) {
    super(scope, id, props);

    this.hostedZoneParameterName = '/superwerker/domain_name_servers';
    const domain = props.domain;
    const subdomain = props.subdomain ?? 'aws';
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
      zoneName: `${subdomain}.${domain}`,
    });

    const hostedZoneSSMParameter = new ssm.StringListParameter(this, 'HostedZoneSSMParameter', {
      parameterName: this.hostedZoneParameterName,
      stringListValue: hostedZone.hostedZoneNameServers || [],
    });

    new HostedZoneDkim(this, 'HostedZoneDkim', {
      domain: domain,
      subdomain: subdomain,
      hostedZone: hostedZone,
      hostedZoneSSMParameter: hostedZoneSSMParameter,
      totalTimeToWireDNS: totalTimeToWireDNS,
    });

    new SESReceive(this, 'SESReceive', {
      domain: domain,
      subdomain: subdomain,
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
