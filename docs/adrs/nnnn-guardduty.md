
# GuardDuty (GD) for threat detection

## Context

superwerker provides a secure baseline and configures security related services by default.
Since GD is a native AWS service to find possible security threats and breaches, superwerker enables it for all AWS accounts. 

## Decision

 - Use delegated administrator feature 
 - Delegate Administrator into Control Tower `Audit` account, since Control Tower also delegates AWS Config Rules Compliance findings into the Audit Account
 - Enable GD for existing Control Tower core accounts (master, Audit, Log Archive)
 - Use Control Tower `Setup/UpdateLandingZone` Lifecycle events to start the setup of Delegated Administrator
 
## Consequences

 - For an aggregated view, superwerker users have to log into the Audit Account. 
 - Findings are aggregated in Security Hub
 - Enrolled AWS accounts cannot leave or disable GD (feature of Delegated Administeator)
 - "Only" S3, EC2 and IAM are currently covered by GD.


## TODO

 - [ ] Should we enable [S3 data protection](https://aws.amazon.com/blogs/aws/new-using-amazon-guardduty-to-protect-your-s3-buckets/) by default?
