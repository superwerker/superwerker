#!/bin/bash
# Wrapper to generate parameter tables within asciidoc workflow.
set -e
#sudo apt-get install pandoc -y
pip3 install -r docs/boilerplate/.utils/requirements.txt;
set +e
egrep -qi '^:no_parameters:$' docs/partner_editable/_settings.adoc; EC=$?
set -e
if [ ${EC} -ne 0 ]; then
  echo "Gen tables"
  python docs/boilerplate/.utils/generate_parameter_tables.py
fi
echo "Gen metadata"
python docs/boilerplate/.utils/generate_metadata_attributes.py
