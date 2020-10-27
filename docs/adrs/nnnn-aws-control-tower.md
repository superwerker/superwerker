
# Control Tower (CT) as a foundation for a secure multi-account setup

## Context

AWS proposes multi-account architectures as best practice (see, e.g. [Well-Architected Framework SEC1](https://wa.aws.amazon.com/wat.question.SEC_1.en.html)), so superwerker is following this best practice.

Implementing least privilege for humans (as opposed to, e.g., lambda execution roles) is currently far too complex to be handled sensibly. Therefore giving humans relatively complete access (minus integrity protection via SCPs) but limit this broad access to clearly defined security boundaries (= one or more AWS accounts with specific content/workloads in them) is the only sensible way forward.

Control Tower (CT) is the native service as the foundation for a secure multi-account setup. Since superwerker prefers to use native services whenever possible, it uses CT.

## Decision

 - Since CT has no API yet, automate it via CloudWatch Synthetics (CWS) Canaries
 - To keep it simple, superwerker can be installed into regions that Control Tower supports. Choosing a home region for Control Tower / AWS SSO has no impact on other resources' multi regionality.
 - Update Control Tower to the latest version when installing/updating superwerker to ensure a sane state. We'll live with the risk of unintended upstream changes for now.
 - Since CT uses AWS SSO, it is set as the default login and AWS account switching solution.
 - superwerker promotes using the Control Tower Account Factory for enrolling/vending new accounts
 - Enabling Custom Guardrails: we know they exist but defer the decision (i.e., wait for CT support and APIs)
 - VPC creation: we know the created VPCs are quite useless and inconsistent (e.g., multi-region setups), but we wait until we build a network feature for this.

## Consequences

 - superwerker only supports regions supported by CT
 - CT implies additional costs (e.g., Config Rules), which is covered by our design decision to enable services which negligible costs
 - Using CWS Canaries provides an audit log of the Click Ops because of the screenshots
 - The CT LZ set up/update/repair has to be supervised since it fails sometimes and has to be restarted (TODO)
 - superwerker provides links to how-tos for wiring existing IdPs like GSuite, AzureAD, etc. (TODO)
 
## TODO

 - [ ] How to handle SSO and Users
 - [ ] Document CW Events / SSM Parameters

