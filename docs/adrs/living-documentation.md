# Living Documentation

## Context

A dashboard with more information and deep-links to resources, e.g. setting up SSO with existing identity providers, GuardDuty/Security Hub dashboards.

## Decision

- Create a CloudWatch Dashboard in the AWS management account. The CW dashboard a) ensures a deep link which can be used to link from the README.md and b) ensures the user is authorized to access the information.
- Display DNS delegation state and setup instructions
- Data is fetched when the dashboard is opened or refreshed 

## Consequences

- CW Dashboards with lambda invocations once require approval of user
