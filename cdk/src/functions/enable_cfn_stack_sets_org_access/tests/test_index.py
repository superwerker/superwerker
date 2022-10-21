import os
from unittest.mock import MagicMock
from index import handler, CREATE


def test_handler(mocker):
    os.environ['AWSAPILIB_ROLE_ARN'] = 'no arn'

    cfn_cls_mock = mocker.patch('index.Cloudformation')
    cfn_mock = MagicMock()
    cfn_cls_mock.return_value = cfn_mock
    stacksets_mock = mocker.patch('index.Cloudformation.stacksets')

    cfn_mock.stacksets.return_value = stacksets_mock

    handler({
        'RequestType': CREATE
    }, {})

    cfn_mock.stacksets.enable_organizations_trusted_access.assert_called_once()
