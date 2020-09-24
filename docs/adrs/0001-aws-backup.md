
# Backups with AWS Backup

## Status

proposed

### TODO

 - [ ] Spike solution
 - [ ] Spike AWS Config vs. Tag Policies
 - [ ] Decide whether opt-out mechanism is 

## Context

A well-architected AWS setup includes backups for non-transient resources like RDS/Aurora, DynamoDB, EFS etc. so superwerker should protect users by enabling backups automatically.
Since superwerker prefers the usage of native AWS services, AWS Backup is used.
AWS Backup does not currently support backing up all resources in an AWS account. Either ARNs or Tags have to be speficied. A workaround has to be found.

## Decision

- Use AWS Organizations Backup Policies to enforce Backups across the entire Organization
- Backups of resources are created daily
- The default Backup Vault is used
- Snapshots are protected via Integrity Protection SCP, only AWS Backup role can delete Snapshots 
- Enforce Tags, either
  - Use AWS Config Rule `required-tags` to check if tags have been set on backup-eligible resources, set tags via AWS Confug Rules Remediation
  - or AWS Organizations Tag Policies and CW Events to tag resources without backup tag
- Tag name is `superwerker:backup`, only valid value for now is `daily`
- No cross-region backup right now to keep it simple.

## Consequences

- AWS Backup is set as the preferred backup solution
- Resources are backed up by default
- Opt-out per Resource or per Account/OU can be added later 
