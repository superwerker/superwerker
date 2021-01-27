VERSION=${1:-0.0.0-DEVELOPMENT}
sed -i "s/SuperwerkerVersion: 0.0.0-DEVELOPMENT/SuperwerkerVersion: ${VERSION}/" templates/*.yaml
