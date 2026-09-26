// A/B: youtube.com with extension vs without, same CfT browser
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const EXT = 'C:/Users/PC/Documents/AeroGaurd';
const CHROME = 'C:/Users/PC/Documents/AeroGaurd/tests/e2e/browsers/chrome/win64-154.0.8037.57/chrome-win64/chrome.exe';

async function testYoutube(label, withExt, profile) {
  const args = [
    '--no-first-run', '--no-default-browser-check', '--lang=en-US',
    `--user-data-dir=${path.join(__dirname, profile)}`
  ];
  if (withExt) {
    args.push(`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`);
  }
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, args });
  if (withExt) await sleep(8000); // let the SW initialize

  const page = await browser.newPage();
  const ytRequests = [];
  page.on('response', async (r) => {
    if (r.url().includes('youtubei/v1/')) {
      ytRequests.push({ url: r.url().slice(8, 80), status: r.status() });
    }
  });
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 90)); });
  const blocked = [];
  page.on('requestfailed', r => {
    if (/BLOCKED_BY_CLIENT/.test(r.failure()?.errorText || '')) blocked.push(r.url().slice(0, 90));
  });

  await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(10000);
  const state = await page.evaluate(() => ({
    title: document.title.slice(0, 40),
    bodyTextLen: document.body.innerText.length,
    gridItems: document.querySelectorAll('ytd-rich-item-renderer').length,
    imgs: [...document.images].filter(i => i.naturalWidth > 0).length,
    imgsTotal: document.images.length,
    shimPresent: !!window.__aeroguardScriptlets,
    playerResponse: !!(window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.videoDetails),
  })).catch(e => ({ evalError: e.message.slice(0, 80) }));
  const out = { label, state, ytRequests: ytRequests.slice(0, 8), blockedCount: blocked.length, blocked: blocked.slice(0, 5), consoleErrors: consoleErrors.slice(0, 5) };
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  return out;
}

(async () => {
  const withExt = await testYoutube('WITH extension', true, 'profile-ab-ext');
  const without = await testYoutube('WITHOUT extension', false, 'profile-ab-plain');
  fs.writeFileSync(path.join(__dirname, 'ab-report.json'), JSON.stringify({ withExt, without }, null, 1));
  console.log('=== AB RESULT saved ===');
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
