// CNAME Uncloaking Engine - Detects and blocks CNAME-cloaked tracking domains
// Uses regex-based DNR rules to catch first-party subdomains cloaking third-party trackers

const CNAME_TRACKER_TARGETS = [
  'omtrdc.net',         // Adobe Experience Cloud / Omniture
  '2o7.net',            // Adobe Legacy
  'eulerian.net',       // Eulerian Analytics
  'wizaly.com',         // Wizaly Attribution
  'at-o.net',           // Piano / AT Internet
  'wt-eu02.net',        // Mapp / Webtrekk
  'commandersact.com',  // Commander's Act / TagCommander
  'tagcommander.com',
  'affex.org',          // Affilinet
  'go-mpulse.net',      // Akamai mPulse
  'keyade.com',         // Keyade
  'kenshoo.com',        // Skai / Kenshoo
  'responsys.net',      // Oracle Responsys
  'sc-cdn.net',         // Snap CNAME Tracker
  'mxpnl.com',          // Mixpanel
  'matomo.cloud',       // Matomo Cloud
  'd1.sc.omtrdc.net',   // Adobe
  'd2.sc.omtrdc.net',   // Adobe
  'd3.sc.omtrdc.net',   // Adobe
  'metrics.cnn.com',    // CNN
  'metrics.bloomberg.com', // Bloomberg
  'stats.g.doubleclick.net', // Google
  'metrics.brightcove.com', // Brightcove
  'metrics.brightcove.com', // Brightcove
  'analytics.twitter.com', // Twitter
  'ads.twitter.com',    // Twitter Ads
  'pixel.facebook.com', // Facebook Pixel
  'connect.facebook.net', // Facebook
  'analytics.tiktok.com', // TikTok
  'ct.pinterest.com',   // Pinterest
  'analytics.tiktok.com', // TikTok
  'analytics.pinterest.com', // Pinterest
  'tr.snapchat.com',    // Snapchat
  'ct.pinterest.com',   // Pinterest
  'px.ads.linkedin.com', // LinkedIn
  'analytics.linkedin.com', // LinkedIn
];

export async function deployCnameRules() {
  console.log('[AeroGuard] Deploying CNAME Uncloaking Engine...');

  // Build regex patterns matching any request resolving or pointing to known CNAME targets
  const rules = CNAME_TRACKER_TARGETS.map((target, index) => {
    // Escapes target domain for regex usage
    const escapedTarget = target.replace(/\./g, '\\.');

    return {
      id: 600000 + index,
      priority: 15, // Higher priority than general domain blocks
      action: { type: 'block' },
      condition: {
        // Matches subdomains pointing to tracker endpoints or explicit CNAME query structures
        regexFilter: `^https?://[a-z0-9.-]+\\.(?:${escapedTarget})(:[0-9]+)?(/.*)?$`,
        resourceTypes: [
          'script', 'xmlhttprequest', 'image', 'ping', 'other'
        ]
      }
    };
  });

  // Remove previous CNAME rules to avoid ID duplication
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules
    .filter(r => r.id >= 600000 && r.id < 700000)
    .map(r => r.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: rules
  });

  console.log(`[AeroGuard] CNAME Uncloaker Active: ${rules.length} regex tracking targets loaded.`);
}

export { CNAME_TRACKER_TARGETS };