import boto3
import time
import random
import re

o = boto3.client("organizations")

CREATE = 'Create'
UPDATE = 'Update'
DELETE = 'Delete'
SCP = "SERVICE_CONTROL_POLICY"


def root():
    return o.list_roots()['Roots'][0]


def root_id():
    return root()['Id']


def scp_enabled():
    enabled_policies = root()['PolicyTypes']
    return {"Type": SCP, "Status": "ENABLED"} in enabled_policies


def exception_handling(function):
    def catch(event, context):
        try:
            function(event, context)
        except Exception as e:
            print(e)
            print(event)
            raise e

    return catch


@exception_handling
def enable_service_control_policies(event, context):
    RequestType = event["RequestType"]
    if RequestType == CREATE and not scp_enabled():
        r_id = root_id()
        print('Enable SCP for root: {}'.format(r_id))
        o.enable_policy_type(RootId=r_id, PolicyType=SCP)
    return {
            'PhysicalResourceId': 'SCP',
    }


def with_retry(function, **kwargs):
    for i in [0, 3, 9, 15, 30]:
        # Random sleep to not run into concurrency problems when adding or attaching multiple SCPs
        # They have to be added/updated/deleted one after the other
        sleeptime = i + random.randint(0, 5)
        print('Running {} with Sleep of {}'.format(function.__name__, sleeptime))
        time.sleep(sleeptime)
        try:
            response = function(**kwargs)
            print("Response for {}: {}".format(function.__name__, response))
            return response
        except o.exceptions.ConcurrentModificationException as e:
            print('Exception: {}'.format(e))
    raise Exception