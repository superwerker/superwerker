#!/bin/bash -e
set -x
git remote update
git fetch
set +e
git remote set-head origin --auto
default_branch=$(basename "$(git symbolic-ref --short refs/remotes/origin/HEAD)")
doc_commit_id=$(git submodule | grep docs/boilerplate | cut -d - -f 2 | cut -f 1 -d " ")
git rev-parse --verify origin/gh-pages
CHECK_BRANCH=$?
set -e
if [[  $CHECK_BRANCH -ne 0 ]];then
  git checkout -b gh-pages
  git push origin gh-pages
else
  git checkout gh-pages
#    git checkout --track origin/gh-pages
fi
git rm -rf .
touch .gitmodules
git restore -s origin/${default_branch} docs
set +e
git rm -r docs/boilerplate -r
rm -rf docs/boilerplate
set -e
git restore -s origin/${default_branch} templates
git submodule add https://github.com/aws-quickstart/quickstart-documentation-base-common.git docs/boilerplate
cd docs/boilerplate
git checkout "${doc_commit_id}"
cd ../../
rm configure_git_env.sh
mv docs/images images
