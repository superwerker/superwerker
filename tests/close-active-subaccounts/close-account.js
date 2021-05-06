
const lib = require('./lib')

const CAPTCHA_KEY = process.env['CAPTCHA_KEY'];
const ACCOUNT_MAIL_ADDRESS = process.env['ACCOUNT_MAIL_ADDRESS'];

(async () => {
    try {
        await lib.deleteAccount(ACCOUNT_MAIL_ADDRESS, CAPTCHA_KEY);
    } catch (e) {
        console.log('got exception in outer scope', e)
        process.exit(1);
    }
})();