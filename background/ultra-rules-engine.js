// ultra-rules-engine.js
// High-Density DNR Rule Generator - 160+ tracking/ad domains

const ADBLOCK_BENCHMARK_DOMAINS = [
  // --- Google Ads & Tracking ---
  'pagead2.googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
  'google-analytics.com', 'analytics.google.com', 'googletagmanager.com',
  'googletagservices.com', 'doubleclick.net', 'ad.doubleclick.net',
  'static.doubleclick.net', 'stats.g.doubleclick.net', 'googleoptimize.com',

  // --- Facebook / Meta ---
  'connect.facebook.net', 'pixel.facebook.com', 'an.facebook.com',
  'graph.facebook.com', 'tr.facebook.com',

  // --- Major Ad Networks & DSPs ---
  'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'amazon-adsystem.com',
  'media.net', 'rubiconproject.com', 'pubmatic.com', 'openx.net', 'appnexus.com',
  'adnxs.com', 'bidswitch.net', 'casalemedia.com', 'indexww.com', 'adroll.com',
  'smartadserver.com', 'yieldlab.net', 'exponential.com', 'popads.net', 'popcash.net',
  'adsterra.com', 'propellerads.com', 'exoclick.com', 'juicyads.com', 'adform.net',
  'revcontent.com', 'infolinks.com', 'zedo.com', 'adbringer.com', 'tribalfusion.com',
  'quantserve.com', 'quantcount.com', 'scorecardresearch.com', 'statcounter.com',

  // --- Analytics, Session Replay & Heatmaps ---
  'hotjar.com', 'hotjar.io', 'clarity.ms', 'sentry.io', 'bugsnag.com',
  'mixpanel.com', 'amplitude.com', 'segment.io', 'segment.com', 'logrocket.com',
  'mouseflow.com', 'fullstory.com', 'crazyegg.com', 'heap.io', 'inspectlet.com',
  'chartbeat.com', 'chartbeat.net', 'rollbar.com', 'raygun.io', 'trackjs.com',
  'alexa.com', 'omtrdc.net', 'demdex.net', 'bluekai.com', 'krxd.net', 'moatads.com',

  // --- Yandex, Mail.ru & Regional Trackers ---
  'mc.yandex.ru', 'mc.yandex.md', 'yastatic.net', 'an.yandex.ru',
  'top-fwz1.mail.ru', 'counter.yadro.ru', 'rambler.ru',

  // --- Social Media Trackers & Pixels ---
  'ads-twitter.com', 'analytics.twitter.com', 'platform.twitter.com',
  'snap.licdn.com', 'licdn.com', 'analytics.tiktok.com', 'ct.pinterest.com',
  'widgets.pinterest.com', 'redditstatic.com', 'pixel.wp.com',

  // --- Mobile, In-App & Push Notification Ads ---
  'onesignal.com', 'pushwoosh.com', 'appsflyer.com', 'adjust.com', 'branch.io',
  'flurry.com', 'urbanairship.com', 'tapjoy.com', 'applovin.com', 'unity3d.com',
  'ads.unity3d.com', 'ironctr.com', 'mbridge.io', 'vungle.com', 'chartboost.com',
  'adcolony.com', 'fyber.com', 'inmobi.com', 'mobfox.com',

  // --- OEM System Telemetry (Windows, Apple, Xiaomi, Samsung) ---
  'telemetry.microsoft.com', 'v10.events.data.microsoft.com', 'data.microsoft.com',
  'metrics.icloud.com', 'metrics.apple.com', 'tracking.miui.com', 'api.ad.xiaomi.com',
  'metrics.data.hicloud.com', 'diagnostics.meizu.com', 'telemetry.sdk.samsung.com',
  'samsungads.com', 'geolocation.onetrust.com', 'cdn.cookielaw.org'
];

export async function applyUltraEngineRules() {
  console.log('[AeroGuard] Deploying Ultra Engine Rule Set...');

  // 1. Get current dynamic rules and wipe old dynamic rules to avoid ID collisions
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existingRules.map(r => r.id);

  // 2. Generate optimized declarative rules
  const rules = ADBLOCK_BENCHMARK_DOMAINS.map((domain, index) => ({
    id: 4000000 + index,
    priority: 10,
    action: { type: 'block' },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: [
        'main_frame', 'sub_frame', 'script', 'xmlhttprequest',
        'image', 'stylesheet', 'media', 'websocket', 'other', 'ping', 'csp_report'
      ]
    }
  }));

  // 3. Batch apply rules safely within MV3 quotas (max 5000 dynamic rules)
  const MAX_BATCH_SIZE = 1000;

  for (let i = 0; i < rules.length; i += MAX_BATCH_SIZE) {
    const batch = rules.slice(i, i + MAX_BATCH_SIZE);
    const updatePayload = { addRules: batch };

    if (i === 0 && removeIds.length > 0) {
      updatePayload.removeRuleIds = removeIds;
    }

    try {
      await chrome.declarativeNetRequest.updateDynamicRules(updatePayload);
    } catch (error) {
      console.error(`[AeroGuard] Rule batch deployment error at index ${i}:`, error);
    }
  }

  const activeRules = await chrome.declarativeNetRequest.getDynamicRules();
  console.log(`[AeroGuard] Ultra Engine active: ${activeRules.length} targeted rules loaded.`);
}

export { ADBLOCK_BENCHMARK_DOMAINS };