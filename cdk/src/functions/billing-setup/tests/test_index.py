import os
from unittest.mock import MagicMock, Mock, PropertyMock, patch
import pytest
from index import CREATE, handler



def test_billing_features_enabled():

    os.environ['AWSAPILIB_BILLING_ROLE_ARN'] = 'apilib-role'

    with patch('index.Billing') as billing:
        with patch('index.Billing.Tax') as tax:
            with patch('index.Billing.Preferences') as preferences:
                iam_access_mock = PropertyMock(return_value=True)
                tax_mock = PropertyMock(return_value=tax)
                preferences_mock = PropertyMock(return_value=preferences)
                tax_inheritance_mock = PropertyMock()
                pdf_invoice_by_mail_mock = PropertyMock()
                credit_sharing_mock = PropertyMock()
                type(billing.return_value).iam_access = iam_access_mock
                type(billing.return_value).tax = tax_mock
                type(billing.return_value).preferences = preferences_mock
                type(tax_mock.return_value).inheritance = tax_inheritance_mock
                type(preferences_mock.return_value).pdf_invoice_by_mail = pdf_invoice_by_mail_mock
                type(preferences_mock.return_value).credit_sharing = credit_sharing_mock

                handler({'RequestType': CREATE}, {})

                billing.assert_called_once()
                iam_access_mock.assert_called_once()
                tax_inheritance_mock.assert_called_once_with(True)
                pdf_invoice_by_mail_mock.assert_called_once_with(True)
                credit_sharing_mock.assert_called_once_with(True)

def test_iam_access_disabled():

    os.environ['AWSAPILIB_BILLING_ROLE_ARN'] = 'apilib-role'

    with patch('index.Billing') as billing:
        with patch('index.Billing.Tax') as tax:
            with patch('index.Billing.Preferences') as preferences:
                iam_access_mock = PropertyMock(return_value=False)
                tax_mock = PropertyMock(return_value=tax)
                preferences_mock = PropertyMock(return_value=preferences)
                tax_inheritance_mock = PropertyMock()
                pdf_invoice_by_mail_mock = PropertyMock()
                credit_sharing_mock = PropertyMock()
                type(billing.return_value).iam_access = iam_access_mock
                type(billing.return_value).tax = tax_mock
                type(billing.return_value).preferences = preferences_mock
                type(tax_mock.return_value).inheritance = tax_inheritance_mock
                type(preferences_mock.return_value).pdf_invoice_by_mail = pdf_invoice_by_mail_mock
                type(preferences_mock.return_value).credit_sharing = credit_sharing_mock

                handler({'RequestType': CREATE}, {})

                billing.assert_called_once()
                iam_access_mock.assert_called_once()
                tax_inheritance_mock.assert_not_called()
                pdf_invoice_by_mail_mock.assert_not_called()
                credit_sharing_mock.assert_not_called()