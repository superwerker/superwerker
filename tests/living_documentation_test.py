import boto3
import pytest
import botocore
import json

cw = boto3.client('cloudwatch')
lambda_client = boto3.client('lambda')

@pytest.fixture(scope="module")
def dashboard_generator_function():
    response_iterator = lambda_client.get_paginator('list_functions').paginate()
    for page in response_iterator:
        for function in page['Functions']:
            if function['FunctionName'].startswith('superwerker-LivingDocumen-'):
                return function


def test_superwerker_dashboard(dashboard_generator_function):
    superwerker_dashboard = cw.get_dashboard(DashboardName="Superwerker-LivingDocumentation")
    assert superwerker_dashboard, "No superwerker dashboard found"
    
    assert dashboard_generator_function, "superwerker dashboard generator lambda function not found"

    assert json.loads(superwerker_dashboard["DashboardBody"]) == json.loads('''{{
    "widgets": [
        {{
            "height": 17,
            "width": 20,
            "y": 0,
            "x": 0,
            "type": "custom",
            "properties": {{
                "endpoint": "{0}",
                "title": "",
                "updateOn": {{
                    "refresh": true,
                    "resize": true,
                    "timeRange": true
                }}
            }}
        }}
    ]
}}'''.format(dashboard_generator_function['FunctionArn'])), 'superwerker dashboard body does not match expected value'
    
def test_superwerker_dashboard_contents(dashboard_generator_function):
    response = lambda_client.invoke(FunctionName=dashboard_generator_function['FunctionName'], InvocationType='RequestResponse')

    assert response['StatusCode'] == 200, 'Lambda invocation failed'
    lambda_payload = str(response['Payload'].read())
    assert 'DNS configuration is set up correctly' in lambda_payload, 'Lambda response should contain "DNS configuration is set up correctly"'
    assert 'https://github.com/superwerker/superwerker' in lambda_payload, 'Lambda response should contain "link to superwerker GitHub repository"'
    assert 'Next steps' in lambda_payload, 'Lambda response should contain "Next steps"'


def test_superwerker_legacy_dashboard_does_not_exist(dashboard_generator_function):
    lambda_client.invoke(FunctionName=dashboard_generator_function['FunctionName'], InvocationType='RequestResponse')

    with pytest.raises(botocore.exceptions.ClientError) as exception:
        cw.get_dashboard(DashboardName="superwerker")
    assert 'An error occurred (ResourceNotFound) when calling the GetDashboard operation: Dashboard superwerker does not exist' == str(exception.value)
