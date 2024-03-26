import { CfnParameter, NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SecurityHubOrganizationAdmin } from '../constructs/securityhub-enable-organization-admin';
import { SecurityHubStandards } from '../constructs/securityhub-enable-standards';
import { SecurityHubMembers } from '../constructs/securityhub-members';
import { SecurityHubRegionAggregation } from '../constructs/securityhub-region-aggregation';

export class SecurityHubStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const auditAccountAccountId = new CfnParameter(this, 'AuditAccountAccountId', {
      type: 'String',
    });

    const secHubCrossAccountRoleName = 'OrganizationAccountAccessRole';
    const secHubCrossAccountRoleArn = `arn:aws:iam::${auditAccountAccountId.valueAsString}:role/${secHubCrossAccountRoleName}`;

    // integrate Security Hub with AWS Organizations
    const securityHubOrganizationAdmin = new SecurityHubOrganizationAdmin(this, 'SecurityHubOrganizationAdmin', {
      adminAccountId: auditAccountAccountId.valueAsString,
    });
    securityHubOrganizationAdmin.id;

    // designate a home region for Security Hub finding aggregation (ALL REGIONS)
    const securityHubRegionAggregation = new SecurityHubRegionAggregation(this, 'SecurityHubRegionAggregation', {
      secHubCrossAccountRoleArn: secHubCrossAccountRoleArn,
      previousRef: securityHubOrganizationAdmin.id,
    });

    // make all accounts in the organization Security Hub members
    const securityHubMembers = new SecurityHubMembers(this, 'SecurityHubMembers', {
      secHubCrossAccountRoleArn: secHubCrossAccountRoleArn,
      previousRef: securityHubRegionAggregation.id,
    });

    // enable Security Hub standards
    new SecurityHubStandards(this, 'SecurityHubStandards', {
      secHubCrossAccountRoleArn: secHubCrossAccountRoleArn,
      previousRef: securityHubMembers.id,
    });

    // enable Security Hub central configuration
    // const securityHubCentralOrganizationConfiguration = new SecurityHubCentralOrganizationConfiguration(
    //   this,
    //   'SecurityHubCentralOrganizationConfiguration',
    //   { secHubCrossAccountRoleArn: secHubCrossAccountRoleArn, secHubRegionAggregationRef: securityHubRegionAggregation.id },
    // );
    // securityHubCentralOrganizationConfiguration.node.addDependency(securityHubRegionAggregation);

    // // create/update Configuration Policy for Security Hub
    // const securityHubConfigurationPolicy = new SecurityHubConfigurationPolicy(this, 'SecurityHubConfigurationPolicy', {
    //   secHubCrossAccountRoleArn: secHubCrossAccountRoleArn,
    // });
    // securityHubConfigurationPolicy.node.addDependency(securityHubCentralOrganizationConfiguration);

    // // associate Configuration Policy with root OU
    // const securityHubConfigurationPolicyAssociation = new SecurityHubConfigurationPolicyAssociation(
    //   this,
    //   'SecurityHubConfigurationPolicyAssociation',
    //   { secHubCrossAccountRoleArn: secHubCrossAccountRoleArn },
    // );
    // securityHubConfigurationPolicyAssociation.node.addDependency(securityHubConfigurationPolicy);
  }
}
