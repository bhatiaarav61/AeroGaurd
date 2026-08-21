/**
 * HTTPS Upgrade Module
 * Upgrades insecure HTTP requests to HTTPS automatically
 * Supports HSTS preload list, manual upgrades, and mixed content protection
 * Based on Brave's HTTPS Everywhere / HTTPS Upgrade implementation
 */

import { ruleUpdateQueue } from '../utils/rule-update-queue.js';

class HTTPSUpgrade {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.mode = options.mode || 'upgrade'; // 'upgrade', 'strict', 'warn'
    this.useHSTSPreload = options.useHSTSPreload ?? true;
    this.upgradeNavigations = options.upgradeNavigations ?? true;
    this.upgradeSubresources = options.upgradeSubresources ?? true;
    this.upgradeForms = options.upgradeForms ?? true;
    this.blockMixedContent = options.blockMixedContent ?? false;

    // HSTS Preload list (subset of common domains - limited to 50 to conserve quota)
    this.hstsPreload = new Set(options.hstsPreload || [
      'google.com', 'youtube.com', 'facebook.com', 'twitter.com', 'instagram.com',
      'linkedin.com', 'github.com', 'gitlab.com', 'stackoverflow.com', 'wikipedia.org',
      'reddit.com', 'amazon.com', 'microsoft.com', 'apple.com', 'cloudflare.com',
      'dropbox.com', 'slack.com', 'discord.com', 'telegram.org', 'whatsapp.com',
      'signal.org', 'protonmail.com', 'tutanota.com', 'fastmail.com', 'icloud.com',
      'office.com', 'live.com', 'outlook.com', 'onedrive.com', 'sharepoint.com',
      'teams.microsoft.com', 'zoom.us', 'webex.com', 'gotomeeting.com', 'salesforce.com',
      'hubspot.com', 'zendesk.com', 'atlassian.com', 'jira.com', 'confluence.com',
      'bitbucket.org', 'trello.com', 'asana.com', 'notion.so', 'airtable.com',
      'figma.com', 'sketch.com', 'adobe.com', 'creativecloud.adobe.com', 'behance.net',
      'dribbble.com', 'pinterest.com', 'etsy.com', 'ebay.com', 'paypal.com', 'stripe.com',
      'squareup.com', 'shopify.com', 'bigcommerce.com', 'woocommerce.com', 'wordpress.com',
      'wp.com', 'medium.com', 'substack.com', 'ghost.org', 'hashnode.com', 'dev.to',
      'freecodecamp.org', 'codecademy.com', 'udemy.com', 'coursera.org', 'edx.org',
      'khanacademy.org', 'pluralsight.com', 'lynda.com', 'skillshare.com', 'masterclass.com',
      'datacamp.com', 'codepen.io', 'jsfiddle.net', 'codesandbox.io', 'replit.com',
      'glitch.com', 'stackblitz.com', 'codespaces.github.com', 'gitpod.io', 'vscode.dev',
      'github.dev', 'raw.githubusercontent.com', 'gist.githubusercontent.com',
      'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'fonts.googleapis.com',
      'fonts.gstatic.com', 'ajax.googleapis.com', 'maps.googleapis.com', 'maps.gstatic.com',
      'www.google-analytics.com', 'ssl.google-analytics.com', 'stats.g.doubleclick.net',
      'googleads.g.doubleclick.net', 'pagead2.googlesyndication.com', 'tpc.googlesyndication.com',
      'securepubads.g.doubleclick.net', 'adservice.google.com', 'googleadservices.com',
      'googletagservices.com', 'googletagmanager.com', 'google-analytics.com',
      'ytimg.com', 'ggpht.com', 'googleusercontent.com', 'gstatic.com', 'gvt1.com', 'gvt2.com',
      'googleapis.com', 'googleusercontent.com', 'android.com', 'play.google.com',
      'chrome.google.com', 'chromium.org', 'web.dev', 'developer.chrome.com',
      'firebase.google.com', 'cloud.google.com', 'console.cloud.google.com',
      'cloudfunctions.net', 'run.app', 'firebaseapp.com', 'web.app', 'vercel.app',
      'netlify.app', 'surge.sh', 'now.sh', 'render.com', 'railway.app', 'fly.io',
      'herokuapp.com', 'aws.amazon.com', 'amazonaws.com', 'cloudfront.net',
      's3.amazonaws.com', 's3-website-us-east-1.amazonaws.com', 'digitaloceanspaces.com',
      'linodeobjects.com', 'vultr.com', 'ovh.com', 'scaleway.com', 'hetzner.com',
      'contabo.com', 'racknerd.com', 'buyvm.net', 'spartanhost.net', 'rackspace.com',
      'godaddy.com', 'namecheap.com', 'cloudflare.com', 'cloudflare.net',
      'cloudflare-dns.com', '1.1.1.1', '1.0.0.1', 'dns.google', '8.8.8.8', '8.8.4.4',
      'doh.opendns.com', '208.67.222.222', '208.67.220.220', 'dns.quad9.net',
      '9.9.9.9', '149.112.112.112', 'dns.nextdns.io', 'dns.adguard.com',
      '94.140.14.14', '94.140.15.15'
    ]);

    // Manual upgrade list (domains known to support HTTPS)
    this.manualUpgrade = new Set(options.manualUpgrade || []);

    // Failed upgrades cache (to avoid retry loops)
    this.failedUpgrades = new Map(); // domain -> { count, lastAttempt }

    this.isUpdating = false; // Lock to prevent concurrent updates

    // Statistics
    this.stats = {
      upgradesAttempted: 0,
      upgradesSuccessful: 0,
      upgradesFailed: 0,
      mixedContentBlocked: 0,
      warningsShown: 0
    };
  }

  /**
   * Enable or disable HTTPS upgrade
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.refreshDNRRules();
  }

  /**
   * Set whether to upgrade navigations (main frame requests)
   */
  setUpgradeNavigations(enabled) {
    this.upgradeNavigations = enabled;
    this.refreshDNRRules();
  }

  /**
   * Set whether to upgrade subresources
   */
  setUpgradeSubresources(enabled) {
    this.upgradeSubresources = enabled;
    this.refreshDNRRules();
  }

  /**
   * Set whether to block mixed content
   */
  setBlockMixedContent(enabled) {
    this.blockMixedContent = enabled;
    this.refreshDNRRules();
  }

  /**
   * Refresh DNR rules after settings change
   */
  async refreshDNRRules() {
    if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest) {
      await this.setupDNRRules();
    }
  }

  /**
   * Get current settings
   */
  getSettings() {
    return {
      enabled: this.enabled,
      mode: this.mode,
      upgradeNavigations: this.upgradeNavigations,
      upgradeSubresources: this.upgradeSubresources,
      blockMixedContent: this.blockMixedContent,
      useHSTSPreload: this.useHSTSPreload
    };
  }

  /**
   * Initialize HTTPS upgrade
   */
  async initialize() {
    if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest) {
      // Set up DNR rules for automatic HTTPS upgrade
      await this.setupDNRRules();
    }

    if (typeof chrome !== 'undefined' && chrome.webRequest) {
      // Fallback for MV2 or if DNR not available
      this.setupWebRequestListener();
    }

    // Listen for navigation events
    if (typeof chrome !== 'undefined' && chrome.webNavigation) {
      chrome.webNavigation.onBeforeNavigate.addListener(this.handleNavigation.bind(this));
    }

    console.log('[HTTPSUpgrade] Initialized with mode:', this.mode);
  }

  /**
   * Set up DNR rules for HTTPS upgrade safely
   */
  async setupDNRRules() {
    if (this.isUpdating) return;
    this.isUpdating = true;

    try {
      const rules = [];

      if (this.enabled) {
        // HSTS domains (limit to 50 to conserve quota)
        const hstsDomains = Array.from(this.hstsPreload).slice(0, 50);
        for (const domain of hstsDomains) {
          rules.push(this.createRedirectRule(domain, false));
          rules.push(this.createRedirectRule(`www.${domain}`, true));
        }

        // Add manual upgrade domains (limited)
        const manualDomains = Array.from(this.manualUpgrade).slice(0, 20);
        for (const domain of manualDomains) {
          rules.push(this.createRedirectRule(domain, false));
        }

        // Generic upgrade rules
        if (this.upgradeSubresources) {
          rules.push(this.createGenericSubresourceRule());
        }
        if (this.upgradeNavigations) {
          rules.push(this.createNavigationRule());
        }
        if (this.blockMixedContent) {
          rules.push(this.createMixedContentBlockRule());
        }
      }

      // Assign unique IDs to rules
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const usedIds = new Set(existingRules.map(r => r.id));

      let nextId = 9000000;
      for (const rule of rules) {
        while (usedIds.has(nextId)) nextId++;
        rule.id = nextId++;
        usedIds.add(rule.id);
      }

      // ATOMIC UPDATE: Remove old + add new in single call
      const existingRulesForRemove = await chrome.declarativeNetRequest.getDynamicRules();
      const existingIds = existingRulesForRemove
        .filter(r => r.id >= 9000000 && r.id < 10000000)
        .map(r => r.id);

      await this.atomicUpdate({
        removeRuleIds: existingIds,
        addRules: rules
      });

      console.log(`[HTTPSUpgrade] Successfully updated ${rules.length} DNR rules.`);
    } catch (error) {
      console.error('[HTTPSUpgrade] Failed to set up DNR rules:', error);
    } finally {
      this.isUpdating = false;
    }
  }

  async atomicUpdate({ removeRuleIds = [], addRules = [] }) {
    return ruleUpdateQueue.atomicUpdate(addRules, removeRuleIds);
  }

  createRedirectRule(domain, isWww) {
    const domainFilter = isWww ? `www.${domain}` : domain;
    return {
      id: 0, // Will be assigned dynamically
      priority: 1,
      action: { type: 'redirect', redirect: { transform: { scheme: 'https' } } },
      condition: {
        urlFilter: `http://${isWww ? 'www.' : ''}${domain}/*`,
        resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'stylesheet', 'font', 'object', 'media', 'websocket', 'other']
      }
    };
  }

  createGenericSubresourceRule() {
    return {
      id: 0,
      priority: 100,
      action: { type: 'redirect', redirect: { transform: { scheme: 'https' } } },
      condition: {
        urlFilter: 'http://*',
        resourceTypes: ['script', 'xmlhttprequest', 'image', 'stylesheet', 'font', 'object', 'media', 'websocket', 'other'],
        excludedDomains: Array.from(this.failedUpgrades.keys())
      }
    };
  }

  createNavigationRule() {
    return {
      id: 0,
      priority: 100,
      action: { type: 'redirect', redirect: { transform: { scheme: 'https' } } },
      condition: {
        urlFilter: 'http://*',
        resourceTypes: ['main_frame', 'sub_frame'],
        excludedDomains: Array.from(this.failedUpgrades.keys())
      }
    };
  }

  createMixedContentBlockRule() {
    return {
      id: 0,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: 'http://*',
        resourceTypes: ['script', 'xmlhttprequest', 'image', 'stylesheet', 'font', 'object', 'media', 'websocket', 'other'],
        initiatorDomains: Array.from(this.hstsPreload).slice(0, 50)
      }
    };
  }

  /**
   * Handle navigation for HTTPS upgrade
   */
  handleNavigation(details) {
    if (!this.enabled || !this.upgradeNavigations) return null;
    if (details.frameId !== 0) return null; // Only main frame

    const url = details.url;
    if (!url.startsWith('http://')) return null;

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace(/^www\./, '');

      // Check if domain is in HSTS preload list
      if (this.hstsPreload.has(hostname)) {
        const httpsUrl = url.replace('http://', 'https://');
        return { upgradeUrl: httpsUrl };
      }
    } catch (e) {
      // Invalid URL
    }

    return null;
  }

  /**
   * Set up webRequest listener as fallback
   */
  setupWebRequestListener() {
    if (typeof chrome === 'undefined' || !chrome.webRequest) return;

    chrome.webRequest.onBeforeRequest.addListener(
      (details) => {
        if (!this.enabled || !this.upgradeNavigations) return;
        if (details.type !== 'main_frame') return;

        const url = details.url;
        if (!url.startsWith('http://')) return;

        try {
          const urlObj = new URL(url);
          const hostname = urlObj.hostname.replace(/^www\./, '');

          if (this.hstsPreload.has(hostname)) {
            const httpsUrl = url.replace('http://', 'https://');
            return { redirectUrl: httpsUrl };
          }
        } catch (e) {
          // Invalid URL
        }
      },
      { urls: ['http://*/*'] },
      ['blocking']
    );
  }

  /**
   * Handle web request for upgrade
   */
  handleWebRequest(details) {
    // Handled by webRequest listener
  }

  /**
   * Check if domain should be upgraded
   */
  shouldUpgrade(url) {
    if (!this.enabled) return false;
    if (!url.startsWith('http://')) return false;

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace(/^www\./, '');
      return this.hstsPreload.has(hostname) || this.manualUpgrade.has(hostname);
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if domain has failed recently
   */
  hasFailedRecently(domain) {
    const failed = this.failedUpgrades.get(domain);
    if (!failed) return false;

    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    if (now - failed.lastAttempt > oneHour) {
      this.failedUpgrades.delete(domain);
      return false;
    }

    return failed.count >= 3;
  }

  /**
   * Record failed upgrade
   */
  recordFailure(domain) {
    const failed = this.failedUpgrades.get(domain) || { count: 0, lastAttempt: 0 };
    failed.count++;
    failed.lastAttempt = Date.now();
    this.failedUpgrades.set(domain, failed);
    this.stats.upgradesFailed++;
  }

  /**
   * Record successful upgrade
   */
  recordSuccess(domain) {
    this.failedUpgrades.delete(domain);
    this.stats.upgradesSuccessful++;
  }

  /**
   * Show warning for failed upgrade
   */
  async showWarning(tabId, url, error) {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'HTTPS_UPGRADE_WARNING',
          url,
          error: error.message
        });
      } catch (e) {
        // Content script not ready
      }
    }
  }

  /**
   * Add domain to HSTS preload list
   */
  addToHSTSPreload(domain) {
    this.hstsPreload.add(domain);
    this.refreshDNRRules();
  }

  /**
   * Add domain to manual upgrade list
   */
  addToManualUpgrade(domain) {
    this.manualUpgrade.add(domain);
    this.refreshDNRRules();
  }

  /**
   * Remove domain from upgrade lists
   */
  removeFromUpgradeLists(domain) {
    this.hstsPreload.delete(domain);
    this.manualUpgrade.delete(domain);
    this.refreshDNRRules();
  }

  /**
   * Clear DNR rules
   */
  async clearDNRRules() {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existingRules
      .filter(r => r.id >= 9000000 && r.id < 10000000)
      .map(r => r.id);

    if (existingIds.length > 0) {
      await this.atomicUpdate({ removeRuleIds: existingIds, addRules: [] });
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Get upgraded requests
   */
  getUpgradedRequests() {
    return Array.from(this.failedUpgrades.entries()).map(([domain, data]) => ({
      domain,
      ...data
    }));
  }

  /**
   * Get failed upgrades
   */
  getFailedUpgrades() {
    return Array.from(this.failedUpgrades.entries()).map(([domain, data]) => ({
      domain,
      ...data
    }));
  }

  /**
   * Update content script config
   */
  async updateContentScriptConfig(tabId, config) {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'HTTPS_UPGRADE_CONFIG',
          config
        });
      } catch (e) {
        // Content script not ready
      }
    }
  }
}

export { HTTPSUpgrade };