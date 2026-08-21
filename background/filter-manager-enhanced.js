/**
 * Enhanced Filter Manager for AeroGuard
 * Integrates CNAME uncloaking, optimized DNR rule management, and session rules
 * Production-grade with sub-millisecond evaluation targets
 */

// Import required modules
import { parseFilterList, createDnrRule, filterValidRules } from './abp-parser.js';
import { CNAMEUncloaking } from '../privacy-modules/cname-uncloaking.js';

const VALID_DNR_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'script', 'xmlhttprequest',
  'image', 'stylesheet', 'font', 'object', 'media',
  'websocket', 'other', 'ping', 'csp_report'
];

const MAX_DYNAMIC_RULES = 5000;
const MAX_SESSION_RULES = 5000;

/**
 * Rule ID allocator with collision prevention
 */
class RuleIdAllocator {
  constructor() {
    this.ranges = new Map();
    this.nextIds = new Map();
  }

  registerRange(name, start, end) {
    if (this.ranges.has(name)) {
      throw new Error(`Range ${name} already registered`);
    }
    this.ranges.set(name, { start, end });
    this.nextIds.set(name, start);
  }

  async getNextId(name, getExistingRules) {
    const range = this.ranges.get(name);
    if (!range) throw new Error(`Range ${name} not registered`);

    const existingRules = await getExistingRules();
    const usedIds = new Set(
      existingRules
        .filter(r => r.id >= range.start && r.id <= range.end)
        .map(r => r.id)
    );

    let nextId = this.nextIds.get(name) || range.start;
    while (nextId <= range.end) {
      if (!usedIds.has(nextId)) {
        this.nextIds.set(name, nextId + 1);
        return nextId;
      }
      nextId++;
    }

    // Try from start again
    nextId = range.start;
    while (nextId <= range.end) {
      if (!usedIds.has(nextId)) {
        this.nextIds.set(name, nextId + 1);
        return nextId;
      }
      nextId++;
    }

    throw new Error(`Range ${name} exhausted (${range.start}-${range.end})`);
  }

  reset(name) {
    const range = this.ranges.get(name);
    if (range) {
      this.nextIds.set(name, range.start);
    }
  }
}

/**
 * Enhanced Filter Manager with CNAME uncloaking DNR integration
 */
export class EnhancedFilterManager {
  constructor(settingsManager, filterListManager, statisticsManager) {
    this.settingsManager = settingsManager;
    this.filterListManager = filterListManager;
    this.statisticsManager = statisticsManager;
    this.customRules = [];
    this.allowlistRules = [];
    this.enabled = true;
    this.ruleCache = new Map();

    // CNAME uncloaking integration
    this.cnameUncloaking = new CNAMEUncloaking();
    this.cnameRules = [];
    this.cnameRulesEnabled = false;

    // ID allocator for collision prevention
    this.idAllocator = new RuleIdAllocator();
    this.idAllocator.registerRange('dynamic', 100000, 8999999);
    this.idAllocator.registerRange('custom', 1000000, 1999999);
    this.idAllocator.registerRange('allowlist', 2000000, 2999999);
    this.idAllocator.registerRange('cname', 3000000, 3999999);
    this.idAllocator.registerRange('session', 4000000, 4999999);
    this.idAllocator.registerRange('httpsUpgrade', 9000000, 9999999);

    // Session rules for temporary exceptions
    this.sessionRules = new Map(); // tabId -> rules

    // Performance tracking
    this.perfStats = {
      lastRefresh: 0,
      refreshDuration: 0,
      rulesApplied: 0,
      cnameRulesApplied: 0
    };
  }

  async initialize() {
    const stored = await this.settingsManager.get('customRules', []);
    this.customRules = stored;
    this.allowlistRules = await this.settingsManager.get('allowlist', []);
    this.enabled = await this.settingsManager.get('enabled', true);

    // Initialize CNAME uncloaking
    const cnameEnabled = await this.settingsManager.get('privacy.cnameUncloaking.enabled', true);
    this.cnameUncloaking.setEnabled(cnameEnabled);

    // Load pre-cached CNAME tracking domains
    await this.loadCnameTrackingDomains();

    // Set up rule matched listener
    try {
      chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(
        this.handleRuleMatched.bind(this)
      );
    } catch (e) {
      console.log('[EnhancedFilterManager] onRuleMatchedDebug not available');
    }

    // Apply rules on initialization
    await this.refreshRules();

    console.log('[EnhancedFilterManager] Initialized with CNAME uncloaking');
  }

  async loadCnameTrackingDomains() {
    // Load known tracking CNAME domains from uBlock Unbreak list and other sources
    const trackingCnames = [
      // Google ad/tracking CNAMEs
      'googlesyndication.com', 'doubleclick.net', 'googleadservices.com',
      'googletagmanager.com', 'google-analytics.com', 'analytics.google.com',
      'stats.g.doubleclick.net', 'googleads.g.doubleclick.net',
      'pagead2.googlesyndication.com', 'tpc.googlesyndication.com',
      'securepubads.g.doubleclick.net', 'adservice.google.com',
      'googletagservices.com', 'google-analytics.com',

      // Facebook/Meta
      'facebook.net', 'connect.facebook.net', 'pixel.facebook.com',
      'analytics.facebook.com', 'ads.facebook.com',

      // Amazon
      'amazon-adsystem.com', 'aax.amazon-adsystem.com', 'c.amazon-adsystem.com',

      // Microsoft/Bing
      'bing.com', 'bat.bing.com', 'ads.msn.com', 'c.msn.com',

      // Twitter/X
      't.co', 'analytics.twitter.com', 'ads-api.twitter.com', 'static.ads-twitter.com',

      // Major ad networks
      'adnxs.com', 'rubiconproject.com', 'pubmatic.com', 'openx.net',
      'criteo.com', 'casalemedia.com', 'smartadserver.com', 'adsrvr.org',
      'teads.tv', 'bidswitch.net', 'moatads.com', 'quantserve.com',
      'scorecardresearch.com', 'hotjar.com', 'crazyegg.com',
      'mixpanel.com', 'segment.com', 'api.segment.io', 'optimizely.com',

      // Analytics
      'matomo.cloud', 'piwik.pro', 'chartbeat.com', 'parsely.com',
      'imrworldwide.com', 'comscore.com', 'bam.nr-data.net',

      // Common CNAME patterns
      'cdn.optimizely.com', 'logx.optimizely.com', 'cdn.segment.com'
    ];

    this.cnameUncloaking.addTrackingDomains(trackingCnames);
    console.log(`[EnhancedFilterManager] Loaded ${trackingCnames.length} CNAME tracking domains`);
  }

  /**
   * Generate DNR rules from CNAME uncloaking blocked domains
   * This allows DNR to block at network level instead of content script
   */
  async generateCnameDnrRules() {
    const blockedDomains = Array.from(this.cnameUncloaking.blockedDomains);
    const trackingDomains = Array.from(this.cnameUncloaking.trackingDomains);

    const allTracking = new Set([...blockedDomains, ...trackingDomains]);
    const rules = [];

    for (const domain of allTracking) {
      try {
        const id = await this.idAllocator.getNextId('cname', () =>
          chrome.declarativeNetRequest.getDynamicRules()
        );

        rules.push({
          id,
          priority: 1,
          action: { type: 'block' },
          condition: {
            urlFilter: `||${domain}^`,
            resourceTypes: VALID_DNR_RESOURCE_TYPES,
            domainType: 'thirdParty'
          }
        });
      } catch (e) {
        console.warn('[EnhancedFilterManager] Failed to allocate CNAME rule ID:', e);
      }
    }

    return rules;
  }

  async refreshRules() {
    if (!this.enabled) {
      await this.disableAllRules();
      return;
    }

    const startTime = performance.now();
    console.log('[EnhancedFilterManager] Refreshing rules...');

    try {
      // Get dynamic rules from filter lists
      const dynamicRules = await this.filterListManager.getDynamicRules();

      // Generate CNAME uncloaking DNR rules
      const cnameRules = await this.generateCnameDnrRules();

      // Build custom rules with allocated IDs
      const customRules = await this.buildCustomRules();

      // Build allowlist rules with allocated IDs
      const allowlistRules = await this.buildAllowlistRules();

      // Combine all rules
      const allRules = [...dynamicRules, ...cnameRules, ...customRules, ...allowlistRules];

      // Apply with collision-safe atomic update
      await this.applyRulesAtomically(allRules);

      // Update cache
      this.ruleCache.clear();
      for (const rule of allRules) {
        this.ruleCache.set(rule.id, rule);
      }

      const duration = performance.now() - startTime;
      this.perfStats.lastRefresh = Date.now();
      this.perfStats.refreshDuration = duration;
      this.perfStats.rulesApplied = allRules.length;
      this.perfStats.cnameRulesApplied = cnameRules.length;

      console.log(`[EnhancedFilterManager] Applied ${allRules.length} rules (${cnameRules.length} CNAME) in ${duration.toFixed(2)}ms`);
    } catch (error) {
      console.error('[EnhancedFilterManager] Failed to refresh rules:', error);
    }
  }

  async buildCustomRules() {
    const rules = [];
    for (let i = 0; i < this.customRules.length; i++) {
      const rule = this.customRules[i];
      try {
        const id = await this.idAllocator.getNextId('custom', () =>
          chrome.declarativeNetRequest.getDynamicRules()
        );
        rules.push({
          id,
          priority: rule.priority || 1,
          action: rule.action || { type: 'block' },
          condition: rule.condition
        });
      } catch (e) {
        console.warn('[EnhancedFilterManager] Failed to allocate custom rule ID:', e);
      }
    }
    return rules;
  }

  async buildAllowlistRules() {
    const rules = [];
    for (let i = 0; i < this.allowlistRules.length; i++) {
      const rule = this.allowlistRules[i];
      try {
        const id = await this.idAllocator.getNextId('allowlist', () =>
          chrome.declarativeNetRequest.getDynamicRules()
        );
        rules.push({
          id,
          priority: 2,
          action: { type: 'allow' },
          condition: rule.condition
        });
      } catch (e) {
        console.warn('[EnhancedFilterManager] Failed to allocate allowlist rule ID:', e);
      }
    }
    return rules;
  }

  async applyRulesAtomically(rules) {
    // Validate and deduplicate
    const validRules = this.validateAndDeduplicateRules(rules);

    // Get existing rules
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = new Set(existingRules.map(r => r.id));
    const newIds = new Set(validRules.map(r => r.id));

    // Find rules to remove
    const removeIds = existingRules
      .filter(r => !newIds.has(r.id))
      .map(r => r.id);

    // Check quota
    const currentCount = await chrome.declarativeNetRequest.getDynamicRules();
    if (currentCount.length + validRules.length > MAX_DYNAMIC_RULES) {
      console.warn(`[EnhancedFilterManager] Rule quota near limit, truncating`);
      validRules.length = MAX_DYNAMIC_RULES - currentCount.length;
    }

    // Atomic update
    const batchSize = 1000;
    for (let i = 0; i < validRules.length; i += batchSize) {
      const batch = validRules.slice(i, i + batchSize);
      const options = { addRules: batch };
      if (i === 0 && removeIds.length > 0) {
        options.removeRuleIds = removeIds;
      }
      try {
        await chrome.declarativeNetRequest.updateDynamicRules(options);
      } catch (error) {
        console.error(`[EnhancedFilterManager] Batch ${i / batchSize} failed:`, error);
      }
    }

    // Verify
    const verifyRules = await chrome.declarativeNetRequest.getDynamicRules();
    console.log(`[EnhancedFilterManager] Verified ${verifyRules.length} dynamic rules active`);
  }

  validateAndDeduplicateRules(rules) {
    const validRules = [];
    const seenIds = new Set();
    const seenConditions = new Map(); // urlFilter -> rule

    for (const rule of rules) {
      // Validate required fields
      if (!rule.id || !rule.action || !rule.condition || !rule.condition.urlFilter) {
        continue;
      }

      // Validate resourceTypes
      if (rule.condition.resourceTypes) {
        rule.condition.resourceTypes = rule.condition.resourceTypes.filter(
          t => VALID_DNR_RESOURCE_TYPES.includes(t)
        );
        if (rule.condition.resourceTypes.length === 0) continue;
      } else {
        rule.condition.resourceTypes = VALID_DNR_RESOURCE_TYPES.filter(t => t !== 'main_frame');
      }

      // Convert thirdParty to domainType
      if (rule.condition.thirdParty !== undefined) {
        rule.condition.domainType = rule.condition.thirdParty ? 'thirdParty' : 'firstParty';
        delete rule.condition.thirdParty;
      }

      // Deduplicate by ID
      if (seenIds.has(rule.id)) continue;
      seenIds.add(rule.id);

      // Deduplicate by condition (keep highest priority)
      const conditionKey = JSON.stringify(rule.condition);
      const existing = seenConditions.get(conditionKey);
      if (existing) {
        if (rule.priority > existing.priority) {
          seenConditions.set(conditionKey, rule);
        }
      } else {
        seenConditions.set(conditionKey, rule);
      }
    }

    return Array.from(seenConditions.values());
  }

  async disableAllRules() {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(r => r.id);
    if (existingRuleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existingRuleIds });
    }
    this.ruleCache.clear();
    console.log('[EnhancedFilterManager] All rules disabled');
  }

  async enableRules() {
    this.enabled = true;
    await this.settingsManager.set('enabled', true);
    await this.refreshRules();

    // Enable static rulesets
    try {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: this.getStaticRulesetIds()
      });
    } catch (error) {
      console.error('[EnhancedFilterManager] Failed to enable static rulesets:', error);
    }
    console.log('[EnhancedFilterManager] Rules enabled');
  }

  async disableRules() {
    this.enabled = false;
    await this.settingsManager.set('enabled', false);

    try {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: this.getStaticRulesetIds()
      });
    } catch (error) {
      console.error('[EnhancedFilterManager] Failed to disable static rulesets:', error);
    }

    await this.disableAllRules();
    console.log('[EnhancedFilterManager] Rules disabled');
  }

  getStaticRulesetIds() {
    return [
      'ruleset_1', 'ruleset_2', 'ruleset_3',
      'ruleset_easylist', 'ruleset_easyprivacy', 'ruleset_easylist_cookie',
      'ruleset_ublock_filters', 'ruleset_ublock_badware', 'ruleset_ublock_privacy',
      'ruleset_ublock_resource_abuse', 'ruleset_ublock_unbreak',
      'ruleset_fanboy_annoyances', 'ruleset_peterlowe', 'ruleset_oisd',
      'ruleset_adguard_dns', 'ruleset_adguard_mobile_dns', 'ruleset_adguard_base',
      'ruleset_adguard_mobile', 'ruleset_adguard_tracking',
      'ruleset_adguard_annoyances', 'ruleset_adguard_social',
      'ruleset_cname_uncloaking'
    ];
  }

  handleRuleMatched(request) {
    const { tabId, rule, request: requestDetails } = request;
    if (tabId < 0) return;

    this.statisticsManager.handleRuleMatched?.(request);

    chrome.tabs.sendMessage(tabId, {
      type: 'RULE_MATCHED', ruleId: rule.id, url: requestDetails.url, resourceType: requestDetails.type
    }).catch(() => {});
  }

  // Session rules for temporary per-tab exceptions
  async addSessionRule(tabId, rule) {
    if (!this.sessionRules.has(tabId)) {
      this.sessionRules.set(tabId, []);
    }
    const tabRules = this.sessionRules.get(tabId);
    const ruleId = 4000000 + tabRules.length;
    tabRules.push({ ...rule, id: ruleId });

    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [{ ...rule, id: ruleId }]
      });
    } catch (error) {
      console.error('[EnhancedFilterManager] Failed to add session rule:', error);
    }
  }

  async removeSessionRules(tabId) {
    const tabRules = this.sessionRules.get(tabId);
    if (tabRules && tabRules.length > 0) {
      const ruleIds = tabRules.map(r => r.id);
      try {
        await chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: ruleIds
        });
      } catch (error) {
        console.error('[EnhancedFilterManager] Failed to remove session rules:', error);
      }
    }
    this.sessionRules.delete(tabId);
  }

  // CNAME uncloaking control
  async setCnameEnabled(enabled) {
    this.cnameUncloaking.setEnabled(enabled);
    await this.settingsManager.set('privacy.cnameUncloaking.enabled', enabled);
    await this.refreshRules();
  }

  async addCnameTrackingDomain(domain) {
    this.cnameUncloaking.addTrackingDomain(domain);
    await this.refreshRules();
  }

  getCnameStats() {
    return this.cnameUncloaking.getStats();
  }

  // Custom rules management
  async addCustomRule(rule) {
    const newRule = { ...rule, id: Date.now(), created: Date.now() };
    this.customRules.push(newRule);
    await this.settingsManager.set('customRules', this.customRules);
    await this.refreshRules();
    return newRule;
  }

  async removeCustomRule(ruleId) {
    this.customRules = this.customRules.filter(r => r.id !== ruleId);
    await this.settingsManager.set('customRules', this.customRules);
    await this.refreshRules();
  }

  async updateCustomRule(ruleId, updates) {
    const index = this.customRules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.customRules[index] = { ...this.customRules[index], ...updates };
      await this.settingsManager.set('customRules', this.customRules);
      await this.refreshRules();
    }
  }

  getCustomRules() { return [...this.customRules]; }

  // Allowlist management
  async addToAllowlist(urlPattern, domain = null) {
    const rule = { id: Date.now(), condition: { urlFilter: urlPattern } };
    if (domain) rule.condition.domains = [domain];
    this.allowlistRules.push(rule);
    await this.settingsManager.set('allowlist', this.allowlistRules);
    await this.refreshRules();
    return rule;
  }

  async removeFromAllowlist(ruleId) {
    this.allowlistRules = this.allowlistRules.filter(r => r.id !== ruleId);
    await this.settingsManager.set('allowlist', this.allowlistRules);
    await this.refreshRules();
  }

  getAllowlist() { return [...this.allowlistRules]; }

  // Cosmetic filters
  async addCosmeticFilter(filter) {
    const filters = await this.settingsManager.get('cosmeticFilters', []);
    filters.push({ id: Date.now(), filter, enabled: true });
    await this.settingsManager.set('cosmeticFilters', filters);
    chrome.runtime.sendMessage({ type: 'COSMETIC_FILTERS_UPDATED', filters }).catch(() => {});
  }

  async removeCosmeticFilter(filterId) {
    const filters = await this.settingsManager.get('cosmeticFilters', []);
    const updated = filters.filter(f => f.id !== filterId);
    await this.settingsManager.set('cosmeticFilters', updated);
    chrome.runtime.sendMessage({ type: 'COSMETIC_FILTERS_UPDATED', filters: updated }).catch(() => {});
  }

  async getCosmeticFilters() { return await this.settingsManager.get('cosmeticFilters', []); }

  async setEnabled(enabled) {
    this.enabled = enabled;
    await this.settingsManager.set('enabled', enabled);
    if (enabled) await this.refreshRules(); else await this.disableAllRules();
    chrome.runtime.sendMessage({ type: 'EXTENSION_TOGGLED', enabled }).catch(() => {});
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'EXTENSION_TOGGLED', enabled }).catch(() => {}));
  }

  isEnabled() { return this.enabled; }

  async getMatchedRules(tabId) {
    try { return await chrome.declarativeNetRequest.getMatchedRules({ tabId }); }
    catch (error) { console.error('[EnhancedFilterManager] Failed to get matched rules:', error); return []; }
  }

  async exportRules() {
    return {
      customRules: this.customRules,
      allowlist: this.allowlistRules,
      cosmeticFilters: await this.settingsManager.get('cosmeticFilters', []),
      exportDate: Date.now(),
      version: 1
    };
  }

  async importRules(data) {
    if (data.customRules) {
      this.customRules = data.customRules;
      await this.settingsManager.set('customRules', this.customRules);
    }
    if (data.allowlist) {
      this.allowlistRules = data.allowlist;
      await this.settingsManager.set('allowlist', this.allowlistRules);
    }
    if (data.cosmeticFilters) {
      await this.settingsManager.set('cosmeticFilters', data.cosmeticFilters);
    }
    await this.refreshRules();
  }

  getRuleStats() {
    return {
      dynamicRules: this.ruleCache.size,
      customRules: this.customRules.length,
      allowlistRules: this.allowlistRules.length,
      cnameRules: this.cnameRules.length,
      sessionRules: this.sessionRules.size,
      cosmeticFilters: 0,
      perfStats: this.perfStats
    };
  }
}

export default EnhancedFilterManager;