VERSION=${1:-0.0.0-DEVELOPMENT}
sed -i "s/0.0.0-DEVELOPMENT/${VERSION}/" templates/*.yaml
