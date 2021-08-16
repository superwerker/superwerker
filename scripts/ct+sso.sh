curl -s https://api.regional-table.region-services.aws.a2z.com/index.json | jq -r '.prices[]|select((.id | startswith("sso:")) or (.id | startswith("controltower:")))|.attributes."aws:region"' | sort
