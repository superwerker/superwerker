import boto3
import time
import random

o = boto3.client("organizations")

CREATE = 'Create'
UPDATE = 'Update'
DELETE = 'Delete'
BACKUP_POLICY = "BACKUP_POLICY"


def root():
    return o.list_roots()['Roots'][0]


def root_id():
    return root()['Id']


def backup_policy_enabled():
    enabled_policies = root()['PolicyTypes']
    return {"Type": BACKUP_POLICY, "Status": "ENABLED"} in enabled_policies


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
def enable_tag_policies(event, context):
    RequestType = event["RequestType"]
    if RequestType == CREATE and not backup_policy_enabled():
        r_id = root_id()
        print('Enable BACKUP_POLICY for root: {}'.format(r_id))
        o.enable_policy_type(RootId=r_id, PolicyType=BACKUP_POLICY)
    return {
        'PhysicalResourceId': 'BACKUP_POLICY',
    }


def with_retry(function, **kwargs):
    for i in [0, 3, 9, 15, 30]:
        # Random sleep to not run into concurrency problems when adding or attaching multiple BACKUP_POLICYs
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


def policy_attached(policy_id):
    return [p['Id'] for p in
            o.list_policies_for_target(TargetId=root_id(), Filter='BACKUP_POLICY')['Policies'] if
            p['Id'] == policy_id]