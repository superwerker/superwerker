# superwerker

A well-architected, secure, compliant, and maintained AWS Baseline ("Landing Zone") for the rest of us. 

## What's included in the setup?

In the initial release, superwerker enables the following AWS services and features in a fully automated way:

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

### Who is this for?

superwerker frees its users from the heavy lifting burden of setting up and maintaining a well-architected AWS baseline.

 - Development/Ops teams in startups and SMEs who want a quick start in AWS with all the best practises set up at once.
 - AWS integrators, APN Partners, and freelancers who want to focus on solving customer problems

### How does it work?

superwerker runs in your own AWS account. You can install it via CloudFormation or AWS Service Catalog. 

### Will you keep this up-to-date?

...

### How can I receive updates?

Either manually by updating the CloudFormation template or via AWS Service Catalog. 

### Which AWS regions are supported?

Since superwerker builds upon AWS Control Tower, it supports the same regions which Control Tower supports.

### Why not use ...

 - Control Tower
 - AWS Landing Zone
 - My homegrown solution?

Here is the feature matrix:

TBD

## Thanks

 - Ian McKay and his AWS Account Controller
 - [Flo Motlik / theserverlessway.com AWS Baseline](https://github.com/theserverlessway/aws-baseline)
