const HIGH_IMPACT_TRACKERS = [
  // Google Ads & Tracking - wildcard subdomains
  '*.googlesyndication.com', '*.googleadservices.com', '*.adservice.google.com',
  '*.google-analytics.com', '*.analytics.google.com', '*.googletagmanager.com',
  '*.doubleclick.net', '*.googleadservices.com',

  // Meta / Facebook
  '*.facebook.net', '*.facebook.com',

  // Major Ad Networks
  '*.criteo.com', '*.criteo.net', '*.taboola.com', '*.outbrain.com', '*.amazon-adsystem.com',
  '*.media.net', '*.rubiconproject.com', '*.pubmatic.com', '*.openx.net', '*.appnexus.com',
  '*.adnxs.com', '*.bidswitch.net', '*.casalemedia.com', '*.indexww.com', '*.adroll.com',
  '*.smartadserver.com', '*.exoclick.com', '*.popads.net', '*.propellerads.com', '*.adsterra.com',

  // Analytics & Session Replays
  '*.hotjar.com', '*.clarity.ms', '*.sentry.io', '*.bugsnag.com', '*.mixpanel.com',
  '*.amplitude.com', '*.segment.io', '*.logrocket.com', '*.mouseflow.com', '*.fullstory.com', '*.heap.io',

  // Yandex & Regional
  '*.yandex.ru', '*.yandex.md', '*.yastatic.net', '*.an.yandex.ru', '*.top-fwz1.mail.ru',

  // Telemetry & Push
  '*.onesignal.com', '*.appsflyer.com', '*.adjust.com', '*.branch.io', '*.telemetry.microsoft.com',
  '*.metrics.icloud.com', '*.tracking.miui.com', '*.samsungads.com'
];

export async function deployUltraDnrEngine() {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules.map(r => r.id);

  const addRules = HIGH_IMPACT_TRACKERS.map((domain, idx) => ({
    id: 10000 + idx,
    priority: 1000,
    action: { type: 'block' },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: [
        'main_frame', 'sub_frame', 'script', 'xmlhttprequest',
        'image', 'stylesheet', 'media', 'websocket', 'other', 'ping'
      ]
    }
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  console.log(`[AeroGuard DNR] ${addRules.length} ultra-priority wildcard rules active.`);
}

export async function deployQueryStripperRules() {
  const trackingParams = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'msclkid', 'mc_eid', 'yclid', '_ga', 'adlt'
  ];

  const rule = {
    id: 99999,
    priority: 200,
    action: {
      type: 'redirect',
      redirect: {
        transform: {
          queryTransform: {
            removeParams: trackingParams
          }
        }
      }
    },
    condition: {
      urlFilter: '*?*=',
      resourceTypes: ['main_frame', 'sub_frame']
    }
  };

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [99999],
    addRules: [rule]
  });
  console.log('[AeroGuard Stripper] Tracking Parameter Stripper active.');
}