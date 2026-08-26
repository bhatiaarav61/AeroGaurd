// background.js — Main service worker (ES module)
import { FilterListManager, DEFAULT_FILTER_LISTS } from './filter-list-manager.js';
import { YouTubeAdBlocker } from './youtube-adblocker.js';
import { RuleOptimizer } from './rule-optimizer.js';
import { StatisticsTracker } from './statistics-tracker.js';
import { lifecycleManager } from './lifecycle-manager.js';
import { storageEngine } from './storage-engine.js';
import { networkStack } from './network-stack.js';
import { errorKernel, wrapStorage, wrapMessaging, wrapDNR, wrapScriptInjection } from './error-kernel.js';

const filterListManager = new FilterListManager();
const youtubeAdBlocker = new YouTubeAdBlocker();
const ruleOptimizer = new RuleOptimizer();
const statisticsTracker = new StatisticsTracker();

let isEnabled = true;
let currentVersion = chrome.runtime.getManifest().version;

// ========== INITIALIZATION ==========
async function initialize() {
  console.log('[AeroGuard] Initializing v' + currentVersion);

  const settings = await storageEngine.get('settings', { backend: 'sync' });
  const syncSettings = settings.settings || {
    enabled: true,
    filterLists: DEFAULT_FILTER_LISTS,
    youtubeBlocking: 'aggressive',
    customRules: [],
    autoUpdate: true,
    updateInterval: 6,
    debug: false
  };

  isEnabled = syncSettings.enabled;

  // Initialize lifecycle manager
  await lifecycleManager.initialize({ settings: syncSettings });

  // Initialize filter lists
  await filterListManager.initialize(syncSettings.filterLists);

  // Initialize YouTube blocker
  await youtubeAdBlocker.initialize(syncSettings.youtubeBlocking);

  // Initialize statistics
  await statisticsTracker.init();

  if (syncSettings.autoUpdate) {
    chrome.alarms.create('filterListUpdate', { periodInMinutes: syncSettings.updateInterval * 60 });
  }

  await applyAllRules();

  chrome.runtime.sendMessage({ type: 'ADBLOCKER_READY', version: currentVersion }).catch(()=>{});
  console.log('[AeroGuard] Initialized');
}

// ========== RULE APPLICATION ==========
async function applyAllRules() {
  if (!isEnabled) {
    const result = await wrapDNR('clearAll', async () => {
      const allIds = (await chrome.declarativeNetRequest.getDynamicRules()).map(r => r.id);
      if (allIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: allIds });
      }
    });
    if (!result.success) throw result.error;
    return;
  }

  const allRules = [];

  // Get optimized rules from each filter list
  const rulesets = filterListManager.getOptimizedRulesets();
  for (const [name, rules] of Object.entries(rulesets)) {
    const optimized = await ruleOptimizer.optimize(rules, name);
    allRules.push(...optimized);
  }

  // YouTube rules
  const ytRules = youtubeAdBlocker.getDNRRules();
  allRules.push(...ytRules);

  // Custom user rules
  const { settings } = await storageEngine.get('settings', { backend: 'sync' });
  allRules.push(...(settings.customRules || []).map((r, i) => ({ ...r, id: 900000 + i })));

  // Apply in batches (DNR limit: 5000 dynamic rules per update)
  const batches = chunkArray(allRules, 4000);
  for (let i = 0; i < batches.length; i++) {
    await wrapDNR(`applyBatch.${i}`, async () => {
      const existingIds = (await chrome.declarativeNetRequest.getDynamicRules())
        .filter(r => r.id >= i * 4000 && r.id < (i + 1) * 4000)
        .map(r => r.id);
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingIds,
        addRules: batches[i]
      });
    });
  }

  console.log(`[AeroGuard] Applied ${allRules.length} dynamic rules`);

  // Notify YouTube tabs to run emergency unblock
  chrome.tabs.query({ url: '*://*.youtube.com/*' }, tabs => {
    tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'EMERGENCY_UNBLOCK' }).catch(() => {}));
  });
  // Notify all tabs for generic content emergency unblock
  chrome.tabs.query({}, tabs => {
    tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'EMERGENCY_UNBLOCK' }).catch(() => {}));
  });
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ========== ALARM HANDLER ==========
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'filterListUpdate') {
    console.log('[AeroGuard] Scheduled filter list update');
    const updated = await filterListManager.updateAll();
    if (updated.length) {
      await applyAllRules();
      // Notify all tabs
      chrome.tabs.query({}, tabs => {
        tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'FILTER_LISTS_UPDATED', updatedLists: updated }).catch(()=>{}));
      });
      console.log('[AeroGuard] Updated lists:', updated);
    }
  }
});

// ========== MESSAGE ROUTER ==========
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handle = async () => {
    switch (msg.type) {
      case 'GET_STATS':
        sendResponse(statisticsTracker.getStats());
        break;
      case 'TOGGLE_ENABLED':
        isEnabled = msg.enabled;
        await applyAllRules();
        await storageEngine.get('settings').then(s => {
          const settings = s.settings || {};
          settings.enabled = isEnabled;
          return storageEngine.set({ settings }, { backend: 'sync' });
        });
        sendResponse({ success: true, enabled: isEnabled });
        break;
      case 'ADD_CUSTOM_RULE':
        await addCustomRule(msg.rule);
        sendResponse({ success: true });
        break;
      case 'REMOVE_CUSTOM_RULE':
        await removeCustomRule(msg.ruleId);
        sendResponse({ success: true });
        break;
      case 'GET_FILTER_LISTS':
        sendResponse(filterListManager.getStatus());
        break;
      case 'TOGGLE_FILTER_LIST':
        filterListManager.toggleList(msg.listId, msg.enabled);
        await applyAllRules();
        sendResponse({ success: true });
        break;
      case 'FORCE_UPDATE':
        const updated = await filterListManager.updateAll();
        if (updated.length) await applyAllRules();
        sendResponse({ success: true, updated });
        break;
      case 'YOUTUBE_BLOCK_MODE':
        youtubeAdBlocker.setMode(msg.mode);
        await applyAllRules();
        sendResponse({ success: true });
        break;
      case 'REPORT_BLOCKED':
        statisticsTracker.trackBlocked(msg.url, msg.ruleId || 0, msg.filterList || 'unknown');
        break;
      case 'REPORT_ALLOWED':
        statisticsTracker.trackAllowed(msg.url);
        break;
      case 'RESET_STATS':
        statisticsTracker.reset();
        sendResponse({ success: true });
        break;
      case 'GET_LIFECYCLE_STATUS':
        sendResponse(lifecycleManager.getStatus());
        break;
      case 'FORCE_REINIT':
        await lifecycleManager.reinitialize();
        sendResponse({ success: true });
        break;
      case 'ADD_EXCEPTION_RULE':
        await addExceptionRule(msg.pattern);
        sendResponse({ success: true });
        break;
      case 'DIAGNOSE_WHITE_VIDEO':
        const diag = await diagnoseWhiteVideo(msg.tabId);
        sendResponse(diag);
        break;
      case 'DIAGNOSE_BLOCK_RATE':
        const audit = await diagnoseBlockRateDrop();
        sendResponse(audit);
        break;
      case 'GET_SCRIPTLET_VERSIONS':
        sendResponse({ scriptlets: getScriptletVersions() });
        break;
      case 'SCRIPTLET_DISABLED':
        console.warn('[AeroGuard] Scriptlet disabled:', msg.name, 'failures:', msg.failures, 'lastError:', msg.lastError);
        // Could store this in storage for persistence
        sendResponse({ success: true });
        break;
    }
  };

  handle().catch(e => sendResponse({ success: false, error: e.message }));
  return true;
});

// ========== SCRIPTLET VERSION MANAGEMENT ==========
function getScriptletVersions() {
  // Get versions from YouTube ad blocker
  return youtubeAdBlocker.getScriptletVersions();
}

async function addCustomRule(rule) {
  const { settings } = await storageEngine.get('settings', { backend: 'sync' });
  const newRule = { ...rule, id: Date.now(), added: new Date().toISOString() };
  settings.customRules = settings.customRules || [];
  settings.customRules.push(newRule);
  await storageEngine.set({ settings }, { backend: 'sync' });
  await applyAllRules();
}

async function removeCustomRule(ruleId) {
  const { settings } = await storageEngine.get('settings', { backend: 'sync' });
  settings.customRules = (settings.customRules || []).filter(r => r.id !== ruleId);
  await storageEngine.set({ settings }, { backend: 'sync' });
  await applyAllRules();
}

async function addExceptionRule(pattern) {
  const { settings } = await storageEngine.get('settings', { backend: 'sync' });
  settings.customRules = settings.customRules || [];
  settings.customRules.push({
    id: Date.now(),
    pattern,
    action: 'allow',
    resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'stylesheet', 'font', 'object', 'media', 'websocket', 'other', 'ping'],
    added: new Date().toISOString(),
    isException: true
  });
  await storageEngine.set({ settings }, { backend: 'sync' });
  await applyAllRules();
}

// ========== YOUTUBE NAVIGATION HANDLING ==========
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (!isEnabled) return;
  if (details.url.includes('youtube.com') || details.url.includes('youtube-nocookie.com')) {
    await youtubeAdBlocker.handleNavigation(details.tabId, details.url, details.frameId);
  }
}, { url: [{ hostSuffix: 'youtube.com' }, { hostSuffix: 'youtube-nocookie.com' }] });

// ========== WEBREQUEST FALLBACK (for DNR limitations) ==========
chrome.webRequest.onBeforeRequest.addListener(async (details) => {
  if (!isEnabled) return { cancel: false };

  const { settings } = await storageEngine.get('settings', { backend: 'sync' });
  const customRules = settings.customRules || [];
  const blockPatterns = customRules.filter(r => r.action === 'block').map(r => r.pattern);

  for (const pattern of blockPatterns) {
    if (matchPattern(details.url, pattern)) {
      await statisticsTracker.trackBlocked(details.url, 0, 'custom');
      return { cancel: true };
    }
  }
  return { cancel: false };
}, { urls: ['<all_urls>'] }, ['blocking']);

function matchPattern(url, pattern) {
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    return regex.test(url);
  }
  return url.includes(pattern);
}

// ========== DIAGNOSTIC FUNCTIONS ==========
async function diagnoseWhiteVideo(tabId) {
  return await wrapScriptInjection('diagnoseWhiteVideo', async () => {
    return await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const video = document.querySelector('video.html5-main-video, video#movie_player');
        const player = document.querySelector('#movie_player, .html5-video-player');
        const ads = document.querySelectorAll('.video-ads, .ytp-ad-module, [class*="ad-"]');

        return {
          videoExists: !!video,
          videoVisible: video ? getComputedStyle(video).display !== 'none' &&
                              getComputedStyle(video).visibility !== 'hidden' &&
                              getComputedStyle(video).opacity !== '0' &&
                              video.offsetWidth > 0 && video.offsetHeight > 0 : false,
          videoStyles: video ? {
            display: getComputedStyle(video).display,
            visibility: getComputedStyle(video).visibility,
            opacity: getComputedStyle(video).opacity,
            width: video.offsetWidth,
            height: video.offsetHeight
          } : null,
          playerExists: !!player,
          playerStyles: player ? {
            display: getComputedStyle(player).display,
            visibility: getComputedStyle(player).visibility
          } : null,
          adElementsFound: ads.length,
          adSelectors: Array.from(ads).map(a => ({
            tag: a.tagName,
            class: a.className,
            id: a.id,
            hidden: getComputedStyle(a).display === 'none'
          }))
        };
      },
      world: 'MAIN'
    });
  });
}

async function diagnoseBlockRateDrop() {
  const audit = filterListManager.getStatus();

  console.group('[AeroGuard] BLOCK RATE DIAGNOSIS');
  console.log('Filter Lists:', audit);

  for (const [id, list] of Object.entries(audit)) {
    if (list.enabled && list.ruleCount === 0) {
      console.error(`❌ LIST EMPTY: ${list.name} (${id}) — enabled but 0 rules!`);
    } else if (!list.enabled) {
      console.warn(`⚠️ LIST DISABLED: ${list.name} (${id})`);
    } else {
      console.log(`✅ ${list.name}: ${list.ruleCount} rules`);
    }
  }

  const criticalAllows = [
    'googlevideo.com/videoplayback',
    's.ytimg.com/yts/jsbin/player-',
    'i.ytimg.com/',
    'youtube.com/api/timedtext'
  ];

  const ytRules = youtubeAdBlocker.getDNRRules();
  const allowRules = ytRules.filter(r => r.action.type === 'allow');
  const missingAllows = criticalAllows.filter(pattern =>
    !allowRules.some(r => r.condition.urlFilter?.includes(pattern))
  );

  if (missingAllows.length > 0) {
    console.error('❌ MISSING CRITICAL ALLOW RULES:', missingAllows);
  } else {
    console.log('✅ All critical allow rules present');
  }
  console.groupEnd();

  return { filterLists: audit, missingCriticalAllows: missingAllows, youtubeRules: ytRules.length };
}

// ========== LIFECYCLE ==========
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await initialize();
    chrome.tabs.create({ url: 'welcome.html' });
  } else if (details.reason === 'update') {
    currentVersion = chrome.runtime.getManifest().version;
    await initialize();
  }
});

chrome.runtime.onStartup.addListener(initialize);

// Initialize on load
initialize();

export { initialize, applyAllRules, filterListManager, youtubeAdBlocker, statisticsTracker, lifecycleManager };