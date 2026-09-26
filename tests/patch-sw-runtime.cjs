const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/background/service-worker.js';
let s = fs.readFileSync(p, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const join = (lines) => lines.join(EOL);

// 1. Sanitize-before-apply for dynamic rules (CRLF aware)
const oldBlockRe = /  const capped = rules\.slice\(0, MAX_DYNAMIC_RULES\);[\s\S]*?console\.log\(`\[AeroGuard\] Applied \$\{capped\.length\} dynamic rules`\);\r?\n\}/;
if (!oldBlockRe.test(s)) { console.log('OLD DNR BLOCK NOT FOUND'); process.exit(1); }
const newBlock = join([
  '  // Sanitize every rule before applying: one invalid rule would fail the',
  '  // whole atomic update and leave the extension unable to intercept requests.',
  '  const valid = [];',
  '  for (const rule of rules.slice(0, MAX_DYNAMIC_RULES)) {',
  '    const clean = sanitizeRule(rule);',
  '    if (clean) valid.push(clean);',
  "    else console.warn('[AeroGuard] dropped invalid dynamic rule', rule?.id, JSON.stringify(rule?.condition || {}).slice(0, 120));",
  '  }',
  '',
  "  const result = await wrapDNR('applyDynamicRules', async () => {",
  '    const existing = (await chrome.declarativeNetRequest.getDynamicRules()).map(r => r.id);',
  '    await chrome.declarativeNetRequest.updateDynamicRules({',
  '      removeRuleIds: existing,',
  '      addRules: valid',
  '    });',
  '  });',
  '  if (!result.success) {',
  "    console.error('[AeroGuard] applyDynamicRules failed:', result.error?.message);",
  '  }',
  '  console.log(`[AeroGuard] Applied ${valid.length} of ${rules.length} dynamic rules`);',
  '}'
]);
s = s.replace(oldBlockRe, newBlock);

// 2. injectPrivacyScripts: skip protected pages, single attempt (no retry storm)
const oldInject = join([
  'async function injectPrivacyScripts(tabId) {',
  "  await wrapScriptInjection('injectPrivacyScripts', async () => {",
  '    await chrome.scripting.executeScript({',
  '      target: { tabId, allFrames: true },',
  '      files: PRIVACY_MODULES',
  '    });',
  '  });',
  '}'
]);
if (!s.includes(oldInject)) { console.log('OLD INJECT BLOCK NOT FOUND'); process.exit(1); }
const newInject = join([
  'async function injectPrivacyScripts(tabId) {',
  '  // Content scripts also run on the new-tab page; chrome.scripting can never',
  '  // access protected pages, so skip them silently instead of retrying.',
  '  try {',
  '    const tab = await chrome.tabs.get(tabId);',
  "    if (!tab?.url || !/^https?:/i.test(tab.url)) return;",
  '  } catch {',
  '    return;',
  '  }',
  '  try {',
  '    await chrome.scripting.executeScript({',
  '      target: { tabId, allFrames: true },',
  '      files: PRIVACY_MODULES',
  '    });',
  '  } catch (e) {',
  "    console.warn('[AeroGuard] privacy injection skipped:', e.message);",
  '  }',
  '}'
]);
s = s.replace(oldInject, newInject);

// 3. Never leave an unhandled rejection from init
s = s.replace(/(\r?\n)initialize\(\);(\r?\n)/, "$1initialize().catch((e) => console.error('[AeroGuard] init failed:', e));$2");

fs.writeFileSync(p, s);
console.log('SW patched: sanitize-first, guarded injection, init catch');
