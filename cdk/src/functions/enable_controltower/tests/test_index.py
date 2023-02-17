from index import CREATE, handler


def test_enable_control_tower(mocker):
    ct = mocker.patch('index.ControlTower')

    logging_account_email: str = 'logging@example.com'
    audit_account_email: str = 'audit@example.com'

    handler({
        'RequestType': CREATE,
        'ResourceProperties': {
            'LOG_ARCHIVE_AWS_ACCOUNT_EMAIL': logging_account_email,
            'AUDIT_AWS_ACCOUNT_EMAIL': audit_account_email,
        }
    }, {})

    assert ct.is_called()
    assert ct.deploy.is_called_with(
        logging_account_email=logging_account_email,
        security_account_email=audit_account_email,
        retries=50,
        wait=5
    )
