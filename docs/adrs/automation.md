# Automation of administration tasks

## Context

Administrating an AWS account landscape involves common tasks. superwerker needs to have an opinionated interface to handle these repetitive tasks.

## Decision

- Use [AWS Systems Manager Automation](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-automation.html) for common tasks
  - Automations allow orchestration of multiple steps for a single task
  - Automations have a simple UI (for parameters) provided by AWS
- Configure least-privilege IAM roles for every Automation
- Use hard-coded names for Automations to have fixed URLs for deep linking
