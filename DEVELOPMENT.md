# Development

## Prerequisites

### MAVM (Management Account Vending Machine)

TBD

## Development

### How to test release workflow updates
For not polluting the superwerker repository we have a [sandbox repository](https://github.com/superwerker/releasetests) to 
test release changes, updates, etc.

## Testing branches before merging to main

superwerker provides a [CodeBuild job](tests/build.yaml) which can be used to test branches before merging changes to the `main` branch. The CodeBuild job uses the same test infrastructure as the pipeline, so it should be pretty safe to merge a branch after a successful CodeBuild job run.

The CodeBuild job is started if a commit message includes `[CodeBuild]` and is authored by one of the allowed GitHub user ids.

### Usage

1. Deploy the [CodeBuild CloudFormation template](tests/build.yaml)
2. Run the build
```shell
cd tests
CODEBUILD_PROJECT_NAME=<codebuild_project_name_from_above_cloudformation_stack> SOURCE_PROFILE=<source_profile> ./start-build.sh
```

#### Update CodeBuild for PR Test

```bash
$ > aws cloudformation deploy --region eu-west-1 \
    --template-file ./tests/build.yaml \
    --stack-name superwerker-build \
    --capabilities CAPABILITY_IAM
```