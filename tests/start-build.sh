#!/bin/bash
set -euo pipefail

superwerker_region=${SUPERWERKER_REGION:-"eu-central-1"}
git_branch=$(git branch --show-current)

echo Source Profile ${SOURCE_PROFILE} - Region ${superwerker_region} - Branch ${git_branch} - CodeBuild Project Name ${CODEBUILD_PROJECT_NAME}

template_prefix=${git_branch}/

aws --profile ${SOURCE_PROFILE} --no-cli-pager codebuild start-build \
  --project-name ${CODEBUILD_PROJECT_NAME} \
  --environment-variables-override name=TEMPLATE_PREFIX,value=${template_prefix} name=SUPERWERKER_REGION,value=${superwerker_region}