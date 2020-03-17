#!/usr/bin/nodejs
'use strict';

const { spawn } = require( 'child_process' );
const fs = require('fs');
const puppeteer = require('puppeteer');
const prompt = require('prompt');
const isRoot = require('is-root');

if (! isRoot()) {
  return console.log('You must run the command as root (sudo)');
};

(async () => {

  const command = await spawn( 'openconnect', [
    '--protocol=gp',
    'vpn.theiconic.com.au',
    '--usergroup=gateway:prelogin-cookie',
  ],{
    stdio: [ 'pipe', 'inherit', 'pipe' ]
  });

  const errorHandler = () => {
    command.kill("SIGINT");
    process.exit();
  }

  process.on('SIGINT', errorHandler);

  command.stderr.once('data', async (data) => {
    fs.writeFileSync('form.html', data);
    const password = await getPassword();
  
    const url = `file://${process.cwd()}/form.html`;
    let headless = true;

    if (process.argv[3] && process.argv[3] == '--debug') {
      headless = false;
    }

    const browser = await puppeteer.launch({ headless, args: ['--disable-dev-shm-usage', '--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'load' });
    
    await page.waitForSelector("#okta-signin-username", "1");
    await page.type('#okta-signin-username', process.argv[2]);
    await page.type('#okta-signin-password', password);
    
    await page.click('#okta-signin-submit', {waitUntil: 'domcontentloaded'});
    console.log('Waiting for user and pass submit result');

    await page.waitFor(4000);
    await page.waitForSelector('.mfa-verify', {timeout: 1000}).catch(async () => {
      console.log('Okta browser error, with message:');
      const element = await page.$(".okta-form-infobox-error p");
      const text = await page.evaluate(element => element.textContent, element);
      console.log(text);
      console.log('Try running the command again with --debug at the end');
      errorHandler();
    });
    await page.click('.button.button-primary', {waitUntil: 'domcontentloaded'});
    console.log('Waiting for okta verify push confirmation. Check your smartphone!');
    

    const handle = await page.waitForFunction(() => {
      console.log(document.cookie);  
      if (document.cookie.indexOf('PHPSESSID') > -1) {
        return document.cookie;
      };

      return false;
    }, {
      polling: 3,
      timeout: 0,
    });

    const sessid = await handle;

    await browser.close();

    command.stdin.write('ljunior\n');
    command.stdin.write(sessid + '\n');
    command.stdin.end();
    
  });
})().catch((err) => console.log(err))

const getPassword = () => {
  return new Promise((resolve, reject) => {
    var prompt_attributes = [
        {
            name: 'password',
            hidden: true
        },
    ];
    prompt.start();
    prompt.get(prompt_attributes, function (err, result) {
        if (err) {
          reject(err);
        }else {
          resolve(result.password);
        }
    });
  })
}
