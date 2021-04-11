# Development

## Prerequisites

### MAVM (Management Account Vending Machine)

TBD

## Development

TBD

## Testing branches before merging to main

superwerker provides a [CodeBuild job](tests/build.yaml) which can be used to test branches before merging changes to the `main` branch. The CodeBuild job uses the same test infrastructure as the pipeline, so it should be pretty safe to merge a branch after a successful CodeBuild job run.

This can also be seen as preparation for [PR tests](https://github.com/superwerker/superwerker/issues/136).

### Usage

1. Deploy the [CodeBuild CloudFormation template](tests/build.yaml)
2. Run the build
```shell
cd tests
CODEBUILD_PROJECT_NAME=<codebuild_project_name_from_above_cloudformation_stack> SOURCE_PROFILE=<source_profile> ./start-build.sh
```