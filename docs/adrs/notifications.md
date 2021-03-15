# Notifications

## Context

superwerker creates an OpsItem in Systems Manager OpsCenter for emails received by the RootMail feature. Without notifications for new OpsItems, users need to manually check the OpsCenter for new items.

## Decision

- Use CloudWatch Events to trigger an AWS Lambda function whenever a new OpsItem is created.
    - OpsCenter / OpsItem do have support for SNS notifications, but the desired SNS topic Arn needs to be provided explicitly whenever an OpsItem is created. Therefore, we decided against this native feature.
- Publish a message to an SNS topic for every new OpsItem.
- Use native email subscriptions for SNS to notify a specified email address about new messages.
    - We decided against using SES because SNS subscriptions and email verification work out-of-the-box in CloudFormation
- If no email address is provided, no SNS topic is created.

## Consequences

- Users can provide an email address when creating the superwerker CloudFormation stack.
    - We decided against (re-)using the existing RootMail address because critical notifications about an AWS account should not land in an mailbox in the same AWS account.
- Users need to verify the SNS subscription for the provided email address.
- Users will receive an email about every new OpsItem in OpsCenter.
