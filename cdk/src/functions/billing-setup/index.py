import os
from awsapilib import Billing

CREATE = 'Create'


def handler(event, _):
    RequestType = event["RequestType"]

    if RequestType == CREATE:

        billing = Billing(os.environ['AWSAPILIB_BILLING_ROLE_ARN'])
        print('Configuring billing relevant settings...')

        if not billing.iam_access:
            print('No IAM access to billing, this lambda does not have sufficient permissions')
            return
        else:
            print('Enabling Tax Inheritance...')
            billing.tax.inheritance = True

            print('Enabling PDF invoices delivery by email...')
            billing.preferences.pdf_invoice_by_mail = True

            print('Enabling Credit Sharing...')
            billing.preferences.credit_sharing = True


    return {}

