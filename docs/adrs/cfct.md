# Customizations for AWS Control Tower Solutions Implementation

## Context

When extending an AWS Control Tower Landing Zone a customization solution is required in order to e.g. deploy additional infrastructure into the Landing Zones accounts.

[Customizations for AWS Control Tower](https://aws.amazon.com/solutions/implementations/customizations-for-aws-control-tower/) (CFCT) is currently the official customization solution for AWS Control Tower.

## Decision

- CFCT is included as an optional superwerker feature to test adoption - after adoption has been proved tighter integration of CFCT's configuration into superwerker can be explored
- Since no configuration options are enabled initially we
  - disable the pipeline approval
  - configure a new AWS CodeCommit instance as repository with a _main_ as it's deployment branch name
  - use `superwerker-custom-control-tower-configuration` as the name of the repository  
