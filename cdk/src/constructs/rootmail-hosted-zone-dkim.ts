import { Fn, Duration, aws_route53 as r53, aws_ssm as ssm } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HostedZoneDKIMPropagation } from './rootmail-hosted-zone-dkim-propagation';
import { HostedZoneDKIMAndVerificationRecords } from './rootmail-hosted-zone-dkim-verification-records';

export interface HostedZoneDkimProps {
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
   * The hosted zone of the <domain>, which has to be in the same AWS account.
   */
  readonly hostedZone: r53.IHostedZone;

  /**
   * The Hosted Zone SSM Parameter Name for the NS records.
   */
  readonly hostedZoneSSMParameter: ssm.StringListParameter;

  /**
   * The SSM Parameter for DNS propagation status.
   */
  readonly propagationParameter: ssm.StringParameter;

  /**
   * The total time to wait for the DNS records to be available/wired.
   */
  readonly totalTimeToWireDNS: Duration;
}

export class HostedZoneDkim extends Construct {
  constructor(scope: Construct, id: string, props: HostedZoneDkimProps) {
    super(scope, id);

    const domain = props.domain;
    const subdomain = props.subdomain ?? 'aws';
    const hostedZone = props.hostedZone;
    // const hostedZoneSSMParameter = props.hostedZoneSSMParameter;
    // const totalTimeToWireDNS = props.totalTimeToWireDNS;

    // 1: trigger SNS DKIM verification
    const hostedZoneDKIMAndVerificationRecords = new HostedZoneDKIMAndVerificationRecords(this, 'HostedZoneDKIMAndVerificationRecords', {
      domain: `${subdomain}.${domain}`,
    });

    const hostedZoneDKIMTokens = hostedZoneDKIMAndVerificationRecords.dkimTokens;

    // 2: set the records in the hosted zone
    new r53.RecordSet(this, 'HostedZoneDKIMTokenRecord0', {
      deleteExisting: false,
      zone: hostedZone,
      target: r53.RecordTarget.fromValues(`${Fn.select(0, hostedZoneDKIMTokens)}.dkim.amazonses.com`),
      recordName: `${Fn.select(0, hostedZoneDKIMTokens)}._domainkey.${subdomain}.${domain}`,
      ttl: Duration.seconds(60),
      recordType: r53.RecordType.CNAME,
    });

    new r53.RecordSet(this, 'HostedZoneDKIMTokenRecord1', {
      deleteExisting: false,
      zone: hostedZone,
      target: r53.RecordTarget.fromValues(`${Fn.select(1, hostedZoneDKIMTokens)}.dkim.amazonses.com`),
      recordName: `${Fn.select(1, hostedZoneDKIMTokens)}._domainkey.${subdomain}.${domain}`,
      ttl: Duration.seconds(60),
      recordType: r53.RecordType.CNAME,
    });

    new r53.RecordSet(this, 'HostedZoneDKIMTokenRecord2', {
      deleteExisting: false,
      zone: hostedZone,
      target: r53.RecordTarget.fromValues(`${Fn.select(2, hostedZoneDKIMTokens)}.dkim.amazonses.com`),
      recordName: `${Fn.select(2, hostedZoneDKIMTokens)}._domainkey.${subdomain}.${domain}`,
      ttl: Duration.seconds(60),
      recordType: r53.RecordType.CNAME,
    });

    new r53.MxRecord(this, 'HostedZoneMXRecord', {
      zone: hostedZone,
      values: [
        {
          priority: 10,
          hostName: 'inbound-smtp.eu-west-1.amazonaws.com', // hardcoded for backward compatibility
        },
      ],
      deleteExisting: false,
      recordName: `${subdomain}.${domain}`,
      ttl: Duration.seconds(60),
    });

    new r53.TxtRecord(this, 'HostedZoneVerificationTokenRecord', {
      zone: hostedZone,
      // Note: quotes by itself
      values: [hostedZoneDKIMAndVerificationRecords.verificationToken],
      deleteExisting: false,
      recordName: `_amazonses.${subdomain}.${domain}`,
      ttl: Duration.seconds(60),
    });

    // 3: trigger SES DKIM propagation polling
    new HostedZoneDKIMPropagation(this, 'HostedZoneDKIMPropagation', {
      domain: `${subdomain}.${domain}`,
      propagationParameter: props.propagationParameter,
    });
  }
}
