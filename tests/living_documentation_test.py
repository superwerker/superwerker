import boto3
from retrying import retry

cw = boto3.client('cloudwatch')
lambda_client = boto3.client('lambda')


def test_superwerker_dashboard():
    superwerker_dashboard = cw.get_dashboard(DashboardName="superwerker")
    assert superwerker_dashboard, "No superwerker dashboard found"

    response_iterator = lambda_client.get_paginator('list_functions').paginate()
    
    function_exists = False
    for page in response_iterator:
        for function in page['Functions']:
            if function['FunctionName'].startswith('superwerker-LivingDocumen-'):
                function_exists = True
    assert function_exists, "superwerker dashboard generator lambda function not found"
    
