# Development

## Prerequisites

### MAVM (Management Account Vending Machine)

An instance of the [MAVM](https://github.com/superluminar-io/mavm) needs to be deployed.

### Testing Infrastructure

 - A [pipeline](tests/pipeline.yaml) needs to be deployed.
 - The [build infrastructure](tests/build.yaml) needs to be deployed.

## Development

All development takes place in the `superwerker-test-master - 824014778649` AWS account.
This account also hosts the MAVM.
To get access to the test environment contact @bracki or @sbstjn.

Make sure to configure your profile in your `~/.aws/config` for example like:

```
[profile superwerker-test-master]
source_profile = <your profile>
role_arn = <role to access account>
```

Now set `SOURCE_PROFILE` to the value you chose above.

### Development/Testing Workflow

#### Create a new dev environment

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

```bash
SOURCE_PROFILE=... \
  SUPERWERKER_REGION=uk-east-1 \
  AWS_ACCOUNT_ID=... \
  ./tests/update-test-env.sh
```

#### Run tests

```bash
cd tests
ACCOUNT_FACTORY_ACCOUNT_ID=... \
  AWS_DEFAULT_REGION=uk-east-1 \
  AWS_PROFILE=test_account_... \
  python -v -m unittest some_test.py
```

#### Login to the test environment

```bash
SUPERWERKER_REGION=uk-east-1 \
  SOURCE_PROFILE=... \
  AWS_ACCOUNT_ID=... \
  ./tests/login-test-env.sh
```

#### Terminate the test environment

```bash
ROOT_MAIL_DOMAIN=... \
  SOURCE_PROFILE=... \
  AWS_ACCOUNT_ID=... \
  CAPTCHA_API_KEY=... \
  ./tests/terminate-test-env.sh
```

#### Create a pull request

Creating a PR will trigger the [build job](tests/build.yaml) and run the test suite (if PR creator is in the allow-list).

### How to test release workflow updates

For not polluting the superwerker repository we have a [sandbox repository](https://github.com/superwerker/releasetests) to test release changes, updates, etc.
