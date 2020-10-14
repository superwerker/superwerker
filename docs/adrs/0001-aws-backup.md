
# Backups with AWS Backup

### TODO

 - [ ] Spike solution
 - [ ] Spike AWS Config vs. Tag Policies
 - [ ] Decide whether to backup EC2 instances, document decision
 - [ ] Decide whether enabling/disabling particular resource types ("Service Opt-in") by the user should be allowed 

## Context

A well-architected AWS setup includes backups for non-transient resources like RDS/Aurora, DynamoDB, EFS etc. so superwerker should protect users by enabling backups automatically.
Since superwerker prefers the usage of native AWS services, AWS Backup is used.
AWS Backup does not currently support backing up all resources in an AWS account. Either ARNs or Tags have to be specified. A workaround has to be found.

So we need a way to tag all resources which should be backed up automatically. Tag policies come into mind. But Tag Policies do not enforce tags on untagged resources ([docs](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_tag-policies-enforcement.html)).

## Decision

- Use AWS Organizations Backup Policies to enforce Backups across the entire Organization
- Backups of resources are created daily
- The default Backup Vault is used
- Snapshots are protected via Integrity Protection SCP, only AWS Backup role can delete Snapshots 
- Enforce Tags, either
  - Use AWS Config Rule `required-tags` to check if tags have been set on backup-eligible resources, set tag to `daily` if tag is not `daily` or `none` via AWS Config Rules Remediation
  - or AWS Organizations Tag Policies and CW Events to tag resources without backup tag
- Tag name is `superwerker:backup`, only valid value for now is `daily` or `none`, default is `none`
- No cross-region backup right now to keep it simple.
- Opt-out is possible via `supwerker:backup` tag set to `none`

### AWS Config Organizational Rules vs. Conformance Packs vs. StackSets

There are several ways to deploy config rules org-wide.

 - AWS Config Organizational Rules and Conformance Packs have no fault-tolerance. If one Sub-Account does not have a Config Recorder installed, the entire installation fails.
 - Conformance packs need a S3 bucket, which makes the setup more complex
 - Stay consistent with Control tower, since it is currently not using Organizational Config Rules or Conformance Pack

## Consequences

- AWS Backup is set as the preferred backup solution
- Resources are backed up by default
- Opt-out per Resource or per Account/OU can be added later 
