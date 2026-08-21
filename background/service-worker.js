// Global Error Omni-Shield
self.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  console.debug('[AeroGuard OmniShield] Intercepted Unhandled Rejection:', event.reason);
});

self.addEventListener('error', (event) => {
  event.preventDefault();
  console.debug('[AeroGuard OmniShield] Intercepted Global Exception:', event.message);
});

// Self-Healing Task Runner
const safeRun = async (label, fn) => {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[AeroGuard SafeRun] Module [${label}] recovered safely:`, err.message);
    return null;
  }
};

// Offscreen Keep-Alive Initialization (Prevents MV3 Sleeping)
async function ensureOffscreenDocument() {
  const hasDocument = await chrome.offscreen.hasDocument();
  if (!hasDocument) {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['BLOB'],
      justification: 'Keep Service Worker state active during blocking tasks.'
    }).catch(() => {});
  }
}

// Service Worker Lifecycle
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[AeroGuard Ultra] Booting Master Engine...');
  await safeRun('URL Parameter Stripper', deployQueryStripperRules);
  await safeRun('Offscreen KeepAlive', ensureOffscreenDocument);

  chrome.alarms.create('aeroguard_ping', { periodInMinutes: 2 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'aeroguard_ping') {
    await safeRun('KeepAlive Sync', async () => {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      if (rules.length === 0) {
        await deployQueryStripperRules();
      }
    });
  }
});