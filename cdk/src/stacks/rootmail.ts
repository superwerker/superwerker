import { aws_route53 as r53, aws_ssm as ssm, CfnResource, NestedStack, NestedStackProps, CfnParameter } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { WorkmailOrganization } from '../constructs/rootmail-workmail-organization';
import { WorkmailUser } from '../constructs/rootmail-workmail-user';

export class RootmailStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const domain = new CfnParameter(this, 'Domain', {
      type: 'String',
    });

    const subdomain = new CfnParameter(this, 'Subdomain', {
      type: 'String',
      default: 'aws',
    });

    const propagationParameterName = new CfnParameter(this, 'PropagationParameterName', {
      type: 'String',
      default: '/superwerker/propagation_status',
    });

    const hostedZoneParameterName = new CfnParameter(this, 'HostedZoneParameterName', {
      type: 'String',
      default: '/superwerker/domain_name_servers',
    });

    const rootmailPasswordParameterName = new CfnParameter(this, 'RootmailPasswordParameterName', {
      type: 'String',
      default: '/superwerker/rootmail_password',
    });

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

    const workmailOrganization = new WorkmailOrganization(this, 'WorkmailOrganization', {
      domain: `${subdomain.valueAsString}.${domain.valueAsString}`,
      propagationParameter: propagationParameter,
      hostedZoneId: hostedZone.hostedZoneId,
    });

    new WorkmailUser(this, 'WorkmailUser', {
      domain: `${subdomain.valueAsString}.${domain.valueAsString}`,
      workmailOrgId: workmailOrganization.workmailOrgId,
      passwordParam: rootmailPasswordParameterName.valueAsString,
    });
  }
}
