from awsapilib import Cloudformation
import os

CREATE = 'Create'
DELETE = 'Delete'
UPDATE = 'Update'


def handler(event, context):
    request_type = event['RequestType']

    cf = Cloudformation(os.environ['AWSAPILIB_ROLE_ARN'])

    if request_type == CREATE:
        cf.stacksets.enable_organizations_trusted_access()

    return {}
