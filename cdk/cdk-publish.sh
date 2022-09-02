#!/usr/bin/env bash

set -euo pipefail

# Synthezise
yarn cdk synth

#  { "Fn::Sub": "magic-bucket-${AWS::Region}" }

# Handle the S3Code part
find cdk.out -name \*.template.json | xargs -n 1 sed -i 's/"magic-bucket"/{ "Fn::Sub": "superwerker-assets-${AWS::Region}" }/'