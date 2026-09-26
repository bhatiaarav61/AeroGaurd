// Probe the extension's live rule state via its service worker
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
      `--user-data-dir=${path.join(__dirname, 'profile2')}`
    ],
    dumpio: false
  });
  let extId = null;
  try { const cdp = await browser.target().createCDPSession(); const r = await cdp.send('Extensions.loadUnpacked', { path: EXT }); extId = r.id; } catch (e) { console.log('loadUnpacked failed:', e.message.slice(0,80)); }
  console.log('[ext]', extId);
  await sleep(7000); // let the SW run initialize()

  // find the SW target
  let swTarget = null;
  for (let i = 0; i < 10; i++) {
    swTarget = browser.targets().find(t => t.type() === 'service_worker' && t.url().includes(extId));
    if (swTarget) break;
    await sleep(1000);
  }
  if (!swTarget) {
    console.log('SW TARGET NOT FOUND. targets:');
    for (const t of browser.targets()) console.log(' ', t.type(), t.url().slice(0, 90));
    await browser.close();
    process.exit(1);
  }
  const worker = await swTarget.worker();
  const evalIn = async (expr) => {
    try { return await worker.evaluate(expr); } catch (e) { return { evalError: e.message.slice(0, 120) }; }
  };

  const enabled = await evalIn(() => chrome.declarativeNetRequest.getEnabledRulesets());
  console.log('enabled rulesets:', JSON.stringify(enabled));

  const dyn = await evalIn(async () => {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    return { count: rules.length, ids: rules.slice(0, 5).map(r => r.id) };
  });
  console.log('dynamic rules:', JSON.stringify(dyn));

  const settings = await evalIn(async () => {
    const st = await chrome.storage.local.get('settings');
    return st.settings ? { enabled: st.settings.enabled, disabledLists: (st.settings.disabledLists || []).length } : 'no-settings-stored';
  });
  console.log('stored settings:', JSON.stringify(settings));

  const errs = await evalIn(() => {
    // last runtime error, if any
    return { lastError: chrome.runtime.lastError ? chrome.runtime.lastError.message : null };
  });
  console.log('runtime lastError:', JSON.stringify(errs));

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
