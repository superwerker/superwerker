import { CodeCommit, SSM } from 'aws-sdk';
import Fs from 'fs';

const codecommit = new CodeCommit();
const ssm = new SSM();
const SSM_PARAMETER = { Name: 'superwerker-initial-ct-customizations-done' };

const BRANCH_NAME = 'main';
const REPOSITORY_NAME = 'custom-control-tower-configuration';

export async function handler(event: any, _context: any) {
  let customizationsConfigured = true;
  try {
    await ssm.getParameter(SSM_PARAMETER).promise();
  } catch (err) {
    if (err) {
      customizationsConfigured = false;
    }
  }

  if (customizationsConfigured) {
    console.log('Control tower customizations have been configured initially, nothing to do.');
    return;
  } else {
    console.log('Control tower customizations have not been configured yet, starting initial configuration.');
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
  const commitId = branchInfo.branch.commitId;

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
      filePath: '/policies/block-s3-public.json',
      fileContent: getBufferFromFile('./config/policies/block-s3-public.json'),
    },
    {
      filePath: '/manifest.yaml',
      fileContent: getBufferFromFile('./config//manifest.yaml'),
    },
  ];
  return filesToUpload;
}

function getBufferFromFile(filePath: string) {
  return Buffer.from(Fs.readFileSync(filePath).toString('utf-8'));
}
