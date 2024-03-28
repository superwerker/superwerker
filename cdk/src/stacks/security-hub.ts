import Fs from 'fs';
import { CfnParameter, CfnStackSet, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { AccountPrincipal, ManagedPolicy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { StringListParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { PrepareStack } from './prepare';
import { EnableSecurityHub } from '../constructs/enable-securityhub';

export class SecurityHubStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const auditAccountAccountId = new CfnParameter(this, 'AuditAccountAccountId', {
      type: 'String',
    });

    const ctGovernedRegions = StringListParameter.fromListParameterAttributes(this, 'GovernedRegionsParameterLookup', {
      parameterName: PrepareStack.controlTowerRegionsParameter,
    }).stringListValue;

    const secHubCrossAccountRoleName = 'OrganizationAccountAccessRole';
    const secHubCrossAccountRoleArn = `arn:aws:iam::${auditAccountAccountId.valueAsString}:role/${secHubCrossAccountRoleName}`;

    // enable Config Service in management account for all regions via Stackset since Control Tower does not configure it by itself
    const stackSetExecutionRole = new Role(this, 'StackSetExecutionRole', {
      assumedBy: new AccountPrincipal(Stack.of(this).account),
      path: '/',
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });

    const stackSetAdminRole = new Role(this, 'StackSetAdministrationRole', {
      assumedBy: new ServicePrincipal('cloudformation.amazonaws.com'),
      path: '/',
      inlinePolicies: {
        AWSCloudFormationStackSetExecutionRole: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['sts:AssumeRole'],
              resources: [stackSetExecutionRole.roleArn],
            }),
          ],
        }),
      },
    });

    const securityHubManagementAccontConfigService = new CfnStackSet(this, 'SecurityHubManagementAccontConfigService', {
      permissionModel: 'SELF_MANAGED',
      stackSetName: Stack.of(this).stackName + '-ManagementAccontConfigService',
      administrationRoleArn: stackSetAdminRole.roleArn,
      capabilities: ['CAPABILITY_IAM'],
      executionRoleName: stackSetExecutionRole.roleName,
      stackInstancesGroup: [
        {
          deploymentTargets: {
            accounts: [Stack.of(this).account],
          },
          regions: ctGovernedRegions,
        },
      ],
      operationPreferences: {
        failureToleranceCount: 0,
        maxConcurrentCount: 5,
        regionConcurrencyType: 'PARALLEL',
      },
      templateBody: Fs.readFileSync('./src/stacks/security-hub-config-stackset.yaml').toString(),
    });

    // enable Security Hub
    const enableSecurityHub = new EnableSecurityHub(this, 'EnableSecurityHub', {
      adminAccountId: auditAccountAccountId.valueAsString,
      secHubCrossAccountRoleArn: secHubCrossAccountRoleArn,
      ctGovernedRegions: ctGovernedRegions,
    });
    enableSecurityHub.node.addDependency(securityHubManagementAccontConfigService);

    // // integrate Security Hub with AWS Organizations
    // const securityHubOrganizationAdmin = new SecurityHubOrganizationAdmin(this, 'SecurityHubOrganizationAdmin', {
    //   adminAccountId: auditAccountAccountId.valueAsString,
    // });
    // securityHubOrganizationAdmin.node.addDependency(securityHubManagementAccontConfigService);

    // // designate a home region for Security Hub finding aggregation (ALL REGIONS)
    // const securityHubRegionAggregation = new SecurityHubRegionAggregation(this, 'SecurityHubRegionAggregation', {
    //   secHubCrossAccountRoleArn: secHubCrossAccountRoleArn,
    //   previousRef: securityHubOrganizationAdmin.id,
    // });

    // // enable Security Hub central configuration
    // const securityHubCentralOrganizationConfiguration = new SecurityHubCentralOrganizationConfiguration(
    //   this,
    //   'SecurityHubCentralOrganizationConfiguration',
    //   { secHubCrossAccountRoleArn: secHubCrossAccountRoleArn, previousRef: securityHubRegionAggregation.id },
    // );

    // // create/update Configuration Policy for Security Hub
    // const securityHubConfigurationPolicy = new SecurityHubConfigurationPolicy(this, 'SecurityHubConfigurationPolicy', {
    //   secHubCrossAccountRoleArn: secHubCrossAccountRoleArn,
    //   previousRef: securityHubCentralOrganizationConfiguration.id,
    // });

    // // associate Configuration Policy with root OU
    // new SecurityHubConfigurationPolicyAssociation(this, 'SecurityHubConfigurationPolicyAssociation', {
    //   secHubCrossAccountRoleArn: secHubCrossAccountRoleArn,
    //   previousRef: securityHubConfigurationPolicy.id,
    // });

    // TODO add CIS benchmark & create necessary alarms & metrics for 100%
  }
}
