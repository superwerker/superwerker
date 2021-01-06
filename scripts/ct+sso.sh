curl -s https://api.regional-table.region-services.aws.a2z.com/index.json | grep -Eo "(controltower|sso):[a-z0-9-]+" | cut -d : -f 2 | sort | uniq -c | grep -E "  2 (.*)" | cut -c 5-
