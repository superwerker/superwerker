# Backups with AWS Backup

## Context

A well-architected AWS setup includes backups for non-transient resources like RDS/Aurora, DynamoDB, EFS etc. so superwerker should protect users by enabling backups automatically.
Since superwerker prefers the usage of native AWS services, AWS Backup is used.

## Decision

- Backups of resources are created daily for 30 days
- The default AWS Backup vault is used per AWS account
- For convince, we auto-create the [Default Service Role for AWS Backup](https://docs.aws.amazon.com/aws-backup/latest/devguide/iam-service-roles.html#default-service-roles)
- Snapshots are protected via integrity protection SCP, only AWS Backup role can delete snapshots
- Use AWS Organizations backup policies to enable backups across the entire AWS Organization
- We use service-managed stack sets to roll out the required roles across the AWS Organization.
- AWS Backup does not currently support backing up all resources of a particular type in an AWS account. Either ARNs or tags have to be specified. Workaround:
  - Set a resource tag `superwerker:backup`. Only valid values are currently `daily` and `none`. Resources with tag set to `daily` are backed up daily defined by the backup policy.
  - AWS Organizations tag policies to tag resources without backup tag
  - Since [tag enforcement has no effect on resources that are created without tags](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_tag-policies-enforcement.html), we set up an AWS Config Rule `required-tags` to check if tags have been set on backup-eligible resources; if not set, set tags via AWS Config Rules Remediation
  - Organizational Config Rules or Conformance Packs could be used to roll out AWS Config rules and/or remediation, but not to roll out the required IAM roles:
    - We don't use AWS Config conformance packs for simplicity: We only have one AWS Config rule, Conformance packs need an additional S3 bucket, and overall they imitate / reimplement parts of CloudFormation StackSets.
    - We don't use AWS Config organizational rules because they don't support rolling out the remediation, so have to roll it out via CloudFormation StackSets anyway.
    - So we use CloudFormation StackSets as unified way for rolling out everything.
- No support for cross-region / cross-account backups (though we know the AWS features exist) currently to keep it simple.
- Since EFS is currently [not supported by AWS Config](https://docs.aws.amazon.com/config/latest/developerguide/resource-config-reference.html), it's currently not automatically tagged and thus not automatically backed up

## Consequences

- Service managed CloudFormation StackSets are enabled
- Resources are backed up by default, opt out per resource is possible by setting the `superwerker:backup` tag to `none`