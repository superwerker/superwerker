# AWS Security Hub (SH) for central security alert management, checks and mitigation

## Context

Since Security Hub is a native AWS service for central security alert management, checks and mitigation, superwerker enables it for all AWS accounts.

## Decision

- Enable SH for existing Control Tower core accounts (master, Audit, Log Archive) and all future member accounts
- Use Control Tower `Setup/UpdateLandingZone` Lifecycle events to start the invite setup for SH
- The delegated administrator feature is currently not supported by Lambda and/or SSM Automation runtimes - since upgrading the current mechanism to this feature as soon as it's available is officially supported we're postponing this (#70); this subsequently requires us to implement integrity protection
- SH out-of-the-box complains about a lot of security check issues - this has been scoped out from 1.0 (#99)

## Consequences

- For an aggregated view, superwerker users have to log into the Audit Account.
- Enrolled AWS accounts cannot leave or disable SH (feature of our integrity protection)
