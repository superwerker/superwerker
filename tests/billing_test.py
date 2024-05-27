import json
from retrying import retry
import boto3
import pytest
from awsapilib import Billing

sts = boto3.client('sts')
cfn = boto3.client('cloudformation')
iam = boto3.client('iam')

@pytest.fixture(scope="module")
def billing_stack():
    stack_prefix = 'superwerker-Billing'
    stack_list = cfn.list_stacks(
        StackStatusFilter=['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE']
    )

    stack = [stack for stack in stack_list['StackSummaries']
                if stack['StackName'].startswith(stack_prefix)].pop()

    return stack

@pytest.fixture(scope="module")
def aws_api_lib_role_name(billing_stack):

    print('fetching SNS notification topic name from stack "{}"'.format(
        billing_stack['StackName']))

    res = cfn.describe_stacks(
        StackName=billing_stack['StackId'],
    )

    for output in res['Stacks'][0]['Outputs']:
        if output['OutputKey'] == 'AwsApiLibRoleName':
            return output['OutputValue']

    return ''

@pytest.fixture(scope="module")
@retry(stop_max_delay=10000, wait_fixed=2000)
def billing(prepare_permissions, management_account_id, aws_api_lib_role_name):
    return Billing(f'arn:aws:iam::{management_account_id}:role/{aws_api_lib_role_name}')

@pytest.fixture(scope="module")
def management_account_id():
    return sts.get_caller_identity()['Account']

@pytest.fixture(scope="module")
def role_arn():
    return sts.get_caller_identity()['Arn']


@pytest.fixture(scope="module")
def update_policy(role_arn, aws_api_lib_role_name):
    old_assume_role_policy = iam.get_role(RoleName=aws_api_lib_role_name)['Role']['AssumeRolePolicyDocument']
    role_name = aws_api_lib_role_name
    policy = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":"' + role_arn + '"},"Action":"sts:AssumeRole"}]}'
    iam.update_assume_role_policy(RoleName=role_name,
                                          PolicyDocument=policy)
    return old_assume_role_policy

@pytest.fixture(scope="module")
def prepare_permissions(update_policy, aws_api_lib_role_name):
    yield update_policy
    iam.update_assume_role_policy(RoleName=aws_api_lib_role_name,
                                          PolicyDocument=json.dumps(update_policy))

def test_billing_preferences(billing):
    assert billing.preferences.pdf_invoice_by_mail == True, 'PDF invoices by email is not enabled'
    assert billing.preferences.credit_sharing == True, 'Credit sharing is not enabled'

def test_tax_settings(billing):
    assert billing.tax.inheritance == True, 'Tax inheritance is not enabled'