// Deep diagnostic: where does YouTube's JS stop? (with vs without extension)
const puppeteer = require('puppeteer-core');
const path = require('path');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const EXT = 'C:/Users/PC/Documents/AeroGaurd';
const CHROME = 'C:/Users/PC/Documents/AeroGaurd/tests/e2e/browsers/chrome/win64-154.0.8037.57/chrome-win64/chrome.exe';

async function run(label, withExt, profile) {
  const args = [
    '--no-first-run', '--no-default-browser-check', '--lang=en-US',
    '--disable-blink-features=AutomationControlled',
    `--user-data-dir=${path.join(__dirname, profile)}`
  ];
  if (withExt) args.push(`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, args });
  if (withExt) await sleep(8000);

  const page = await browser.newPage();
  let scriptParsed = 0;
  const exceptions = [];
  const client = await page.createCDPSession();
  await client.send('Runtime.enable');
  await client.send('Debugger.enable');
  client.on('Debugger.scriptParsed', () => scriptParsed++);
  client.on('Runtime.exceptionThrown', (e) => {
    const d = e.exceptionDetails;
    exceptions.push(((d.exception && d.exception.description) || d.text || '').slice(0, 160));
  });
  const bigScripts = [];
  page.on('response', r => {
    if (/polymer|ytmainappweb|base\.js|desktop_/.test(r.url()) && bigScripts.length < 8) {
      bigScripts.push(r.status() + ' ' + r.url().slice(8, 90));
    }
  });
  const blocked = [];
  page.on('requestfailed', r => {
    if (/BLOCKED_BY_CLIENT/.test(r.failure()?.errorText || '')) blocked.push(r.url().slice(8, 70));
  });

  await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(11000);
  const st = await page.evaluate(() => ({
    ytcfg: typeof window.ytcfg,
    ytcfgData: window.ytcfg ? !!window.ytcfg.data_ : null,
    ytplayer: typeof window.ytplayer,
    polymer: typeof customElements !== 'undefined' && !!customElements.get('ytd-app'),
    bodyTextLen: document.body.innerText.length,
    bodyChildren: document.body ? document.body.children.length : -1,
    shim: !!window.__aeroguardScriptlets,
    ytDataLen: window.ytInitialData ? JSON.stringify(window.ytInitialData).length : 0
  })).catch(e => ({ evalError: e.message.slice(0, 80) }));

  console.log(`\n===== ${label} =====`);
  console.log('scriptParsed:', scriptParsed);
  console.log('state:', JSON.stringify(st));
  console.log('core scripts loaded:', JSON.stringify(bigScripts));
  console.log('exceptions:', JSON.stringify(exceptions.slice(0, 6)));
  console.log('blocked:', JSON.stringify(blocked.slice(0, 6)));
  await browser.close();
}

(async () => {
  await run('WITH EXTENSION', true, 'profile-diag-ext');
  await run('WITHOUT EXTENSION', false, 'profile-diag-plain');
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
