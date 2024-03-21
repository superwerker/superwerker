import path from 'path';
import { NestedStack, NestedStackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SecurityHubOrganizationAdmin } from '../constructs/securityhub-enable-organization-admin';
import { SecurityHubRegionAggregation } from '../constructs/securityhub-region-aggregation';

export class SecurityHubStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    // TODO: Stackset with SecurityHub Role in Audit Account?

    // integrate Security Hub with AWS Organizations
    const securityHubOrganizationAdmin = new SecurityHubOrganizationAdmin(this, 'SecurityHubOrganizationAdmin', {
      adminAccountId: '123456789012',
    });

    // designate a home region for Security Hub finding aggregation (ALL REGIONS)
    const securityHubRegionAggregation = new SecurityHubRegionAggregation(this, 'SecurityHubRegionAggregation');
    securityHubOrganizationAdmin.node.addDependency(securityHubRegionAggregation);

    // enable Security Hub central configuration

    // create/update Configuration Policy for Security Hub

    // associate Configuration Policy with root OU
  }
}
