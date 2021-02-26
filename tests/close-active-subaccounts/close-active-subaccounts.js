// Adapted from and proudly found elsewhere at https://github.com/iann0036/aws-account-controller
// special thanks to Ian McKay
const AWS = require('aws-sdk');

const ssm = new AWS.SSM();
const org = new AWS.Organizations({region: 'us-east-1'});
const puppeteer = require('puppeteer');

const CAPTCHA_KEY = process.env['CAPTCHA_KEY'];
const PASSWORD = 'TesTIdontCare243!'

const handler = async function () {

    const accounts = await org.listAccounts().promise();

    for (let account of accounts.Accounts) {
        if (account.JoinedMethod !== 'CREATED' || account.Status !== 'ACTIVE') {
            continue;
        }
        console.log(account);

        const browser = await puppeteer.launch({args: ['--no-sandbox']});
        const page = await browser.newPage();

        const pw_reset_url = await requestPwResetLink(page, account.Email)
        await pwReset(page, pw_reset_url, PASSWORD);
        await accountDelete(page, account.Email, PASSWORD);

        await browser.close();
    }
};

async function requestPwResetLink(page, ACCOUNT_EMAIL) {
    await loginStage1(page, ACCOUNT_EMAIL);

    await page.click('#root_forgot_password_link');

    await page.waitForTimeout(2000);

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
        await input2.type(captcharesult, {delay: 100});

        await page.waitForTimeout(3000);

        await page.click('#password_recovery_ok_button');

        await page.waitForTimeout(5000);

        let errormessagediv = await page.$('#password_recovery_error_message');
        let errormessagedivstyle = await page.evaluate((obj) => {
            return obj.getAttribute('style');
        }, errormessagediv);

        if (errormessagedivstyle.includes("display: none")) {
            captchanotdone = false;
        }
        await page.waitForTimeout(2000);
    }

    await new Promise(resolve => setTimeout(resolve, 15000)); // give it some time to receive the mail

    const params = {
        Name: '/superwerker/rootmail/pw_reset_link/' + ACCOUNT_EMAIL.split('@')[0].split('+')[1]
    };

    let tries = 0
    const max_tries = 20
    let parameter;
    do {
        try {
            parameter = await ssm.getParameter(params).promise();
            break
        } catch(e) {
            console.log(e)
            await new Promise(resolve => setTimeout(resolve, 5000)); // one does not simply sleep() in node
        }
    }  while (++tries < max_tries);

    return parameter['Parameter']['Value'];
}

async function pwReset(page, url, password) {

    await page.goto(url, {
        timeout: 0,
        waitUntil: ['domcontentloaded']
    });
    await page.waitForTimeout(5000);


    let newpwinput = await page.$('#new_password');
    await newpwinput.press('Backspace');
    await newpwinput.type(password, {delay: 100});

    let input2 = await page.$('#confirm_password');
    await input2.press('Backspace');
    await input2.type(password, {delay: 100});

    await page.click('#reset_password_submit');
    await page.waitForTimeout(5000);
}

async function accountDelete(page, email, password) {

    await loginStage1(page, email);

    let input4 = await page.$('#password');
    await input4.press('Backspace');
    await input4.type(password, { delay: 100 });


    await page.click('#signin_button');
    await page.waitForTimeout(8000);


    await page.goto('https://console.aws.amazon.com/billing/home?#/account', {
        timeout: 0,
        waitUntil: ['domcontentloaded']
    });


    // remove cookie banner if present
    try {
        page.waitForSelector('#awsccc-cb-buttons > button.awsccc-u-btn.awsccc-u-btn-primary');
        await page.click('#awsccc-cb-buttons > button.awsccc-u-btn.awsccc-u-btn-primary');
        await page.waitForTimeout(1000);
    } catch (e) {
    }

    await page.click('#billing-console-root > div > div > div > div.content--2j5zk.span10--28Agl > div > div > div > div > div > div.ng-scope > div > div > div > div.animation-content.animation-fade > div:nth-child(13) > div > div > label:nth-child(1) > input');
    await page.waitForTimeout(1000);
    await page.click('#billing-console-root > div > div > div > div.content--2j5zk.span10--28Agl > div > div > div > div > div > div.ng-scope > div > div > div > div.animation-content.animation-fade > div:nth-child(13) > div > div > label:nth-child(5) > input');
    await page.waitForTimeout(1000);
    await page.click('#billing-console-root > div > div > div > div.content--2j5zk.span10--28Agl > div > div > div > div > div > div.ng-scope > div > div > div > div.animation-content.animation-fade > div:nth-child(13) > div > div > label:nth-child(6) > input');
    await page.waitForTimeout(1000);
    await page.click('#billing-console-root > div > div > div > div.content--2j5zk.span10--28Agl > div > div > div > div > div > div.ng-scope > div > div > div > div.animation-content.animation-fade > div:nth-child(13) > div > div > label:nth-child(8) > input');
    await page.waitForTimeout(5000);

    await page.click('.btn-danger'); // close account button

    await page.waitForTimeout(1000);

    await page.click('.modal-footer > button.btn-danger'); // confirm close account button

    await page.waitForTimeout(5000);

    // "Account has been closed" box
    await page.waitForSelector('#billing-console-root > div > div > div.root--3xRQC.awsui > div > div > div > div.text--37m-5', 10000);
}

async function loginStage1(page, email) {
    await page.goto('https://console.aws.amazon.com/console/home', {
        timeout: 0,
        waitUntil: ['domcontentloaded']
    });
    await page.waitForSelector('#resolving_input', {timeout: 15000});
    await page.waitForTimeout(500);

    let resolvinginput = await page.$('#resolving_input');
    await resolvinginput.press('Backspace');
    await resolvinginput.type(email, { delay: 100 });

    await page.click('#next_button');

    await page.waitForTimeout(5000);

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
                await page.waitForTimeout(5000);


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

        await page.waitForTimeout(5000);
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

(async () => {
    try {
        await handler();
    } catch (e) {
        console.log('got exception in outer scope', e)
        process.exit(1);
    }
})();