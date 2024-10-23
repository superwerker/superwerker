# close-org-accounts-cdk

This solution provides a simple lambda and attempts to close AWS Accounts located in the `Suspended` OU on a schedule.
It is needed for keeping the testing enviornment clean due to the AWS Account closing limit.

# requirements
- node/npm, aws cdk cli


# Setup new account
get credentials form cloudshell via create-iam-user.sh

```
npm install
cdk bootstrap
cdk synth
cdk deploy
```