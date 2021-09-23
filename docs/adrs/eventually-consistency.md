# Eventual consistency and convergence

## Context 

CloudFormation is the base service to roll out superwerker. It's robust and maintenance-free. It also allows solutions to be installable via one-click links and superwerker being available as an AWS QuickStart.

superwerker is currently consisting of nested CloudFormation stacks, so a rollback of one sub-stack due to a failure would result in the entire creation or update of the installation to fail.

Plain CloudFormation cannot handle the following scenarios, which are common for superwerker: 

-  intermittent failures happen all the time in the cloud, e.g., API calls might have to retried until the system is in the expected state
- Another scenario is the deployment into brownfield environment where resources might already exist and manual cleanup needs to be done first
- A third scenario is where existing resources need to be imported into CloudFormation 
- (superwerker) features which need pre- and post-processing outside of CloudFormation which otherwise would need to be maintained with custom resources
- creating and cleaning resources for one-time tasks, e.g. setting up Control Tower or service managed CFN stack sets

## Solution

 - Thin wrapper around CloudFormnation
 - Converge to the desired state
 - AWS Config Rules + Remediation (via SSM automatiom)
 - CloudFormation resources are rolled out in SSM Automation remediation (if any)

 - AWS Config recorder, delivery channel, and S3 Bucket are installed into the management AWS account so that AWS Config works. S3 Bucket is set up with a lifecycle policy to remove objects asap, since the Config delivery channel is only needed to have AWS Config working.
 
## Consequences

- AWS Config recorder, delivery channel, and S3 in the Management account induce small amount of costs (24 hours * 30 days * 0,003$ per item recorded = $2,16?). But do custom periodic rules really cost money?
