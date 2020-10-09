
# GuardDuty (GD) for threat detection

## Context

superwerker provides a secure baseline and configures security related services by default.
GD is a native AWS service to find possible security threats and breaches. 

## Decision

 - Use delegated administrator feature 
 - Enable GD for existing Control Tower core accounts (master, Audit, Log Archive)
 - Delegate into Control Tower Audit account, since Control Tower also delegates AWS Config Rules Compliance findings into the Audit Account
 
## Consequences

 - For an aggregated view, superwerker users have to log into the Audit Account. 
 - Findings are aggregated in Security Hub
 - Enrolled AWS accounts cannot leave or disable GD
