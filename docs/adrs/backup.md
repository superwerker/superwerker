# Backups with AWS Backup

## Context

A well-architected AWS setup includes backups for non-transient resources like RDS/Aurora, DynamoDB, EBS etc. so superwerker should protect users by enabling backups automatically.
Since superwerker prefers the usage of native AWS services, AWS Backup is used.

## Decision

- Backups of resources are created daily for 30 days
- The default AWS Backup vault is used per AWS account
- For convenience, we auto-create the [Default Service Role for AWS Backup](https://docs.aws.amazon.com/aws-backup/latest/devguide/iam-service-roles.html#default-service-roles)
- Snapshots are currently not protected via integrity protection SCP, only AWS Backup role should delete snapshots. This is descoped for now. #120
- Use AWS Organizations backup policies to enable backups across the entire AWS Organization
- We use service-managed stack sets to roll out the required resources across the AWS Organization.
- AWS Backup does not currently support backing up all resources of a particular type in an AWS account. Either ARNs or tags have to be specified. Workaround:
  - Set a resource tag `superwerker:backup` to valid values of `daily` or `none`. Resources with tag set to `daily` are backed up daily defined by the backup policy. AWS Organizations tag policies to enforce `superwerker:backup` is set to valid values.
  - Since [tag enforcement has no effect on resources that are created without tags](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_tag-policies-enforcement.html), we set up an AWS Config Rule `required-tags` to check if tags have been set on backup-eligible resources; if not set, set tags via AWS Config Rules Remediation
  - Organizational Config Rules or Conformance Packs can be used to roll out AWS Config rules and/or remediation, but not to roll out the required IAM roles, so:
    - We use CloudFormation StackSets for rolling out required IAM roles in sub-accounts.
    - We use AWS Config organizational conformance packs to roll out AWS Config rules and remediation since rolling out AWS Config rules via StackSets would lead to the following race condition: once a new sub-account is enrolled, the stack set would immediately start to roll out AWS Config rules to the new sub-account, but this would fail since the AWS Config recorder would not yet have been created by Control Tower.
    - Om the other hand, conformance packs wait until the AWS config recorder is created before rolling out AWS Config rules and remediation
    - Conformance packs provide integrity protection of AWS config rules and remediation configs out of the box.
    - Trade-offs:
      - We are aware that conformance packs need an additional S3 bucket, and overall they imitate / reimplement parts of CloudFormation StackSets.
      - The conformance pack tries to enable Config rules in all sub-accounts. Existing sub-accounts must have an enabled AWS config recorder, at least at superwerker installation time, otherwise the installation would fail.
    - We don't use AWS Config organizational rules because they don't support rolling out the remediation.
- No support for cross-region / cross-account backups (though we know the AWS features exist) currently to keep it simple.
- Since EFS is currently [not supported by AWS Config](https://docs.aws.amazon.com/config/latest/developerguide/resource-config-reference.html), it's currently not automatically tagged and thus not automatically backed up
- Since AWS Config Rule with compliance resource type `AWS::RDS::DBCluster` and source identifier `REQUIRED_TAGS` [are currently not supported](https://docs.aws.amazon.com/config/latest/developerguide/required-tags.html), RDS Clusters are currently not automatically tagged and thus not automatically backed up.
