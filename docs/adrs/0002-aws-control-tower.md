
# Control Tower (CT) as foundation for a secure multi-account setup

## Context


## Decision

 - Since CT has no API yet, automate it via CloudWatch Synthetics (CWS) Canaries
 - In order to keep it simple superwerker can be installed into regions which Control Tower supports. No multi-region support for now.
 - Update Control Tower to latest version when installing/updating superwerker in order to ensure a sane state
 - Since CT uses AWS SSO, it is set as the default Login and AWS Account switching solution.

### Account Factory 

 - superwerker promotes using the CTAF for enrolling/vending new Accounts

## Consequences

 - superwerker only supports regions supported by CT
 - CT implies additional costs (e.g. Config Rules)
 - Using CWS Canaries provides an audit log of the Click Ops because of the screenshots
 - The CT LZ setup/update/repair has to be supervised since it fails sometimes and has to be restarted (TODO)
 - superwerker provides links to how-tos for wiring existing IdPs like GSuite, AzureAD, etc. (TODO)
 - Since AWS SSO is used, IAM users are deprecated and should only be used for machine users. Key rotation is supervised by Security Hub.
