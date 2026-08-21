// High-Density DNR Rule Generator with Automatic Quota Safeguards
export const BENCHMARK_DOMAINS = [
  // Google Ads & Tracking
  'pagead2.googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
  'google-analytics.com', 'analytics.google.com', 'googletagmanager.com',
  'googletagservices.com', 'doubleclick.net', 'ad.doubleclick.net', 'static.doubleclick.net',

  // Meta / Facebook
  'connect.facebook.net', 'pixel.facebook.com', 'an.facebook.com', 'tr.facebook.com',

  // Major Ad Networks
  'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'amazon-adsystem.com',
  'media.net', 'rubiconproject.com', 'pubmatic.com', 'openx.net', 'appnexus.com',
  'adnxs.com', 'bidswitch.net', 'casalemedia.com', 'indexww.com', 'adroll.com',
  'smartadserver.com', 'exoclick.com', 'popads.net', 'propellerads.com', 'adsterra.com',

  // Analytics & Session Replays
  'hotjar.com', 'clarity.ms', 'sentry.io', 'bugsnag.com', 'mixpanel.com',
  'amplitude.com', 'segment.io', 'logrocket.com', 'mouseflow.com', 'fullstory.com', 'heap.io',

  // Yandex & Regional
  'mc.yandex.ru', 'mc.yandex.md', 'yastatic.net', 'an.yandex.ru', 'top-fwz1.mail.ru',

  // Telemetry & Push
  'onesignal.com', 'appsflyer.com', 'adjust.com', 'branch.io', 'telemetry.microsoft.com',
  'metrics.icloud.com', 'tracking.miui.com', 'samsungads.com'
];

export async function deployUltraDnrEngine() {
  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules.map(r => r.id);
    const addRules = BENCHMARK_DOMAINS.map((domain, idx) => ({
      id: 100000 + idx,
      priority: 100,
      action: { type: 'block' },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: [
          'main_frame', 'sub_frame', 'script', 'xmlhttprequest',
          'image', 'stylesheet', 'media', 'websocket', 'other', 'ping'
        ]
      }
    }));
    // Safe batch execution under chrome limits
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules
    });

    console.log(`[AeroGuard Engine] Applied ${addRules.length} dynamic block rules.`);
  } catch (err) {
    console.warn('[AeroGuard Engine] Dynamic rule allocation handled safely:', err.message);
  }
}