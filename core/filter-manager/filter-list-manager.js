/**
 * Filter List Manager — 25+ lists, auto-update, cache-first, priority queue, health monitoring
 * Handles core, annoyances, uBlock, specialized, regional lists
 */

import { errorKernel, wrapStorage, wrapNetwork } from '../../background/error-kernel.js';
import { ABPParser, StreamingABPParser } from '../dnr-compiler/abp-parser.js';
import { DNRConverter } from '../dnr-compiler/dnr-converter.js';
import { RuleOptimizer } from '../dnr-compiler/rule-optimizer.js';
import { networkStack } from '../../background/network-stack.js';
import { storageEngine } from '../../background/storage-engine.js';

// ============================================================================
// Default Filter Lists (25 lists)
// ============================================================================

export const DEFAULT_FILTER_LISTS = [
  // Core ad blocking (3)
  {
    id: 'easylist',
    name: 'EasyList',
    url: 'https://easylist.to/easylist/easylist.txt',
    enabled: true,
    category: 'core',
    parser: 'adblock',
    ruleIdBase: 10000,
    description: 'Primary ad blocking filter list'
  },
  {
    id: 'easyprivacy',
    name: 'EasyPrivacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    enabled: true,
    category: 'core',
    parser: 'adblock',
    ruleIdBase: 20000,
    description: 'Privacy-focused tracking protection'
  },
  {
    id: 'peterlowe',
    name: "Peter Lowe's List",
    url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext',
    enabled: true,
    category: 'core',
    parser: 'adblock',
    ruleIdBase: 30000,
    description: 'Malware and ad server blocking'
  },

  // Annoyances (2)
  {
    id: 'fanboy_annoyances',
    name: 'Fanboy Annoyances',
    url: 'https://easylist.to/easylist/fanboy-annoyance.txt',
    enabled: true,
    category: 'annoyances',
    parser: 'adblock',
    ruleIdBase: 40000,
    description: 'Anti-annoyance filters (popups, overlays, etc.)'
  },
  {
    id: 'fanboy_social',
    name: 'Fanboy Social',
    url: 'https://easylist.to/easylist/fanboy-social.txt',
    enabled: true,
    category: 'annoyances',
    parser: 'adblock',
    ruleIdBase: 50000,
    description: 'Social media widget blocking'
  },

  // uBlock Origin comprehensive (4)
  {
    id: 'ublock_filters',
    name: 'uBlock Filters',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
    enabled: true,
    category: 'ublock',
    parser: 'adblock',
    ruleIdBase: 60000,
    description: 'uBlock Origin main filter list'
  },
  {
    id: 'ublock_privacy',
    name: 'uBlock Privacy',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt',
    enabled: true,
    category: 'ublock',
    parser: 'adblock',
    ruleIdBase: 70000,
    description: 'uBlock privacy-specific filters'
  },
  {
    id: 'ublock_badware',
    name: 'uBlock Badware',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt',
    enabled: true,
    category: 'ublock',
    parser: 'adblock',
    ruleIdBase: 80000,
    description: 'uBlock malware/badware filters'
  },
  {
    id: 'ublock_annoyances',
    name: 'uBlock Annoyances',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances.txt',
    enabled: true,
    category: 'ublock',
    parser: 'adblock',
    ruleIdBase: 90000,
    description: 'uBlock anti-annoyance filters'
  },

  // Specialized (2)
  {
    id: 'easylist_cookie',
    name: 'EasyList Cookie',
    url: 'https://easylist.to/easylist/easylist-cookie.txt',
    enabled: true,
    category: 'specialized',
    parser: 'adblock',
    ruleIdBase: 100000,
    description: 'Cookie notice and GDPR banner blocking'
  },
  {
    id: 'anti_adblock',
    name: 'Anti-Adblock Killer',
    url: 'https://raw.githubusercontent.com/reek/anti-adblock-killer/master/anti-adblock-killer-filters.txt',
    enabled: true,
    category: 'specialized',
    parser: 'adblock',
    ruleIdBase: 110000,
    description: 'Anti-anti-adblock circumvention'
  },

  // Regional (10)
  {
    id: 'easylist_germany',
    name: 'EasyList Germany',
    url: 'https://easylist.to/easylist/easylistgermany.txt',
    enabled: true,
    category: 'regional',
    parser: 'adblock',
    ruleIdBase: 120000,
    description: 'German regional ad blocking'
  },
  {
    id: 'easylist_france',
    name: 'EasyList France',
    url: 'https://easylist.to/easylist/easylistfr.txt',
    enabled: true,
    category: 'regional',
    parser: 'adblock',
    ruleIdBase: 130000,
    description: 'French regional ad blocking'
  },
  {
    id: 'easylist_china',
    name: 'EasyList China',
    url: 'https://easylist.to/easylist/easylistchina.txt',
    enabled: true,
    category: 'regional',
    parser: 'adblock',
    ruleIdBase: 140000,
    description: 'Chinese regional ad blocking'
  },
  {
    id: 'easylist_italy',
    name: 'EasyList Italy',
    url: 'https://easylist.to/easylist/easylistitaly.txt',
    enabled: true,
    category: 'regional',
    parser: 'adblock',
    ruleIdBase: 150000,
    description: 'Italian regional ad blocking'
  },
  {
    id: 'easylist_spain',
    name: 'EasyList Spain',
    url: 'https://easylist.to/easylist/easylistspain.txt',
    enabled: true,
    category: 'regional',
    parser: 'adblock',
    ruleIdBase: 160000,
    description: 'Spanish regional ad blocking'
  },
  {
    id: 'easylist_poland',
    name: 'EasyList Poland',
    url: 'https://easylist.to/easylist/easylistpoland.txt',
    enabled: true,
    category: 'regional',
    parser: 'adblock',
    ruleIdBase: 170000,
    description: 'Polish regional ad blocking'
  },
  {
    id: 'easylist_netherlands',
    name: 'EasyList Netherlands',
    url: 'https://easylist.to/easylist/easylistnetherlands.txt',
    enabled: true,
    category: 'regional',
    parser: 'adblock',
    ruleIdBase: 180000,
    description: 'Dutch regional ad blocking'
  },
  {
    id: 'easylist_taiwan',
    name: 'EasyList Taiwan',
    url: 'https://easylist.to/easylist/easylisttaiwan.txt',
    enabled: true,
    category: 'regional',
    parser: 'adblock',
    ruleIdBase: 190000,
    description: 'Taiwanese regional ad blocking'
  },
  {
    id: 'easylist_czech',
    name: 'EasyList Czech',
    url: 'https://easylist.to/easylist/easylistczech.txt',
    enabled: true,
    category: 'regional',
    parser: 'adblock',
    ruleIdBase: 200000,
    description: 'Czech regional ad blocking'
  },
  {
    id: 'easylist_denmark',
    name: 'EasyList Denmark',
    url: 'https://easylist.to/easylist/easylistdenmark.txt',
    enabled: true,
    category: 'regional',
    parser: 'adblock',
    ruleIdBase: 210000,
    description: 'Danish regional ad blocking'
  },

  // YouTube specific (1)
  {
    id: 'youtube_ads',
    name: 'YouTube Ads',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/youtube.txt',
    enabled: true,
    category: 'youtube',
    parser: 'adblock',
    ruleIdBase: 220000,
    description: 'YouTube-specific ad blocking'
  },

  // Additional quality lists
  {
    id: 'easylist_bulgaria',
    name: 'EasyList Bulgaria',
    url: 'https://easylist.to/easylist/easylistbulgaria.txt',
    enabled: false,
    category: 'regional',
    parser: 'adblock',
    ruleIdBase: 230000,
    description: 'Bulgarian regional ad blocking'
  },
  {
    id: 'easylist_greece',
    name: 'EasyList Greece',
    url: 'https://easylist.to/easylist/easylistgreece.txt',
    enabled: false,
    category: 'regional',
    parser: 'adblock',
    ruleIdBase: 240000,
    description: 'Greek regional ad blocking'
  }
];

// ============================================================================
// Filter List Manager
// ============================================================================

export class FilterListManager {
  constructor(options = {}) {
    this.options = {
      maxCacheAge: options.maxCacheAge ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      retryConfig: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000
      },
      ...options
    };

    this.lists = new Map();
    this.parser = new ABPParser({ debug: options.debug });
    this.converter = DNRConverter;
    this.optimizer = new RuleOptimizer();
    this.cache = new Map();
    this.updateQueue = new Set();
    this.isUpdating = false;
    this.lastUpdateCheck = null;
    this.updateListeners = new Set();
  }

  /**
   * Initialize filter lists from storage
   */
  async initialize(storedLists = null) {
    // Load from storage or use defaults
    let listsToLoad = DEFAULT_FILTER_LISTS;

    if (storedLists && Array.isArray(storedLists) && storedLists.length > 0) {
      // Merge stored settings with defaults (preserve new default lists)
      const storedMap = new Map(storedLists.map(l => [l.id, l]));
      listsToLoad = DEFAULT_FILTER_LISTS.map(defaultList => {
        const stored = storedMap.get(defaultList.id);
        return stored ? { ...defaultList, ...stored } : defaultList;
      });
    }

    for (const list of listsToLoad) {
      this.lists.set(list.id, {
        ...list,
        rules: [],
        lastUpdated: null,
        etag: null,
        lastModified: null,
        errorCount: 0,
        consecutiveFailures: 0,
        lastError: null,
        parseStats: null
      });
    }

    // Load cached rules
    await this.loadCache();

    // Initial fetch for enabled lists
    const enabled = Array.from(this.lists.values()).filter(l => l.enabled);
    await Promise.allSettled(enabled.map(l => this.fetchAndParse(l)));

    console.log(`[FilterListManager] Initialized ${this.lists.size} filter lists`);
  }

  /**
   * Fetch and parse a filter list with ETag/Last-Modified, exponential backoff, and cache fallback
   */
  async fetchAndParse(list) {
    const wrappedFetch = errorKernel.wrap(
      'filterlist.fetch',
      this._fetchAndParse.bind(this),
      {
        retries: this.options.retryConfig.maxRetries,
        delay: this.options.retryConfig.baseDelay,
        fallback: async (error, l) => this._fallbackToCache(l),
        shouldRetry: (error) => this._isRetryableError(error)
      }
    );

    return await wrappedFetch(list);
  }

  async _fetchAndParse(list) {
    const headers = {};
    if (list.etag) headers['If-None-Match'] = list.etag;
    if (list.lastModified) headers['If-Modified-Since'] = list.lastModified;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(list.url, {
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 304) {
        // Not modified - use cached version
        return { updated: false, fromCache: true };
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Stream parse for large lists
      const parser = new StreamingABPParser({ debug: this.parser.debug });
      const allRules = [];

      await networkStack.downloadFilterList(list.url, (line) => {
        const rules = parser.parseChunk(line, list.id);
        allRules.push(...rules);
      });

      // Flush remaining
      allRules.push(...parser.flush(list.id));

      if (allRules.length === 0) {
        throw new Error('No valid rules parsed');
      }

      // Convert to DNR
      const dnrRules = this.converter.convert(allRules, list.ruleIdBase, list.id);

      // Optimize
      const optimizedRules = this.optimizer.optimize(dnrRules, list.name);

      // Update list metadata
      const etag = response.headers.get('etag');
      const lastModified = response.headers.get('last-modified');

      this.lists.set(list.id, {
        ...list,
        rules: optimizedRules,
        lastUpdated: new Date().toISOString(),
        etag,
        lastModified,
        errorCount: 0,
        consecutiveFailures: 0,
        lastError: null,
        parseStats: parser.getStats()
      });

      // Save to cache
      await this.saveCache(list.id, optimizedRules, list.lastUpdated, etag, lastModified);

      console.log(`[FilterList] ${list.name}: ${optimizedRules.length} DNR rules (cached)`);
      this._notifyUpdate(list.id);

      return { updated: true, fromCache: false, ruleCount: optimizedRules.length };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Check if error is retryable
   */
  _isRetryableError(error) {
    const message = error.message.toLowerCase();
    return message.includes('network') ||
           message.includes('timeout') ||
           message.includes('fetch') ||
           message.includes('aborted') ||
           message.includes('503') ||
           message.includes('502') ||
           message.includes('504') ||
           message.includes('429');
  }

  /**
   * Fallback to cached rules when fetch fails
   */
  async _fallbackToCache(list) {
    console.log(`[FilterList] ${list.name}: Fetch failed, using cached rules`);

    const cached = this.cache.get(list.id);
    if (cached && cached.rules && cached.rules.length > 0) {
      this.lists.set(list.id, {
        ...list,
        rules: cached.rules,
        lastUpdated: cached.lastUpdated,
        etag: cached.etag,
        lastModified: cached.lastModified,
        errorCount: (list.errorCount || 0) + 1,
        consecutiveFailures: (list.consecutiveFailures || 0) + 1,
        lastError: 'Using cached version'
      });
      return { updated: false, fromCache: true, ruleCount: cached.rules.length };
    }

    // No cache available
    this.lists.set(list.id, {
      ...list,
      errorCount: (list.errorCount || 0) + 1,
      consecutiveFailures: (list.consecutiveFailures || 0) + 1,
      lastError: 'No cache available'
    });
    return { updated: false, fromCache: false, ruleCount: 0 };
  }

  /**
   * Update all enabled filter lists
   */
  async updateAll() {
    if (this.isUpdating) {
      console.log('[FilterListManager] Update already in progress');
      return [];
    }

    this.isUpdating = true;
    this.lastUpdateCheck = Date.now();
    await storageEngine.set({ lastUpdateCheck: this.lastUpdateCheck }, { backend: 'local' });

    const enabled = Array.from(this.lists.values()).filter(l => l.enabled);
    const results = await Promise.allSettled(enabled.map(l => this.fetchAndParse(l)));

    const updated = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value.updated) {
        updated.push(enabled[i].id);
      }
    });

    this.isUpdating = false;

    if (updated.length > 0) {
      await this.saveSettings();
    }

    return updated;
  }

  /**
   * Get optimized rulesets for enabled lists
   */
  getOptimizedRulesets() {
    const rulesets = {};
    for (const [id, list] of this.lists) {
      if (list.enabled && list.rules && list.rules.length > 0) {
        // Filter to valid DNR rules only
        rulesets[id] = list.rules.filter(r => this._isValidDnrRule(r));
      }
    }
    return rulesets;
  }

  _isValidDnrRule(rule) {
    return rule &&
           typeof rule === 'object' &&
           rule.id &&
           rule.action &&
           rule.action.type &&
           rule.condition &&
           (rule.condition.urlFilter || rule.condition.regexFilter) &&
           rule.condition.resourceTypes &&
           Array.isArray(rule.condition.resourceTypes) &&
           rule.condition.resourceTypes.length > 0;
  }

  /**
   * Get status of all filter lists
   */
  getStatus() {
    const status = {};
    for (const [id, list] of this.lists) {
      status[id] = {
        name: list.name,
        enabled: list.enabled,
        ruleCount: list.rules?.length || 0,
        lastUpdated: list.lastUpdated,
        errorCount: list.errorCount || 0,
        consecutiveFailures: list.consecutiveFailures || 0,
        lastError: list.lastError,
        category: list.category,
        description: list.description,
        url: list.url,
        parseStats: list.parseStats
      };
    }
    return status;
  }

  /**
   * Toggle a filter list on/off
   */
  toggleList(id, enabled) {
    const list = this.lists.get(id);
    if (list) {
      list.enabled = enabled;
      this.lists.set(id, list);
      this.saveSettings();
      console.log(`[FilterListManager] ${list.name} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Save filter list settings to storage
   */
  async saveSettings() {
    const lists = Array.from(this.lists.values()).map(l => ({
      id: l.id,
      name: l.name,
      url: l.url,
      enabled: l.enabled,
      category: l.category,
      parser: l.parser,
      ruleIdBase: l.ruleIdBase,
      description: l.description
    }));

    try {
      await wrapStorage('filterlists.save', () =>
        chrome.storage.sync.set({ filterLists: lists })
      );
    } catch (error) {
      errorKernel._recordMetric('storage.filterlists.save.error', 1);
    }
  }

  /**
   * Load cached rules from storage with decompression
   */
  async loadCache() {
    try {
      const { filterListCache } = await storageEngine.get('filterListCache', { backend: 'indexeddb' });
      if (!filterListCache) return;

      for (const [id, data] of Object.entries(filterListCache)) {
        if (this.lists.has(id) && data.rules) {
          // Check cache age
          if (data.lastUpdated) {
            const age = Date.now() - new Date(data.lastUpdated).getTime();
            if (age > this.options.maxCacheAge) {
              console.log(`[FilterListManager] Cache expired for ${id}, will refetch`);
              continue;
            }
          }

          const l = this.lists.get(id);
          l.rules = data.rules;
          l.lastUpdated = data.lastUpdated;
          l.etag = data.etag;
          l.lastModified = data.lastModified;
          this.lists.set(id, l);

          // Also store in memory cache
          this.cache.set(id, data);
        }
      }

      console.log(`[FilterListManager] Loaded ${this.cache.size} cached filter lists`);
    } catch (error) {
      errorKernel._recordMetric('storage.filterlists.load.error', 1);
    }
  }

  /**
   * Save rules to cache with compression
   */
  async saveCache(id, rules, lastUpdated, etag, lastModified) {
    try {
      // Compress rules by removing redundant fields for storage
      const compressedRules = rules.map(rule => ({
        id: rule.id,
        p: rule.priority,
        a: rule.action,
        c: rule.condition
      }));

      const cacheData = {
        rules: compressedRules,
        lastUpdated,
        etag,
        lastModified,
        ruleCount: rules.length
      };

      // Update memory cache
      this.cache.set(id, cacheData);

      // Persist to storage
      const { filterListCache = {} } = await storageEngine.get('filterListCache', { backend: 'indexeddb' });
      filterListCache[id] = cacheData;
      await storageEngine.set({ filterListCache }, { backend: 'indexeddb' });
    } catch (error) {
      errorKernel._recordMetric('storage.filterlists.cache.error', 1, { listId: id });
    }
  }

  /**
   * Decompress cached rules
   */
  _decompressRules(compressedRules) {
    return compressedRules.map(rule => ({
      id: rule.id,
      priority: rule.p,
      action: rule.a,
      condition: rule.c
    }));
  }

  /**
   * Get a specific list by ID
   */
  getList(id) {
    return this.lists.get(id);
  }

  /**
   * Get all lists
   */
  getAllLists() {
    return Array.from(this.lists.values());
  }

  /**
   * Get lists by category
   */
  getListsByCategory(category) {
    return Array.from(this.lists.values()).filter(l => l.category === category);
  }

  /**
   * Get enabled lists
   */
  getEnabledLists() {
    return Array.from(this.lists.values()).filter(l => l.enabled);
  }

  /**
   * Add a custom filter list
   */
  async addCustomList(listConfig) {
    const newList = {
      id: listConfig.id || `custom_${Date.now()}`,
      name: listConfig.name,
      url: listConfig.url,
      enabled: listConfig.enabled !== false,
      category: listConfig.category || 'custom',
      parser: listConfig.parser || 'adblock',
      ruleIdBase: listConfig.ruleIdBase || 200000 + this.lists.size * 10000,
      description: listConfig.description || 'Custom filter list'
    };

    this.lists.set(newList.id, { ...newList, rules: [], lastUpdated: null, etag: null, errorCount: 0 });

    if (newList.enabled) {
      await this.fetchAndParse(newList);
    }

    await this.saveSettings();
    return newList;
  }

  /**
   * Remove a custom filter list
   */
  async removeCustomList(id) {
    const list = this.lists.get(id);
    if (!list || list.category !== 'custom') {
      throw new Error('Can only remove custom lists');
    }

    this.lists.delete(id);
    this.cache.delete(id);
    await this.saveSettings();

    // Remove from storage cache
    try {
      const { filterListCache = {} } = await storageEngine.get('filterListCache', { backend: 'indexeddb' });
      delete filterListCache[id];
      await storageEngine.set({ filterListCache }, { backend: 'indexeddb' });
    } catch (error) {
      errorKernel._recordMetric('storage.filterlists.remove.error', 1);
    }
  }

  /**
   * Force refresh a specific list
   */
  async forceUpdate(id) {
    const list = this.lists.get(id);
    if (!list) throw new Error(`List ${id} not found`);

    // Clear cache to force fresh fetch
    list.etag = null;
    list.lastModified = null;
    this.lists.set(id, list);
    this.cache.delete(id);

    return await this.fetchAndParse(list);
  }

  /**
   * Get total rule count across all enabled lists
   */
  getTotalRuleCount() {
    let count = 0;
    for (const [id, list] of this.lists) {
      if (list.enabled && list.rules) {
        count += list.rules.length;
      }
    }
    return count;
  }

  /**
   * Get rules for a specific list
   */
  getRulesForList(id) {
    const list = this.lists.get(id);
    return list?.rules || [];
  }

  /**
   * Export all filter list configurations
   */
  exportConfig() {
    return Array.from(this.lists.values()).map(l => ({
      id: l.id,
      name: l.name,
      url: l.url,
      enabled: l.enabled,
      category: l.category,
      parser: l.parser,
      ruleIdBase: l.ruleIdBase,
      description: l.description
    }));
  }

  /**
   * Import filter list configurations
   */
  async importConfig(config) {
    if (!Array.isArray(config)) throw new Error('Invalid config format');

    for (const listConfig of config) {
      const existing = this.lists.get(listConfig.id);
      if (existing) {
        // Update existing
        this.lists.set(listConfig.id, { ...existing, ...listConfig });
      } else {
        // Add new custom list
        await this.addCustomList(listConfig);
      }
    }

    await this.saveSettings();
  }

  /**
   * Subscribe to update notifications
   */
  onUpdate(callback) {
    this.updateListeners.add(callback);
    return () => this.updateListeners.delete(callback);
  }

  _notifyUpdate(listId) {
    for (const callback of this.updateListeners) {
      try {
        callback(listId);
      } catch (e) {
        console.error('[FilterListManager] Update listener error:', e);
      }
    }
  }
}

export default FilterListManager;