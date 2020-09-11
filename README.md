# superwerker - automated best practises for AWS

The superwerker open source solution automates the setup of an AWS Cloud environment with prescriptive best practises.
It enables startups and SMEs to focus on their core business - by saving setup and maintenance time and money.

superwerker is brought to you by AWS Advanced Partners [kreuzwerker](https://kreuzwerker.de/) and [superluminar](https://superluminar.io/).

## Project state / Roadmap

This project is currently under heavy delopment, no preview yet.

[Roadmap and Kanban board](https://github.com/superwerker/superwerker/projects/1)

## What's included in the setup?

In the initial release, superwerker configures the following AWS services and features in a fully automated way:

- AWS Control Tower as the basis for a future-proof multi-account setup
- AWS GuardDuty for automatic detection of possible threats breaches
- AWS Security Hub to ensure established security standards
- AWS Trusted Advisor for service limits checks
- Budget alarms for cost control
- AWS Backup for Automated creation of backups
- Service control policies to protect the infrastructure from intentional or unintentional mistakes
  - E.g. deny use of non allowed AWS regions, deletion of backup copies, deactivation of security features
- Master Setup: VAT-ID/Tax inheritance, currency, IAM Access to Billing, PDF invoices by mail
- Secure mailboxes and service catalogue aliases for all root accounts

## FAQ

More FAQ are currently in the makings.

### Who is this for?

superwerker frees its users from the heavy lifting burden of setting up and maintaining a well-architected AWS baseline.

 - Development/Ops teams in startups and SMEs who want a quick start in AWS with all the best practises set up at once.
 - AWS integrators, APN Partners, and freelancers who want to focus on solving customer problems

## Design decisions

### Low total cost of ownership

 - use native AWS services when possible
 - use functionless / managed runtimes when possible

### Tested code

All features need to have tests. We prefer integration tests which tests the correct end state.

### Idempotent and re-entrant

All steps have to be idempotent / re-entrant so we ensure that processes can be re-run without breaking.

### Event-driven

We use CloudWatch Events where possible and decouple steps.

### Forward compability and adoption

As soon as AWS releases a feature/service which makes parts of superwerker obsolete, we will adopt. 
In an ideal world this project does have to exist.


## Thanks

 - Ian McKay and his AWS Account Controller
 - [Flo Motlik / theserverlessway.com AWS Baseline](https://github.com/theserverlessway/aws-baseline)
