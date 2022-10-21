from awsapilib import Cloudformation
import os

CREATE = 'Create'
DELETE = 'Delete'
UPDATE = 'Update'


def handler(event, context):
    RequestType = event["RequestType"]

    cf = Cloudformation(os.environ['AWSAPILIB_ROLE_ARN'])

    if RequestType == CREATE:
        cf.stacksets.enable_organizations_trusted_access()

    return {}
