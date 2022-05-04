from awsapilib import AccountManager, PasswordManager
from awsapilib.captcha import Captcha2
import boto3
import os
import time
from retrying import retry

PASSWORD = 'TesTIdontCare243!'

org = boto3.client('organizations', region_name='us-east-1')
ssm = boto3.client('ssm');
solver = Captcha2(os.environ['CAPTCHA_KEY'])
password_manager = PasswordManager(solver=solver)


@retry(stop_max_attempt_number=100)
def reset_password(account_to_close):
    pw_reset_link_ssm_parameter_name = '/superwerker/rootmail/pw_reset_link/' + account_to_close['Email'].split('@')[0].split('+')[1]
    password_manager.request_password_reset(account_to_close['Email'])
    time.sleep(5)
    pw_reset_url = ssm.get_parameter(Name=pw_reset_link_ssm_parameter_name)['Parameter']['Value']
    password_manager.reset_password(pw_reset_url, PASSWORD)


@retry(stop_max_attempt_number=100)
def close_account(account_to_close):

    account_manager = AccountManager(account_to_close['Email'], PASSWORD, 'us-east-1', solver=solver)
    account_manager.terminate_account()

    print("Closed Account {}".format(account))

accounts = org.list_accounts()['Accounts']
for account in accounts:
    if account['JoinedMethod'] != 'CREATED' or account['Status'] != 'ACTIVE':
        continue

    reset_password(account)
    close_account(account)

