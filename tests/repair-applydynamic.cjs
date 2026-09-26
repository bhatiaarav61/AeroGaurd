const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/background/service-worker.js';
let s = fs.readFileSync(p, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const J = (arr) => arr.join(EOL);

const start = s.indexOf('async function applyDynamicRules() {');
const end = s.indexOf('async function clearDynamicRules()');
if (start === -1 || end === -1 || end <= start) { console.log('FUNCTION BOUNDS NOT FOUND', start, end); process.exit(1); }

const fresh = J([
  'async function applyDynamicRules() {',
  '  if (!settings.enabled) {',
  '    await clearDynamicRules();',
  '    return;',
  '  }',
  '',
  '  const rules = [];',
  '',
  '  // YouTube tuned allow/block rules (~130 rules)',
  '  for (const rule of youtubeAdBlocker.getDNRRules()) rules.push(rule);',
  '',
  '  // Custom user rules',
  '  settings.customRules.forEach((rule, i) => {',
  '    const dnr = customRuleToDnr(rule, ID.customRule + i);',
  '    if (dnr) rules.push(dnr);',
  '  });',
  '',
  '  // Per-site shields (popup "disable for this site")',
  '  settings.siteToggles.slice(0, 500).forEach((domain, i) => {',
  '    rules.push(allowAllRequestsRule(domain, ID.allowlist + i));',
  '  });',
  '',
  '  // Options allowlist',
  '  settings.allowlist.slice(0, 500).forEach((entry, i) => {',
  "    const domain = (typeof entry === 'string' ? entry : entry.domain) || null;",
  '    if (domain) rules.push(allowAllRequestsRule(domain, ID.allowlist + 500 + i));',
  '  });',
  '',
  '  // Custom filter list subscriptions (compiled at runtime, capped)',
  '  const customListRules = await loadCustomListRules();',
  '  rules.push(...customListRules.slice(0, Math.max(0, MAX_DYNAMIC_RULES - rules.length)));',
  '',
  '  // HTTPS by Default (Brave parity): upgrade top-level navigations only.',
  '  // Chrome natively autoupgrades mixed-content subresources; forcing',
  '  // subresource upgrades here breaks images/videos on http-only hosts.',
  '  // The regex works under both full-match and partial-match semantics.',
  '  if (settings.advanced?.httpsByDefault !== false) {',
  '    rules.push({',
  '      id: ID.httpsUpgrade,',
  '      priority: 1,',
  "      action: { type: 'upgradeScheme' },",
  '      condition: {',
  "        regexFilter: '^http://[a-z].*' + '$',",
  "        excludedRequestDomains: ['localhost'],",
  "        resourceTypes: ['main_frame']",
  '      }',
  '    });',
  '  }',
  '',
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
  '}',
  ''
]);

s = s.slice(0, start) + fresh + s.slice(end);
fs.writeFileSync(p, s);
console.log('applyDynamicRules rebuilt cleanly');
