// Bisect: what exactly is the youtube main frame response, and which layers ran?
const puppeteer = require('puppeteer-core');
const path = require('path');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const EXT = 'C:/Users/PC/Documents/AeroGaurd';
const CHROME = 'C:/Users/PC/Documents/AeroGaurd/tests/e2e/browsers/chrome/win64-154.0.8037.57/chrome-win64/chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    args: [
      `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      '--no-first-run', '--no-default-browser-check', '--lang=en-US',
      `--user-data-dir=${path.join(__dirname, 'profile-bisect')}`
    ]
  });
  await sleep(8000);

  const page = await browser.newPage();
  let mainStatus = null, mainLen = null;
  page.on('response', async (r) => {
    if (r.url() === 'https://www.youtube.com/' && mainStatus === null) {
      mainStatus = r.status();
      try {
        const body = await r.text();
        mainLen = body.length;
        fs.writeFileSync(path.join(__dirname, 'yt-main.html'), body);
      } catch (e) { mainLen = 'bodyErr:' + e.message.slice(0, 50); }
    }
  });
  const failed = [];
  page.on('requestfailed', r => failed.push({ u: r.url().slice(8, 70), e: r.failure()?.errorText }));
  const responses = [];
  page.on('response', r => { if (responses.length < 15) responses.push(r.status() + ' ' + r.url().slice(8, 75)); });

  await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(10000);

  const state = await page.evaluate(() => ({
    htmlLen: document.documentElement.outerHTML.length,
    bodyChildren: document.body ? document.body.children.length : -1,
    ytdApp: !!document.querySelector('ytd-app'),
    scriptTags: document.scripts.length,
    shim: !!window.__aeroguardScriptlets,
    enginePart2: !!(window.__aeroguardScriptlets && window.__aeroguardScriptlets.__part2),
    ytInitData: typeof window.ytInitialData,
    ytInitDataLen: window.ytInitialData ? JSON.stringify(window.ytInitialData).length : 0,
    ytPlayerResp: typeof window.ytInitialPlayerResponse,
    dataLayerIsStub: Array.isArray(window.dataLayer),
    polymerLoaded: typeof customElements !== 'undefined' && !!customElements.get('ytd-app'),
  })).catch(e => ({ evalError: e.message.slice(0, 100) }));

  console.log('mainStatus:', mainStatus, 'mainLen:', mainLen);
  console.log('state:', JSON.stringify(state, null, 1));
  console.log('first responses:', JSON.stringify(responses, null, 1));
  console.log('failed requests:', JSON.stringify(failed.slice(0, 8)));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
