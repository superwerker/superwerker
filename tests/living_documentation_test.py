import boto3
import pytest
import botocore

cw = boto3.client('cloudwatch')
lambda_client = boto3.client('lambda')


def test_superwerker_dashboard():
    superwerker_dashboard = cw.get_dashboard(DashboardName="Superwerker-LivingDocumentation")
    assert superwerker_dashboard, "No superwerker dashboard found"

    response_iterator = lambda_client.get_paginator('list_functions').paginate()
    
    function_exists = False
    for page in response_iterator:
        for function in page['Functions']:
            if function['FunctionName'].startswith('superwerker-LivingDocumen-'):
                function_exists = True
    assert function_exists, "superwerker dashboard generator lambda function not found"
    
def test_superwerker_legacy_dashboard():
    with pytest.raises(botocore.exceptions.ClientError) as exception:
        cw.get_dashboard(DashboardName="superwerker")
    assert 'An error occurred (ResourceNotFound) when calling the GetDashboard operation: Dashboard superwerker does not exist'
