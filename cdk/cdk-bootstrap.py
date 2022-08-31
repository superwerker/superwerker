"""
This is a poor man's CDK bootstrap. It will create an S3 bucket in each AWS region so that Lambda can deploy code.
This works around the limitation described here:
https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-lambda-function-code.html#cfn-lambda-function-code-s3bucket
"""
import boto3
from boto3.session import Session
import subprocess
import os



class DeployError(Exception):
    pass


cfn = boto3.client("cloudformation")
s = Session()
regions = s.get_available_regions('s3')

template_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cdk-bootstrap.yaml")
for region in regions:
    cmd = ["aws", "cloudformation", "deploy",
             "--stack-name", "superwerker-cdk-bootstrap",
             "--region", region,
             "--template-file", template_file,
             ]
    print("Deploying to region={0} with cmd={1}".format(region, cmd))
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode != 0:
        raise DeployError(p.stderr)
    print(p.stdout)

