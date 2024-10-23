#!/bin/bash

# get current user name  & account id from credentials
CREDS=$(aws sts get-caller-identity --output text)

USER=$(echo $CREDS | cut -d' ' -f2 | cut -d'/' -f2)
USER_ACC_ID=$(echo $CREDS | cut -d' ' -f1)

if [ "$USER" != 'lz-cleanup' ]; then
    echo "You running with the wrong IAM user, must run with lz-cleanup user, see README"
    exit 1
fi

# get master account id
MASTER_ACC_ID=$(aws organizations describe-organization --query 'Organization.MasterAccountId' --output text)

if [ $USER_ACC_ID != $MASTER_ACC_ID ]; then
    echo "You have the wrong credentails, must run from master account"
    exit 1
fi

echo "Running in master account with correct IAM user, continuing"