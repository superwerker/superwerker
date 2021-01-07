# superwerker - automated best practises for AWS

The superwerker open source solution automates the setup of an AWS Cloud environment with prescriptive best practises.
It enables startups and SMBs to focus on their core business - by saving setup and maintenance time and money.

superwerker is brought to you by AWS Advanced Partners [kreuzwerker](https://kreuzwerker.de/) and [superluminar](https://superluminar.io/).

## Project state / Roadmap

This project is currently under heavy development. We are working towards [1.0 milestone](https://github.com/superwerker/superwerker/milestone/1).

There is a [Long term roadmap and list of ideas](https://github.com/superwerker/superwerker/projects/1) as well. Feel free to comment and add ideas.

## Quick install

You can install the current `main` branch via CloudFormation in the following AWS regions:

 - [🇪🇺 eu-west-1](https://console.aws.amazon.com/cloudformation/home?region=eu-west-1#/stacks/quickcreate?stackName=superwerker&templateURL=https://superwerker-deployment.s3.amazonaws.com/main/components/superwerker.yaml&param_TemplateUrlPrefix=https://superwerker-deployment.s3.amazonaws.com/main)
 - [🇺🇸 us-east-1](https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?stackName=superwerker&templateURL=https://superwerker-deployment.s3.amazonaws.com/main/components/superwerker.yaml&param_TemplateUrlPrefix=https://superwerker-deployment.s3.amazonaws.com/main)
 - [🇺🇸 us-east-2](https://console.aws.amazon.com/cloudformation/home?region=us-east-2#/stacks/quickcreate?stackName=superwerker&templateURL=https://superwerker-deployment.s3.amazonaws.com/main/components/superwerker.yaml&param_TemplateUrlPrefix=https://superwerker-deployment.s3.amazonaws.com/main)
 - [🇺🇸 us-west-2](https://console.aws.amazon.com/cloudformation/home?region=us-west-2#/stacks/quickcreate?stackName=superwerker&templateURL=https://superwerker-deployment.s3.amazonaws.com/main/components/superwerker.yaml&param_TemplateUrlPrefix=https://superwerker-deployment.s3.amazonaws.com/main)
 - [🇦🇺 ap-southeast-2](https://console.aws.amazon.com/cloudformation/home?region=ap-southeast-2#/stacks/quickcreate?stackName=superwerker&templateURL=https://superwerker-deployment.s3.amazonaws.com/main/components/superwerker.yaml&param_TemplateUrlPrefix=https://superwerker-deployment.s3.amazonaws.com/main)

## What's included in the setup?

In the initial release, superwerker configures the following AWS services and features in a fully automated way:

- AWS Control Tower and SSO as the basis for a future-proof multi-account setup
- AWS GuardDuty for automatic detection of possible threats breaches
- AWS Security Hub to ensure established security standards
- AWS Backup for automated creation of backups
- Budget alarms for cost control
- Service control policies to protect the infrastructure from intentional or unintentional mistakes, e.g. deny use of non allowed AWS regions, deletion of backup copies, deactivation of security features
- Management account Setup: VAT-ID/Tax inheritance, currency, IAM Access to Billing, PDF invoices by mail
- Systems Manager OpsCenter/Items notification aggregation and incident response handling
- Secure mailboxes and service catalogue aliases for all root accounts
- Feature flippers to gradually opt into functionality
- A dashboard with more information and deep-links to resources, e.g. setting up SSO with existing identity providers, GuardDuty/Security Hub dashboards, AWS account setup

### Say what again? (the non-technical what's included)

AWS provides all the building blocks. superwerker adds the wiring and "how to" so you can start right ahead with a well-architected AWS foundation:

- Manage multiple AWS accounts and perform access management
- Sign in to your AWS accounts with your existing login provider (usually your email infrastructure provider, e.g. Office 365 or Google Workspace)
- Security built-in:
  - Protect superuser ("root") access to your AWS accounts
  - Scanning for best practise violations and active threats against your infrastructure
  - Backups enabled for all database and file systems
- Billing best practices built-in:
  - Automatic cost control and budget alarms
  - Prevents your from using inappropriate AWS regions
- Low total cost of ownership: native and maintenance-free AWS service are used (no third-party tooling required)
- Notification centre: aggregates notifications from several services in a single place
- Gradual roll-out: features can be enabled/disabled individually
- Living quickstart dashboard with status overview (which features are active?) and actionable links to e.g. the notification center, or your security findings

## Help & Feedback

 - Join our [mailing list](https://groups.google.com/forum/#!forum/superwerker/join)
 - Chat with us on the [#superwerker](https://og-aws.slack.com/archives/C01CQ34TC93) channel in the OG-AWS Slack ([invite link](http://slackhatesthe.cloud/)).

## FAQ

More FAQ are currently in the makings.

### Who is this for?

superwerker frees its users from the heavy lifting burden of setting up and maintaining a well-architected AWS baseline.

 - Development/Ops teams in startups and SMEs who want a quick start in AWS with all the best practises set up at once.
 - AWS integrators, APN Partners, and freelancers who want to focus on solving customer problems

## Design decisions

### Forward compability and adoption

As soon as AWS releases a feature/service which makes parts of superwerker obsolete, we will adopt.
In an ideal world this project would not have to exist.

### Low total cost of ownership

 - use native AWS services when possible
 - use functionless / managed runtimes when possible
 - whenever the cost of a service or option (e.g. logging to S3 as opposed to logging to CloudWatch Logs) is negligible it will be added without opt-out

Preferred services: CloudFormation, Systems Manager Parameter Store / Automation, Lambda, CodePipeline / Build

### Tested code

All features need to have tests. We prefer integration tests which tests the correct end state. This usually results in the use of real AWS APIs for tests and no mocks.

### Idempotent and convergent

All code has to be idempotent so we ensure that tasks can be re-run without breaking and without changing the result.
All code has to be convergent so we ensure that tasks which have been interrupted formerly can re-run and converge to the final state.

### Event-driven

We use CloudWatch Events where possible in order to decouple architecture. We acknowledge this decision makes end-to-end testing harder sometimes.

## Thanks

 - Ian McKay and his AWS Account Controller
 - [Flo Motlik / theserverlessway.com AWS Baseline](https://github.com/theserverlessway/aws-baseline)
