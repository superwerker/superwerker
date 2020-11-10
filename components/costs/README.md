# Cost and usage reports
[Requirements](https://github.com/superwerker/superwerker/issues/30)

## Deployment
- sam package --template-file cost-usage-report.yaml --output-template-file packaged.yaml --s3-bucket superwerker-sam
- sam deploy --template-file packaged.yaml --stack-name cost-usage-report --capabilities CAPABILITY_IAM

