import {
  aws_route53 as r53,
  aws_ssm as ssm,
  Duration,
  CfnResource,
  NestedStack,
  NestedStackProps,
  CfnParameter,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_events as events,
  aws_events_targets as targets,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { WorkmailOrganization } from '../constructs/rootmail-workmail-organization';
import { WorkmailUser } from '../constructs/rootmail-workmail-user';
import { HostedZoneDkim } from '../constructs/rootmail-hosted-zone-dkim';

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

    const hostedZoneDkim = new HostedZoneDkim(this, 'HostedZoneDkim', {
      domain: domain.valueAsString,
      subdomain: subdomain.valueAsString,
      hostedZone: hostedZone,
      hostedZoneSSMParameter: hostedZoneSSMParameter,
    });

    const workmailOrganization = new WorkmailOrganization(this, 'WorkmailOrganization', {
      domain: `${subdomain.valueAsString}.${domain.valueAsString}`,
      propagationParameter: propagationParameter,
      hostedZoneId: hostedZone.hostedZoneId,
    });
    workmailOrganization.node.addDependency(hostedZoneDkim);

    new WorkmailUser(this, 'WorkmailUser', {
      domain: `${subdomain.valueAsString}.${domain.valueAsString}`,
      workmailOrgId: workmailOrganization.workmailOrgId,
      passwordParam: rootmailPasswordParameterName.valueAsString,
    });

    const sesRuleSetFunction = new NodejsFunction(this, 'sesRuleSetFunction', {
      entry: path.join(__dirname, '..', 'functions', 'ses-rule-set-function.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      logRetention: 3,
      timeout: Duration.seconds(30),
    });

    sesRuleSetFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SetActiveReceiptRuleSet'],
        effect: iam.Effect.ALLOW,
        resources: ['*'],
      }),
    );

    const sesRuleSetEvent = new events.Rule(this, 'sesRuleSetEvent', {
      ruleName: 'Superwerker-RootMail-Event',
      eventPattern: {
        detailType: ['CloudFormation Stack Status Change'],
        source: ['aws.cloudformation'],
        resources: [`${this.stackId}`],
        detail: {
          'status-details': {
            status: ['UPDATE_COMPLETE'],
          },
        },
      },
      targets: [
        new targets.LambdaFunction(sesRuleSetFunction, {
          maxEventAge: Duration.hours(1),
          retryAttempts: 5,
        }),
      ],
    });

    targets.addLambdaPermission(sesRuleSetEvent, sesRuleSetFunction);
  }
}
