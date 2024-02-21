# Superwerker Distribution

Superwerker is published as ready to use cloudformation template that opens in the user's cloudformation console.
For this to work we need to provide the templates in each AWS region superwerker should be installable.

Use the `cdk-bootstrap.py` to create the S3 buckets in each region. Please be aware that the script is not idempotent, so if you want to add regions please comment out the one which already have an existing bucket.

There is one more bucket called `superwerker-release` that stores the main root superwerker template and which references the nested templates. This one is created manually.

The publishing of new versions is done via the `release.yml` Github action automatically.