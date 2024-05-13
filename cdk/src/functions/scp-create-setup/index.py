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

def exception_handling(function):
    def catch(event, context):
        try:
            function(event, context)
        except Exception as e:
            print(e)
            print(event)
            raise e

    return catch

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

def handler(event, context):
    RequestType = event["RequestType"]
    Properties = event["ResourceProperties"]
    LogicalResourceId = event["LogicalResourceId"]
    PhysicalResourceId = event.get("PhysicalResourceId")
    Policy = Properties["Policy"]
    Attach = Properties["Attach"] == 'true'

    print('RequestType: {}'.format(RequestType))
    print('PhysicalResourceId: {}'.format(PhysicalResourceId))
    print('LogicalResourceId: {}'.format(LogicalResourceId))
    print('Attach: {}'.format(Attach))

    parameters = dict(
        Content=Policy,
        Description="superwerker - {}".format(LogicalResourceId),
        Name="superwerker",
    )

    policy_id = PhysicalResourceId

    try:
        if RequestType == CREATE:

            listOfPolicies = o.list_policies_for_target(TargetId=root_id(), Filter='SERVICE_CONTROL_POLICY')['Policies']
            for p in listOfPolicies:
                if(p["Name"] == "superwerker"):
                    return {}

            print('Creating Policy: {}'.format(LogicalResourceId))
            response = with_retry(o.create_policy,
                                **parameters, Type=SCP
                                )
            policy_id = response["Policy"]["PolicySummary"]["Id"]
            if Attach:
                with_retry(o.attach_policy, PolicyId=policy_id, TargetId=root_id())
        elif RequestType == UPDATE:
            print('Updating Policy: {}'.format(LogicalResourceId))
            with_retry(o.update_policy, PolicyId=policy_id, **parameters)
        elif RequestType == DELETE:
            return True
        else:
            raise Exception('Unexpected RequestType: {}'.format(RequestType))

        return {
            'PhysicalResourceId': policy_id,
        }
    except Exception as e:
        print(e)
        print(event)
        raise e

def policy_attached(policy_id):
    return [p['Id'] for p in
            o.list_policies_for_target(TargetId=root_id(), Filter='SERVICE_CONTROL_POLICY')['Policies'] if
            p['Id'] == policy_id]


def policy_attached(policy_id):
    return [p['Id'] for p in
            o.list_policies_for_target(TargetId=root_id(), Filter='SERVICE_CONTROL_POLICY')['Policies'] if
            p['Id'] == policy_id]