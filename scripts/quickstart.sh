#!/bin/bash

CWD=$(cd `dirname $0` && pwd)
TMP=$CWD/../tmp

rm -rf $TMP
mkdir -p $TMP
cd $TMP

git clone git@github.com:superwerker/quickstart-superwerker.git . 
git checkout develop
git pull origin develop

BRANCH_NAME=update-$(date +'%Y-%m-%dT%H-%M-%S')

git checkout -b $BRANCH_NAME

rsync -avr \
    --exclude='.git' \
    --exclude='.github' \
    --exclude='.releaserc' \
    --exclude='docs/index.html' \
    --exclude='docs/boilerplate' \
    --exclude='package.json' \
    --exclude='pull_request_template.md' \
    --exclude="scripts" \
    --exclude="tests" \
    --exclude='tmp' \
    ../ .

echo "Use https://github.com/superwerker/superwerker for Pull Requests!" > pull_request_template.md
echo "Use https://github.com/superwerker/superwerker for Issues!" > issue_template.md

git add .

git commit -m 'Synced files from https://github.com/superwerker/superwerker'

git push origin $BRANCH_NAME