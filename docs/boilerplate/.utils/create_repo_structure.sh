#!/bin/bash -e
# # Work in progress.
# exit 1

#Adds Help and Second Language options (-h | -l)
while getopts hl  option
do
    case "${option}" in
      h )
          echo "Usage:"
          echo "Run './create_repo_structure.sh' with no options for English langauge only."
          echo "Run './create_repo_structure.sh -l' to add files for second langauge."
          echo " "
          echo "(-h)       Show usage and brief help"
          echo "(-l)       Use to add files for second language for translation"
          exit 0
          ;;
      l )
          CREATESECONDLANG="create_second_lang";;
      * )
          echo "this is in an invalid flag. Please see "-h" for help on valid flags"
          exit 0
          ;;
    esac
done

#Creates Standard English directory structure to the repo.
function create_repo() {
BOILERPLATE_DIR="docs/boilerplate"
GENERATED_DIR="docs/generated"
SPECIFIC_DIR="docs/partner_editable"
# Creating directories.
mkdir -p ${GENERATED_DIR}/parameters
mkdir -p ${GENERATED_DIR}/regions
mkdir -p ${GENERATED_DIR}/services
mkdir -p ${SPECIFIC_DIR}
mkdir -p docs/images
mkdir -p .github/workflows

# Copying content.
rsync -avP ${BOILERPLATE_DIR}/.images/ docs/images/
rsync -avP ${BOILERPLATE_DIR}/.specific/ ${SPECIFIC_DIR}

# enabling workflow.
cp ${BOILERPLATE_DIR}/.actions/main-docs-build.yml .github/workflows/


# creating placeholders.
echo "// placeholder" > ${GENERATED_DIR}/parameters/index.adoc
echo "// placeholder" > ${GENERATED_DIR}/regions/index.adoc
echo "// placeholder" > ${GENERATED_DIR}/services/index.adoc
echo "// placeholder" > ${GENERATED_DIR}/services/metadata.adoc
}

#Creates standard English and second language directory structures to the repo.
function create_second_lang() {
read -p "Please enter enter 2 character language code: " LANG_CODE
create_repo
LANG_DIR="docs/languages"
SPECIFIC_LANG_DIR="docs/languages/docs-${LANG_CODE}"
TRANSLATE_ONLY="docs/languages/docs-${LANG_CODE}/translate-only"
LANG_FOLDER="docs-${LANG_CODE}"
mkdir -p ${LANG_DIR}
mkdir -p ${SPECIFIC_LANG_DIR}
mkdir -p ${TRANSLATE_ONLY}
rsync -avP ${BOILERPLATE_DIR}/.specific/ ${SPECIFIC_LANG_DIR}/partner_editable
rsync -avP ${BOILERPLATE_DIR}/*.adoc ${TRANSLATE_ONLY} --exclude *.lang.adoc --exclude index.adoc --exclude _layout_cfn.adoc --exclude planning_deployment.adoc
rsync -avP ${BOILERPLATE_DIR}/_layout_cfn.lang.adoc ${SPECIFIC_LANG_DIR}/_layout_cfn.adoc
rsync -avP ${BOILERPLATE_DIR}/index.lang.adoc ${SPECIFIC_LANG_DIR}/index.adoc
rsync -avP ${BOILERPLATE_DIR}/planning_deployment.lang.adoc ${TRANSLATE_ONLY}/planning_deployment.adoc
rsync -avP ${BOILERPLATE_DIR}/index-docinfo-footer.html ${TRANSLATE_ONLY}
rsync -avP ${BOILERPLATE_DIR}/LICENSE ${TRANSLATE_ONLY}
sed -i "" "s/docs-lang-code/${LANG_FOLDER}/g" ${SPECIFIC_LANG_DIR}/index.adoc
}

while true
do
#clear
if [ $OPTIND -eq 1 ]; then create_repo; fi
shift $((OPTIND-1))
#printf "$# non-option arguments"
$CREATESECONDLANG
touch .nojekyll
git add -A docs/
git add .github/
git add .nojekyll
exit
done