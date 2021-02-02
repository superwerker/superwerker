#!/bin/bash
set -e

function build_language_docs(){
  for dir in docs/languages/*/
  do
    dir=${dir%*/}
    lang=$(echo ${dir%*/} | awk -F'[-]' '{print $2}')
    asciidoctor --base-dir docs/languages/docs-${lang}/ --backend=html5 -o ../../../index-${lang}.html -w --failure-level ERROR --doctype=book -a toc2 ${ASCIIDOC_ATTRIBUTES} docs/languages/docs-${lang}/index.adoc
  done
}

function _set_prod_asciidoc_attributes(){
  export ASCIIDOC_ATTRIBUTES="-a production_build"
}

function build_docs_with_asciidoc_attributes(){
  set +x
  asciidoctor --base-dir docs/ --backend=html5 -o ../${HTML_FILE:-index.html} -w --failure-level ERROR --doctype=book -a toc2 ${ASCIIDOC_ATTRIBUTES} docs/boilerplate/index.adoc
  set -x
}

function build_prod_example_docs(){
  export HTML_FILE="prod_example.html"
  _set_prod_asciidoc_attributes
  build_docs_with_asciidoc_attributes
}


ASCIIDOC_ATTRIBUTES=""
GITHUB_REPO_OWNER=$(echo ${GITHUB_REPOSITORY} | cut -d '/' -f 1)
if [ -d docs/images ]; then
  rsync -avP docs/images/ images/
fi

if [ -f docs/index.html ]; then
  rm docs/index.html
fi

if [ "${GITHUB_REPO_OWNER}" == "aws-quickstart" ]; then
  cp docs/boilerplate/.css/AWS-Logo.svg images/
  if [ "${GITHUB_REF}" == "refs/heads/master" ] || [ "${GITHUB_REF}" == "refs/heads/main" ];  then
    _set_prod_asciidoc_attributes
  else
    PREVIEW_BUILD="true"
  fi
fi

build_docs_with_asciidoc_attributes

if [ -d docs/languages ]; then
  build_language_docs
fi

if [ "${PREVIEW_BUILD}" == "true" ]; then
  build_prod_example_docs
fi

