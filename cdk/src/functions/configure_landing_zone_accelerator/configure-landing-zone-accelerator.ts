import { CodeCommit, SSM } from 'aws-sdk';
import Fs from 'fs';
import Path from 'path';
import * as Handlebars from 'handlebars';

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

  const AWS_REGION = process.env.AWS_REGION;
  const AUDIT_ACCOUNT_EMAIL = process.env.AUDIT_ACCOUNT_EMAIL;
  console.log('adding variables to customizations.yaml');
  await addVariablesToCustomizations(AWS_REGION);
  await addVariablesToSecurity(AWS_REGION);
  await addVariablesToGlobal(AWS_REGION, AUDIT_ACCOUNT_EMAIL);

  // TODO copy all files to /tmp then modify them and create bulk upload
  console.log('getting files to upload');
  const scpFiles = await getStaticFiles('/service-control-policies');
  const iamFiles = await getStaticFiles('/iam-policies');
  const remainingFiles = await getRemainingFiles();
  const filesToUpload = scpFiles.concat(iamFiles).concat(remainingFiles);

  console.log('making inital commit');
  await makeInitalCommit(filesToUpload);

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

async function makeInitalCommit(files: PutFileEntry[]) {
  const branchInfo = await codecommit.getBranch({ branchName: BRANCH_NAME, repositoryName: REPOSITORY_NAME }).promise();
  const commitId = branchInfo.branch!.commitId;

  const params = {
    branchName: BRANCH_NAME,
    repositoryName: REPOSITORY_NAME,
    commitMessage: 'inital configuration',
    parentCommitId: commitId,
    putFiles: files,
  };
  await codecommit
    .createCommit(params, function (err, data) {
      if (err) console.log(err, err.stack);
      else console.log(data);
    })
    .promise();
}

interface PutFileEntry {
  filePath: string;
  fileContent: Buffer;
}

async function getStaticFiles(path: string) {
  let filesToUpload = [];

  const PATH_CODECOMMIT = path;
  const PATH_LAMBDA = `.${PATH_CODECOMMIT}`;

  const files = Fs.readdirSync(PATH_LAMBDA, { withFileTypes: true });
  files.forEach((file) => {
    if (file.isFile()) {
      const filePath = Path.join(PATH_LAMBDA, file.name);
      const fileDict = {
        filePath: Path.join(PATH_CODECOMMIT, file.name),
        fileContent: getBufferFromFile(filePath),
      };
      filesToUpload.push(fileDict);
    }
  });

  return filesToUpload;
}

async function getRemainingFiles() {
  let filesToUpload = [
    {
      filePath: '/cloudformation/iam-access-analyzer.yaml',
      fileContent: getBufferFromFile('./cloudformation/iam-access-analyzer.yaml'),
    },
    {
      filePath: '/iam-config.yaml',
      fileContent: getBufferFromFile('./iam-config.yaml'),
    },
    {
      filePath: '/organization-config.yaml',
      fileContent: getBufferFromFile('./organization-config.yaml'),
    },
    {
      filePath: '/global-config.yaml',
      fileContent: getBufferFromFile('/tmp/global-config.yaml'),
    },
    {
      filePath: '/customizations-config.yaml',
      fileContent: getBufferFromFile('/tmp/customizations-config.yaml'),
    },
    {
      filePath: '/security-config.yaml',
      fileContent: getBufferFromFile('/tmp/security-config.yaml'),
    },
  ];
  return filesToUpload;
}

function getBufferFromFile(filePath: string) {
  return Buffer.from(Fs.readFileSync(filePath).toString('utf-8'));
}

function addVariablesToCustomizations(region: string) {
  const source = Fs.readFileSync(`./customizations-config.yaml`).toString();
  const template = Handlebars.compile(source);
  const contents = template({ REGION: `${region}` });
  Fs.writeFileSync(`/tmp/customizations-config.yaml`, contents);
}

function addVariablesToSecurity(region: string) {
  const source = Fs.readFileSync(`./security-config.yaml`).toString();
  const template = Handlebars.compile(source);
  const contents = template({ REGION: `${region}` });
  Fs.writeFileSync(`/tmp/security-config.yaml`, contents);
}

function addVariablesToGlobal(region: string, auditMail: string) {
  const source = Fs.readFileSync(`./global-config.yaml`).toString();
  const template = Handlebars.compile(source);
  const contents = template({ REGION: `${region}`, AUDIT_MAIL: `${auditMail}` });
  Fs.writeFileSync(`/tmp/global-config.yaml`, contents);
}
