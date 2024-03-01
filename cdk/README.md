# CDK migration

This holds code for the issue https://github.com/superwerker/superwerker/issues/328

# 1. CDK bootstrap

For CDK/Cloudformation to deploy an S3 bucket has to exist. Because Cloudformation can only
deploy code from buckets as the same region as the Cloudformation deployment we need a bucket in each region (see [details](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-lambda-function-code.html)).

The bucket is called `superwerker-assets-${AWS:Region}` with public read access. 

Make sure you have the latest `boto3` version and have enabled all AWS regions.

To create the buckets run:

```shell
python3 -m venv venv
venv/bin/pip install -r requirements.txt
# Now paste credentials for the superwerker test master account
venv/bin/python cdk-bootstrap.py

# The output should look like this
Deploying to region=af-south-1 with cmd=['aws', 'cloudformation', 'deploy', '--stack-name', 'superwerker-cdk-bootstrap', '--region', 'af-south-1', '--template-file', '/Users/jan/Code/superwerker/tests/cdk-bootstrap.yaml']
b'\nWaiting for changeset to be created..\n\nNo changes to deploy. Stack superwerker-cdk-bootstrap is up to date\n'
... [OMITTED FOR BREVITY]
Deploying to region=us-west-2 with cmd=['aws', 'cloudformation', 'deploy', '--stack-name', 'superwerker-cdk-bootstrap', '--region', 'us-west-2', '--template-file', '/Users/jan/Code/superwerker/tests/cdk-bootstrap.yaml']
b'\nWaiting for changeset to be created..\n\nNo changes to deploy. Stack superwerker-cdk-bootstrap is up to date\n'
```

# 2. CDK development

The project layout is stolen from [projen](https://projen.io/api/API.html#projen-awscdk-awscdktypescriptapp).
All CDK code resides in the folder `cdk/`.

We have one stack construct per original stack, e.g. `SuperwerkerStack / superwerker.template.yaml`, `BudgetStack / budget.yaml` etc.

# 3. Typescript development

We are using yarn as package manager.

`yarn install`

Run tests.

`yarn jest`

Debug Tests using Visual Studio Code.

1. Open Test File
2. Open "Run and Debug"
3. Choose launch configuration "Run Current Jest Test"
4. Typescript compile will run in the background and watch for changes.
4. Set breakpoints and debug.




