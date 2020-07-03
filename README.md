# Founopticum

A well-architected, secure, compliant, and maintained AWS Baseline ("Landing Zone") for the rest of us. 

## What's included in the setup?

Founopticum provisions and maintains the following AWS 

- AWS Control Tower / AWS SSO
- AWS Config Rules in all given Regions
- GuardDuty in all Regions (Delegated Administrator into Audit Account)
- Security Hub (Delegated Administrator into Audit Account) 
- IAM Access Advisor (Delegated Administrator into Audit Account)
- Region Restriction Service Control Policy
- Trusted Advisor Notifications
- AWS Backup


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

### Why not use ...

 - Control Tower
 - AWS Landing Zone
 - My homegrown solution?
 
## Thanks

 - Ian McKay and his AWS Account Controller
 - [Flo Motlik / theserverlessway.com AWS Baseline](https://github.com/theserverlessway/aws-baseline)