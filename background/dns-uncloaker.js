// dns-uncloaker.js - Async DNS Uncloaking for Firefox MV3 & Supported Browsers
// Uses browser.dns API for true asynchronous CNAME resolution
// When a first-party request occurs, checks if the canonical domain maps to an ad network
// and dynamically updates DNR rules.

import { CNAME_TRACKER_TARGETS } from './cname-uncloaking.js';

if (typeof browser !== 'undefined' && browser.dns) {
  const RESOLVED_CNAME_CACHE = new Set();

  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return; // Only process main frame navigation subresources

    try {
      const url = new URL(details.url);
      const hostname = url.hostname;

      // Skip root domain resolving
      if (RESOLVED_CNAME_CACHE.has(hostname)) return;

      // Resolve CNAME records asynchronously
      const record = await browser.dns.resolve(hostname, ['canonical_name']);

      if (record && record.canonicalName && record.canonicalName !== hostname) {
        const canonical = record.canonicalName.toLowerCase();

        // Check if canonical domain belongs to a tracking company
        const isTracker = CNAME_TRACKER_TARGETS.some(target => canonical.endsWith(target));

        if (isTracker) {
          RESOLVED_CNAME_CACHE.add(hostname);

          // Dynamically block this specific first-party cloaked hostname
          await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [{
              id: 700000 + (RESOLVED_CNAME_CACHE.size % 90000),
              priority: 20,
              action: { type: 'block' },
              condition: {
                urlFilter: `||${hostname}^`,
                resourceTypes: ['script', 'xmlhttprequest', 'image', 'ping', 'other']
              }
            }]
          });

          console.log(`[AeroGuard CNAME] Uncloaked and blocked: ${hostname} -> ${canonical}`);
        }
      }
    } catch (e) {
      // Quiet fail for unresolvable local or private hosts
    }
  });
}

export { CNAME_TRACKER_TARGETS };