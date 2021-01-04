
# Budget - Report and Alerting (_BRA_)

## Context

In it's current form, superwerker provides a rudimentary budget reporting and alerting that leverages a dynamic forecast of existing usage patterns. Currently Cost and Usage (_CUR_) reports do not provide a basic "what am I spending currently and how does the spend develop" report which superwerker aims to substitute with this feature.

## Decision

 - BRA starts with an initial budget of 100 USD
 - At the beginning of every month, this budget is replaced by a rolling average of the last three months
 - A CUR budget alert is created using 100% of the forecasted rolling average budget - this implements a basic warning of "we spend more than usual (= the rolling average of the last three months)"
 - We are currently not implementing overrides / parameterization for this feature - we need to test initially if the logic of this feature is sufficient before adding more features
 - We are ignoring credits in the BRA in order to reflect the actual usage, not the actual spend - in situations where customers are burning credits we nevertheless want to create an awareness of cost baselines as soon as possible
