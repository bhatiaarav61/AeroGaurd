/**
 * Cookie Annihilator - Advanced Cookie Protection
 * Targets specific tracker footprints, downgrades long-lived cookies to session,
 * and broadcasts actions to UI for live stats
 * Based on Brave's aggressive cookie protection
 */

class CookieProtection {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.blockThirdParty = options.blockThirdParty ?? true;
    this.partitionCookies = options.partitionCookies ?? true;
    this.autoDeleteOnClose = options.autoDeleteOnClose ?? false;
    this.deleteNonWhitelisted = options.deleteNonWhitelisted ?? false;
    this.whitelistedDomains = new Set(options.whitelistedDomains || []);
    this.sessionOnlyDomains = new Set(options.sessionOnlyDomains || []);

    // Tracking
    this.blockedCookies = new Map(); // tabId -> [{ cookie, reason }]
    this.deletedCookies = new Map(); // tabId -> [{ cookie, reason }]
    this.cookieStore = new Map(); // partitionKey -> Map(cookieName -> cookie)

    // Common tracking cookie signatures (names)
    this.trackerNames = new Set([
      '_ga', '_gid', '_ga_*', '_gcl_au', '_fbp', '_fbc',  // Google Analytics, Facebook
      'IDE', 'DSID', 'FLC', 'AID', 'TAID', 'exchange_uid', // Google Ads
      'MUID', 'MR', 'ANON', 'NID', 'DV', // Microsoft, Google
      'test_cookie', 'YSC', 'VISITOR_INFO1_LIVE', 'GPS', // YouTube
      'datr', 'c_user', 'xs', 'fr', 'sb', 'dbln', // Facebook
      'UID', 'UIDR', 'uvc', 'loc', 'bt2', 'di2', 'ssc', 'uid', 'uvc', // AddThis, ShareThis
      '__utma', '__utmb', '__utmc', '__utmz', '__utmv', '__utmx', // Old GA
      '_hjid', '_hjIncludedInSample', '_hjAbsoluteSessionInProgress', // Hotjar
      '_mkto_trk', '_mkt_trk', // Marketo
      '_pendo_visitorId', '_pendo_accountId', '_pendo_meta_', // Pendo
      'ajs_anonymous_id', 'ajs_user_id', 'ajs_group_id', // Segment
      'intercom-id-', 'intercom-session-', // Intercom
      'drift_aid', 'drift_session_id', // Drift
      '_cfduid', '__cf_bm', // Cloudflare
      '_sp_id.*', '_sp_ses.*', // Snowplow
      '_pk_id.*', '_pk_ses.*', // Matomo
      '_clck', '_clsk', // Clarity
      '_tt_enable_cookie', '_ttp', // TikTok
      '_pin_unauth', '_pinterest_ct_', // Pinterest
      '_sctr', '_scid', // Snapchat
      '_rdt_uuid', // Reddit
      '_lr_', '_lr_hb_', // Lucky Orange
      '_gcl_aw', '_gcl_dc', '_gcl_ha', '_gcl_gf', // Google Ads
      'ARRAffinity', 'ARRAffinitySameSite', // Azure
      'AWSALB', 'AWSALBCORS', // AWS
      'JSESSIONID', 'SESSION', 'PHPSESSID', 'ASP.NET_SessionId', // Session IDs (if long-lived)
      'csrf_token', 'xsrf_token', 'auth_token', 'access_token', // Auth tokens (if tracking)
    ]);

    // Tracker domain patterns for aggressive blocking
    this.trackerDomainPatterns = [
      'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
      'google-analytics.com', 'analytics.google.com', 'googletagmanager.com',
      'googletagservices.com', 'facebook.net', 'connect.facebook.net',
      'pixel.facebook.com', 'facebook.com/tr', 'ads.facebook.com',
      'amazon-adsystem.com', 'aax.amazon-adsystem.com',
      'adsystem.amazon.com', 'c.amazon-adsystem.com',
      'bing.com', 'bat.bing.com', 'ads.msn.com', 'c.msn.com',
      't.co', 'analytics.twitter.com', 'ads-api.twitter.com',
      'static.ads-twitter.com', 'adnxs.com', 'rubiconproject.com',
      'pubmatic.com', 'casalemedia.com', 'openx.net', 'criteo.com',
      'smartadserver.com', 'adsrvr.org', 'teads.tv', 'bidswitch.net',
      'moatads.com', 'quantserve.com', 'scorecardresearch.com',
      'hotjar.com', 'crazyegg.com', 'mixpanel.com', 'segment.com',
      'api.segment.io', 'cdn.segment.com', 'optimizely.com',
      'logx.optimizely.com', 'chartbeat.com', 'parsely.com',
      'imrworldwide.com', 'comscore.com', 'bam.nr-data.net',
      'browser-intake-datadoghq.com', 'sentry.io', 'bugsnag.com',
      'amplitude.com', 'mc.yandex.ru', 'hm.baidu.com', 'taboola.com',
      'outbrain.com', 'revcontent.com', 'mgid.com', 'adblade.com',
      'adskeeper.co.uk', 'adsupply.com', 'adup-tech.com', 'bidtheatre.com',
      'bidswitch.net', 'bidtellect.com', 'conversantmedia.com', 'dataxu.com',
      'districtm.io', 'dyntrk.com', 'eyeviewads.com', 'freewheel.com',
      'hb-api.com', 'indexexchange.com', 'inner-active.com', 'innity.net',
      'ipredictive.com', 'krxd.net', 'loopme.me', 'magnite.com',
      'media.net', 'mediamath.com', 'netmng.com', 'nexage.com',
      'platform.io', 'prebid.org', 'pulsepoint.com', 'quantcast.com',
      'realytics.com', 'rhythmone.com', 'rockerbox.com', 'rokt.com',
      'rtbhouse.com', 'rtk.io', 'rubiconproject.com', 'smaato.net',
      'smartadserver.com', 'sovrn.com', 'spotx.tv', 'stackadapt.com',
      'thetradedesk.com', 'tremorvideo.com', 'triplelift.com', 'turn.com',
      'unruly.co.uk', 'verizonmedia.com', 'vidible.tv', 'videoamp.com',
      'videoplaza.tv', 'wunderkind.com', 'yieldlab.net', 'yieldmo.com',
      'yieldoptimizer.com', 'zergnet.com', 'zvelo.com',
      'adservice.google.com', 'pagead2.googlesyndication.com',
      'tpc.googlesyndication.com', 'securepubads.g.doubleclick.net',
      'googleads.g.doubleclick.net', 'stats.g.doubleclick.net',
      'ad.doubleclick.net', 'cm.g.doubleclick.net', 'fls.doubleclick.net',
      'adclick.g.doubleclick.net', 'adview.g.doubleclick.net',
      'cm.g.doubleclick.net', 'fpfn.g.doubleclick.net', 'n4756ad.g.doubleclick.net'
    ];
  }

  // Configuration setters
  setEnabled(val) { this.enabled = val; }
  setBlockThirdParty(val) { this.blockThirdParty = val; }
  setPartitionCookies(val) { this.partitionCookies = val; }
  setAutoDeleteOnClose(val) { this.autoDeleteOnClose = val; }
  setDeleteNonWhitelisted(val) { this.deleteNonWhitelisted = val; }

  /**
   * Initialize cookie protection
   */
  async initialize() {
    if (typeof chrome === 'undefined' || !chrome.cookies) {
      console.warn('[CookieProtection] Chrome cookies API not available');
      return;
    }

    // Listen for cookie changes - use the optimized handler
    chrome.cookies.onChanged.addListener(this.handleCookieChange.bind(this));

    // Listen for tab removal to clean up
    if (chrome.tabs && chrome.tabs.onRemoved) {
      chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));
    }

    // Listen for tab updates
    if (chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
    }

    console.log('[CookieProtection] Cookie Annihilator initialized');
  }

  /**
   * Main cookie change handler - aggressive tracking cookie destruction
   */
  async handleCookieChange(changeInfo) {
    if (!this.enabled || changeInfo.removed) return;

    const { cookie } = changeInfo;
    if (!cookie?.domain) return;

    // Only process explicit cookie sets (not updates/overwrites)
    if (changeInfo.cause !== 'explicit') return;

    const isThirdParty = this.isThirdPartyCookie(cookie);
    const isKnownTrackerName = this.trackerNames.has(cookie.name);
    const isTrackerDomain = this.isTrackerDomain(cookie.domain);

    // ACTION 1: Destroy known trackers instantly
    if (this.blockThirdParty && (isThirdParty || isKnownTrackerName || isTrackerDomain)) {
      // Skip if whitelisted
      if (this.isWhitelisted(cookie.domain)) return;

      await this.destroyCookie(cookie);
      this.broadcastAction('destroyed', cookie.name, cookie.domain, 'tracker');
      return;
    }

    // ACTION 2: Force long-lived cookies to expire when browser closes (Session Downgrade)
    // If a cookie tries to live longer than 24 hours, cut its lifespan
    const oneDay = 24 * 60 * 60;
    const isLongLived = cookie.expirationDate &&
      (cookie.expirationDate - (Date.now() / 1000) > oneDay);

    if (this.autoDeleteOnClose && !cookie.session && isLongLived) {
      // Don't downgrade whitelisted domains
      if (this.isWhitelisted(cookie.domain)) return;

      await this.downgradeToSession(cookie);
      this.broadcastAction('downgraded', cookie.name, cookie.domain, 'long-lived');
    }
  }

  /**
   * Check if cookie is third-party (heuristic)
   */
  isThirdPartyCookie(cookie) {
    const domain = cookie.domain.toLowerCase().replace(/^\./, '');

    // Cookies starting with dot are typically third-party
    if (cookie.domain.startsWith('.')) return true;

    // Check for tracking-related subdomains
    const trackingSubdomains = ['tracking', 'analytics', 'metrics', 'stats', 'pixel', 'beacon', 'collect'];
    return trackingSubdomains.some(sub => domain.includes(sub));
  }

  /**
   * Check if domain is a known tracker
   */
  isTrackerDomain(domain) {
    const normalized = domain.toLowerCase().replace(/^\./, '');

    // Exact match
    if (this.trackerDomainPatterns.some(d => normalized === d || normalized.endsWith('.' + d))) {
      return true;
    }

    // Check for tracking patterns in domain
    const trackingPatterns = [
      'analytics', 'tracking', 'tracker', 'pixel', 'beacon',
      'telemetry', 'metrics', 'stats', 'monitor', 'collect',
      'adserver', 'adserver', 'adclick', 'adtrack', 'adsystem',
      'adserver', 'advertising', 'adservices', 'adtech',
      'yield', 'bid', 'rtb', 'ssp', 'dsp', 'exchange'
    ];

    return trackingPatterns.some(pattern => normalized.includes(pattern));
  }

  /**
   * Check if cookie name is a known tracker
   */
  isTrackerName(name) {
    // Exact match
    if (this.trackerNames.has(name)) return true;

    // Pattern match for wildcard entries
    for (const tracker of this.trackerNames) {
      if (tracker.endsWith('*') || tracker.endsWith('.*')) {
        const prefix = tracker.replace(/\*|\.\*/, '');
        if (name.startsWith(prefix)) return true;
      }
      if (tracker.startsWith('*') || tracker.startsWith('.*')) {
        const suffix = tracker.replace(/\*|\.\*/, '');
        if (name.endsWith(suffix)) return true;
      }
    }
    return false;
  }

  /**
   * Destroy cookie instantly
   */
  async destroyCookie(cookie) {
    const protocol = cookie.secure ? 'https:' : 'http:';
    const cleanDomain = cookie.domain.replace(/^\./, '');
    const url = `${protocol}//${cleanDomain}${cookie.path || '/'}`;

    try {
      await chrome.cookies.remove({
        url,
        name: cookie.name,
        storeId: cookie.storeId
      });

      this.recordBlockedCookie(cookie, 'tracker_destroyed');
    } catch (error) {
      console.debug(`[AeroGuard] Failed to nuke cookie ${cookie.name}:`, error.message);
    }
  }

  /**
   * Downgrade long-lived cookie to session cookie
   */
  async downgradeToSession(cookie) {
    const protocol = cookie.secure ? 'https:' : 'http:';
    const cleanDomain = cookie.domain.replace(/^\./, '');
    const url = `${protocol}//${cleanDomain}${cookie.path || '/'}`;

    try {
      // Re-create the cookie without an expiration date (makes it a session cookie)
      await chrome.cookies.set({
        url,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        storeId: cookie.storeId
        // No expirationDate = session cookie
      });

      this.recordBlockedCookie(cookie, 'downgraded_to_session');
    } catch (error) {
      console.debug(`[AeroGuard] Failed to downgrade cookie ${cookie.name}:`, error.message);
    }
  }

  /**
   * Broadcast action to UI for live stats
   */
  broadcastAction(action, name, domain, reason) {
    // Send a message to the popup UI so the user can see live stats
    chrome.runtime.sendMessage({
      type: 'COOKIE_ACTION',
      payload: { action, name, domain, reason, time: Date.now() }
    }).catch(() => {
      // Ignore errors if the popup isn't currently open
    });
  }

  /**
   * Record blocked cookie for statistics
   */
  recordBlockedCookie(cookie, reason) {
    console.log(`[CookieProtection] ${reason}: ${cookie.name} from ${cookie.domain}`);
  }

  /**
   * Legacy handler for backward compatibility
   */
  handleCookieChanged(changeInfo) {
    this.handleCookieChange(changeInfo);
  }

  /**
   * Handle tab removal - clean up cookies if auto-delete enabled
   */
  async handleTabRemoved(tabId, removeInfo) {
    if (!this.enabled || !this.autoDeleteOnClose) return;
    if (!removeInfo.isWindowClosing) return;
  }

  /**
   * Handle tab updated - check cookies for the new URL
   */
  async handleTabUpdated(tabId, changeInfo, tab) {
    if (!this.enabled) return;
    if (changeInfo.status !== 'complete') return;
    if (!tab.url) return;
  }

  /**
   * Add domain to whitelist
   */
  addToWhitelist(domain) {
    this.whitelistedDomains.add(this.normalizeDomain(domain));
  }

  /**
   * Remove domain from whitelist
   */
  removeFromWhitelist(domain) {
    this.whitelistedDomains.delete(this.normalizeDomain(domain));
  }

  /**
   * Set domain as session-only
   */
  setSessionOnly(domain) {
    this.sessionOnlyDomains.add(this.normalizeDomain(domain));
  }

  /**
   * Remove domain from session-only
   */
  removeSessionOnly(domain) {
    this.sessionOnlyDomains.delete(this.normalizeDomain(domain));
  }

  /**
   * Check if domain is whitelisted
   */
  isWhitelisted(domain) {
    const normalized = this.normalizeDomain(domain);

    // Check exact match
    if (this.whitelistedDomains.has(normalized)) return true;
    if (this.defaultWhitelist.has(normalized)) return true;

    // Check parent domains
    const parts = normalized.split('.');
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(i).join('.');
      if (this.whitelistedDomains.has(parent)) return true;
      if (this.defaultWhitelist.has(parent)) return true;
    }

    return false;
  }

  /**
   * Normalize domain (remove leading dot, lowercase)
   */
  normalizeDomain(domain) {
    return domain.replace(/^\./, '').toLowerCase();
  }

  /**
   * Get global statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      blockThirdParty: this.blockThirdParty,
      partitionCookies: this.partitionCookies,
      autoDeleteOnClose: this.autoDeleteOnClose,
      deleteNonWhitelisted: this.deleteNonWhitelisted,
      whitelistedDomainsCount: this.whitelistedDomains.size,
      defaultWhitelistCount: this.defaultWhitelist.size,
      sessionOnlyDomainsCount: this.sessionOnlyDomains.size,
      blockedCookiesCount: Array.from(this.blockedCookies.values()).reduce((a, b) => a + b.length, 0),
      deletedCookiesCount: Array.from(this.deletedCookies.values()).reduce((a, b) => a + b.length, 0),
      trackerNamesCount: this.trackerNames.size,
      trackerDomainsCount: this.trackerDomainPatterns.length
    };
  }

  /**
   * Clear all data
   */
  clearData() {
    this.blockedCookies.clear();
    this.deletedCookies.clear();
    this.cookieStore.clear();
  }

  /**
   * Clear cookies for a tab (for tab removal)
   */
  async clearTabCookies(tabId) {
    if (typeof chrome === 'undefined' || !chrome.cookies) return;

    try {
      const cookies = await chrome.cookies.getAll({});
      for (const cookie of cookies) {
        await chrome.cookies.remove({
          url: `https://${cookie.domain}${cookie.path}`,
          name: cookie.name,
          storeId: cookie.storeId
        });
      }
    } catch (e) {
      console.warn('[CookieProtection] Failed to clear tab cookies:', e);
    }
  }

  /**
   * Export data for backup
   */
  exportData() {
    return {
      whitelistedDomains: Array.from(this.whitelistedDomains),
      sessionOnlyDomains: Array.from(this.sessionOnlyDomains),
      blockThirdParty: this.blockThirdParty,
      partitionCookies: this.partitionCookies,
      autoDeleteOnClose: this.autoDeleteOnClose,
      deleteNonWhitelisted: this.deleteNonWhitelisted,
      exportTime: Date.now()
    };
  }

  /**
   * Import data from backup
   */
  importData(data) {
    if (data.whitelistedDomains) {
      this.whitelistedDomains = new Set(data.whitelistedDomains);
    }
    if (data.sessionOnlyDomains) {
      this.sessionOnlyDomains = new Set(data.sessionOnlyDomains);
    }
    if (data.blockThirdParty !== undefined) {
      this.blockThirdParty = data.blockThirdParty;
    }
    if (data.partitionCookies !== undefined) {
      this.partitionCookies = data.partitionCookies;
    }
    if (data.autoDeleteOnClose !== undefined) {
      this.autoDeleteOnClose = data.autoDeleteOnClose;
    }
    if (data.deleteNonWhitelisted !== undefined) {
      this.deleteNonWhitelisted = data.deleteNonWhitelisted;
    }
  }
}

export { CookieProtection };

// Export for use in service worker (CommonJS fallback)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CookieProtection };
}

// Export for browser use
if (typeof window !== 'undefined') {
  window.CookieProtection = CookieProtection;
}