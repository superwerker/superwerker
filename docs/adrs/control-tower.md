# Control Tower (CT) as a foundation for a secure multi-account setup

**Note:** This is outdated and partially replaced by [Control Tower Cloudformation ADR](./control-tower-cloudformation.md)

## Context

AWS proposes multi-account architectures as best practice (see, e.g. [Well-Architected Framework SEC1](https://wa.aws.amazon.com/wat.question.SEC_1.en.html)), so superwerker is following this best practice.

Implementing least privilege for humans (as opposed to, e.g., lambda execution roles) is currently far too complex to be handled sensibly. Therefore giving humans relatively complete access (minus integrity protection via SCPs) but limit this broad access to clearly defined security boundaries (= one or more AWS accounts with specific content/workloads in them) is the only sensible way forward.

Control Tower (CT) is the native service as the foundation for a secure multi-account setup. Since superwerker prefers to use native services whenever possible, it uses CT.

## Decision

- ~~Since CT has no API yet, automate it via [awsapilib](https://awsapilib.readthedocs.io/en/latest/usage.html#usage-for-controltower)~~
- To keep it simple, superwerker can be installed into regions that Control Tower supports. Choosing a home region for Control Tower / AWS SSO has no impact on other resources' multi regionality.
- Since CT uses AWS SSO, it is set as the default login and AWS account switching solution.
- superwerker promotes using the Control Tower Account Factory for enrolling/vending new accounts
- Enabling additional CT Guardrails: we know they exist but defer the decision (i.e., wait for CT support and APIs)
- VPC creation: we know the created VPCs are quite useless and inconsistent (e.g., multi-region setups), but we wait until we build a network feature for this.

## Consequences

- superwerker only supports regions supported by CT
- CT implies additional costs (e.g., Config Rules), which is covered by our design decision to enable services which negligible costs
- The CT LZ set up/update/repair has to be supervised since it fails sometimes and has to be restarted -> #61
- superwerker provides links to how-tos for wiring existing IdPs like Google Workspace, AzureAD, etc. -> #20
