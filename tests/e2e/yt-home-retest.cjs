// YouTube homepage retest with extension after the shredder/proxy fixes
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
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-first-run', '--no-default-browser-check', '--lang=en-US',
      '--disable-blink-features=AutomationControlled',
      `--user-data-dir=${path.join(__dirname, 'profile-ab-ext2')}`
    ]
  });
  await sleep(8000);
  const page = await browser.newPage();
  const blocked = [];
  page.on('requestfailed', r => {
    if (/BLOCKED_BY_CLIENT/.test(r.failure()?.errorText || '')) blocked.push(r.url().slice(8, 80));
  });
  await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(12000);
  const st = await page.evaluate(() => ({
    title: document.title.slice(0, 30),
    polymerLoaded: typeof customElements !== 'undefined' && !!customElements.get('ytd-app'),
    gridItems: document.querySelectorAll('ytd-rich-item-renderer').length,
    imgs: [...document.images].filter(i => i.naturalWidth > 0).length,
    imgsTotal: document.images.length,
    bodyTextLen: document.body.innerText.length,
    ytDataLen: window.ytInitialData ? JSON.stringify(window.ytInitialData).length : 0
  }));
  console.log(JSON.stringify(st, null, 1));
  console.log('blocked by client:', blocked.slice(0, 6));
  await page.screenshot({ path: path.join(__dirname, 'shot-yt-home-fixed.png') });
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
