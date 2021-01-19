# Living Documentation

## Context

A dashboard with more information and deep-links to resources, e.g. setting up SSO with existing identity providers, GuardDuty/Security Hub dashboards, AWS account setup

## Decision

- Create a CW Dashboard called `suerwerker` in the AWS management account. The CW dashboard a) ensures a deep link which can be used to link from the README.md b) ensures user is authorized.
- Display DNS delegation state and instructions
- Refresh dashboard on events
- All other features (#20) scoped out from 1.0 release

## Consequences

- CW Dashboards don't support auto-reload for text widgets, so browser reload has to be done by the user.
