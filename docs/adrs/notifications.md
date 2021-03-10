# Notifications

## Context

superwerker creates an OpsItem in Systems Manager OpsCenter for emails received by the RootMail featured. Without notifications for new OpsItems, users need to manually check the OpsCenter for new items.

## Decision

- Use CloudWatch Events to trigger an AWS Lambda function whenever a new OpsItem is created.
- Publish a message to an SNS topic for every new OpsItem.
- Use native email subscriptions for SNS to notify a specified email address about new messages.
- If no email address is provided, no SNS topic is created.

## Consequences

- Users can provide an email address when creating the superwerker CloudFormation stack.
- Users need to verify the SNS subscription for the provided email address.
- Users will receive an email about every new OpsItem in OpsCenter.
