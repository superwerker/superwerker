var synthetics = require('Synthetics');
const LOG = require('SyntheticsLogger');
const AWS = require('aws-sdk');

const CONNECT_SSM_PARAMETER = '/superwerker/tests/connect'

const CAPTCHA_KEY = process.env['CAPTCHA_KEY'];

const flowBuilderBlueprint = async function () {
    let page = await synthetics.getPage();

    let email = 'root+1604778386@aws.db182a4d-4ac9-43fc-b4b1-4ba89275b063.de';

    // await synthetics.executeStep('pwResetEmailRequest', async function () {
    //
    //     await loginStage1(page, email);
    //
    //     await page.click('#root_forgot_password_link');
    //
    //     await page.waitFor(2000);
    //
    //     await page.waitForSelector('#password_recovery_captcha_image', {timeout: 15000});
    //
    //     captchanotdone = true;
    //     captchaattempts = 0;
    //     while (captchanotdone) {
    //         captchaattempts += 1;
    //         if (captchaattempts > 6) {
    //             return;
    //         }
    //
    //         let recaptchaimg = await page.$('#password_recovery_captcha_image');
    //         let recaptchaurl = await page.evaluate((obj) => {
    //             return obj.getAttribute('src');
    //         }, recaptchaimg);
    //
    //
    //         let captcharesult = await solveCaptcha2captcha(page, recaptchaurl);
    //
    //         let input2 = await page.$('#password_recovery_captcha_guess');
    //         await input2.press('Backspace');
    //         await input2.type(captcharesult, {delay: 100});
    //
    //         await page.waitFor(3000);
    //
    //
    //         await page.click('#password_recovery_ok_button');
    //
    //         await page.waitFor(5000);
    //
    //         let errormessagediv = await page.$('#password_recovery_error_message');
    //         let errormessagedivstyle = await page.evaluate((obj) => {
    //             return obj.getAttribute('style');
    //         }, errormessagediv);
    //
    //         if (errormessagedivstyle.includes("display: none")) {
    //             captchanotdone = false;
    //         }
    //         await page.waitFor(2000);
    //     }
    // });



    await synthetics.executeStep('pwReset', async function () {
        const AWS = require('aws-sdk');
        const ssm = new AWS.SSM();
        var params = {
            Name: '/superwerker/rootmail/pw_reset_link/1604778386'
        };

        tries = 0
        max_tries = 20
        do {
            try {
                parameter = await ssm.getParameter(params).promise();
                break
            } catch(e) {
                console.log(e)
                sleep(5000)
            }
        }  while (++tries < max_tries);

        pw_reset_url = parameter['Parameter']['Value']

        await pwResetAndDelete(page, pw_reset_url, email);

    });
};

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const solveCaptcha2captcha = async (page, url) => {
    var imgbody = await httpGetBinary(url).then(res => {
        return res;
    });

    var captcharef = await httpPostJson('https://2captcha.com/in.php', {
        'key': CAPTCHA_KEY,
        'method': 'base64',
        'body': imgbody.toString('base64')
    }).then(res => {
        console.log('2Captcha: ' + res)
        return res.split("|").pop();
    });

    var captcharesult = '';
    var i = 0;
    while (!captcharesult.startsWith("OK") && i < 20) {
        await new Promise(resolve => { setTimeout(resolve, 5000); });

        captcharesult = await httpGet('https://2captcha.com/res.php?key=' + CAPTCHA_KEY + '&action=get&id=' + captcharef).then(res => {
            return res;
        });

        i++;
    }

    return captcharesult.split("|").pop();
}

async function pwResetAndDelete(page, url, email) {

    var secretsmanager = new AWS.SecretsManager();
    let secretsmanagerresponse = await secretsmanager.getSecretValue({
        SecretId: '/superwerker/tests/accountdeletion'
    }).promise();

    let secretdata = JSON.parse(secretsmanagerresponse.SecretString);

    // await page.goto(url, {
    //     timeout: 0,
    //     waitUntil: ['domcontentloaded']
    // });
    // await page.waitFor(5000);
    //
    //
    // let newpwinput = await page.$('#new_password');
    // await newpwinput.press('Backspace');
    // await newpwinput.type(secretdata.password, { delay: 100 });
    //
    // let input2 = await page.$('#confirm_password');
    // await input2.press('Backspace');
    // await input2.type(secretdata.password, { delay: 100 });
    //
    // await page.click('#reset_password_submit');
    // await page.waitFor(5000);


    await loginStage1(page, email);

    let input4 = await page.$('#password');
    await input4.press('Backspace');
    await input4.type(secretdata.password, { delay: 100 });


    await page.click('#signin_button');
    await page.waitFor(8000);


    await page.goto('https://portal.aws.amazon.com/billing/signup?client=organizations&enforcePI=True', {
        timeout: 0,
        waitUntil: ['domcontentloaded']
    });
    await page.waitFor(8000);

    // /confirmation is an activation period
    if (page.mainFrame().url().split("#").pop() == "/paymentinformation") {

        let input5 = await page.$('#credit-card-number');
        await input5.press('Backspace');
        await input5.type(secretdata.ccnumber, { delay: 100 });

        await page.select('#expirationMonth', (parseInt(secretdata.ccmonth)-1).toString());

        await page.waitFor(2000);

        let currentyear = new Date().getFullYear();

        await page.select('select[name=\'expirationYear\']', (parseInt(secretdata.ccyear)-currentyear).toString());

        let input6 = await page.$('#accountHolderName');
        await input6.press('Backspace');
        await input6.type(secretdata.ccname, { delay: 100 });

        await page.waitFor(2000);

        await page.click('.form-submit-click-box > button');

        await page.waitFor(8000);
    }

    if (page.mainFrame().url().split("#").pop() == "/identityverification") {
        let usoption = await page.$('option[label="United States (+1)"]');
        let usvalue = await page.evaluate( (obj) => {
            return obj.getAttribute('value');
        }, usoption);

        await page.select('#countryCode', usvalue);

        const ssm = new AWS.SSM({region: 'us-east-1'});

        let connectssmparameter = await ssm.getParameter({
            Name: CONNECT_SSM_PARAMETER
        }).promise();

        let variables = JSON.parse(connectssmparameter['Parameter']['Value']);

        let portalphonenumber = await page.$('#phoneNumber');
        await portalphonenumber.press('Backspace');
        await portalphonenumber.type(variables['PHONE_NUMBER'].replace("+1", ""), { delay: 100 });

        var phonecode = "";
        var phonecodetext = "";
        var captchanotdone = true;
        var captchaattemptsfordiva = 0;
        while (captchanotdone) {
            captchaattemptsfordiva += 1;
            if (captchaattemptsfordiva > 5) {
                throw "Could not confirm phone number verification - possible error in DIVA system or credit card";
            }
            try {
                let submitc = await page.$('#btnCall');

                let recaptchaimgx = await page.$('#imageCaptcha');
                let recaptchaurlx = await page.evaluate((obj) => {
                    return obj.getAttribute('src');
                }, recaptchaimgx);

                let result = await solveCaptcha2captcha(page, recaptchaurlx);

                let input32 = await page.$('#guess');
                await input32.press('Backspace');
                await input32.type(result, { delay: 100 });

                await submitc.click();
                await page.waitFor(5000);


                await page.waitForSelector('.phone-pin-number', {timeout: 5000});

                phonecode = await page.$('.phone-pin-number > span');
                phonecodetext = await page.evaluate(el => el.textContent, phonecode);

                if (phonecodetext.trim().length == 4) {
                    captchanotdone = false;
                } else {
                    await page.waitFor(5000);
                }
            } catch (error) {
                LOG.error(error);
            }
        }

        variables['CODE'] = phonecodetext;

        await ssm.putParameter({
            Name: CONNECT_SSM_PARAMETER,
            Type: "String",
            Value: JSON.stringify(variables),
            Overwrite: true
        }).promise();

        await page.waitFor(30000);

        try {
            await page.click('#verification-complete-button');
        } catch(err) {
            LOG.error("Could not confirm phone number verification - possible error in DIVA system or credit card");
            throw err;
        }

        await page.waitFor(3000);


    }

    if (page.mainFrame().url().split("#").pop() == "/support" || page.mainFrame().url().split("#").pop() == "/confirmation") {
        await page.goto('https://console.aws.amazon.com/billing/rest/v1.0/account', {
            timeout: 0,
            waitUntil: ['domcontentloaded']
        });

        await page.waitFor(3000);

        let accountstatuspage = await page.content();


        let issuspended = accountstatuspage.includes("\"accountStatus\":\"Suspended\"");

        if (!issuspended) {
            await page.goto('https://console.aws.amazon.com/billing/home?#/account', {
                timeout: 0,
                waitUntil: ['domcontentloaded']
            });

            await page.waitFor(8000);

            let closeaccountcbs = await page.$$('.close-account-checkbox > input');
            await closeaccountcbs.forEach(async (cb) => {
                await cb.click();
            });

            await page.waitFor(1000);

            await page.click('.btn-danger'); // close account button

            await page.waitFor(1000);

            await page.click('.modal-footer > button.btn-danger'); // confirm close account button

            await page.waitFor(5000);
        }

        //await removeAccountFromOrg(account);
    } else {
        LOG.warn("Unsure of location, send help! - " + page.mainFrame().url());
    }
}

async function removeAccountFromOrg(account) {
    var now = new Date();
    var threshold = new Date(account.JoinedTimestamp);
    threshold.setDate(threshold.getDate() + 7); // 7 days
    if (now > threshold) {
        await retryWrapper(organizations, 'removeAccountFromOrganization', {
            AccountId: account.Id
        });

        LOG.info("Removed account from Org");

        return true;
    } else {
        threshold.setMinutes(threshold.getMinutes() + 2); // plus 2 minutes buffer
        await eventbridge.putRule({
            Name: "ScheduledAccountDeletion-" + account.Id.toString(),
            Description: "The scheduled deletion of an Organizations account",
            //RoleArn: '',
            ScheduleExpression: "cron(" + threshold.getMinutes() + " " + threshold.getUTCHours() + " " + threshold.getUTCDate() + " " + (threshold.getUTCMonth() + 1) + " ? " + threshold.getUTCFullYear() + ")",
            State: "ENABLED"
        }).promise();

        await eventbridge.putTargets({
            Rule: "ScheduledAccountDeletion-" + account.Id.toString(),
            Targets: [{
                Arn: "arn:aws:lambda:" + process.env.AWS_REGION + ":" + process.env.ACCOUNTID  + ":function:" + process.env.AWS_LAMBDA_FUNCTION_NAME,
                Id: "Lambda",
                //RoleArn: "",
                Input: JSON.stringify({
                    "action": "removeAccountFromOrg",
                    "account": account,
                    "ruleName": "ScheduledAccountDeletion-" + account.Id.toString()
                })
            }]
        }).promise();

        await retryWrapper(organizations, 'tagResource', {
            ResourceId: account.Id,
            Tags: [{
                Key: "ScheduledRemovalTime",
                Value: threshold.toISOString()
            }]
        });

        LOG.info("Scheduled removal for later");
    }

    return false;
}

exports.handler = async () => {
    return await flowBuilderBlueprint();
};


async function loginStage1(page, email) {
    await page.goto('https://console.aws.amazon.com/console/home', {
        timeout: 0,
        waitUntil: ['domcontentloaded']
    });
    await page.waitForSelector('#resolving_input', {timeout: 15000});
    await page.waitFor(500);

    let resolvinginput = await page.$('#resolving_input');
    await resolvinginput.press('Backspace');
    await resolvinginput.type(email, { delay: 100 });

    await page.click('#next_button');

    await page.waitFor(5000);

    let captchacontainer = await page.$('#captcha_container');

    let captchacontainerstyle = await page.evaluate((obj) => {
        return obj.getAttribute('style');
    }, captchacontainer);

    var captchanotdone = true;
    var captchaattempts = 0;

    if (captchacontainerstyle.includes("display: none")) {
    } else {
        while (captchanotdone) {
            captchaattempts += 1;
            if (captchaattempts > 6) {
                return;
            }
            try {
                let submitc = await page.$('#submit_captcha');

                let recaptchaimgx = await page.$('#captcha_image');
                let recaptchaurlx = await page.evaluate((obj) => {
                    return obj.getAttribute('src');
                }, recaptchaimgx);

                let result = await solveCaptcha2captcha(page, recaptchaurlx);

                let input3 = await page.$('#captchaGuess');
                await input3.press('Backspace');
                await input3.type(result, { delay: 100 });

                await submitc.click();
                await page.waitFor(5000);


                captchacontainer = await page.$('#captcha_container');
                captchacontainerstyle = await page.evaluate((obj) => {
                    return obj.getAttribute('style');
                }, captchacontainer);

                if (captchacontainerstyle.includes("display: none")) {


                    captchanotdone = false;
                }
            } catch (error) {
            }
        }

        await page.waitFor(5000);
    }
}



const httpGet = url => {
    const https = require('https');
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            res.setEncoding('utf8');
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });
};

const httpGetBinary = url => {
    const https = require('https');
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            //res.setEncoding('binary');
            var data = [ ];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => resolve(Buffer.concat(data)));
        }).on('error', reject);
    });
};

const httpPostJson = (url, postData) => {
    const https = require('https');
    var querystring = require('querystring');

    postData = querystring.stringify(postData);

    var options = {
        method: 'POST',
    };

    return new Promise((resolve, reject) => {
        let req = https.request(url, options);
        req.on('response', (res) => {
            //If the response status code is not a 2xx success code
            if (res.statusCode < 200 || res.statusCode > 299) {
                reject("Failed: " + options.path);
            }

            res.setEncoding('utf8');
            let body = '';
            res.on('data', chunk => {
                body += chunk;
            });
            res.on('end', () => resolve(body));
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
};
