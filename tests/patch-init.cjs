const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/background/service-worker.js';
let s = fs.readFileSync(p, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const J = (arr) => arr.join(EOL);

const oldInit = J([
  'async function initialize() {',
  "  console.log('[AeroGuard] Initializing v' + chrome.runtime.getManifest().version);",
  '  await loadSettings();',
  '  await filterListManager.initialize(settings.disabledLists);',
  '  statisticsTracker.setSlotCategories(filterListManager.getSlotCategories());',
  '  await syncStaticRulesets();',
  '  loadJsonCached(SCRIPTLET_SHARD).catch(() => {}); // warm the scriptlet shard',
  '  await youtubeAdBlocker.initialize(settings.youtubeBlocking);',
  '  await statisticsTracker.init();',
  '  await lifecycleManager.initialize({ settings });',
  '  await applyDynamicRules();',
  '  attachMatchTracking();',
  '  if (settings.autoUpdate) {',
  "    chrome.alarms.create('filterListUpdate', { periodInMinutes: Math.max(1, settings.updateInterval) * 60 });",
  '  }'
]);

if (!s.includes(oldInit)) { console.log('INIT BLOCK NOT FOUND'); process.exit(1); }

const newInit = J([
  'async function initialize() {',
  "  console.log('[AeroGuard] Initializing v' + chrome.runtime.getManifest().version);",
  '  // Every step is independently guarded: a failure in one subsystem must',
  '  // never abort startup - an aborted startup is what makes Chrome flag the',
  '  // extension with "failed to load properly / cannot intercept requests".',
  '  const step = async (name, fn) => {',
  '    try { await fn(); } catch (e) {',
  "      console.error('[AeroGuard] init step failed (' + name + '):', e.message);",
  '    }',
  '  };',
  '',
  "  await step('settings', () => loadSettings());",
  "  await step('filter list index', () => filterListManager.initialize(settings.disabledLists));",
  "  await step('stats categories', async () => statisticsTracker.setSlotCategories(filterListManager.getSlotCategories()));",
  "  await step('static rulesets', () => syncStaticRulesets());",
  '  loadJsonCached(SCRIPTLET_SHARD).catch(() => {}); // warm the scriptlet shard',
  "  await step('youtube blocker', () => youtubeAdBlocker.initialize(settings.youtubeBlocking));",
  "  await step('statistics', () => statisticsTracker.init());",
  "  await step('lifecycle', () => lifecycleManager.initialize({ settings }));",
  "  await step('dynamic rules', () => applyDynamicRules());",
  "  await step('match tracking', async () => attachMatchTracking());",
  "  await step('update alarm', async () => {",
  '    if (settings.autoUpdate) {',
  "      chrome.alarms.create('filterListUpdate', { periodInMinutes: Math.max(1, settings.updateInterval || 6) * 60 });",
  '    }',
  '  });'
]);

s = s.replace(oldInit, newInit);
fs.writeFileSync(p, s);
console.log('initialize() hardened with per-step guards');
