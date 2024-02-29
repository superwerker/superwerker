# Rollout of Control Tower Landing Zone via Cloudformation

## Context

Since the official release by AWS of the Control Tower [Landing Zone APIs](https://aws.amazon.com/about-aws/whats-new/2023/11/automate-aws-control-tower-zone-operations-apis/) as well as [Cloudformation integration](https://docs.aws.amazon.com/controltower/latest/userguide/lz-apis-cfn-launch.html), we can simplify the rollout of Control Tower and no rely on [awsapilib](https://awsapilib.readthedocs.io/en/latest/usage.html#usage-for-controltower) anymore (also see [Control tower ADR](./control-tower.md)). 

## Decision

- We will create Control Tower Landing Zone via Cloudformation
- All Prerequisites (Accounts, Organisation, IAM resources) will be managed by Cloudformation as well

## Consequences

- Create & Destroy of Landing Zone is handled by Cloudformation allowing us to remove previous workarounds, such as using unoffical APIs 
- We don't need to rely on a event from EventBridge when Control Tower Landing Zone setup is finished. This event was not reliable in the past (only triggered on initial install, not on subsequent installation within an account). Using Cloudformation we can use standard wait condition and dependencies to trigger additional features that rely on completed Landing Zone setup (such as Guardduty or Backup).
- To update existing superwerker installations (v.0.17.2 and previous), [Cloudformation Import](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resource-import.html) needs to be used. This specifically applies to CfnAccount (LogArchive and Audit Account) and the CfnLandingZone itself. See [Upgrade Instructions](../updates/update_0.17.2.md).
- This enables a simplified automated testing setup without any wait conditions or pulling of statuses.
- [Control Tower Updates](https://docs.aws.amazon.com/controltower/latest/userguide/release-notes.html) are enabled by superwerker cloudformation updates