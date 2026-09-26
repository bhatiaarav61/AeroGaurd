// Definitive probe: are static DNR rules active? Does the SW ever start?
const puppeteer = require('puppeteer-core');
const path = require('path');
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const EXT = 'C:/Users/PC/Documents/AeroGaurd';

const srv = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<html><body>probe</body></html>');
});

(async () => {
  await new Promise(r => srv.listen(8766, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: false,
    dumpio: true, // capture chrome stderr - extension errors appear here
    args: [
      '--enable-unsafe-extension-debugging',
      '--no-first-run', '--no-default-browser-check', '--lang=en-US',
      `--user-data-dir=${path.join(__dirname, 'profile3')}`
    ]
  });
  const cdp = await browser.target().createCDPSession();
  const r = await cdp.send('Extensions.loadUnpacked', { path: EXT });
  const extId = r.id;
  console.log('[ext]', extId);
  await sleep(5000);

  // SW target present?
  const findSW = () => browser.targets().find(t => t.type() === 'service_worker' && t.url().includes(extId));
  console.log('SW target right after load:', !!findSW());

  // wake attempts: open a page (navigation events wake nothing, but onInstalled should have)
  const page = await browser.newPage();
  await page.goto('http://localhost:8766/', { waitUntil: 'load' });
  await sleep(2000);
  console.log('SW target after page open:', !!findSW());

  // static rule activity: fetch known-blocked endpoints from the page
  const probe = await page.evaluate(async () => {
    const test = async (url) => {
      try {
        await fetch(url, { mode: 'no-cors', cache: 'no-store' });
        return 'LOADED (not blocked)';
      } catch (e) {
        return 'BLOCKED/FAILED: ' + e.message.slice(0, 60);
      }
    };
    return {
      analytics: await test('https://www.google-analytics.com/collect?v=1&t=probe'),
      pagead: await test('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'),
      control: await test('https://www.wikipedia.org/'),
    };
  });
  console.log('static rule probe:', JSON.stringify(probe, null, 1));
  console.log('SW target after probes:', !!findSW());

  await browser.close();
  srv.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
