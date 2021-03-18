# Notifications

## Context

superwerker creates an OpsItem in Systems Manager OpsCenter for each email received by the [RootMail](rootmail.md) feature. Without notifications for new OpsItems, users need to check the OpsCenter for new items manually and might miss important information regarding their AWS accounts and resources.

## Decision

- Use CloudWatch Events to trigger an AWS Lambda function whenever a new OpsItem is created.
    - OpsCenter / OpsItem supports SNS notifications, but the desired SNS topic Arn needs to be provided explicitly whenever an OpsItem is created. Therefore, we decided against this native feature.
- Publish a message to an SNS topic for every new OpsItem.
 - Use SNS, since subscriptions and email verification work out-of-the-box with CloudFormation tooling.
 - Use native email subscriptions for SNS to notify a specified email address about new messages.
 - We decided against using SES because for email notifications since this would lead to several additional steps like verifying sender and recipient domains or email addresses.
- We decided against (re-)using the existing root email address of the management AWS account since we would need to keep this in sync with the SNS subscription (because the management account root email adress can be changed). And we wanted to keep the notification feature simple.
- If no email address is provided, no SNS topic is created.

## Consequences

- Users can provide an email address for notifications when creating the superwerker CloudFormation stack.
- Users need to verify the SNS subscription for the provided email address.
- Users will receive an email about every new OpsItem in OpsCenter.
- Users need to take care of handling OpsItems (e.g., close them).
- SNS email subscriptions do not allow the full range of email capabilities/customizations (which SES would).
