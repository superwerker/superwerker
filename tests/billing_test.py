import boto3
import pytest
from awsapilib import Billing

sts = boto3.client('sts')

@pytest.fixture(scope="module")
def billing(management_account_id):
    return Billing('arn:aws:iam::{}:role/AWSControlTowerExecution'.format(management_account_id))

@pytest.fixture(scope="module")
def management_account_id():
    return sts.get_caller_identity()['Account']

def test_billing_preferences(billing):
    assert billing.preferences.pdf_invoice_by_mail == True, 'PDF invoices by email is not enabled'
    assert billing.preferences.credit_sharing == True, 'Credit sharing is not enabled'

def test_tax_settings(billing):
    assert billing.tax.inheritance == True, 'Tax inheritance is not enabled'

def test_living_documentation():
    assert billing.iam_access == True, 'IAM access is not enabled'