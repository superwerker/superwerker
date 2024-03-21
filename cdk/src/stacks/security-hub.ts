import Fs from 'fs';
import { CfnStackSet, Fn, NestedStack, NestedStackProps, Stack } from 'aws-cdk-lib';
import { AccountPrincipal, ManagedPolicy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { SecurityHubCentralOrganizationConfiguration } from '../constructs/securityhub-central-organization-configuration';
import { SecurityHubConfigurationPolicy } from '../constructs/securityhub-configuration-policy';
import { SecurityHubConfigurationPolicyAssociation } from '../constructs/securityhub-configuration-policy-association';
import { SecurityHubOrganizationAdmin } from '../constructs/securityhub-enable-organization-admin';
import { SecurityHubRegionAggregation } from '../constructs/securityhub-region-aggregation';

interface SecurityHubStackProps extends NestedStackProps {
  delegatedSecurityAdminAccountId: string;
}

export class SecurityHubStack extends NestedStack {
  constructor(scope: Construct, id: string, props: SecurityHubStackProps) {
    super(scope, id, props);

    const secHubCrossAccountRoleName = 'SecHubCrossAccountRole';
    const secHubCrossAccountRoleArn = `arn:aws:iam::${props.delegatedSecurityAdminAccountId}:role/${secHubCrossAccountRoleName}`;

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

    const secHubIamRoleStackset = new CfnStackSet(this, 'SecHubIamRoleStackset', {
      permissionModel: 'SELF_MANAGED',
      stackSetName: 'SecHubIamRoleStackset',
      administrationRoleArn: stackSetAdminRole.roleArn,
      capabilities: ['CAPABILITY_IAM'],
      executionRoleName: stackSetExecutionRole.roleName,
      stackInstancesGroup: [
        {
          deploymentTargets: {
            accounts: [props.delegatedSecurityAdminAccountId],
          },
          regions: [Stack.of(this).region],
        },
      ],
      templateBody: Fn.sub(Fs.readFileSync('./src/stacks/security-hub-iam-role.yaml').toString(), {
        RoleName: secHubCrossAccountRoleName,
        ManagementAccountId: Stack.of(this).account,
      }),
    });

    // integrate Security Hub with AWS Organizations
    const securityHubOrganizationAdmin = new SecurityHubOrganizationAdmin(this, 'SecurityHubOrganizationAdmin', {
      adminAccountId: props.delegatedSecurityAdminAccountId,
    });
    securityHubOrganizationAdmin.node.addDependency(secHubIamRoleStackset);

    // designate a home region for Security Hub finding aggregation (ALL REGIONS)
    const securityHubRegionAggregation = new SecurityHubRegionAggregation(this, 'SecurityHubRegionAggregation');
    securityHubOrganizationAdmin.node.addDependency(securityHubOrganizationAdmin);

    // enable Security Hub central configuration
    const securityHubCentralOrganizationConfiguration = new SecurityHubCentralOrganizationConfiguration(
      this,
      'SecurityHubCentralOrganizationConfiguration',
      { secHubCrossAccountRoleArn: secHubCrossAccountRoleArn },
    );
    securityHubCentralOrganizationConfiguration.node.addDependency(securityHubRegionAggregation);

    // create/update Configuration Policy for Security Hub
    const securityHubConfigurationPolicy = new SecurityHubConfigurationPolicy(this, 'SecurityHubConfigurationPolicy', {
      secHubCrossAccountRoleArn: secHubCrossAccountRoleArn,
    });
    securityHubConfigurationPolicy.node.addDependency(securityHubCentralOrganizationConfiguration);

    // associate Configuration Policy with root OU
    const securityHubConfigurationPolicyAssociation = new SecurityHubConfigurationPolicyAssociation(
      this,
      'SecurityHubConfigurationPolicyAssociation',
      { secHubCrossAccountRoleArn: secHubCrossAccountRoleArn },
    );
    securityHubConfigurationPolicyAssociation.node.addDependency(securityHubConfigurationPolicy);
  }
}
