# Using the CDK as the default tool for superwerker

## Context

Writing plain CLoudFormation templates is cumbersome, so the CDK was invented.
According to the superwerker design guidelines, only native AWS services and tools should be used, so using the CDK currently the best option (vs. Terrform, Pulumi etc.). CDK is also supported by the AWS QuickStart team.

## Decision

 - CDK is used for all further development. Plain CloudFormation is deprecated. Plain CloudFormation templates should be moved over to CDK over time.
 - Trigger CDK deployment with an CloudFormation Custom Resource, since CodeBuild does not support GitHub triggers without authorization, and we don't want to have to set up a GitHub webhook.
 - Delete the CDK stack when the superwerker main CloudFormation stack is deleted.
 - Deploy directly from GitHub to avoid further packaging steps.
 - Determine version to be deployed from `QSS3KeyPrefix` in the superwerker main CloudFormation stack, for now, so we don't need to introduce a new version parameter top be filled out by humans, e.g. when updating superwerker via CloudFormation
 - For development and PR tests introduce a (hidden) parameter `OverrideSourceVersion` to override the git version to be deployed.
 - Don't deploy CDK locally in development, since this would turn in to [NodeJS/AWS SSO-not-supported hassle](https://github.com/aws/aws-cdk/issues/5455)

## Implications

- Depedency on GitHub is introduced.
- The AWS Quickstart installation path needs a special way to determine its GitHub source.
- Updating superwerker via the Quickstart is currently not supported since the `QSS3KeyPrefix` does not change and so the CDK deployment is not triggered. But the official superwerker documentation does not mention updating via the Quickstart Path anyway. 
