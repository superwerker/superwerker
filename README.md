# Founopticum

A well-architected, secure, compliant, and maintained AWS Baseline ("Landing Zone") for the rest of us. 

## What's included in the setup?

Founopticum provisions and maintains the following AWS services features:

- AWS Control Tower / AWS SSO
- GuardDuty in all Regions (Delegated Administrator into Audit Account)
- Security Hub (Delegated Administrator into Audit Account) 
- Region Restriction Service Control Policy
- and more to come / to be discussed

## FAQ

### Who is this for?

Founopticum frees its users from the heavy lifting burden of setting up and maintaining a well-architected AWS baseline.

 - Development/Ops teams in startups and SMEs who want a quick start in AWS with all the best practises set up at once.
 - AWS integrators, APN Partners, and freelancers who want to focus on solving customer problems

### How does it work?

Founopticum runs in your own AWS account. You can install it via CloudFormation or AWS Service Catalog. 

### Will you keep this up-to-date?

...

### How can I receive updates?

Either manually by updating the CloudFormation template or via AWS Service Catalog. 

### Which AWS regions are supported?

Since Founopticum builds upon AWS Control Tower, it supports the same regions which Control Tower supports.

### Why not use ...

 - Control Tower
 - AWS Landing Zone
 - My homegrown solution?

Here is the feature matrix:

TBD

## Thanks

 - Ian McKay and his AWS Account Controller
 - [Flo Motlik / theserverlessway.com AWS Baseline](https://github.com/theserverlessway/aws-baseline)
