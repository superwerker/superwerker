import json
import os
from awsapilib import Billing

CREATE = 'Create'


def handler(event, _):
    billing = Billing(os.environ['AWSAPILIB_BILLING_ROLE_ARN'])

    if 'RequestType' in event.keys() and event["RequestType"] == CREATE:

        # custom cloudformation resource: on create configure billing settings

        print('Configuring billing relevant settings...')

        if not billing.iam_access:
            print('No IAM access to billing, this lambda does not have sufficient permissions.')
            return {}
        else:
            print('Enabling Tax Inheritance...')
            billing.tax.inheritance = True

            print('Enabling PDF invoices delivery by email...')
            billing.preferences.pdf_invoice_by_mail = True

            print('Enabling Credit Sharing...')
            billing.preferences.credit_sharing = True

            return {}

    else:

        # return current settings and recommentations for display on cloudwatch dashboard

        if not billing.iam_access:
            return '<p>Error: Not sufficient permissions to access billing information. Please activate <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/tutorial_billing.html#tutorial-billing-activate">IAM Access for billing</a> (requires root user).</p>'
        else:
            
            return f'''<ul><li>Recommended settings for billing:</li>
<li>Add your VAT/Tax registration number in <a href="https://us-east-1.console.aws.amazon.com/billing/home?region=us-east-1#/tax-settings">Tax settings</a>.</li>
<li>Set your preferred currency for your <a href="https://us-east-1.console.aws.amazon.com/billing/home?region=us-east-1#/paymentpreferences/paymentmethods">default payment method</a>.</li>
<li>Set security and operational contacts in <a href="https://us-east-1.console.aws.amazon.com/billing/home#/account">alternate contacts section</a>.</li>
<li>Tax inheritance: {billing.tax.inheritance} &#10004;</li>
<li>PDF invoices by email: {billing.preferences.pdf_invoice_by_mail} &#10004;</li>
<li>Credit sharing: {billing.preferences.credit_sharing} &#10004;</li></ul>'''

    

