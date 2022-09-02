#!/usr/bin/env node

const fs = require('fs');

const file = process.argv[2];

const data = fs.readFileSync(file).toString();

//s3bucket
const dataNew = data.replace(/"magic-bucket"/g, '{ "Fn::Sub": "superwerker-assets-${AWS::Region}" }');

console.log(dataNew);
