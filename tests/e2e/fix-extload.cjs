const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/tests/e2e/run-e2e.cjs';
let s = fs.readFileSync(p, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';

// 1. launch args: add the unsafe-extension-debugging flag
s = s.replace(
  "      `--load-extension=${EXT}`,",
  "      '--enable-unsafe-extension-debugging',"
);

// 2. replace the SW-target polling block with installExtension + polling
const oldBlock = [
  '  // confirm the extension actually loaded via its service worker target',
  '  let extId = null;',
  '  for (let i = 0; i < 20; i++) {',
  '    for (const t of browser.targets()) {',
  "      if (t.type() === 'service_worker' && t.url().startsWith('chrome-extension://')) {",
  '        extId = new URL(t.url()).host;',
  '      }',
  '    }',
  '    if (extId) break;',
  '    await sleep(500);',
  '  }'
].join(EOL);
const newBlock = [
  '  // Chrome 137+ (branded): --load-extension is ignored; install via CDP',
  '  let extId = null;',
  '  try {',
  '    extId = await browser.installExtension(EXT);',
  "    console.log('[ext] installExtension ->', extId);",
  '  } catch (e) {',
  "    console.log('[ext] installExtension failed:', e.message.slice(0, 100));",
  '    try {',
  '      const cdp = await browser.target().createCDPSession();',
  "      const r = await cdp.send('Extensions.loadUnpacked', { path: EXT });",
  '      extId = r.id;',
  "      console.log('[ext] Extensions.loadUnpacked ->', extId);",
  '    } catch (e2) {',
  "      console.log('[ext] loadUnpacked failed:', e2.message.slice(0, 100));",
  '    }',
  '  }',
  '  for (let i = 0; i < 20 && !extId; i++) {',
  '    for (const t of browser.targets()) {',
  "      if (t.type() === 'service_worker' && t.url().startsWith('chrome-extension://')) {",
  '        extId = new URL(t.url()).host;',
  '      }',
  '    }',
  '    if (extId) break;',
  '    await sleep(500);',
  '  }'
].join(EOL);
if (!s.includes(oldBlock)) { console.log('EXT POLL BLOCK NOT FOUND'); process.exit(1); }
s = s.replace(oldBlock, () => newBlock);
fs.writeFileSync(p, s);
console.log('e2e switched to CDP extension install');
