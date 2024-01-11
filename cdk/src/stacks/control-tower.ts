import Fs from 'fs';
import { CfnParameter, NestedStack, NestedStackProps, aws_iam as iam, RemovalPolicy } from 'aws-cdk-lib';
import { CfnLandingZone } from 'aws-cdk-lib/aws-controltower';
import { CfnAccount, CfnOrganization } from 'aws-cdk-lib/aws-organizations';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as Handlebars from 'handlebars';
import * as yaml from 'yaml';
import { SuperwerkerBootstrap } from '../constructs/superwerker-bootstrap';


export class ControlTowerStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const logArchiveAWSAccountEmail = new CfnParameter(this, 'LogArchiveAWSAccountEmail', {
      type: 'String',
    });
    const auditAWSAccountEmail = new CfnParameter(this, 'AuditAWSAccountEmail', {
      type: 'String',
    });

    const organization = new CfnOrganization(this, 'Organization', {
      featureSet: 'ALL',
    });
    organization.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const logArchiveAccount = new CfnAccount(this, 'LogArchiveAccount', {
      accountName: 'Log Archive',
      email: logArchiveAWSAccountEmail.valueAsString,
    });
    logArchiveAccount.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const logArchiveParam = new StringParameter(this, 'LogArchiveAccountParameter', {
      description: '(superwerker) account id of logarchive account',
      parameterName: '/superwerker/account_id_logarchive',
      stringValue: logArchiveAccount.attrAccountId,
    });
    logArchiveParam.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const auditAccount = new CfnAccount(this, 'AuditAccount', {
      accountName: 'Audit',
      email: auditAWSAccountEmail.valueAsString,
    });
    auditAccount.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const auditAccountParam = new StringParameter(this, 'AuditAccountParameter', {
      description: '(superwerker) account id of audit account',
      parameterName: '/superwerker/account_id_audit',
      stringValue: auditAccount.attrAccountId,
    });
    auditAccountParam.applyRemovalPolicy(RemovalPolicy.DESTROY);


    // Roles and Policies required by Control Tower
    // https://docs.aws.amazon.com/controltower/latest/userguide/lz-apis-cfn-setup.html
    const controlTowerAdminRole = new iam.Role(this, 'AWSControlTowerAdmin', {
      roleName: 'AWSControlTowerAdmin',
      assumedBy: new iam.ServicePrincipal('controltower.amazonaws.com'),
      path: '/service-role/',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSControlTowerServiceRolePolicy'),
      ],
    });

    const controlTowerAdminPolicy = new iam.Policy(this, 'AWSControlTowerAdminPolicy', {
      policyName: 'AWSControlTowerAdminPolicy',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ec2:DescribeAvailabilityZones'],
          resources: ['*'],
        }),
      ],
      roles: [controlTowerAdminRole],
    });

    const controlTowerCloudTrailRole = new iam.Role(this, 'AWSControlTowerCloudTrailRole', {
      roleName: 'AWSControlTowerCloudTrailRole',
      assumedBy: new iam.ServicePrincipal('cloudtrail.amazonaws.com'),
      path: '/service-role/',
    });

    const controlTowerCloudTrailPolicy = new iam.Policy(this, 'AWSControlTowerCloudTrailRolePolicy', {
      policyName: 'AWSControlTowerCloudTrailRolePolicy',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['arn:aws:logs:*:*:log-group:aws-controltower/CloudTrailLogs:*'],
        }),
      ],
      roles: [controlTowerCloudTrailRole],
    });

    const controlTowerConfigAggregatorRole = new iam.Role(
      this,
      'AWSControlTowerConfigAggregatorRoleForOrganizations',
      {
        roleName: 'AWSControlTowerConfigAggregatorRoleForOrganizations',
        assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
        path: '/service-role/',
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSConfigRoleForOrganizations'),
        ],
      },
    );

    const controlTowerStackSetRole = new iam.Role(this, 'AWSControlTowerStackSetRole', {
      roleName: 'AWSControlTowerStackSetRole',
      assumedBy: new iam.ServicePrincipal('cloudformation.amazonaws.com'),
      path: '/service-role/',
    });

    const controlTowerStackSetPolicy = new iam.Policy(this, 'AWSControlTowerStackSetRolePolicy', {
      policyName: 'AWSControlTowerStackSetRolePolicy',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: ['arn:aws:iam::*:role/AWSControlTowerExecution'],
        }),
      ],
      roles: [controlTowerStackSetRole],
    });


    const source = Fs.readFileSync('./src/stacks/landing-zone-manifest.yaml').toString();
    const template = Handlebars.compile(source);
    const contents = template({
      REGION: `${this.region}`,
      LOG_ARCHIVE_ACCOUNT_ID: `${logArchiveAccount.attrAccountId}`,
      AUDIT_ACCOUNT_ID: `${auditAccount.attrAccountId}`,
    });

    const manifest = yaml.parse(contents);

    const landingZone = new CfnLandingZone(this, 'LandingZone', {
      manifest: manifest,
      version: '3.3',
      tags: [{
        key: 'name',
        value: 'superwerker',
      }],
    });
    landingZone.applyRemovalPolicy(RemovalPolicy.DESTROY);
    landingZone.node.addDependency(
      controlTowerAdminPolicy,
      controlTowerAdminRole,
      controlTowerStackSetPolicy,
      controlTowerStackSetRole,
      controlTowerCloudTrailPolicy,
      controlTowerCloudTrailRole,
      controlTowerConfigAggregatorRole,
      logArchiveAccount,
      auditAccount,
      organization,
    );

    // create function to trigger enabling of features after landing zone has been installed
    const superwerkerBootstrap = new SuperwerkerBootstrap(this, 'SuperwerkerBootstrap');
    superwerkerBootstrap.node.addDependency(landingZone);
  }
}
