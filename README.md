# superwerker - automated best practices for AWS

[![AWS Quick Start](https://badgen.net/badge/AWS/Quick%20Start/FF9900?1)](https://aws.amazon.com/quickstart/architecture/superwerker)
[![kreuzwerker.de](https://badgen.net/badge/by/kreuzwerker/C62B3F?1)](https://kreuzwerker.de/post/introducing-superwerker)
[![superluminar.io](https://badgen.net/badge/by/superluminar/ff3b61?1)](https://superluminar.io/2021/02/15/superwerker-kostenloser-schnellstart-in-die-aws-cloud/)
[![MIT License](https://badgen.now.sh/badge/License/MIT/blue?1)](https://github.com/superwerker/superwerker/blob/master/LICENSE.md)

> The superwerker open source solution by **AWS Advanced Partners** [kreuzwerker](https://kreuzwerker.de/) and [superluminar](https://superluminar.io/) automates the setup of an AWS Cloud environment with prescriptive best practices. It enables startups and SMBs to focus on their core business - by saving setup and maintenance time and money.

![superwerker](/docs/images/splash.jpg)

## Project state / Roadmap

superwerker is stable and used in production by several customers. The roadmap is currently organized in [projects](https://github.com/superwerker/superwerker/projects).

## Installation guide

[![Installation in a nutshell](https://i.vimeocdn.com/filter/overlay?src0=https%3A%2F%2Fi.vimeocdn.com%2Fvideo%2F1062388452_295x166.webp&src1=http%3A%2F%2Ff.vimeocdn.com%2Fp%2Fimages%2Fcrawler_play.png)](https://player.vimeo.com/video/513105990)


There are two ways to install superwerker:

[![GitHub Release](https://badgen.net/badge/Install/GitHub%20Release/purple?1)](https://github.com/superwerker/superwerker/releases) \
_(the latest stable release - recommended)_

[![AWS Quick Start](https://badgen.net/badge/Install/AWS%20Quick%20Start/FF9900?1)](https://aws.amazon.com/quickstart/architecture/superwerker) \
_(currently slower release frequency)_

### Installation prerequisites

- A dedicated AWS Account with administrative access ([sign up here](https://portal.aws.amazon.com/billing/signup))
- A domain and manageable DNS settings (You can register domains with [Amazon Route53](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/domain-register.html))

### Installation

Installations instructions are available in the [superwerker guide](https://superwerker.awsworkshop.io/installation.html).
    
## What's included in the setup?

In the initial release, superwerker configures the following AWS services and features in a fully automated way:

1. [AWS Control Tower](https://aws.amazon.com/controltower/) and [AWS Single Sign-On](https://aws.amazon.com/single-sign-on/) as the basis for a future-proof multi-account setup
1. [Amazon GuardDuty](https://aws.amazon.com/guardduty/) for automatic detection of possible threats breaches
1. [AWS Security Hub](https://aws.amazon.com/security-hub) to ensure established security standards
1. [AWS Backup](https://aws.amazon.com/backup/) for automated creation of backups
1. Budget alarms for cost control
1. Service control policies to protect the infrastructure from intentional or unintentional mistakes
1. [AWS Systems Manager](https://aws.amazon.com/systems-manager) OpsCenter/Items notification aggregation and incident response handling
1. Secure mailboxes and service catalogue aliases for all root accounts
1. Feature flippers to gradually opt into functionality
1. A dashboard with more information and deep-links to resources, e.g. setting up SSO with existing identity providers, GuardDuty/Security Hub dashboards, AWS account setup

### Say what again? (the non-technical what's included)

AWS provides all the building blocks. superwerker adds the wiring and `how to` so you can start right ahead with a well-architected AWS foundation:

1. Manage multiple AWS accounts and perform access management
2. Sign in to your AWS accounts with your existing login provider (usually your email infrastructure provider, e.g. Office 365 or Google Workspace)
3. Security built-in:
    1. Protect superuser (`root`) access to your AWS accounts
    2. Scanning for best practise violations and active threats against your infrastructure
    3. Backups enabled for all database and file systems
4. Billing best practices built-in: Automatic cost control and budget alarm
5. Low total cost of ownership: native and maintenance-free AWS service are used (no third-party tooling required)
6. Notification centre: aggregates notifications from several services in a single place
7. Gradual roll-out: features can be enabled/disabled individually
8. Living quickstart dashboard with status overview (which features are active?) and actionable links to e.g. the notification center, or your security findings

## Help & Feedback

- Join our [mailing list](https://groups.google.com/forum/#!forum/superwerker/join)
- Chat with us on the [#superwerker](https://og-aws.slack.com/archives/C01CQ34TC93) channel in the OG-AWS Slack ([invite link](http://slackhatesthe.cloud/)).

## FAQ

### Should I use superwerker?

superwerker is ideal for quickly getting started with the AWS Cloud with preconceived decisions based on years of experience. Start-ups and small to medium-sized companies, where time-to-market and financial aspects play an especially important role, can benefit in particular.

As a rule of thumb: if you have no dedicated AWS team or cloud centre of excellence in-house, you should use superwerker.

But also large companies can use superwerker as a basis. Since superwerker is open source, it can also be tailored to individual needs.

### What does superwerker cost?

superwerker itself is free and open source under an MIT licence. Costs may be incurred by the AWS services you set up. Smaller set-ups and test set-ups cost less than $10/month.

You can find more information about the costs on the detailed pricing pages for the services used, e.g. Control Tower, Security Hub, GuardDuty, AWS Backup

### How do I install superwerker?

superwerker uses the proven infrastructure-as-code service AWS CloudFormation for installation. Please have a look at the [installation section](#installation).

### Can I activate and deactivate the features of superwerker individually?

superwerker features can be activated individually. This enables a gradual roll-out and also facilitates installation into an existing AWS set-up.

### How do I receive updates?

We plan to roll-out releases via GitHub releases. The update is then deployed via the current CloudFormation template. You can then perform the update according to the instructions below:

1. Go to the AWS Console
1. Navigate to the CloudFormation service
1. Choose the superwerker stack
1. Choose `Update`
1. Choose `Replace current template`
1. For `Amazon S3 URL`, copy the link to the latest version of the template e.g. "https://superwerker-releases.s3.amazonaws.com/0.13.0/templates/superwerker.template.yaml", the latest version number can be found here: [Github Releases](https://github.com/superwerker/superwerker/releases)
1. Click `Next`
1. Ensure the parameter `QSS3BucketName` is set to `superwerker-releases`
1. Change the parameter `QSS3KeyPrefix` to the current version number e.g. `0.13.0/`
1. Click `Next`
1. Click `Next` again
1. Tick the boxes acknowledging that CloudFormation might create IAM resources such as Roles and Policies

After completion of the stack update, navigate to the superwerker [living documentation](https://console.aws.amazon.com/cloudwatch/home#dashboards:name=superwerker) dashboard for more information.

### Can I use superwerker for existing AWS set-ups?

superwerker is primarily designed for new AWS set-ups and can be used if AWS Control Tower is available in the respective region. superwerker will then try to set up services including Security Hub and GuardDuty. Depending on whether you already have them, you may need to clear the set-up accordingly beforehand.

### Which regions is superwerker available in?

Since superwerker uses AWS Control Tower as a basis, it is available in all regions where Control Tower is supported.

### What is the difference compared to Control Tower/Landing Zone?

AWS Control Tower and Landing Zone also use AWS fundamentally, but leave a lot of free scope. Building on AWS Control Tower, superwerker provides further guide rails and facilitates a quick-start with AWS even further.

### What is the difference compared to AWS Proton, AWS Amplify or AWS Copilot, for example?

AWS Proton, Amplify, and Copilot are tools for developing workloads. superwerker provides a secure AWS foundation in which these tools can be used.

### How can I expand superwerker?

superwerker deliberately offers few parameters for adjustment. It has been designed to coexist with solutions like AWS Control Tower (+ Customizations) or with CloudFormation StackSets. These can be used to customise the AWS set-up.

### If I no longer want to use superwerker, will my AWS set-up stop working?

superwerker uses AWS CloudFormation for installation and updates. If the CloudFormation stack is deleted, the superwerker templates will also be deleted. This can negatively affect the running AWS set-up.

### How does superwerker differ from the Well-Architected Framework?

It’s complementary. You can consider superwerker a “well set-up”. At the same time, the underlying design decisions take into account the pillars of WAF. superwerker pushes the workloads into the Well-Architected direction using certain guardrails.

### Do you have access to our AWS account?

No, superwerker runs exclusively in your AWS account and does not communicate with the internet.

### What happens if AWS offers features of superwerker itself?

superwerker always aims to build on AWS services and features. If a superwerker feature becomes obsolete because AWS releases it as a service or feature itself, we will adapt superwerker.

### Can using superwerker break existing workloads?

Some of the infrastructure that superwerker sets up carries out changes to existing set-ups, for example Control Tower and Service Control Policies, which restrict services and regions. For this reason, we cannot rule out the possibility of impacting existing workloads. We will be happy to help you when evaluating this issue.

### Can superwerker also handle network/VPC and workloads?

superwerker is initially specialised in a basic AWS set-up. An extension to best practices in the network and workload area is planned. Please send us feedback/feature requests in our GitHub repository.

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

- [Ian McKay and his AWS Account Controller](https://github.com/iann0036/aws-account-controller)
- [awsapilib](https://github.com/schubergphilis/awsapilib/)
- [Flo Motlik / theserverlessway.com AWS Baseline](https://github.com/theserverlessway/aws-baseline)
