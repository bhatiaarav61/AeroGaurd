/**
 * Bounce Tracking Protection Module
 * Detects and blocks redirect tracking (bounce tracking)
 * Clears bounce tracking cookies and storage
 *
 * Based on Brave's bounce tracking protection implementation
 */

class BounceTrackingProtection {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.strictMode = options.strictMode ?? false;
    this.knownTrackers = new Set(options.knownTrackers || []);
    this.bounceThreshold = options.bounceThreshold || 2; // Max redirects before considering bounce tracking
    this.timeWindow = options.timeWindow || 10000; // Time window in ms
    this.storageKeys = [
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'cacheStorage',
      'serviceWorker'
    ];

    // Tracking state
    this.redirectChains = new Map(); // tabId -> [{ url, timestamp, referrer }]
    this.blockedBounces = new Map(); // tabId -> count
    this.clearedStorage = new Map(); // tabId -> { type, keys }

    // Known bounce tracking domains (common redirectors)
    this.defaultBounceTrackers = new Set([
      // Google
      'googleadservices.com',
      'google.com/aclk',
      'google.com/url',
      'googleadservices.com/pagead/aclk',
      'googleads.g.doubleclick.net',
      'www.googleadservices.com',
      'www.google.com/aclk',
      // Meta/Facebook
      'facebook.com/ads/click',
      'facebook.com/tr',
      'l.facebook.com',
      'lm.facebook.com',
      // Twitter/X
      't.co',
      'twitter.com/i/adsct',
      // Microsoft
      'bing.com/ck',
      'bat.bing.com',
      // Amazon
      'amazon.com/gp/redirect',
      'amazon-adsystem.com',
      // Generic tracking redirectors
      'click.appcast.io',
      'click.convertkit-mail.com',
      'click.getdrip.com',
      'click.mailerlite.com',
      'clicks.activecampaign.com',
      'clicks.aweber.com',
      'clicks.sendgrid.net',
      'email.mktg.godaddy.com',
      'links.klaviyo.com',
      'r.mailgun.net',
      'track.hubspot.com',
      'tracking.entrepreneur.com',
      'trk.mailjet.com',
      'metrics.verticalresponse.com',
      'link.etracker.de',
      'click.email-od.com',
      'clicks.benchmarkemail.com',
      'clicks.constantcontact.com',
      'clicks.icontact.com',
      'clicks.infusionsoft.com',
      'clicks.mailchimp.com',
      'clicks.sendinblue.com',
      'clicks.simplified.io',
      'clicks.zohocampaigns.com',
      'cts.audible.com',
      'go.buysellads.com',
      'go.capterra.com',
      'go.getambassador.com',
      'go.hubspot.com',
      'go.marketo.net',
      'go.pardot.com',
      'link.brightcove.com',
      'link.email.upserve.com',
      'link.hotjar.com',
      'link.intercom.io',
      'link.mixpanel.com',
      'link.pendo.io',
      'links.customer.io',
      'links.drift.com',
      'links.getresponse.com',
      'links.intercom-mail.com',
      'links.mandrillapp.com',
      'links.ontraport.com',
      'links.sendgrid.com',
      'links.userpilot.io',
      'metrics.sendinblue.com',
      'r.sendgrid.net',
      'tracking.bloomreach.com',
      'tracking.braze.com',
      'tracking.convertkit.com',
      'tracking.drip.com',
      'tracking.getresponse.com',
      'tracking.iterable.com',
      'tracking.kartra.com',
      'tracking.klaviyo.com',
      'tracking.leadsquared.com',
      'tracking.lemlist.com',
      'tracking.mailerlite.com',
      'tracking.outreach.io',
      'tracking.reply.io',
      'tracking.salesloft.com',
      'tracking.sendinblue.com',
      'tracking.sharpSpring.com',
      'tracking.woodpecker.co',
      'trk.activecampaign.com',
      'trk.audible.com',
      'trk.emailoctopus.com',
      'trk.feedblitz.com',
      'trk.infusionsoft.com',
      'trk.kartra.com',
      'trk.keen.io',
      'trk.lemlist.com',
      'trk.mailchimp.com',
      'trk.mailerlite.com',
      'trk.mailgun.net',
      'trk.outreach.io',
      'trk.pipedrive.com',
      'trk.reply.io',
      'trk.salesloft.com',
      'trk.sendgrid.net',
      'trk.sendinblue.com',
      'trk.woodpecker.co',
      'u.clickup.com',
      'u.hubspot.com',
      'u.intercom.io',
      'u.klaviyo.com',
      'u.maildrop.cc',
      'u.mixpanel.com',
      'u.pendo.io',
      'u.sendgrid.net',
      'u.userpilot.io',
      'url.avangate.com',
      'url.email.samsara.com',
      'v.clickfunnels.com',
      'v.klaviyo.com',
      'v.woodpecker.co',
      'www.googleadservices.com/pagead/aclk',
      'www.google.com/aclk',
      'www.google.com/url'
    ]);
  }

  /**
   * Initialize bounce tracking protection
   */
  async initialize() {
    if (typeof chrome !== 'undefined' && chrome.webNavigation) {
      // Listen for navigation events
      chrome.webNavigation.onBeforeNavigate.addListener(this.handleNavigation.bind(this));
      chrome.webNavigation.onCompleted.addListener(this.handleNavigationComplete.bind(this));
      chrome.webNavigation.onErrorOccurred.addListener(this.handleNavigationError.bind(this));

      // Listen for tab updates
      if (chrome.tabs && chrome.tabs.onUpdated) {
        chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
      }

      // Listen for cookies changes
      if (chrome.cookies && chrome.cookies.onChanged) {
        chrome.cookies.onChanged.addListener(this.handleCookieChanged.bind(this));
      }
    }

    console.log('[BounceTrackingProtection] Initialized');
  }

  /**
   * Handle navigation events to detect bounce tracking
   */
  handleNavigation(details) {
    if (!this.enabled) return;
    if (details.frameId !== 0) return; // Only main frame

    const tabId = details.tabId;
    const url = details.url;
    const timestamp = details.timeStamp;

    // Initialize redirect chain for this tab
    if (!this.redirectChains.has(tabId)) {
      this.redirectChains.set(tabId, []);
    }

    const chain = this.redirectChains.get(tabId);

    // Add to chain
    chain.push({
      url,
      timestamp,
      referrer: details.referrer || '',
      transitionType: details.transitionType,
      transitionQualifiers: details.transitionQualifiers
    });

    // Clean old entries outside time window
    const cutoff = timestamp - this.timeWindow;
    const recent = chain.filter(entry => entry.timestamp > cutoff);
    this.redirectChains.set(tabId, recent);

    // Check for bounce tracking
    if (recent.length >= this.bounceThreshold) {
      this.analyzeRedirectChain(tabId, recent);
    }
  }

  /**
   * Analyze redirect chain for bounce tracking patterns
   */
  analyzeRedirectChain(tabId, chain) {
    // Look for patterns:
    // 1. Multiple redirects through known tracking domains
    // 2. Redirects that strip referrer
    // 3. Redirects to different domains rapidly

    let trackerCount = 0;
    let domainChanges = 0;
    let lastDomain = null;

    for (const entry of chain) {
      try {
        const url = new URL(entry.url);
        const domain = url.hostname.toLowerCase();

        // Check if this is a known bounce tracker
        if (this.isBounceTracker(domain)) {
          trackerCount++;
        }

        // Count domain changes
        if (lastDomain && domain !== lastDomain) {
          domainChanges++;
        }
        lastDomain = domain;
      } catch (e) {
        // Invalid URL, skip
      }
    }

    // Bounce tracking detected if:
    // - Multiple known trackers in chain
    // - Rapid domain changes
    // - Chain includes known tracking redirect patterns
    if (trackerCount >= 2 || domainChanges >= 3) {
      console.warn('[BounceTrackingProtection] Bounce tracking detected on tab', tabId, {
        trackerCount,
        domainChanges,
        chainLength: chain.length
      });

      // Increment blocked count
      const blocked = this.blockedBounces.get(tabId) || 0;
      this.blockedBounces.set(tabId, blocked + 1);

      // Clear storage for this tab
      this.clearTabStorage(tabId);

      // Notify content script
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.sendMessage(tabId, {
          type: 'BOUNCE_TRACKING_DETECTED',
          trackerCount,
          domainChanges,
          chainLength: chain.length
        }).catch(() => {});
      }
    }
  }

  /**
   * Check if a domain is a known bounce tracker
   */
  isBounceTracker(domain) {
    const normalized = domain.replace(/^www\./, '');

    // Check known trackers
    if (this.knownTrackers.has(normalized)) return true;
    if (this.defaultBounceTrackers.has(normalized)) return true;

    // Check patterns
    for (const tracker of this.defaultBounceTrackers) {
      if (tracker.includes('/')) {
        // Path-based tracker
        if (normalized.includes(tracker.split('/')[0])) return true;
      } else if (normalized.endsWith(tracker) || normalized === tracker) {
        return true;
      }
    }

    return false;
  }

  /**
   * Handle navigation completion
   */
  handleNavigationComplete(details) {
    if (!this.enabled) return;
    if (details.frameId !== 0) return;

    // Clean up old redirect chains after a delay
    setTimeout(() => {
      const chain = this.redirectChains.get(details.tabId);
      if (chain) {
        // Keep only very recent entries
        const cutoff = Date.now() - this.timeWindow;
        const recent = chain.filter(entry => entry.timestamp > cutoff);
        if (recent.length === 0) {
          this.redirectChains.delete(details.tabId);
        } else {
          this.redirectChains.set(details.tabId, recent);
        }
      }
    }, this.timeWindow * 2);
  }

  /**
   * Handle navigation errors
   */
  handleNavigationError(details) {
    if (!this.enabled) return;
    if (details.frameId !== 0) return;

    // Clear chain on error
    this.redirectChains.delete(details.tabId);
  }

  /**
   * Handle tab updates
   */
  handleTabUpdated(tabId, changeInfo, tab) {
    if (!this.enabled) return;

    // Clear redirect chain on new navigation
    if (changeInfo.status === 'loading' && changeInfo.url) {
      this.redirectChains.delete(tabId);
      this.blockedBounces.delete(tabId);
    }
  }

  /**
   * Handle cookie changes
   */
  handleCookieChanged(changeInfo) {
    if (!this.enabled) return;

    // Check if cookie is from a bounce tracker
    if (changeInfo.cookie && this.isBounceTracker(changeInfo.cookie.domain)) {
      // Cookie from bounce tracker - could be tracking
      console.log('[BounceTrackingProtection] Cookie from bounce tracker:', changeInfo.cookie.domain);
    }
  }

  /**
   * Clear storage for a tab to prevent bounce tracking persistence
   */
  async clearTabStorage(tabId) {
    if (typeof chrome === 'undefined') return;

    const cleared = {
      localStorage: [],
      sessionStorage: [],
      indexedDB: [],
      cacheStorage: [],
      cookies: []
    };

    try {
      // Get tab URL to determine origin
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url) return;

      const url = new URL(tab.url);
      const origin = url.origin;

      // Clear localStorage and sessionStorage via content script
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (origin) => {
          const cleared = { localStorage: [], sessionStorage: [] };

          // Clear localStorage
          try {
            for (let i = localStorage.length - 1; i >= 0; i--) {
              const key = localStorage.key(i);
              if (key) {
                cleared.localStorage.push(key);
                localStorage.removeItem(key);
              }
            }
          } catch (e) {}

          // Clear sessionStorage
          try {
            for (let i = sessionStorage.length - 1; i >= 0; i--) {
              const key = sessionStorage.key(i);
              if (key) {
                cleared.sessionStorage.push(key);
                sessionStorage.removeItem(key);
              }
            }
          } catch (e) {}

          return cleared;
        },
        args: [origin]
      }).then(results => {
        if (results && results[0] && results[0].result) {
          cleared.localStorage = results[0].result.localStorage;
          cleared.sessionStorage = results[0].result.sessionStorage;
        }
      }).catch(() => {});

      // Clear cookies for the origin
      if (chrome.cookies) {
        const cookies = await chrome.cookies.getAll({ url: tab.url });
        for (const cookie of cookies) {
          if (this.isBounceTracker(cookie.domain)) {
            await chrome.cookies.remove({
              url: tab.url,
              name: cookie.name,
              storeId: cookie.storeId
            });
            cleared.cookies.push(cookie.name);
          }
        }
      }

      // Clear IndexedDB
      await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          const dbs = await indexedDB.databases();
          const deleted = [];
          for (const db of dbs) {
            try {
              await new Promise((resolve, reject) => {
                const req = indexedDB.deleteDatabase(db.name);
                req.onsuccess = resolve;
                req.onerror = reject;
              });
              deleted.push(db.name);
            } catch (e) {}
          }
          return deleted;
        }
      }).then(results => {
        if (results && results[0] && results[0].result) {
          cleared.indexedDB = results[0].result;
        }
      }).catch(() => {});

      // Clear Cache Storage
      await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          const keys = await caches.keys();
          const deleted = [];
          for (const key of keys) {
            try {
              await caches.delete(key);
              deleted.push(key);
            } catch (e) {}
          }
          return deleted;
        }
      }).then(results => {
        if (results && results[0] && results[0].result) {
          cleared.cacheStorage = results[0].result;
        }
      }).catch(() => {});

      // Record cleared storage
      this.clearedStorage.set(tabId, cleared);

      console.log('[BounceTrackingProtection] Cleared storage for tab', tabId, cleared);
    } catch (error) {
      console.error('[BounceTrackingProtection] Failed to clear storage:', error);
    }
  }

  /**
   * Add a known bounce tracker domain
   */
  addTracker(domain) {
    this.knownTrackers.add(domain.toLowerCase());
  }

  /**
   * Add multiple tracker domains
   */
  addTrackers(domains) {
    for (const domain of domains) {
      this.addTracker(domain);
    }
  }

  /**
   * Remove a tracker domain
   */
  removeTracker(domain) {
    this.knownTrackers.delete(domain.toLowerCase());
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      strictMode: this.strictMode,
      knownTrackersCount: this.knownTrackers.size,
      defaultTrackersCount: this.defaultBounceTrackers.size,
      activeTabs: this.redirectChains.size,
      blockedBounces: Object.fromEntries(this.blockedBounces),
      clearedStorageCount: this.clearedStorage.size
    };
  }

  /**
   * Set enabled state
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Set strict mode
   */
  setStrictMode(strict) {
    this.strictMode = strict;
  }

  /**
   * Export data for backup
   */
  exportData() {
    return {
      knownTrackers: Array.from(this.knownTrackers),
      defaultTrackers: Array.from(this.defaultBounceTrackers),
      bounceThreshold: this.bounceThreshold,
      timeWindow: this.timeWindow,
      exportTime: Date.now()
    };
  }

  /**
   * Import data from backup
   */
  importData(data) {
    if (data.knownTrackers) {
      this.knownTrackers = new Set(data.knownTrackers);
    }
    if (data.defaultTrackers) {
      this.defaultBounceTrackers = new Set(data.defaultTrackers);
    }
    if (data.bounceThreshold) {
      this.bounceThreshold = data.bounceThreshold;
    }
    if (data.timeWindow) {
      this.timeWindow = data.timeWindow;
    }
  }

  /**
   * Clear all data
   */
  clearData() {
    this.redirectChains.clear();
    this.blockedBounces.clear();
    this.clearedStorage.clear();
  }

  /**
   * Clear redirect chain for a tab
   */
  clearChain(tabId) {
    this.redirectChains.delete(tabId);
    this.blockedBounces.delete(tabId);
  }

  /**
   * Inject bounce tracking protection into a tab
   */
  async injectContentScript(tabId) {
    if (typeof chrome === 'undefined' || !chrome.scripting) return;

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Bounce tracking protection is automatically applied when the content script loads
          if (window.BounceTrackingProtection && !window.bounceTrackingProtection) {
            window.bounceTrackingProtection = new BounceTrackingProtection();
            window.bounceTrackingProtection.initialize();
          }
        }
      });
    } catch (error) {
      console.warn('[BounceTrackingProtection] Failed to inject content script:', error);
    }
  }
}


// Export for use in service worker (CommonJS fallback)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BounceTrackingProtection };
}

// Export for browser use
if (typeof window !== 'undefined') {
  window.BounceTrackingProtection = BounceTrackingProtection;
}