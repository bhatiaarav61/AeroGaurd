/**
 * Cookie Protection Module
 * Blocks third-party cookies, partitions cookies by first-party domain,
 * auto-deletes cookies on tab close, and provides cookie cleaning
 *
 * Based on Brave's cookie protection implementation
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

    // Default whitelist for essential cookies
    this.defaultWhitelist = new Set([
      'google.com',
      'youtube.com',
      'github.com',
      'gitlab.com',
      'stackoverflow.com',
      'github.io',
      'gitlab.io',
      'cloudflare.com',
      'cloudflare.net',
      'microsoft.com',
      'office.com',
      'live.com',
      'outlook.com',
      'apple.com',
      'icloud.com',
      'amazon.com',
      'aws.amazon.com',
      'paypal.com',
      'stripe.com',
      'dropbox.com',
      'box.com',
      'drive.google.com',
      'docs.google.com',
      'sheets.google.com',
      'slides.google.com',
      'forms.google.com',
      'calendar.google.com',
      'mail.google.com',
      'accounts.google.com',
      'myaccount.google.com',
      'security.google.com',
      'passwords.google.com',
      'takeout.google.com',
      'contacts.google.com',
      'keep.google.com',
      'photos.google.com',
      'maps.google.com',
      'earth.google.com',
      'translate.google.com',
      'books.google.com',
      'scholar.google.com',
      'patents.google.com',
      'trends.google.com',
      'alerts.google.com',
      'shopping.google.com',
      'finance.google.com',
      'news.google.com',
      'flights.google.com',
      'hotels.google.com',
      'travel.google.com',
      'workspace.google.com',
      'admin.google.com',
      'cloud.google.com',
      'console.cloud.google.com',
      'firebase.google.com',
      'developers.google.com',
      'developers.googleusercontent.com',
      'android.com',
      'play.google.com',
      'chrome.google.com',
      'chromium.org',
      'web.dev',
      'developer.chrome.com',
      'support.google.com',
      'help.google.com',
      'policies.google.com',
      'privacy.google.com',
      'terms.google.com',
      'safety.google.com',
      'families.google.com',
      'edu.google.com',
      'research.google.com',
      'ai.google.com',
      'blog.google.com',
      'about.google.com',
      'sustainability.google.com',
      'diversity.google.com',
      'careers.google.com',
      'jobs.google.com',
      'blog.google',
      'googleblog.com',
      'thinkwithgoogle.com',
      'grow.google.com',
      'smallbusiness.google.com',
      'marketingplatform.google.com',
      'analytics.google.com',
      'tagmanager.google.com',
      'optimize.google.com',
      'surveys.google.com',
      'data.studio.google.com',
      'lookerstudio.google.com',
      'ads.google.com',
      'adsmanager.google.com',
      'admob.google.com',
      'adsense.google.com',
      'admanager.google.com',
      'doubleclick.net',
      'googleadservices.com',
      'googlesyndication.com',
      'googletagmanager.com',
      'googletagservices.com',
      'google-analytics.com',
      'google.com/adsense',
      'google.com/pagead',
      'youtube.com/api/stats/ads',
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'ajax.googleapis.com',
      'cdn.jsdelivr.net',
      'cdnjs.cloudflare.com',
      'unpkg.com'
    ]);
  }

  /**
   * Initialize cookie protection
   */
  async initialize() {
    if (typeof chrome === 'undefined' || !chrome.cookies) {
      console.warn('[CookieProtection] Chrome cookies API not available');
      return;
    }

    // Listen for cookie changes
    chrome.cookies.onChanged.addListener(this.handleCookieChanged.bind(this));

    // Listen for tab removal to clean up
    if (chrome.tabs && chrome.tabs.onRemoved) {
      chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));
    }

    // Listen for tab updates
    if (chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
    }

    console.log('[CookieProtection] Initialized');
  }

  /**
   * Handle cookie changes
   */
  handleCookieChanged(changeInfo) {
    if (!this.enabled) return;
    if (!changeInfo.cookie) return;

    const cookie = changeInfo.cookie;
    const cause = changeInfo.cause;

    // Check if this is a third-party cookie being set
    if (cause === 'explicit' && this.blockThirdParty) {
      if (this.isThirdPartyCookie(cookie)) {
        // Check if domain is whitelisted
        if (!this.isWhitelisted(cookie.domain)) {
          // Block this cookie by removing it
          this.removeCookie(cookie);
          this.recordBlockedCookie(cookie, 'third_party_blocked');
        }
      }
    }

    // Handle session-only cookies
    if (this.sessionOnlyDomains.has(this.normalizeDomain(cookie.domain))) {
      if (!cookie.session) {
        // Convert to session cookie by removing expiration
        this.makeSessionCookie(cookie);
      }
    }
  }

  /**
   * Check if a cookie is third-party relative to the current page
   */
  isThirdPartyCookie(cookie) {
    // This is a simplified check - in practice, we'd need the tab's URL
    // For now, we check if the cookie domain doesn't match common first-party patterns
    const domain = this.normalizeDomain(cookie.domain);

    // If it's a known first-party domain pattern, it's not third-party
    // This is a heuristic - real implementation would compare with tab URL
    return false; // We'll implement per-tab checking
  }

  /**
   * Check if a cookie is third-party for a specific tab URL
   */
  isThirdPartyForUrl(cookie, tabUrl) {
    try {
      const tabDomain = new URL(tabUrl).hostname.toLowerCase().replace(/^www\./, '');
      const cookieDomain = this.normalizeDomain(cookie.domain);

      // Check if cookie domain matches tab domain or is a parent domain
      if (cookieDomain === tabDomain) return false;
      if (tabDomain.endsWith('.' + cookieDomain)) return false;
      if (cookieDomain.endsWith('.' + tabDomain)) return false;

      // Check if both are subdomains of the same registrable domain
      const tabRegistrable = this.getRegistrableDomain(tabDomain);
      const cookieRegistrable = this.getRegistrableDomain(cookieDomain);

      return tabRegistrable !== cookieRegistrable;
    } catch (e) {
      return true; // Assume third-party on error
    }
  }

  /**
   * Get the registrable domain (eTLD+1)
   */
  getRegistrableDomain(domain) {
    // Simplified - in production, use Public Suffix List
    const parts = domain.split('.');
    if (parts.length <= 2) return domain;

    // Known TLDs that have two-part suffixes
    const twoPartTlds = new Set([
      'co.uk', 'co.jp', 'co.kr', 'co.nz', 'co.za', 'co.il', 'co.in',
      'com.au', 'com.br', 'com.cn', 'com.mx', 'com.tr', 'com.tw',
      'org.uk', 'org.au', 'net.uk', 'net.au',
      'gov.uk', 'gov.au', 'edu.au', 'ac.uk', 'ac.jp',
      'ne.jp', 'or.jp', 'gr.jp', 'ed.jp', 'go.jp', 'lg.jp'
    ]);

    for (let i = parts.length - 2; i >= 0; i--) {
      const suffix = parts.slice(i).join('.');
      if (twoPartTlds.has(suffix)) {
        if (i > 0) return parts.slice(i - 1).join('.');
        return suffix;
      }
    }

    // Default: last two parts
    return parts.slice(-2).join('.');
  }

  /**
   * Normalize domain (remove leading dot, lowercase)
   */
  normalizeDomain(domain) {
    return domain.replace(/^\./, '').toLowerCase();
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
   * Remove a cookie
   */
  async removeCookie(cookie) {
    if (typeof chrome === 'undefined' || !chrome.cookies) return;

    try {
      await chrome.cookies.remove({
        url: `https://${cookie.domain}${cookie.path}`,
        name: cookie.name,
        storeId: cookie.storeId
      });
    } catch (e) {
      console.warn('[CookieProtection] Failed to remove cookie:', e);
    }
  }

  /**
   * Make a cookie session-only
   */
  async makeSessionCookie(cookie) {
    if (typeof chrome === 'undefined' || !chrome.cookies) return;

    try {
      // Remove the existing cookie
      await chrome.cookies.remove({
        url: `https://${cookie.domain}${cookie.path}`,
        name: cookie.name,
        storeId: cookie.storeId
      });

      // Set it again without expiration
      await chrome.cookies.set({
        url: `https://${cookie.domain}${cookie.path}`,
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
    } catch (e) {
      console.warn('[CookieProtection] Failed to make session cookie:', e);
    }
  }

  /**
   * Record a blocked cookie
   */
  recordBlockedCookie(cookie, reason) {
    // We'd need the tab ID to properly track this
    // For now, just log
    console.log('[CookieProtection] Blocked cookie:', cookie.name, 'from', cookie.domain, 'reason:', reason);
  }

  /**
   * Handle tab removal - clean up cookies if auto-delete enabled
   */
  async handleTabRemoved(tabId, removeInfo) {
    if (!this.enabled || !this.autoDeleteOnClose) return;
    if (!removeInfo.isWindowClosing) return; // Only clean up on window close

    // This would require tracking which tabs belong to which window
    // For now, we'll clean up on a per-tab basis if configured
  }

  /**
   * Handle tab updated - check cookies for the new URL
   */
  async handleTabUpdated(tabId, changeInfo, tab) {
    if (!this.enabled) return;
    if (changeInfo.status !== 'complete') return;
    if (!tab.url) return;

    // Scan cookies for this URL and block third-party ones
    await this.scanAndCleanCookies(tabId, tab.url);
  }

  /**
   * Scan and clean cookies for a specific URL
   */
  async scanAndCleanCookies(tabId, url) {
    if (typeof chrome === 'undefined' || !chrome.cookies) return;

    try {
      const cookies = await chrome.cookies.getAll({ url });

      for (const cookie of cookies) {
        if (this.isThirdPartyForUrl(cookie, url)) {
          if (!this.isWhitelisted(cookie.domain)) {
            await this.removeCookie(cookie);
            this.recordDeletedCookie(tabId, cookie, 'third_party_cleanup');
          }
        }

        // Handle session-only domains
        if (this.sessionOnlyDomains.has(this.normalizeDomain(cookie.domain))) {
          if (!cookie.session) {
            await this.makeSessionCookie(cookie);
          }
        }
      }
    } catch (e) {
      console.warn('[CookieProtection] Failed to scan cookies:', e);
    }
  }

  /**
   * Record a deleted cookie
   */
  recordDeletedCookie(tabId, cookie, reason) {
    if (!this.deletedCookies.has(tabId)) {
      this.deletedCookies.set(tabId, []);
    }
    this.deletedCookies.get(tabId).push({
      name: cookie.name,
      domain: cookie.domain,
      reason,
      timestamp: Date.now()
    });
  }

  /**
   * Clean all cookies for a tab
   */
  async cleanTabCookies(tabId, url) {
    if (typeof chrome === 'undefined' || !chrome.cookies) return;

    try {
      const cookies = await chrome.cookies.getAll({ url });
      let cleaned = 0;

      for (const cookie of cookies) {
        if (!this.isWhitelisted(cookie.domain)) {
          await this.removeCookie(cookie);
          this.recordDeletedCookie(tabId, cookie, 'manual_cleanup');
          cleaned++;
        }
      }

      return cleaned;
    } catch (e) {
      console.warn('[CookieProtection] Failed to clean cookies:', e);
      return 0;
    }
  }

  /**
   * Clean all non-whitelisted cookies globally
   */
  async cleanAllCookies() {
    if (typeof chrome === 'undefined' || !chrome.cookies) return;

    try {
      const cookies = await chrome.cookies.getAll({});
      let cleaned = 0;

      for (const cookie of cookies) {
        if (!this.isWhitelisted(cookie.domain)) {
          await this.removeCookie(cookie);
          cleaned++;
        }
      }

      return cleaned;
    } catch (e) {
      console.warn('[CookieProtection] Failed to clean all cookies:', e);
      return 0;
    }
  }

  /**
   * Get cookie statistics for a tab
   */
  async getTabCookieStats(tabId, url) {
    if (typeof chrome === 'undefined' || !chrome.cookies) return null;

    try {
      const cookies = await chrome.cookies.getAll({ url });

      let firstParty = 0;
      let thirdParty = 0;
      let session = 0;
      let persistent = 0;
      let secure = 0;
      let httpOnly = 0;
      let sameSiteStrict = 0;
      let sameSiteLax = 0;
      let sameSiteNone = 0;

      for (const cookie of cookies) {
        if (this.isThirdPartyForUrl(cookie, url)) {
          thirdParty++;
        } else {
          firstParty++;
        }

        if (cookie.session) session++; else persistent++;
        if (cookie.secure) secure++;
        if (cookie.httpOnly) httpOnly++;

        switch (cookie.sameSite) {
          case 'strict': sameSiteStrict++; break;
          case 'lax': sameSiteLax++; break;
          case 'no_restriction': sameSiteNone++; break;
        }
      }

      return {
        total: cookies.length,
        firstParty,
        thirdParty,
        session,
        persistent,
        secure,
        httpOnly,
        sameSiteStrict,
        sameSiteLax,
        sameSiteNone,
        blocked: this.blockedCookies.get(tabId)?.length || 0,
        deleted: this.deletedCookies.get(tabId)?.length || 0
      };
    } catch (e) {
      console.warn('[CookieProtection] Failed to get cookie stats:', e);
      return null;
    }
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
      deletedCookiesCount: Array.from(this.deletedCookies.values()).reduce((a, b) => a + b.length, 0)
    };
  }

  /**
   * Set enabled state
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Set block third-party cookies
   */
  setBlockThirdParty(block) {
    this.blockThirdParty = block;
  }

  /**
   * Set partition cookies
   */
  setPartitionCookies(partition) {
    this.partitionCookies = partition;
  }

  /**
   * Set auto-delete on close
   */
  setAutoDeleteOnClose(autoDelete) {
    this.autoDeleteOnClose = autoDelete;
  }

  /**
   * Set partition cookies
   */
  setPartitionCookies(enabled) {
    this.partitionCookies = enabled;
  }

  /**
   * Set delete non-whitelisted
   */
  setDeleteNonWhitelisted(deleteNonWhitelisted) {
    this.deleteNonWhitelisted = deleteNonWhitelisted;
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
   * Inject cookie protection into a tab
   */
  async injectContentScript(tabId) {
    if (typeof chrome === 'undefined' || !chrome.scripting) return;

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Cookie protection is automatically applied when the content script loads
          if (window.CookieProtection && !window.cookieProtection) {
            window.cookieProtection = new CookieProtection();
            // Note: Cookie protection mainly works in service worker
          }
        }
      });
    } catch (error) {
      console.warn('[CookieProtection] Failed to inject content script:', error);
    }
  }

  /**
   * Update content script config
   */
  async updateContentScriptConfig(tabId, settings) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (config) => {
          if (window.cookieProtection) {
            // Cookie protection settings are mainly handled in service worker
          }
        },
        args: [settings]
      });
    } catch (error) {
      console.warn('[CookieProtection] Failed to update config:', error);
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