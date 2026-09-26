// AeroGaurd end-to-end test: real Chrome + the unpacked extension.
// Starts a local test server, loads Chrome with the extension, then verifies:
//  - local test page: images/videos/scripts load, ad requests are blocked
//  - real sites (google, wikipedia, youtube): render, images visible, no client blocks
const http = require('http');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Users/PC/Documents/AeroGaurd/tests/e2e/browsers/chrome/win64-154.0.8037.57/chrome-win64/chrome.exe';
const EXT = 'C:/Users/PC/Documents/AeroGaurd';
const PORT = 8765;

// 1x1 solid-color PNGs (valid, stretched via CSS so they show in screenshots)
const PNG = {
  red: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  green: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
  blue: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
};

const PAGE_HTML = `<!DOCTYPE html>
<html><head><title>AeroGaurd e2e</title><style>
body{font-family:Segoe UI,sans-serif;background:#fff;margin:20px}
.row{display:flex;gap:12px;flex-wrap:wrap}
img,img.t{width:140px;height:90px;background:#eee;border:1px solid #ccc}
video{width:260px;height:150px;background:#000}
.bad{border:2px dashed red}
.ok{outline:2px solid #2c5}
table{border-collapse:collapse;font-size:12px}td,th{border:1px solid #999;padding:3px 8px}
</style></head>
<body>
<h2>AeroGaurd e2e page</h2>
<div class="row" id="imgs">
  <img id="l1" src="/img/red.png">
  <img id="l2" src="/img/green.png">
  <img id="l3" src="/img/blue.png">
  <img id="r1" src="https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png">
  <img id="r2" src="https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png">
  <img id="r3" src="https://www.wikipedia.org/portal/wikipedia.org/assets/img/Wikipedia-logo-v2.png">
</div>
<div class="row" style="margin-top:12px">
  <video id="v1" src="https://www.w3schools.com/html/mov_bbb.mp4" muted autoplay preload="auto" playsinline></video>
</div>
<div style="margin-top:8px">
  <img class="bad" id="ad1" src="https://www.google-analytics.com/collect?v=1&amp;t=pageview&amp;tid=UA-E2E-TEST">
  <iframe class="bad" id="ad2" src="https://pagead2.googlesyndication.com/pagead/ads" width="140" height="90"></iframe>
</div>
<div id="status" style="margin-top:10px">running...</div>
<script src="/script.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>
<script>
(function(){
  const results = { images: [], videos: [], adsBlocked: {}, scripts: {} };
  window.__testResults = results;
  const imgs = document.querySelectorAll('#imgs img, #ad1');
  imgs.forEach(im => {
    const rec = () => results.images.push({ id: im.id, ok: im.naturalWidth > 0, w: im.naturalWidth });
    if (im.complete) rec(); else { im.addEventListener('load', rec); im.addEventListener('error', () => { results.images.push({ id: im.id, ok: false, w: 0 }); }); }
  });
  const v = document.getElementById('v1');
  results.videos.push({ id: 'v1', ok: false });
  v.addEventListener('loadeddata', () => { results.videos[0].ok = true; });
  v.addEventListener('error', () => { results.videos[0].ok = false; results.videos[0].err = true; });
  v.addEventListener('canplay', () => { results.videos[0].ok = true; });
  document.getElementById('ad1').addEventListener('error', () => { results.adsBlocked.analyticsImg = true; });
  document.getElementById('ad2').addEventListener('error', () => { results.adsBlocked.adIframe = true; });
  window.addEventListener('error', (e) => {
    if (/pagead|adsbygoogle/.test(e.filename || '')) results.adsBlocked.adScript = true;
  }, true);
  let checks = 0;
  const t = setInterval(() => {
    checks++;
    results.scripts.local = !!window.__localScript;
    results.scripts.jquery = !!window.jQuery;
    results.videos[0].ok = results.videos[0].ok || v.readyState >= 2;
    if (checks >= 10) {
      clearInterval(t);
      results.ready = true;
      document.getElementById('status').textContent = 'DONE - see window.__testResults';
    }
  }, 800);
})();
</script>
</body></html>`;

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = req.url.split('?')[0];
      if (u === '/test') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(PAGE_HTML);
      } else if (u.startsWith('/img/')) {
        const key = u.replace('/img/', '').replace('.png', '');
        const buf = PNG[key] || PNG.red;
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(buf);
      } else if (u === '/script.js') {
        res.writeHead(200, { 'content-type': 'text/javascript' });
        res.end('window.__localScript = true;');
      } else {
        res.writeHead(404); res.end();
      }
    });
    srv.listen(PORT, () => resolve(srv));
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const report = { extension: {}, testPage: {}, sites: {} };
  const srv = await startServer();
  console.log('[srv] listening on ' + PORT);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    dumpio: false,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate',
      '--lang=en-US',
      `--user-data-dir=${path.join(__dirname, 'profile')}`
    ]
  });

  // wait for the extension service worker, then probe its live state
  let extId = null, swWorker = null, swClient = null;
  for (let i = 0; i < 30; i++) {
    const t = browser.targets().find(t => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'));
    if (t) {
      extId = new URL(t.url()).host;
      try { swWorker = await t.worker(); } catch {}
      try { swClient = await t.createCDPSession(); await swClient.send('Runtime.enable'); } catch {}
      break;
    }
    await sleep(500);
  }
  if (swClient) {
    swClient.on('Runtime.exceptionThrown', e => {
      const d = e.exceptionDetails; console.log('[SW EXCEPTION]', (d.exception && d.exception.description || d.text || '').slice(0, 300));
    });
    swClient.on('Runtime.consoleAPICalled', e => {
      const txt = (e.args || []).map(a => a.value || a.description || '').join(' ');
      if (e.type === 'error' || e.type === 'warning') console.log('[SW console]', e.type, txt.slice(0, 200));
    });
  }
  report.extension = { loaded: !!extId, id: extId, swFound: !!swWorker };
  console.log('[ext]', JSON.stringify(report.extension));
  if (swWorker) {
    try {
      report.extension.version = await swWorker.evaluate(() => chrome.runtime.getManifest().version);
      report.extension.enabledRulesets = await swWorker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets());
      report.extension.dynamicRules = await swWorker.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length);
      console.log('[ext state]', JSON.stringify({ version: report.extension.version, enabledCount: (report.extension.enabledRulesets || []).length, dynamic: report.extension.dynamicRules }));
    } catch (e) { console.log('[ext probe error]', e.message.slice(0, 120)); }
  }
  await sleep(6000); // let the service worker finish initialize()

  // ---------- local test page ----------
  {
    const page = await browser.newPage();
    const consoleErrors = [];
    const blocked = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 120)); });
    page.on('requestfailed', r => blocked.push({ url: r.url().slice(0, 90), err: r.failure()?.errorText }));
    await page.goto(`http://localhost:${PORT}/test`, { waitUntil: 'load', timeout: 45000 });
    await sleep(9500);
    report.testPage.results = await page.evaluate(() => window.__testResults);
    report.testPage.consoleErrors = consoleErrors.slice(0, 8);
    report.testPage.blockedRequests = blocked.slice(0, 10);
    await page.screenshot({ path: path.join(__dirname, 'shot-testpage.png') });
    await page.close();
    console.log('[test page]', JSON.stringify(report.testPage.results));
  }

  // ---------- real sites ----------
  async function visitSite(name, url, waitMs, evaluateFn) {
    const page = await browser.newPage();
    const consoleErrors = [];
    const blocked = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 120)); });
    page.on('requestfailed', r => blocked.push({ url: r.url().slice(0, 100), err: r.failure()?.errorText }));
    let mainFrameOk = true;
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      mainFrameOk = resp ? resp.ok() || resp.status() < 400 : true;
      await sleep(waitMs);
    } catch (e) {
      mainFrameOk = false;
      report.sites[name] = { mainFrameOk, error: e.message.slice(0, 120) };
      await page.close();
      return;
    }
    let evalResult = null;
    try { evalResult = await page.evaluate(evaluateFn); } catch (e) { evalResult = { evalError: e.message.slice(0, 100) }; }
    report.sites[name] = {
      mainFrameOk,
      finalUrl: page.url().slice(0, 80),
      evalResult,
      consoleErrors: consoleErrors.slice(0, 6),
      blockedByClient: blocked.filter(b => /ERR_BLOCKED_BY_CLIENT/.test(b.err || '')).slice(0, 8)
    };
    await page.screenshot({ path: path.join(__dirname, `shot-${name}.png`) });
    await page.close();
    console.log(`[${name}]`, JSON.stringify(report.sites[name]).slice(0, 400));
  }

  await visitSite('google', 'https://www.google.com/', 4000, () => {
    const imgs = [...document.images];
    return {
      title: document.title,
      imgsLoaded: imgs.filter(i => i.naturalWidth > 0).length,
      imgsTotal: imgs.length,
      searchBox: !!document.querySelector('textarea[name=q], input[name=q]'),
      bodyTextLen: document.body.innerText.length
    };
  });

  await visitSite('wikipedia', 'https://en.wikipedia.org/wiki/Video', 3000, () => {
    const imgs = [...document.images];
    return {
      title: document.title,
      imgsLoaded: imgs.filter(i => i.naturalWidth > 0).length,
      imgsTotal: imgs.length,
      bodyTextLen: document.body.innerText.length
    };
  });

  await visitSite('youtube', 'https://www.youtube.com/', 9000, () => {
    const imgs = [...document.images];
    return {
      title: document.title,
      isConsentWall: /consent/.test(location.host),
      imgsLoaded: imgs.filter(i => i.naturalWidth > 0).length,
      imgsTotal: imgs.length,
      hasApp: !!document.querySelector('ytd-app'),
      gridItems: document.querySelectorAll('ytd-rich-item-renderer').length,
      bodyTextLen: document.body.innerText.length
    };
  });

  fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(report, null, 1));
  console.log('\n=== REPORT saved to tests/e2e/report.json ===');
  await browser.close();
  srv.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
