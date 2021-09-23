#!/usr/bin/env python3
# based on https://gist.github.com/ottokruse/1c0f79d51cdaf82a3885f9b532df1ce5

from urllib import parse, request
import boto3
import json
import os

console_url = os.environ.get("CONSOLE_URL", "https://console.aws.amazon.com/")

creds = boto3.Session().get_credentials()
url_credentials = dict(sessionId=creds.access_key,sessionKey=creds.secret_key, sessionToken=creds.token)

request_parameters = "?Action=getSigninToken"
request_parameters += "&DurationSeconds=43200"
request_parameters += "&Session=" + parse.quote_plus(json.dumps(url_credentials))
request_url = "https://signin.aws.amazon.com/federation" + request_parameters

with request.urlopen(request_url) as response:
    if not response.status == 200:
        raise Exception("Failed to get federation token")
    signin_token = json.loads(response.read())

request_parameters = "?Action=login"
request_parameters += "&Destination=" + parse.quote_plus(console_url)
request_parameters += "&SigninToken=" + signin_token["SigninToken"]
request_parameters += "&Issuer=" + parse.quote_plus("https://example.com")
request_url = "https://signin.aws.amazon.com/federation" + request_parameters

print(request_url)
