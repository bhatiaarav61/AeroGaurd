// Open the extension's own options page (extension context) and interrogate DNR
const puppeteer = require('puppeteer-core');
const path = require('path');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const EXT = 'C:/Users/PC/Documents/AeroGaurd';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: false,
    args: [
      '--enable-unsafe-extension-debugging',
      '--no-first-run', '--no-default-browser-check', '--lang=en-US',
      `--user-data-dir=${path.join(__dirname, 'profile4')}`
    ]
  });
  const cdp = await browser.target().createCDPSession();
  const { id: extId } = await cdp.send('Extensions.loadUnpacked', { path: EXT });
  console.log('[ext]', extId);
  await sleep(4000);

  const page = await browser.newPage();
  const consoleMsgs = [];
  page.on('console', m => consoleMsgs.push(`[${m.type()}] ${m.text().slice(0, 160)}`));
  page.on('pageerror', e => consoleMsgs.push(`[pageerror] ${String(e).slice(0, 200)}`));

  await page.goto(`chrome-extension://${extId}/options/options.html`, { waitUntil: 'load', timeout: 20000 }).catch(e => console.log('goto err:', e.message.slice(0, 80)));
  await sleep(4000);
  console.log('options url:', page.url().slice(0, 70));

  const state = await page.evaluate(async () => {
    const out = {};
    try {
      out.enabledRulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
    } catch (e) { out.enabledRulesetsErr = e.message; }
    try {
      const dyn = await chrome.declarativeNetRequest.getDynamicRules();
      out.dynamicCount = dyn.length;
    } catch (e) { out.dynamicErr = e.message; }
    try {
      const st = await chrome.storage.local.get(null);
      out.storageKeys = Object.keys(st);
      out.settings = st.settings ? { enabled: st.settings.enabled, disabledLists: st.settings.disabledLists } : null;
    } catch (e) { out.storageErr = e.message; }
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'GET_EXTENSION_STATE' });
      out.runtimeState = resp;
    } catch (e) { out.runtimeErr = e.message.slice(0, 120); }
    return out;
  });
  console.log('EXTENSION STATE:', JSON.stringify(state, null, 1));
  console.log('console from options page:');
  consoleMsgs.slice(0, 20).forEach(m => console.log(' ', m));

  // check the SW wake state after the options page messaged it
  await sleep(2000);
  const swAlive = browser.targets().some(t => t.type() === 'service_worker' && t.url().includes(extId));
  console.log('SW alive after message:', swAlive);

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
