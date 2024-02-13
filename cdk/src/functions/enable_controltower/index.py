import os

from awsapilib import ControlTower


CREATE = 'Create'


def handler(event, _):
    RequestType = event["RequestType"]
    control_tower_role_arn = os.getenv(
        'AWSAPILIB_CONTROL_TOWER_ROLE_ARN'
    )

    tower = ControlTower(control_tower_role_arn)

    logging_account_email = event['ResourceProperties'].get(
        'LOG_ARCHIVE_AWS_ACCOUNT_EMAIL'
    )
    audit_account_email = event['ResourceProperties'].get(
        'AUDIT_AWS_ACCOUNT_EMAIL'
    )
    if RequestType == CREATE:
        tower.deploy(
            logging_account_email=logging_account_email,
            security_account_email=audit_account_email,
            core_ou_name='Core',
            custom_ou_name='Sandbox',
            regions=['eu-central-1', 'eu-west-1'],
            retries=50,
            wait=5
        )

    return {}
