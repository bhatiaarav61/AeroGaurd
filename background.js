// background.js — Service Worker (ES Module)
import { FilterEngine } from './filter-engine.js';
import { YouTubeEngine } from './youtube-engine.js';
import { StatsEngine } from './stats-engine.js';

const filterEngine = new FilterEngine();
const ytEngine = new YouTubeEngine();
const statsEngine = new StatsEngine();

let currentVersion = chrome.runtime.getManifest().version;
let isEnabled = true;

// ============================================================
// INITIALIZATION
// ============================================================
async function initialize() {
  console.log('[AeroGuard] Initializing v' + currentVersion);

  // Load settings
  const { settings = {} } = await chrome.storage.sync.get('settings');
  const config = {
    enabled: settings.enabled ?? true,
    youtubeMode: settings.youtubeMode ?? 'aggressive',
    filterLists: settings.filterLists ?? FilterEngine.DEFAULT_LISTS.map(l => l.id),
    customRules: settings.customRules ?? [],
    autoUpdate: settings.autoUpdate ?? true,
    updateInterval: settings.updateInterval ?? 6
  };

  isEnabled = config.enabled;

  // Initialize engines
  await filterEngine.initialize(config.filterLists);
  await ytEngine.initialize(config.youtubeMode);
  await statsEngine.init();

  // Apply all rules
  await applyAllRules();

  // Schedule updates
  if (config.autoUpdate) {
    chrome.alarms.create('filterUpdate', { periodInMinutes: config.updateInterval * 60 });
  }

  chrome.runtime.sendMessage({ type: 'READY', version: currentVersion }).catch(() => {});
  console.log('[AeroGuard] Ready');
}

async function applyAllRules() {
  if (!isEnabled) {
    await clearAllRules();
    return;
  }

  const allRules = [];
  let ruleId = 1000000;

  // 1. Filter list rules (converted to DNR)
  const filterRules = filterEngine.getDNRRules();
  allRules.push(...filterRules);

  // 2. YouTube-specific rules (ALLOW first, then BLOCK)
  const ytRules = ytEngine.getDNRRules(ruleId);
  ruleId = ytEngine.nextId;
  allRules.push(...ytRules);

  // 3. Custom user rules
  const { settings } = await chrome.storage.sync.get('settings');
  const custom = (settings.customRules || []).map((r, i) => ({
    ...r,
    id: 9000000 + i,
    priority: r.priority || 1
  }));
  allRules.push(...custom);

  // Apply in batches (DNR limit: 5000 per update)
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existing.map(r => r.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingIds,
    addRules: allRules.slice(0, 5000)
  });

  console.log('[AeroGuard] Applied', allRules.length, 'rules');

  // Notify YouTube tabs
  chrome.tabs.query({ url: '*://*.youtube.com/*' }, tabs => {
    tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'RULES_UPDATED' }).catch(() => {}));
  });
}

async function clearAllRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  if (existing.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map(r => r.id) });
  }
}

// ============================================================
// ALARM HANDLER
// ============================================================
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'filterUpdate') {
    console.log('[AeroGuard] Scheduled filter update');
    const updated = await filterEngine.updateAll();
    if (updated.length > 0) {
      await applyAllRules();
      chrome.tabs.query({}, tabs => {
        tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'FILTER_LISTS_UPDATED', updated }).catch(() => {}));
      });
    }
  }
});

// ============================================================
// MESSAGE ROUTER
// ============================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handle = async () => {
    switch (msg.type) {
      case 'GET_STATS':
        sendResponse(statsEngine.getStats());
        break;
      case 'TOGGLE_ENABLED':
        isEnabled = msg.enabled;
        await applyAllRules();
        await chrome.storage.sync.get('settings').then(s => {
          const st = s.settings || {};
          st.enabled = isEnabled;
          return chrome.storage.sync.set({ settings: st });
        });
        sendResponse({ success: true, enabled: isEnabled });
        break;
      case 'SET_YOUTUBE_MODE':
        ytEngine.setMode(msg.mode);
        await applyAllRules();
        sendResponse({ success: true });
        break;
      case 'ADD_CUSTOM_RULE':
        const { settings: s1 } = await chrome.storage.sync.get('settings');
        const newRule = { ...msg.rule, id: Date.now(), added: new Date().toISOString() };
        s1.customRules = [...(s1.customRules || []), newRule];
        await chrome.storage.sync.set({ settings: s1 });
        await applyAllRules();
        sendResponse({ success: true });
        break;
      case 'REMOVE_CUSTOM_RULE':
        const { settings: s2 } = await chrome.storage.sync.get('settings');
        s2.customRules = (s2.customRules || []).filter(r => r.id !== msg.ruleId);
        await chrome.storage.sync.set({ settings: s2 });
        await applyAllRules();
        sendResponse({ success: true });
        break;
      case 'GET_FILTER_LISTS':
        sendResponse(filterEngine.getStatus());
        break;
      case 'TOGGLE_FILTER_LIST':
        filterEngine.toggleList(msg.listId, msg.enabled);
        await applyAllRules();
        sendResponse({ success: true });
        break;
      case 'FORCE_UPDATE':
        const updated = await filterEngine.updateAll();
        if (updated.length) await applyAllRules();
        sendResponse({ success: true, updated });
        break;
      case 'GET_SETTINGS':
        const { settings } = await chrome.storage.sync.get('settings');
        sendResponse({ settings: settings || {} });
        break;
      case 'SAVE_SETTINGS':
        await chrome.storage.sync.set({ settings: msg.settings });
        if (msg.settings.enabled !== isEnabled) {
          isEnabled = msg.settings.enabled;
        }
        if (msg.settings.youtubeMode) ytEngine.setMode(msg.settings.youtubeMode);
        if (msg.settings.filterLists) filterEngine.setEnabledLists(msg.settings.filterLists);
        await applyAllRules();
        sendResponse({ success: true });
        break;
      case 'REPORT_BLOCKED':
        statsEngine.trackBlocked(msg.url, msg.ruleId, msg.filterList);
        break;
      case 'REPORT_ALLOWED':
        statsEngine.trackAllowed(msg.url);
        break;
      case 'RULES_UPDATED':
        // Content script notification
        break;
    }
  };
  handle().catch(e => sendResponse({ success: false, error: e.message }));
  return true;
});

// ============================================================
// WEB NAVIGATION (YouTube SPA)
chrome.webNavigation.onBeforeNavigate.addListener(async details => {
  if (!isEnabled) return;
  if (details.url.includes('youtube.com') || details.url.includes('youtube-nocookie.com')) {
    await ytEngine.handleNavigation(details.tabId, details.url, details.frameId);
  }
}, { url: [{ hostSuffix: 'youtube.com' }, { hostSuffix: 'youtube-nocookie.com' }] });

// ============================================================
// LIFECYCLE
chrome.runtime.onInstalled.addListener(async details => {
  if (details.reason === 'install') {
    await initialize();
    chrome.tabs.create({ url: 'welcome.html' });
  } else if (details.reason === 'update') {
    currentVersion = chrome.runtime.getManifest().version;
    await initialize();
  }
});

chrome.runtime.onStartup.addListener(initialize);
initialize();

export { initialize, applyAllRules, filterEngine, ytEngine, statsEngine };