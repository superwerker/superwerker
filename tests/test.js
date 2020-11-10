var synthetics = require('Synthetics');
const log = require('SyntheticsLogger');
var querystring = require('querystring');

synthetics.setLogLevel(0);

const CAPTCHA_KEY = process.env.CAPTCHA_KEY;

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

const httpPostJson = (url, postData) => {
    const https = require('https');

    var options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length
        }
    };

    postData = querystring.stringify(postData);

    return new Promise((resolve, reject) => {
        log.info("Making request with options: " + JSON.stringify(options));
        let req = https.request(url, options);
        req.on('response', (res) => {
            log.info(`Status Code: ${res.statusCode}`)
            log.info(`Response Headers: ${JSON.stringify(res.headers)}`)
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


const solveCaptcha2captcha = async (page, url) => {
    var imgbody = await httpGet(url).then(res => {
        return res;
    });

    var captcharef = await httpPostJson('https://2captcha.com/in.php', JSON.stringify({
            'key': CAPTCHA_KEY,
            'method': 'base64',
            'body': "data:image/jpeg;base64," + Buffer.from(imgbody).toString('base64')
        })).then(res => {
            console.log('2Captcha: ' + res)
        return res.split("|").pop();
    });

    var captcharesult = '';
    var i = 0;
    while (!captcharesult.startsWith("OK") && i < 20) {
        await new Promise(resolve => { setTimeout(resolve, 5000); });

        var captcharesult = await httpGet('https://2captcha.com/res.php?key=' + CAPTCHA_KEY + '&action=get&id=' + captcharef).then(res => {
            console.log(res)
            return res;
        });

        i++;
    }

    return captcharesult.split("|").pop();
}

async function handleEmailInbound(page, event) {
    for (const record of event['Records']) {
        var account = null;
        var email = '';
        var body = '';
        var isdeletable = false;

        let data = await s3.getObject({
            Bucket: record.s3.bucket.name,
            Key: record.s3.object.key
        }).promise();

        var msg = InternetMessage.parse(data.Body.toString());

        email = msg.to;
        body = msg.body;

        var emailmatches = /<(.*)>/g.exec(msg.to);
        if (emailmatches && emailmatches.length > 1) {
            email = emailmatches[1];
        }

        data = await retryWrapper(organizations, 'listAccounts', {
            // no params
        });
        let accounts = data.Accounts;
        while (data.NextToken) {
            data = await retryWrapper(organizations, 'listAccounts', {
                NextToken: data.NextToken
            });

            accounts = accounts.concat(data.Accounts);
        }

        for (const accountitem of accounts) {
            if (accountitem.Email == email) {
                account = accountitem;
            }
        }

        var accountemailforwardingaddress = null;
        var provisionedproductid = null;

        if (account) {
            let orgtags = await retryWrapper(organizations, 'listTagsForResource', { // TODO: paginate
                ResourceId: account.Id
            });

            orgtags.Tags.forEach(tag => {
                if (tag.Key.toLowerCase() == "delete" && tag.Value.toLowerCase() == "true") {
                    isdeletable = true;
                }
                if (tag.Key.toLowerCase() == "accountemailforwardingaddress") {
                    accountemailforwardingaddress = tag.Value;
                }
                if (tag.Key.toLowerCase() == "accountemailforwardingaddress") {
                    accountemailforwardingaddress = tag.Value;
                }
                if (tag.Key.toLowerCase() == "servicecatalogprovisionedproductid") {
                    provisionedproductid = tag.Value;
                }
            });
        }

        let filteredbody = body.replace(/=3D/g, '=').replace(/=\r\n/g, '');

        let start = filteredbody.indexOf("https://signin.aws.amazon.com/resetpassword");
        if (start !== -1) {
            LOG.debug("Started processing password reset");

            let secretsmanagerresponse = await secretsmanager.getSecretValue({
                SecretId: process.env.SECRET_ARN
            }).promise();

            let secretdata = JSON.parse(secretsmanagerresponse.SecretString);

            let end = filteredbody.indexOf("<", start);
            let url = filteredbody.substring(start, end);

            let parsedurl = new URL(url);
            if (parsedurl.host != "signin.aws.amazon.com") { // safety
                throw "Unexpected reset password host";
            }

            if (!account) { // safety
                LOG.debug("No account found, aborting");
                return;
            }

            LOG.debug(url);

            await page.goto(url, {
                timeout: 0,
                waitUntil: ['domcontentloaded']
            });
            await page.waitFor(5000);

            await debugScreenshot(page);

            let newpwinput = await page.$('#new_password');
            await newpwinput.press('Backspace');
            await newpwinput.type(secretdata.password, { delay: 100 });

            let input2 = await page.$('#confirm_password');
            await input2.press('Backspace');
            await input2.type(secretdata.password, { delay: 100 });

            await page.click('#reset_password_submit');
            await page.waitFor(5000);

            LOG.info("Completed resetpassword link verification");

            if (isdeletable) {
                LOG.info("Begun delete account");

                if (provisionedproductid) {
                    var terminaterecord = await servicecatalog.terminateProvisionedProduct({
                        TerminateToken: Math.random().toString().substr(2),
                        IgnoreErrors: true,
                        ProvisionedProductId: provisionedproductid
                    }).promise();
                }

                await loginStage1(page, email);

                await debugScreenshot(page);

                let input4 = await page.$('#password');
                await input4.press('Backspace');
                await input4.type(secretdata.password, { delay: 100 });

                await debugScreenshot(page);

                await page.click('#signin_button');
                await page.waitFor(8000);

                await debugScreenshot(page);

                await page.goto('https://portal.aws.amazon.com/billing/signup?client=organizations&enforcePI=True', {
                    timeout: 0,
                    waitUntil: ['domcontentloaded']
                });
                await page.waitFor(8000);

                await debugScreenshot(page);
                LOG.debug("Screenshotted at portal");
                LOG.debug(page.mainFrame().url());
                // /confirmation is an activation period
                if (page.mainFrame().url().split("#").pop() == "/paymentinformation") {

                    let input5 = await page.$('#credit-card-number');
                    await input5.press('Backspace');
                    await input5.type(secretdata.ccnumber, { delay: 100 });

                    await page.select('#expirationMonth', (parseInt(secretdata.ccmonth)-1).toString());

                    await page.waitFor(2000);
                    await debugScreenshot(page);

                    let currentyear = new Date().getFullYear();

                    await page.select('select[name=\'expirationYear\']', (parseInt(secretdata.ccyear)-currentyear).toString());

                    let input6 = await page.$('#accountHolderName');
                    await input6.press('Backspace');
                    await input6.type(secretdata.ccname, { delay: 100 });

                    await page.waitFor(2000);
                    await debugScreenshot(page);

                    await page.click('.form-submit-click-box > button');

                    await page.waitFor(8000);
                }

                await debugScreenshot(page);

                if (page.mainFrame().url().split("#").pop() == "/identityverification") {
                    let usoption = await page.$('option[label="United States (+1)"]');
                    let usvalue = await page.evaluate( (obj) => {
                        return obj.getAttribute('value');
                    }, usoption);

                    await page.select('#countryCode', usvalue);

                    let connectssmparameter = await ssm.getParameter({
                        Name: process.env.CONNECT_SSM_PARAMETER
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

                            await debugScreenshot(page);
                            let recaptchaimgx = await page.$('#imageCaptcha');
                            let recaptchaurlx = await page.evaluate((obj) => {
                                return obj.getAttribute('src');
                            }, recaptchaimgx);

                            LOG.debug("CAPTCHA IMG URL:");
                            LOG.debug(recaptchaurlx);
                            let result = await solveCaptcha2captcha(page, recaptchaurlx);

                            LOG.debug("CAPTCHA RESULT:");
                            LOG.debug(result);

                            let input32 = await page.$('#guess');
                            await input32.press('Backspace');
                            await input32.type(result, { delay: 100 });

                            await debugScreenshot(page);
                            await submitc.click();
                            await page.waitFor(5000);

                            await debugScreenshot(page);

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

                    await debugScreenshot(page);

                    variables['CODE'] = phonecodetext;

                    await ssm.putParameter({
                        Name: process.env.CONNECT_SSM_PARAMETER,
                        Type: "String",
                        Value: JSON.stringify(variables),
                        Overwrite: true
                    }).promise();

                    await page.waitFor(30000);

                    await debugScreenshot(page);

                    try {
                        await page.click('#verification-complete-button');
                    } catch(err) {
                        LOG.error("Could not confirm phone number verification - possible error in DIVA system or credit card");
                        throw err;
                    }

                    await page.waitFor(3000);

                    await debugScreenshot(page);

                }

                if (page.mainFrame().url().split("#").pop() == "/support" || page.mainFrame().url().split("#").pop() == "/confirmation") {
                    await page.goto('https://console.aws.amazon.com/billing/rest/v1.0/account', {
                        timeout: 0,
                        waitUntil: ['domcontentloaded']
                    });

                    await page.waitFor(3000);

                    await debugScreenshot(page);

                    let accountstatuspage = await page.content();

                    LOG.debug(accountstatuspage);

                    let issuspended = accountstatuspage.includes("\"accountStatus\":\"Suspended\"");

                    if (provisionedproductid) {
                        let terminatestatus = "CREATED";
                        while (['CREATED', 'IN_PROGRESS'].includes(terminatestatus)) {
                            await new Promise((resolve) => {setTimeout(resolve, 10000)});

                            let record = await servicecatalog.describeRecord({
                                Id: terminaterecord.RecordDetail.RecordId
                            }).promise();
                            terminatestatus = record.RecordDetail.Status;
                        }
                        if (terminatestatus != "SUCCEEDED") {
                            throw "Could not terminate product from Service Catalog";
                        }
                    }

                    if (!issuspended) {
                        await page.goto('https://console.aws.amazon.com/billing/home?#/account', {
                            timeout: 0,
                            waitUntil: ['domcontentloaded']
                        });

                        await page.waitFor(8000);

                        await debugScreenshot(page);

                        let closeaccountcbs = await page.$$('.close-account-checkbox > input');
                        await closeaccountcbs.forEach(async (cb) => {
                            await cb.click();
                        });

                        await page.waitFor(1000);

                        await debugScreenshot(page);

                        await page.click('.btn-danger'); // close account button

                        await page.waitFor(1000);

                        await debugScreenshot(page);

                        await page.click('.modal-footer > button.btn-danger'); // confirm close account button

                        await page.waitFor(5000);

                        await debugScreenshot(page);

                        await retryWrapper(organizations, 'tagResource', {
                            ResourceId: account.Id,
                            Tags: [{
                                Key: "AccountDeletionTime",
                                Value: (new Date()).toISOString()
                            }]
                        });
                    }

                    await removeAccountFromOrg(account);
                } else {
                    LOG.warn("Unsure of location, send help! - " + page.mainFrame().url());
                }
            }

        }
    }

    return true;
};

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




const flowBuilderBlueprint = async function () {
    let page = await synthetics.getPage();

    let email = 'root+1602246046@aws.db182a4d-4ac9-43fc-b4b1-4ba89275b063.de';

    await synthetics.executeStep('consoleLogin', async function () {

        await loginStage1(page, email);

        await page.click('#root_forgot_password_link');

        await page.waitFor(2000);

        await page.waitForSelector('#password_recovery_captcha_image', {timeout: 15000});

        captchanotdone = true;
        captchaattempts = 0;
        while (captchanotdone) {
            captchaattempts += 1;
            if (captchaattempts > 6) {
                return;
            }

            let recaptchaimg = await page.$('#password_recovery_captcha_image');
            let recaptchaurl = await page.evaluate((obj) => {
                return obj.getAttribute('src');
            }, recaptchaimg);


            let captcharesult = await solveCaptcha2captcha(page, recaptchaurl);

            let input2 = await page.$('#password_recovery_captcha_guess');
            await input2.press('Backspace');
            await input2.type(captcharesult, { delay: 100 });

            await page.waitFor(3000);


            await page.click('#password_recovery_ok_button');

            await page.waitFor(5000);

            let errormessagediv = await page.$('#password_recovery_error_message');
            let errormessagedivstyle = await page.evaluate((obj) => {
                return obj.getAttribute('style');
            }, errormessagediv);

            if (errormessagedivstyle.includes("display: none")) {
                captchanotdone = false;
            }
        }

        await page.waitFor(2000);

    });
};

exports.handler = async () => {
    return await flowBuilderBlueprint();
};

