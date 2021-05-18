const AWS = require('aws-sdk');
const org = new AWS.Organizations({region: 'us-east-1'});

const lib = require('./lib')

const CAPTCHA_KEY = process.env['CAPTCHA_KEY'];

(async () => {
    try {
        const accounts = await org.listAccounts().promise();

        for (let account of accounts.Accounts) {
            if (account.JoinedMethod !== 'CREATED' || account.Status !== 'ACTIVE') {
                continue;
            }

            console.log(account);
    
            await lib.deleteAccount(account.Email, CAPTCHA_KEY);
        }
    } catch (e) {
        console.log('got exception in outer scope', e)
        process.exit(1);
    }
})();