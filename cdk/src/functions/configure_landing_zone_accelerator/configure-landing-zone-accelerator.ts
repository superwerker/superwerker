import { CodeCommit, SSM } from 'aws-sdk';
import Fs from 'fs';

const codecommit = new CodeCommit();
const ssm = new SSM();
const SSM_PARAMETER = { Name: '/superwerker/initial-lza-config-done' };

const BRANCH_NAME = 'main';
const REPOSITORY_NAME = 'aws-accelerator-config';

export async function handler(event: any, _context: any) {
  let lzaConfigured = true;
  try {
    await ssm.getParameter(SSM_PARAMETER).promise();
  } catch (err) {
    if (err) {
      lzaConfigured = false;
    }
  }

  if (lzaConfigured) {
    console.log('LZA has been configured initially, nothing to do.');
    return;
  } else {
    console.log('LZA has not been configured yet, starting initial configuration.');
  }

  const snsMessage = event.Records[0].Sns.Message;
  if (!snsMessage.includes('CREATE_COMPLETE')) {
    console.log('stack is not in CREATE_COMPLETE state, nothing to do yet');
    return;
  }

  console.log('making inital commit');
  await makeInitalCommit();

  console.log('setting initial commit ssm parameter');
  const params = {
    Name: SSM_PARAMETER.Name,
    Value: 'true',
    Type: 'String',
  };
  await ssm
    .putParameter(params, function (err, data) {
      if (err) console.log(err, err.stack);
      else console.log(data);
    })
    .promise();
}

async function makeInitalCommit() {
  const branchInfo = await codecommit.getBranch({ branchName: BRANCH_NAME, repositoryName: REPOSITORY_NAME }).promise();
  const commitId = branchInfo.branch!.commitId;

  // TODO get current files from codecommit
  // do changes to files

  const params = {
    branchName: BRANCH_NAME,
    repositoryName: REPOSITORY_NAME,
    commitMessage: 'inital configuration',
    parentCommitId: commitId,
    putFiles: getFilesToUpload(),
  };
  await codecommit
    .createCommit(params, function (err, data) {
      if (err) console.log(err, err.stack);
      else console.log(data);
    })
    .promise();
}

function getFilesToUpload() {
  // TODO dynamically get files from config directory
  let filesToUpload = [
    {
      filePath: '/service-control-policies/superwerker-sandbox-scp.json',
      fileContent: getBufferFromFile('./service-control-policies/superwerker-sandbox-scp.json'),
    },
    {
      filePath: '/cloudformation/iam-access-analyzer.yaml',
      fileContent: getBufferFromFile('./iam-access-analyzer.yaml'),
    },
    {
      filePath: '/security-config.yaml',
      fileContent: getBufferFromFile('./security-config.yaml'),
    },
    {
      filePath: '/organization-config.yaml',
      fileContent: getBufferFromFile('./organization-config.yaml'),
    },
    {
      filePath: '/customizations-config.yaml',
      fileContent: getBufferFromFile('./customizations-config.yaml'),
    },
  ];
  return filesToUpload;
}

function getBufferFromFile(filePath: string) {
  return Buffer.from(Fs.readFileSync(filePath).toString('utf-8'));
}

function addVariablesToCustomizations(region: string) {
  const source = Fs.readFileSync(`./config/manifest.yaml`).toString();
  const template = Handlebars.compile(source);
  const contents = template({ REGION: `${region}` });
  Fs.writeFileSync(`/tmp/manifest.yaml`, contents);
}
