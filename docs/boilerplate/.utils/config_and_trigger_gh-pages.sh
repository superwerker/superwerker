#!/bin/bash
exit 0
# set -e
# curl -fsSL https://github.com/github/hub/raw/master/script/get | bash -s 2.14.1
# sudo apt-get install jq -y
# PAGES_STATUS=$(bin/hub api repos/${GITHUB_REPOSITORY}/pages | jq '.status' | sed -e 's/"//g')
# if [ "${PAGES_STATUS}" != "null" ]; then
#   exit 0
# fi

# bin/hub api -H Accept:application/vnd.github.switcheroo-preview+json repos/${GITHUB_REPOSITORY}/pages -f {"source":{"branch":"gh-pages"}}
