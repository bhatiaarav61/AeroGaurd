// background.js — Main service worker (ES module)
//
// Architecture (Brave-like):
//  - Network blocking is done by the STATIC declarativeNetRequest rulesets
//    declared in manifest.json (compiled by build-rules.js). They are toggled
//    with chrome.declarativeNetRequest.updateEnabledRulesets().
//  - DYNAMIC rules are reserved for the small per-user state: custom rules,
//    per-site shields/allowlist, tuned YouTube rules and custom subscriptions.
//    Chrome caps dynamic rules at 30k, so nothing large ever goes here.
//  - Statistics come from declarativeNetRequest.onRuleMatchedDebug.

import { FilterListManager } from './filter-list-manager.js';
import { YouTubeAdBlocker } from './youtube-adblocker.js';
import { sanitizeRule } from './rule-optimizer.js';
import { StatisticsTracker } from './statistics-tracker.js';
import { lifecycleManager } from './lifecycle-manager.js';
import { storageEngine } from './storage-engine.js';
import { wrapDNR, wrapScriptInjection } from './error-kernel.js';
import { parseAbpFilter, createDnrRule, collectBadFilters } from './abp-parser.js';

const filterListManager = new FilterListManager();
const youtubeAdBlocker = new YouTubeAdBlocker();
const statisticsTracker = new StatisticsTracker();

const DEFAULT_SETTINGS = {
  enabled: true,
  showBadge: true,
  showNotifications: true,
  theme: 'system',
  language: 'en',
  blockAds: true,
  blockTrackers: true,
  blockMalware: true,
  blockAnnoyances: true,
  blockSocial: false,
  blockCookieNotices: true,
  advanced: { strictBlocking: false, blockWebRTC: false, blockRemoteFonts: false, blockThirdPartyFrames: false, httpsByDefault: true, privacyModules: false },
  youtubeBlocking: 'aggressive',
  customRules: [],
  customLists: [],
  allowlist: [],
  siteToggles: [],
  cosmeticFilters: [],
  disabledLists: [],
  autoUpdate: true,
  updateInterval: 6,
  debugMode: false
};

const ID = {
  youtube: 80000,
  customRule: 900000,
  allowlist: 950000,
  customList: 100000000,
  httpsUpgrade: 970000
};
const MAX_DYNAMIC_RULES = 25000;
const MAX_CUSTOM_LIST_RULES = 5000;

let settings = { ...DEFAULT_SETTINGS };
let cosmeticsCache = new Map();

// ========== SETTINGS ==========
async function loadSettings() {
  const stored = await storageEngine.get('settings', { backend: 'local' });
  settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  for (const key of ['customRules', 'customLists', 'allowlist', 'siteToggles', 'cosmeticFilters', 'disabledLists']) {
    if (!Array.isArray(settings[key])) settings[key] = [];
  }
  if (!settings.advanced) settings.advanced = { ...DEFAULT_SETTINGS.advanced };
  return settings;
}

async function saveSettings() {
  await storageEngine.set({ settings }, { backend: 'local' });
}

async function getActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs[0] || null;
  } catch {
    return null;
  }
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function siteToggleFor(url) {
  const domain = domainOf(url);
  if (!domain) return true;
  return !settings.siteToggles.some(d => domain === d || domain.endsWith('.' + d));
}

function allowlistedFor(url) {
  const domain = domainOf(url);
  if (!domain) return false;
  return settings.allowlist.some(entry => {
    const d = (typeof entry === 'string' ? entry : entry.domain) || '';
    return domain === d || domain.endsWith('.' + d);
  });
}

// ========== DYNAMIC RULES ==========
function allResourceTypes() {
  return ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
    'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'webtransport', 'webbundle', 'other'];
}

// Options "custom rule" shape: {condition:{urlFilter,domains?},action:{type},priority}
// Legacy shape {pattern, action:'block'|'allow'} is normalized too.
function customRuleToDnr(rule, id) {
  const pattern = rule?.condition?.urlFilter ?? rule?.pattern;
  if (!pattern || typeof pattern !== 'string') return null;
  const type = rule?.action?.type ?? (rule?.isException ? 'allow' : rule?.action);
  const isAllow = type === 'allow' || rule?.isException;
  const condition = { urlFilter: pattern, resourceTypes: allResourceTypes() };
  const domains = rule?.condition?.domains;
  if (Array.isArray(domains) && domains.length > 0) condition.initiatorDomains = domains.map(d => String(d).replace(/^\*\./, ''));
  const clean = sanitizeRule({
    id,
    priority: isAllow ? 2 : 1,
    action: { type: isAllow ? 'allow' : 'block' },
    condition
  });
  return clean;
}

function allowAllRequestsRule(domain, id) {
  return {
    id,
    priority: 3,
    action: { type: 'allowAllRequests' },
    condition: { initiatorDomains: [domain], resourceTypes: ['main_frame', 'sub_frame'] }
  };
}

async function applyDynamicRules() {
  if (!settings.enabled) {
    await clearDynamicRules();
    return;
  }

  const rules = [];

  // YouTube tuned allow/block rules (~130 rules)
  for (const rule of youtubeAdBlocker.getDNRRules()) rules.push(rule);

  // Custom user rules
  settings.customRules.forEach((rule, i) => {
    const dnr = customRuleToDnr(rule, ID.customRule + i);
    if (dnr) rules.push(dnr);
  });

  // Per-site shields (popup "disable for this site")
  settings.siteToggles.slice(0, 500).forEach((domain, i) => {
    rules.push(allowAllRequestsRule(domain, ID.allowlist + i));
  });

  // Options allowlist
  settings.allowlist.slice(0, 500).forEach((entry, i) => {
    const domain = (typeof entry === 'string' ? entry : entry.domain) || null;
    if (domain) rules.push(allowAllRequestsRule(domain, ID.allowlist + 500 + i));
  });

  // Custom filter list subscriptions (compiled at runtime, capped)
  const customListRules = await loadCustomListRules();
  rules.push(...customListRules.slice(0, Math.max(0, MAX_DYNAMIC_RULES - rules.length)));

  // HTTPS by Default (Brave parity): upgrade top-level navigations only.
  // Chrome natively autoupgrades mixed-content subresources; forcing
  // subresource upgrades here breaks images/videos on http-only hosts.
  // The regex works under both full-match and partial-match semantics.
  if (settings.advanced?.httpsByDefault !== false) {
    rules.push({
      id: ID.httpsUpgrade,
      priority: 1,
      action: { type: 'upgradeScheme' },
      condition: {
        regexFilter: '^http://[a-z].*' + '$',
        excludedRequestDomains: ['localhost'],
        resourceTypes: ['main_frame']
      }
    });
  }

  // Sanitize every rule before applying: one invalid rule would fail the
  // whole atomic update and leave the extension unable to intercept requests.
  const valid = [];
  for (const rule of rules.slice(0, MAX_DYNAMIC_RULES)) {
    const clean = sanitizeRule(rule);
    if (clean) valid.push(clean);
    else console.warn('[AeroGuard] dropped invalid dynamic rule', rule?.id, JSON.stringify(rule?.condition || {}).slice(0, 120));
  }

  const result = await wrapDNR('applyDynamicRules', async () => {
    const existing = (await chrome.declarativeNetRequest.getDynamicRules()).map(r => r.id);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing,
      addRules: valid
    });
  });
  if (!result.success) {
    console.error('[AeroGuard] applyDynamicRules failed:', result.error?.message);
  }
  console.log(`[AeroGuard] Applied ${valid.length} of ${rules.length} dynamic rules`);
}
async function clearDynamicRules() {
  await wrapDNR('clearDynamicRules', async () => {
    const existing = (await chrome.declarativeNetRequest.getDynamicRules()).map(r => r.id);
    if (existing.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing });
    }
  });
}

// Compile a custom subscription list into DNR rules (capped).
async function compileCustomList(text) {
  const bad = collectBadFilters(text);
  const seen = new Set();
  const rules = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^[!#[]/.test(trimmed)) continue;
    if (/##|#@#|\+js\(/.test(trimmed)) continue;
    if (trimmed.includes('$badfilter') || bad.has(trimmed.split('$')[0])) continue;
    try {
      const parsed = parseAbpFilter(trimmed);
      if (!parsed) continue;
      const rule = createDnrRule(parsed, 1, 'custom-list', trimmed);
      if (!rule) continue;
      const clean = sanitizeRule(rule);
      if (!clean) continue;
      const key = JSON.stringify([clean.action, clean.condition]);
      if (seen.has(key)) continue;
      seen.add(key);
      rules.push(clean);
      if (rules.length >= MAX_CUSTOM_LIST_RULES) break;
    } catch { /* skip bad line */ }
  }
  return rules;
}

async function loadCustomListRules() {
  const out = [];
  for (const list of settings.customLists) {
    if (list.enabled === false) continue;
    const stored = await storageEngine.get('customListRules:' + list.id, { backend: 'local' });
    const rules = stored['customListRules:' + list.id];
    if (Array.isArray(rules)) {
      rules.forEach((rule, i) => out.push({ ...rule, id: ID.customList + out.length + i }));
    }
  }
  return out;
}

// ========== STATIC RULESET SYNC ==========
async function syncStaticRulesets() {
  try {
    const all = filterListManager.getManifestIds();
    if (all.length === 0) return;
    const enabledNow = new Set(await chrome.declarativeNetRequest.getEnabledRulesets());
    const shouldEnable = all.filter(id => !settings.disabledLists.includes(id) && !enabledNow.has(id));
    const shouldDisable = settings.enabled
      ? all.filter(id => settings.disabledLists.includes(id) && enabledNow.has(id))
      : [...enabledNow];
    if (shouldEnable.length || shouldDisable.length) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRuleIds: shouldEnable,
        disableRuleIds: shouldDisable
      });
    }
  } catch (e) {
    console.warn('[AeroGuard] syncStaticRulesets:', e.message);
  }
}

async function pauseAllBlocking() {
  try {
    const enabled = await chrome.declarativeNetRequest.getEnabledRulesets();
    if (enabled.length) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRuleIds: enabled });
    }
  } catch (e) {
    console.warn('[AeroGuard] pauseAllBlocking:', e.message);
  }
}

// ========== COSMETIC SHARDS ==========
async function loadJsonCached(path) {
  if (cosmeticsCache.has(path)) return cosmeticsCache.get(path);
  try {
    const res = await fetch(chrome.runtime.getURL(path));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    cosmeticsCache.set(path, data);
    return data;
  } catch {
    cosmeticsCache.set(path, null);
    return null;
  }
}

function domainMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

// Build the selector set for one page from the per-domain shards in
// rules/cosmetic/. Generic selectors are NOT sent here - element-hider.js
// fetches rules/cosmetic/generic.json directly to keep messages light.
async function cosmeticSelectorsFor(url) {
  const host = domainOf(url);
  if (!host) return [];
  const selectors = new Set();
  const bucket = /^[a-z0-9]/i.test(host) ? host[0].toLowerCase() : '_';
  const shard = await loadJsonCached(`rules/cosmetic/${bucket}.json`);
  if (shard) {
    for (const [domain, sels] of Object.entries(shard.hide || {})) {
      if (domainMatches(host, domain)) for (const sel of sels) selectors.add(sel);
    }
    for (const [domain, sels] of Object.entries(shard.except || {})) {
      if (domainMatches(host, domain)) for (const sel of sels) selectors.delete(sel);
    }
  }
  return [...selectors];
}

// ========== INITIALIZATION ==========
async function initialize() {
  console.log('[AeroGuard] Initializing v' + chrome.runtime.getManifest().version);
  // Every step is independently guarded: a failure in one subsystem must
  // never abort startup - an aborted startup is what makes Chrome flag the
  // extension with "failed to load properly / cannot intercept requests".
  const step = async (name, fn) => {
    try { await fn(); } catch (e) {
      console.error('[AeroGuard] init step failed (' + name + '):', e.message);
    }
  };

  await step('settings', () => loadSettings());
  await step('filter list index', () => filterListManager.initialize(settings.disabledLists));
  await step('stats categories', async () => statisticsTracker.setSlotCategories(filterListManager.getSlotCategories()));
  await step('static rulesets', () => syncStaticRulesets());
  loadJsonCached(SCRIPTLET_SHARD).catch(() => {}); // warm the scriptlet shard
  await step('youtube blocker', () => youtubeAdBlocker.initialize(settings.youtubeBlocking));
  await step('statistics', () => statisticsTracker.init());
  await step('lifecycle', () => lifecycleManager.initialize({ settings }));
  await step('dynamic rules', () => applyDynamicRules());
  await step('match tracking', async () => attachMatchTracking());
  await step('update alarm', async () => {
    if (settings.autoUpdate) {
      chrome.alarms.create('filterListUpdate', { periodInMinutes: Math.max(1, settings.updateInterval || 6) * 60 });
    }
  });
  chrome.runtime.sendMessage({ type: 'ADBLOCKER_READY', version: chrome.runtime.getManifest().version }).catch(() => {});
  console.log('[AeroGuard] Initialized');
}

// Real per-request block counting (works for unpacked extensions with
// declarativeNetRequestFeedback, i.e. exactly how this extension is used).
let trackingAttached = false;
function attachMatchTracking() {
  if (trackingAttached || !chrome.declarativeNetRequest.onRuleMatchedDebug) return;
  trackingAttached = true;
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    try {
      statisticsTracker.recordMatch(info.request.tabId || -1, info.request.url, info.rule.ruleId);
      updateBadge(info.request.tabId);
    } catch { /* stats must never break blocking */ }
  });
}

async function updateBadge(tabId) {
  if (!settings.showBadge || tabId < 0) return;
  try {
    const stats = statisticsTracker.getTabStats(tabId);
    await chrome.action.setBadgeText({ tabId, text: stats.blockedCount > 0 ? String(Math.min(stats.blockedCount, 999)) : '' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#4a7dff' });
  } catch { /* tab may be gone */ }
}

// ========== PRIVACY MODULE INJECTION ==========
const PRIVACY_MODULES = [
  'privacy-modules/fingerprinting-protection.js',
  'privacy-modules/cookie-protection.js',
  'privacy-modules/cname-uncloaking.js',
  'privacy-modules/bounce-tracking-protection.js',
  'privacy-modules/webrtc-protection.js'
];

async function injectPrivacyScripts(tabId) {
  // Content scripts also run on the new-tab page; chrome.scripting can never
  // access protected pages, so skip them silently instead of retrying.
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url || !/^https?:/i.test(tab.url)) return;
  } catch {
    return;
  }
  // The privacy modules are experimental hooks; they stay opt-in so an
  // untested hook can never take down browsing on every site.
  if (settings.advanced?.privacyModules !== true) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: PRIVACY_MODULES
    });
  } catch (e) {
    console.warn('[AeroGuard] privacy injection skipped:', e.message);
  }
}

// ========== HELPERS FOR MESSAGES ==========
function setNested(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let target = obj;
  for (const k of keys) target = (target[k] ??= {});
  target[last] = value;
}

async function respondTabEnabled(tab) {
  const url = tab?.url;
  return url ? siteToggleFor(url) : true;
}

async function broadcast(type, extra = {}) {
  chrome.runtime.sendMessage({ type, ...extra }).catch(() => {});
}

async function refreshBlocking({ syncStatic = false } = {}) {
  await saveSettings();
  if (syncStatic) await syncStaticRulesets();
  if (settings.enabled) await applyDynamicRules();
  else await clearDynamicRules();
  broadcast('EXTENSION_TOGGLED', { enabled: settings.enabled });
}

// ========== MESSAGE ROUTER ==========
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const p = msg?.payload || {};
  const arg = (key) => p[key] !== undefined ? p[key] : msg?.[key];

  const handle = (async () => {
    switch (msg?.type) {
      // ---- state ----
      case 'GET_SETTINGS':
        return { ...settings };
      case 'GET_EXTENSION_STATE': {
        const tab = sender.tab || await getActiveTab();
        return { enabled: settings.enabled, tabEnabled: await respondTabEnabled(tab), version: chrome.runtime.getManifest().version };
      }
      case 'TOGGLE_EXTENSION':
      case 'TOGGLE_ENABLED': {
        settings.enabled = arg('enabled') ?? !settings.enabled;
        if (settings.enabled) await syncStaticRulesets();
        else await pauseAllBlocking();
        await refreshBlocking();
        return { enabled: settings.enabled };
      }
      case 'TOGGLE_TAB': {
        const tabId = arg('tabId');
        let url = sender.tab?.url;
        if (!url && tabId) {
          try { url = (await chrome.tabs.get(tabId)).url; } catch { /* gone */ }
        }
        if (!url) {
          const tab = await getActiveTab();
          url = tab?.url;
        }
        const domain = domainOf(url || '');
        const enable = arg('enabled') ?? siteToggleFor(url || '');
        if (domain) {
          const had = settings.siteToggles.includes(domain);
          if (!enable && !had) settings.siteToggles.push(domain);
          if (enable) {
            settings.siteToggles = settings.siteToggles.filter(d =>
              d !== domain && !d.endsWith('.' + domain) && !domain.endsWith('.' + d));
          }
        }
        await refreshBlocking();
        return { tabEnabled: domain ? siteToggleFor('https://' + domain) : true };
      }
      case 'UPDATE_SETTING': {
        const key = arg('key');
        const value = arg('value');
        if (key) setNested(settings, key, value);
        await refreshBlocking({ syncStatic: true });
        broadcast('SETTINGS_UPDATED');
        return { success: true };
      }

      // ---- stats ----
      case 'GET_TAB_STATS': {
        const tabId = arg('tabId') ?? sender.tab?.id ?? (await getActiveTab())?.id;
        return statisticsTracker.getTabStats(tabId ?? -1);
      }
      case 'GET_GLOBAL_STATS':
      case 'GET_STATS':
        return statisticsTracker.getStats();
      case 'RESET_STATS':
        await statisticsTracker.reset();
        return { success: true };
      case 'REPORT_BLOCKED':
        statisticsTracker.recordMatch(sender.tab?.id ?? -1, arg('url') || '', arg('ruleId') || 0);
        return { ok: true };
      case 'REPORT_ALLOWED':
        return { ok: true };

      // ---- filter lists ----
      case 'GET_FILTER_LISTS':
        return filterListManager.getStatus();
      case 'TOGGLE_FILTER_LIST': {
        const key = arg('key') ?? arg('listId');
        const enabled = arg('enabled');
        const touched = filterListManager.resolveListKeys(key);
        for (const id of touched) {
          const has = settings.disabledLists.includes(id);
          if (!enabled && !has) settings.disabledLists.push(id);
          if (enabled && has) settings.disabledLists = settings.disabledLists.filter(x => x !== id);
        }
        await saveSettings();
        await syncStaticRulesets();
        broadcast('FILTER_LISTS_UPDATED');
        return { success: true, updated: touched };
      }
      case 'UPDATE_FILTER_LISTS':
      case 'FORCE_UPDATE': {
        await syncStaticRulesets();
        settings.lastListUpdate = Date.now();
        await saveSettings();
        broadcast('FILTER_LISTS_UPDATED');
        return { success: true, updated: [] };
      }
      case 'ADD_CUSTOM_FILTER_LIST': {
        const url = arg('url');
        const name = arg('name') || 'Custom list';
        if (!/^https?:\/\//i.test(url || '')) return { error: 'Invalid URL' };
        let text;
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
          if (!res.ok) return { error: 'HTTP ' + res.status };
          text = await res.text();
        } catch (e) {
          return { error: e.message };
        }
        const rules = await compileCustomList(text);
        if (rules.length === 0) return { error: 'No usable network rules found in list' };
        const id = 'cl_' + Date.now().toString(36);
        settings.customLists.push({ id, url, name, enabled: true, ruleCount: rules.length, added: Date.now() });
        await storageEngine.set({ ['customListRules:' + id]: rules }, { backend: 'local' });
        await refreshBlocking();
        return { id, ruleCount: rules.length };
      }

      // ---- custom rules ----
      case 'GET_CUSTOM_RULES':
        return [...settings.customRules];
      case 'ADD_CUSTOM_RULE': {
        const rule = arg('rule');
        if (!rule) return { error: 'missing rule' };
        const id = Date.now();
        settings.customRules.push({ ...rule, id });
        await refreshBlocking();
        return { success: true, rule: { ...rule, id } };
      }
      case 'UPDATE_CUSTOM_RULE': {
        const id = arg('id');
        const updates = arg('updates') || {};
        const idx = settings.customRules.findIndex(r => r.id === id);
        if (idx >= 0) {
          settings.customRules[idx] = { ...settings.customRules[idx], ...updates, id };
          await refreshBlocking();
        }
        return { success: idx >= 0 };
      }
      case 'REMOVE_CUSTOM_RULE': {
        const id = arg('id') ?? arg('ruleId');
        settings.customRules = settings.customRules.filter(r => r.id !== id);
        await refreshBlocking();
        return { success: true };
      }
      case 'ADD_EXCEPTION_RULE': {
        const pattern = arg('pattern');
        if (!pattern) return { error: 'missing pattern' };
        settings.customRules.push({
          id: Date.now(),
          condition: { urlFilter: pattern },
          action: { type: 'allow' },
          priority: 2,
          isException: true
        });
        await refreshBlocking();
        return { success: true };
      }

      // ---- allowlist (site-level) ----
      case 'GET_ALLOWLIST':
        return settings.allowlist.map((entry, i) => ({
          id: entry.id ?? i,
          condition: { urlFilter: '||' + entry.domain + '^' },
          action: { type: 'allowAllRequests' },
          priority: 3
        }));
      case 'ADD_TO_ALLOWLIST': {
        const raw = arg('url') || '';
        const domain = domainOf(raw.includes('://') ? raw : 'https://' + raw);
        if (!domain) return { error: 'Invalid domain' };
        if (!settings.allowlist.some(e => e.domain === domain)) {
          settings.allowlist.push({ id: Date.now(), domain });
          await refreshBlocking();
        }
        return { success: true, rule: { condition: { urlFilter: '||' + domain + '^' } } };
      }
      case 'REMOVE_FROM_ALLOWLIST': {
        const id = arg('id');
        settings.allowlist = settings.allowlist.filter(e => (e.id ?? e.domain) !== id);
        await refreshBlocking();
        return { success: true };
      }

      // ---- cosmetic filters ----
      case 'GET_COSMETIC_FILTERS': {
        const pageUrl = sender.url || sender.tab?.url;
        const userFilters = settings.cosmeticFilters.filter(f => f.enabled !== false);
        if (!settings.enabled || !pageUrl) return { filters: userFilters };
        const selectors = await cosmeticSelectorsFor(pageUrl);
        return {
          filters: [
            ...userFilters,
            ...selectors.map(sel => ({ filter: '##' + sel, domains: [domainOf(pageUrl)], enabled: true }))
          ]
        };
      }
      case 'ADD_COSMETIC_FILTER': {
        const filter = arg('filter');
        if (!filter) return { error: 'missing filter' };
        settings.cosmeticFilters.push({ id: Date.now(), filter, enabled: true });
        await saveSettings();
        broadcast('COSMETIC_FILTERS_UPDATED', { filters: settings.cosmeticFilters });
        return { success: true };
      }
      case 'UPDATE_COSMETIC_FILTER': {
        const id = arg('id');
        const idx = settings.cosmeticFilters.findIndex(f => f.id === id);
        if (idx >= 0) {
          settings.cosmeticFilters[idx] = { ...settings.cosmeticFilters[idx], ...(arg('filter') || {}), id };
          await saveSettings();
          broadcast('COSMETIC_FILTERS_UPDATED', { filters: settings.cosmeticFilters });
        }
        return { success: idx >= 0 };
      }
      case 'REMOVE_COSMETIC_FILTER': {
        const id = arg('id');
        settings.cosmeticFilters = settings.cosmeticFilters.filter(f => f.id !== id);
        await saveSettings();
        broadcast('COSMETIC_FILTERS_UPDATED', { filters: settings.cosmeticFilters });
        return { success: true };
      }

      // ---- data management ----
      case 'EXPORT_DATA':
        return { settings: { ...settings }, exportedAt: new Date().toISOString() };
      case 'IMPORT_DATA': {
        const data = arg('data');
        if (!data || !data.settings) return { success: false };
        settings = { ...DEFAULT_SETTINGS, ...data.settings };
        await refreshBlocking({ syncStatic: true });
        return { success: true };
      }
      case 'RESET_SETTINGS':
        settings = { ...DEFAULT_SETTINGS };
        settings.customRules = [];
        settings.customLists = [];
        settings.allowlist = [];
        settings.siteToggles = [];
        settings.cosmeticFilters = [];
        settings.disabledLists = [];
        await refreshBlocking({ syncStatic: true });
        return { success: true };

      // ---- youtube ----
      case 'YOUTUBE_BLOCK_MODE':
        settings.youtubeBlocking = arg('mode') || 'aggressive';
        youtubeAdBlocker.setMode(settings.youtubeBlocking);
        await refreshBlocking();
        return { success: true };
      case 'GET_SCRIPTLET_VERSIONS':
        return { scriptlets: youtubeAdBlocker.getScriptletVersions() };
      case 'SCRIPTLET_DISABLED':
        console.warn('[AeroGuard] Scriptlet disabled:', arg('name'), 'failures:', arg('failures'));
        return { success: true };

      // ---- scriptlets ----
      case 'GET_SCRIPTLETS': {
        const url = arg('url') || sender.url || sender.tab?.url || '';
        return { calls: settings.enabled ? scriptletCallsForUrl(url) : [] };
      }
      case 'REPORT_SCRIPTLETS':
        return { ok: true };

      // ---- misc ----
      case 'INJECT_PRIVACY_SCRIPTS': {
        const tabId = sender.tab?.id ?? arg('tabId');
        if (tabId) await injectPrivacyScripts(tabId);
        return { ok: true };
      }
      case 'CONTENT_SCRIPT_READY':
        return { enabled: settings.enabled, tabEnabled: await respondTabEnabled(sender.tab?.url) };
      case 'GET_LIFECYCLE_STATUS':
        return lifecycleManager.getStatus();
      case 'FORCE_REINIT':
        await initialize();
        return { success: true };
      case 'DIAGNOSE_WHITE_VIDEO':
        return diagnoseWhiteVideo(arg('tabId'));
      case 'DIAGNOSE_BLOCK_RATE':
        return diagnoseBlockRate();
      default:
        return { error: 'Unknown message type: ' + (msg?.type || 'none') };
    }
  })();

  handle.then(
    (result) => { try { sendResponse(result); } catch { /* channel closed */ } },
    (e) => { try { sendResponse({ success: false, error: e.message }); } catch { /* channel closed */ } }
  );
  return true; // async response
});

// ========== DIAGNOSTICS ==========
async function diagnoseWhiteVideo(tabId) {
  return await wrapScriptInjection('diagnoseWhiteVideo', async () => {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const video = document.querySelector('video.html5-main-video, video#movie_player, video');
        const player = document.querySelector('#movie_player, .html5-video-player');
        return {
          videoExists: !!video,
          videoVisible: video ? video.offsetWidth > 0 && video.offsetHeight > 0 : false,
          videoStyles: video ? {
            display: getComputedStyle(video).display,
            visibility: getComputedStyle(video).visibility,
            width: video.offsetWidth,
            height: video.offsetHeight
          } : null,
          playerExists: !!player,
          adElementsFound: document.querySelectorAll('.video-ads, .ytp-ad-module').length
        };
      },
      world: 'MAIN'
    });
    return results?.[0]?.result || { error: 'no result' };
  });
}

async function diagnoseBlockRate() {
  const status = filterListManager.getStatus();
  const problems = [];
  let enabledCount = 0;
  for (const list of status) {
    if (list.enabled && list.ruleCount === 0) problems.push(`LIST EMPTY: ${list.name} (${list.id})`);
    if (!list.enabled) problems.push(`LIST DISABLED: ${list.name} (${list.id})`);
    else enabledCount++;
  }
  const ytRules = youtubeAdBlocker.getDNRRules();
  const allowRules = ytRules.filter(r => r.action.type === 'allow');
  const criticalAllows = ['videoplayback', 'i.ytimg.com', 'timedtext'];
  const missing = criticalAllows.filter(pattern =>
    !allowRules.some(r => r.condition.urlFilter?.includes(pattern)));
  if (missing.length) problems.push('MISSING CRITICAL ALLOW RULES: ' + missing.join(', '));
  if (!settings.enabled) problems.push('Extension is paused');
  return { filterLists: status, enabledCount, problems, youtubeRules: ytRules.length };
}

// ========== NAVIGATION / LIFECYCLE ==========
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (!settings.enabled) return;
  if (details.url.includes('youtube.com') || details.url.includes('youtube-nocookie.com')) {
    await youtubeAdBlocker.handleNavigation(details.tabId, details.url, details.frameId);
  }
}, { url: [{ hostSuffix: 'youtube.com' }, { hostSuffix: 'youtube-nocookie.com' }] });

// ========== SCRIPTLET INJECTION (all sites, Brave/uBO-style) ==========
// build-rules.js compiles uBO scriptlet calls from every list into
// rules/scriptlets/all.json: { generic: [...], domains: { host: [[name, args], ...] } }.
const SCRIPTLET_SHARD = 'rules/scriptlets/all.json';

function scriptletCallsForUrl(url) {
  const host = domainOf(url);
  if (!host) return [];
  const shard = cosmeticsCache.get(SCRIPTLET_SHARD);
  if (!shard) return [];
  const matches = (d) => host === d || host.endsWith('.' + d);
  const calls = [...(shard.generic || [])];
  for (const [domain, domainCalls] of Object.entries(shard.domains || {})) {
    if (matches(domain)) calls.push(...domainCalls);
  }
  // dedupe (same scriptlet + args can come from several lists)
  const seen = new Set();
  return calls.filter(call => {
    const key = JSON.stringify(call);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 300);
}

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (!settings.enabled || details.url.startsWith('chrome')) return;
  try {
    const calls = scriptletCallsForUrl(details.url);
    if (calls.length === 0) return;
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId, frameIds: [details.frameId] },
      injectImmediately: true,
      world: 'MAIN',
      func: (pending) => {
        const shim = window.__aeroguardScriptlets;
        if (shim && typeof shim.apply === 'function') shim.apply(pending);
        else if (shim && typeof shim.runAll === 'function') shim.runAll(pending);
        else window.__aeroguardPendingScriptlets = pending;
      },
      args: [calls]
    });
  } catch { /* unsupported frames (chrome://, store pages, discarded tabs) */ }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'filterListUpdate') {
    console.log('[AeroGuard] Scheduled filter list check');
    await syncStaticRulesets();
    settings.lastListUpdate = Date.now();
    await saveSettings();
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await initialize();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' });
  }
});

chrome.runtime.onStartup.addListener(initialize);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') updateBadge(tabId);
});

initialize().catch((e) => console.error('[AeroGuard] init failed:', e));

export { initialize, settings as currentSettings, filterListManager, youtubeAdBlocker, statisticsTracker, lifecycleManager };
