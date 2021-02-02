#!/bin/bash

set -eu
function common_steps(){
  git add -A
  git add images
  git add index.html
  git rm -r --force templates
  git commit -a -m "Updating documentation"
  git status
}

function github_actions_prod(){
  repo_uri="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
  remote_name="doc-upstream"
  main_branch=$(basename "$(git symbolic-ref --short refs/remotes/origin/HEAD)")
  target_branch="gh-pages"
  cd "$GITHUB_WORKSPACE"
  ls -lah
  git config --local user.email "action@github.com"
  git config --local user.name "GitHub Action"
  common_steps
  git remote set-url origin ${repo_uri}
  git status | grep "nothing to commit, working tree clean" || git push origin HEAD:${target_branch} --force
}

#if [ $? -ne 0 ]; then
#    echo "nothing to commit"
#    exit 0
#fi

if [ "${DOCBUILD_PROD:-x}" == "true" ]; then
  common_steps
else
  github_actions_prod
fi

git remote set-url origin ${repo_uri}
git status | grep "Your branch is up to date" || git push origin HEAD:${target_branch} --force
