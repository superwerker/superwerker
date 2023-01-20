# Development

This is a guide how we run the development of superwerker.

## Prerequisites

To setup the test infrastructure we need a `superwerker-test-master` AWS Account and install the following components in it:

### MAVM (Management Account Vending Machine)

An instance of the [MAVM](https://github.com/superluminar-io/mavm) needs to be deployed by [hand](https://github.com/superluminar-io/mavm#installation) in `eu-west-1`.

### Testing Infrastructure
Via cloudformation the following stacks need to be deployed in `eu-west-1`:
- A [pipeline](tests/pipeline.yaml)
-  The [build infrastructure](tests/build.yaml)

to have a baseline for a testing pipeline.

## Development

- As mentiond all development takes place in the `superwerker-test-master - 824014778649` AWS account.
- This account also hosts the MAVM.
- To get access to the test environment contact @bracki (superluminar) or @mavogel (kreuzwerker) and provide them your GitHub ID as follows, which they will add to the [superwerker-build](https://eu-west-1.console.aws.amazon.com/cloudformation/home?region=eu-west-1#/stacks) cloudformation stack as the parameter `AllowedGitHubAccountIDs`
```sh
curl -s https://api.github.com/users/<your-GitHub-handle> | jq '.id'
```


### Software
- NodeLTS, which is now 16 and `yarn`
- `python` and `virtualenv`
- `Firefox` with the [container plugin](https://addons.mozilla.org/en-US/firefox/addon/multi-account-containers/)
```sh
brew install node@16 yarn
brew install virtualenv python@3.11
brew install --cask firefox
```

### AWS config

- Make sure to configure your profile in your `~/.aws/config` for example like:
- all <xyz> values will be provided by @bracki or @mavogel 

```
[profile YourSandboxAdmin]
sso_start_url = https://<xyz>.awsapps.com/start#/
sso_region = eu-central-1
sso_account_id = <xyz>
sso_role_name = AWSAdministratorAccess
output = json
 
[profile SuperwerkerTestMaster]
source_profile = YourSandboxAdmin
role_arn = arn:aws:iam::824014778649:role/<xyz>
region = eu-west-1
 
# test via if you get a session
aws sts get-caller-identity --profile SuperwerkerTestMaster --no-cli-pager
```

Now set `SOURCE_PROFILE` to the value from above `SuperwerkerTestMaster`.

### Development/Testing Workflow

Make sure you are in the root directory and run the following steps to setup the dependencies for python
```sh
# create a virtualenv  via 
virtualenv venv
# activate via source 
./venv/bin/activate
# install boto3 via 
pip install boto3
```

#### Create a new dev environment

From your desired branch, here `new-branch`.

**NOTE**: you get the values for the environment variables from the `superwerker-build` stack

```bash
git checkout -b new-branch
git push origin new-branch
ORGANIZATIONS_VENDING_MACHINE_ENDPOINT=... \ 
  TEMPLATE_PREFIX=new-branch/  \
  TEMPLATE_BUCKET_NAME=superwerker-deployment \
  SOURCE_PROFILE=... \
  TEMPLATE_REGION=eu-west-1 \
  ROOT_MAIL_DOMAIN=... \
  SUPERWERKER_REGION=uk-east-1 \
  ./tests/setup-test-env.sh
```

#### Update the test environment

This becomes handy if you directly want to deploy your changes to the test environment:

```bash
SOURCE_PROFILE=... \
  SUPERWERKER_REGION=uk-east-1 \
  AWS_ACCOUNT_ID=... \
  ./tests/update-test-env.sh
```

#### Run tests

This runs the python integration tests. Also run `yarn test` before for the unit tests

```bash
cd tests
ACCOUNT_FACTORY_ACCOUNT_ID=... \
  AWS_DEFAULT_REGION=uk-east-1 \
  AWS_PROFILE=test_account_... \
  python -v -m unittest some_test.py
```

#### Login to the test environment

This uses `firefox` and logs you in to the test account. You get the `AWS_ACCOUNT_ID` as follows
1. In the GitHub PR click in the *Details* link of the `AWS CodeBuild BuildBatch eu-west-1` check
2. Click on the `uuid` of the `Build run`, where you find the `arn` of the `OVMCrossAccountRole`, which contains the AccountID, where the fresh superwerker installation runs.
3. If the build logs are not present any more due to the retention time, then take the `Build number` and look for the details in the [BuildAndTestProject](https://eu-west-1.console.aws.amazon.com/codesuite/codebuild/projects?region=eu-west-1) codebuild project
 
```bash
SUPERWERKER_REGION=uk-east-1 \
  SOURCE_PROFILE=... \
  AWS_ACCOUNT_ID=... \
  ./tests/login-test-env.sh
```

**NOTE**: if this fails with the error `An error occurred (AccessDenied) when calling the AssumeRole operation`, make sure the AWS account is not already closed. You can check this via scanning the DynamoDB table [account](https://eu-west-1.console.aws.amazon.com/dynamodbv2/home?region=eu-west-1#item-explorer?table=account) for the respective `account_id` attribute and take a look at the `account_status` field.

#### Terminate the test environment

If you want to terminate the test environment manually, you can do this as follows:

```bash
ROOT_MAIL_DOMAIN=... \
  SOURCE_PROFILE=... \
  AWS_ACCOUNT_ID=... \
  CAPTCHA_API_KEY=... \
  ./tests/terminate-test-env.sh
```

#### Create a pull request

Creating a PR will trigger the [build job](tests/build.yaml) and run the test suite (if PR creator is in the `AllowedGitHubAccountIDs` as mentioned above).

## Releasing

We are using the [semantic-release-action](https://github.com/cycjimmy/semantic-release-action), so the plugin determines which version it will cut based on the semantic commit messages (see the format [here](https://github.com/semantic-release/semantic-release)) from the last release until now. 

We do not have local git hooks for this repository, however we ensure the correct commit message with a GitHub action. Note: you always modify your commit messages afterwards via [git commit --amend](https://git-scm.com/book/en/v2/Git-Tools-Rewriting-History)

To release a new version from `superwerker`
1. go to the [release action](https://github.com/superwerker/superwerker/actions/workflows/release.yml)
2. presse `Run workflow` on the right-hand side and select the desired branch, which should be `main`
3. :exclamation: If the workflow fails, e.g. while published the assets via `yarn publish-assets`, because an AWS region is not available, then do the following steps
   1. Delete the correspoing [git tag](https://github.com/superwerker/superwerker/tags) in GitHub
   2. and the corresponding [GitHub release](https:/*/github.com/superwerker/superwerker/releases) via the *trash* symbol.
   3. And re-run from Step 1.

**Note:** You might wonder: how do the S3 buckets and publish assets work together? 
> S3Bucket: An Amazon S3 bucket in the same AWS Region as your \[lambda\] function. The bucket can be in a different AWS account.
- We need a bucket in each region (see [details](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-lambda-function-code.html)).
- The buckets follow the schema `superwerker-assets-${AWS:Region}` with public read access. 

More details in the [README](/cdk/README.md) of the `cdk` folder.

### How to test release workflow updates

For not polluting the superwerker repository we have a [sandbox repository](https://github.com/superwerker/releasetests) to test release changes, updates, etc.