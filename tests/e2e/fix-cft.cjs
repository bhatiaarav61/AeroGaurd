const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/tests/e2e/run-e2e.cjs';
let s = fs.readFileSync(p, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const J = (arr) => arr.join(EOL);

// 1. executablePath -> Chrome for Testing
s = s.replace(
  "const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';",
  "const CHROME = 'C:/Users/PC/Documents/AeroGaurd/tests/e2e/browsers/chrome/win64-154.0.8037.57/chrome-win64/chrome.exe';"
);

// 2. args: classic load-extension (works on CfT), drop the debugging flag
s = s.replace(
  "      '--enable-unsafe-extension-debugging',",
  J(['      \`--disable-extensions-except=${EXT}\`', '      \`--load-extension=${EXT}\`'])
);

// 3. replace the CDP install block with SW polling + deep probe
const start = s.indexOf('  // Chrome 137+ (branded): --load-extension is ignored; install via CDP');
const end = s.indexOf('  await sleep(6000);');
if (start === -1 || end === -1) { console.log('INSTALL BLOCK NOT FOUND'); process.exit(1); }
const probe = J([
  '  // wait for the extension service worker, then probe its live state',
  '  let extId = null, swWorker = null, swClient = null;',
  '  for (let i = 0; i < 30; i++) {',
  '    const t = browser.targets().find(t => t.type() === \'service_worker\' && t.url().startsWith(\'chrome-extension://\'));',
  '    if (t) {',
  '      extId = new URL(t.url()).host;',
  '      try { swWorker = await t.worker(); } catch {}',
  '      try { swClient = await t.createCDPSession(); await swClient.send(\'Runtime.enable\'); } catch {}',
  '      break;',
  '    }',
  '    await sleep(500);',
  '  }',
  '  if (swClient) {',
  "    swClient.on('Runtime.exceptionThrown', e => {",
  "      const d = e.exceptionDetails; console.log('[SW EXCEPTION]', (d.exception && d.exception.description || d.text || '').slice(0, 300));",
  '    });',
  "    swClient.on('Runtime.consoleAPICalled', e => {",
  "      const txt = (e.args || []).map(a => a.value || a.description || '').join(' ');",
  "      if (e.type === 'error' || e.type === 'warning') console.log('[SW console]', e.type, txt.slice(0, 200));",
  '    });',
  '  }',
  '  report.extension = { loaded: !!extId, id: extId, swFound: !!swWorker };',
  "  console.log('[ext]', JSON.stringify(report.extension));",
  '  if (swWorker) {',
  '    try {',
  '      report.extension.version = await swWorker.evaluate(() => chrome.runtime.getManifest().version);',
  '      report.extension.enabledRulesets = await swWorker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets());',
  '      report.extension.dynamicRules = await swWorker.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length);',
  '      console.log(\'[ext state]\', JSON.stringify({ version: report.extension.version, enabledCount: (report.extension.enabledRulesets || []).length, dynamic: report.extension.dynamicRules }));',
  '    } catch (e) { console.log(\'[ext probe error]\', e.message.slice(0, 120)); }',
  '  }'
]);
s = s.slice(0, start) + probe + EOL + s.slice(end);

fs.writeFileSync(p, s);
console.log('e2e updated: CfT + classic load-extension + SW probe');
