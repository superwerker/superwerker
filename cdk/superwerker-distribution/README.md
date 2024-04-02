# Superwerker Distribution

Superwerker is published as ready to use cloudformation template that opens in the user's cloudformation console.
For this to work we need to provide the templates in each AWS region superwerker should be installable.

Use the `cdk-bootstrap.py` to create the S3 buckets in each region. Please be aware that the script is not idempotent, so if you want to add regions please comment out the ones which already have an existing bucket.

There is one more bucket called `superwerker-release` that stores the main root superwerker template and which references the nested templates. This one is created manually.

The publishing of new versions is done via the `release.yml` Github action automatically.

# Run cdk-bootsrap.py

Make sure you have the latest `boto3` version and have enabled all AWS regions.

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