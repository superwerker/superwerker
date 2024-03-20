#!/bin/bash
DEFAULT_ENABLED_REGIONS=$(aws account list-regions --region-opt-status-contains ENABLED_BY_DEFAULT | jq -r '.Regions[].RegionName' | sort)

# get list of regions that have both controltower and identity-center activated
CT_AND_SSO_REGIONS=$(curl -s https://api.regional-table.region-services.aws.a2z.com/index.json | grep -Eo "(controltower|identity-center):[a-z0-9-]+" | cut -d : -f 2 | sort | uniq -c | grep -E "  2 (.*)" | cut -c 5-)

FINAL_LIST=()
for region1 in $DEFAULT_ENABLED_REGIONS; do
    for region2 in $CT_AND_SSO_REGIONS; do
        if [ "$region1" == "$region2" ]; then
            FINAL_LIST+=("$region1")
        fi
    done
done

printf '%s\n' "${FINAL_LIST[@]}"