// Filter List Manager — Handles 16 default filter lists with parsing, caching, and DNR rule generation
// Supports: core, annoyances, uBlock, specialized, regional (DE/FR/CN/IT/ES/PL/NL/TW)

import { errorHandler } from '../error-handler.js';

// ========== DEFAULT FILTER LISTS (16+ lists) ==========
const DEFAULT_FILTER_LISTS = [
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

  // Regional (7) - DE/FR/CN/IT/ES/PL/NL/TW
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
  // YouTube Ads - dedicated list for YouTube ad blocking
  {
    id: 'youtube_ads',
    name: 'YouTube Ads',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/youtube.txt',
    enabled: true,
    category: 'youtube',
    parser: 'adblock',
    ruleIdBase: 200000,
    description: 'YouTube-specific ad blocking'
  }
];

// ========== VALID DNR RESOURCE TYPES ==========
const VALID_DNR_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'script', 'xmlhttprequest',
  'image', 'stylesheet', 'font', 'object', 'media',
  'websocket', 'other', 'ping', 'csp_report'
];

const ALL_RESOURCE_TYPES = [...VALID_DNR_RESOURCE_TYPES];

// ========== RESOURCE TYPE MAPPING ==========
const RESOURCE_TYPE_MAP = {
  script: 'script', image: 'image', stylesheet: 'stylesheet',
  object: 'object', xmlhttprequest: 'xmlhttprequest',
  'object-subrequest': 'object_subrequest', subdocument: 'sub_frame',
  document: 'main_frame', elemhide: 'other', other: 'other',
  font: 'font', media: 'media', websocket: 'websocket',
  ping: 'ping', csp: 'csp_report', cookie: 'cookie',
  redirect: 'redirect', 'redirect-rule': 'redirect',
  removeparam: 'removeparam', important: 'important'
};

// ========== ABP PARSER WITH ERROR RECOVERY ==========
class ABPParser {
  constructor(options = {}) {
    this.debug = options.debug || false;
    this.errorCount = 0;
    this.maxErrors = 100;
    this.skippedLines = [];
  }

  /**
   * Parse ABP filter text with error recovery
   * @param {string} text - Filter list text
   * @param {string} listId - Identifier for the list
   * @returns {Array} Parsed filter rules
   */
  parse(text, listId) {
    const rules = [];
    const lines = text.split('\n');
    this.errorCount = 0;
    this.skippedLines = [];

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      try {
        let line = lines[lineNum].trim();

        // Skip comments, metadata, empty lines
        if (!line || line.startsWith('!') || line.startsWith('[')) continue;

        // Handle exception rules (@@)
        const isException = line.startsWith('@@');
        if (isException) line = line.substring(2);

        // Parse filter components
        const parsed = this.parseFilterLine(line, listId, lineNum);
        if (parsed) {
          rules.push({ ...parsed, isException, listId, lineNumber: lineNum, raw: line });
        }
      } catch (e) {
        // Error recovery: log and continue
        this.handleError(e, listId, lineNum, lines[lineNum]);
      }
    }

    if (this.debug && this.skippedLines.length > 0) {
      console.log(`[ABPParser] ${listId}: Skipped ${this.skippedLines.length} lines`);
    }

    return rules;
  }

  /**
   * Parse a single filter line
   */
  parseFilterLine(line, listId, lineNum) {
    const options = this.parseOptions(line);
    const cleanLine = line.replace(/\$.*$/, '');

    // 1. Domain filter: ||example.com^
    const domainMatch = cleanLine.match(/^\|\|([^/\^]+)(\^|$)/);
    if (domainMatch) {
      return { type: 'domain', domain: domainMatch[1].toLowerCase(), options, raw: line };
    }

    // 2. URL pattern with anchors: |http://example.com|
    const anchoredMatch = cleanLine.match(/^\|([^\|]+)\|$/);
    if (anchoredMatch) {
      return { type: 'url_anchored', pattern: anchoredMatch[1], options, raw: line };
    }

    // 3. URL pattern: |http://example.com or /path/*
    const urlMatch = cleanLine.match(/^[\|]?([^\|]+)[\|]?$/);
    if (urlMatch && (urlMatch[1].includes('/') || urlMatch[1].includes('*') || urlMatch[1].includes('?'))) {
      return { type: 'url', pattern: urlMatch[1], options, raw: line };
    }

    // 4. Regex filter: /pattern/options
    const regexMatch = cleanLine.match(/^\/(.+)\/([a-z]*)$/);
    if (regexMatch) {
      return { type: 'regex', pattern: regexMatch[1], flags: regexMatch[2], options, raw: line };
    }

    // 5. Element hiding: ##selector
    const elemHideMatch = cleanLine.match(/^##(.+)$/);
    if (elemHideMatch) {
      return { type: 'elemhide', selector: elemHideMatch[1], options, raw: line };
    }

    // 6. Extended CSS: #?#selector
    const extCssMatch = cleanLine.match(/^#\?#(.+)$/);
    if (extCssMatch) {
      return { type: 'extcss', selector: extCssMatch[1], options, raw: line };
    }

    // 7. Scriptlet: #%#scriptlet-name(arg1, arg2)
    const scriptletMatch = cleanLine.match(/^#%#(.+)$/);
    if (scriptletMatch) {
      return { type: 'scriptlet', scriptlet: scriptletMatch[1], options, raw: line };
    }

    // 8. Exception for elemhide: #@##selector
    const elemHideException = cleanLine.match(/^#@##(.+)$/);
    if (elemHideException) {
      return { type: 'elemhide_exception', selector: elemHideException[1], options, raw: line };
    }

    // 9. HTML filtering: ##^pattern$ (rare, skip for DNR)
    if (cleanLine.startsWith('##^') && cleanLine.endsWith('$')) {
      return { type: 'html_filter', pattern: cleanLine.slice(3, -1), options, raw: line };
    }

    // Unrecognized pattern - skip with warning
    if (this.debug && line.length > 0) {
      this.skippedLines.push({ lineNum, line, reason: 'unrecognized_pattern' });
    }
    return null;
  }

  /**
   * Parse $options from filter line
   */
  parseOptions(line) {
    const options = {
      domains: [], excludeDomains: [],
      thirdParty: null, matchCase: false, collapse: true,
      resourceTypes: [], initiatorDomains: [], excludedInitiatorDomains: [],
      requestDomains: [], excludedRequestDomains: [],
      redirect: null, redirectRule: null, removeParams: [],
      csp: null, cookie: null, important: false
    };

    const optionMatch = line.match(/\$(.+)$/);
    if (!optionMatch) return options;

    const opts = optionMatch[1].split(',');

    for (const opt of opts) {
      const [key, value] = opt.split('=').map(s => s.trim());

      switch (key) {
        case 'domain':
          if (value) {
            const domains = value.split('|');
            options.domains = domains.filter(d => !d.startsWith('~')).map(d => d.toLowerCase());
            options.excludeDomains = domains.filter(d => d.startsWith('~')).map(d => d.substring(1).toLowerCase());
            options.initiatorDomains = options.domains;
            options.excludedInitiatorDomains = options.excludeDomains;
          }
          break;

        case 'third-party':
          options.thirdParty = true;
          break;
        case '~third-party':
          options.thirdParty = false;
          break;

        case 'match-case':
          options.matchCase = true;
          break;
        case '~match-case':
          options.matchCase = false;
          break;

        case 'collapse':
          options.collapse = true;
          break;
        case '~collapse':
          options.collapse = false;
          break;

        case 'important':
          options.important = true;
          break;

        case 'redirect':
          if (value) options.redirect = value;
          break;
        case 'redirect-rule':
          if (value) options.redirectRule = value;
          break;

        case 'removeparam':
          if (value) {
            options.removeParams = value.split('|').map(p => p.trim()).filter(p => p);
          }
          break;

        case 'csp':
          if (value) options.csp = value;
          break;

        case 'cookie':
          if (value) options.cookie = value;
          break;

        default:
          // Resource type
          if (RESOURCE_TYPE_MAP[key]) {
            options.resourceTypes.push(RESOURCE_TYPE_MAP[key]);
          } else if (key.startsWith('~') && RESOURCE_TYPE_MAP[key.substring(1)]) {
            // Excluded resource type - handled by not including
          }
          break;
      }
    }
    return options;
  }

  /**
   * Handle parsing errors with recovery
   */
  handleError(error, listId, lineNum, line) {
    this.errorCount++;
    if (this.errorCount > this.maxErrors) {
      // Too many errors, stop parsing
      throw new Error(`Too many parse errors in ${listId}, stopping at line ${lineNum}`);
    }

    this.skippedLines.push({ lineNum, line: line.substring(0, 100), reason: error.message });

    if (this.debug) {
      console.warn(`[ABPParser] ${listId}:${lineNum} parse error:`, error.message);
    }

    // Report to errorHandler for telemetry
    errorHandler.log(error, { listId, lineNum, context: 'abp_parse' });
  }
}

// ========== DNR CONVERTER ==========
class DNRConverter {
  static convert(parsedRules, ruleIdBase, listId) {
    const dnrRules = [];
    let ruleId = ruleIdBase;

    for (const rule of parsedRules) {
      const dnrRule = this.convertSingleRule(rule, ruleId++, listId);
      if (dnrRule) dnrRules.push(dnrRule);
    }
    return dnrRules;
  }

  static convertSingleRule(rule, ruleId, listId) {
    const baseRule = {
      id: ruleId,
      priority: 1,
      action: rule.isException ? { type: 'allow' } : { type: 'block' },
      condition: {}
    };

    const opts = rule.options || {};

    switch (rule.type) {
      case 'domain':
        baseRule.condition.urlFilter = `||${rule.domain}^`;
        if (opts.initiatorDomains?.length) baseRule.condition.initiatorDomains = opts.initiatorDomains;
        if (opts.excludedInitiatorDomains?.length) baseRule.condition.excludedInitiatorDomains = opts.excludedInitiatorDomains;
        if (opts.resourceTypes?.length) baseRule.condition.resourceTypes = opts.resourceTypes.filter(t => VALID_DNR_RESOURCE_TYPES.includes(t));
        if (opts.thirdParty !== null) baseRule.condition.domainType = opts.thirdParty ? 'thirdParty' : 'firstParty';
        break;

      case 'url_anchored':
        baseRule.condition.urlFilter = rule.pattern;
        baseRule.condition.isUrlFilterCaseSensitive = opts.matchCase;
        break;

      case 'url':
        baseRule.condition.urlFilter = rule.pattern;
        baseRule.condition.isUrlFilterCaseSensitive = opts.matchCase;
        if (opts.initiatorDomains?.length) baseRule.condition.initiatorDomains = opts.initiatorDomains;
        if (opts.resourceTypes?.length) baseRule.condition.resourceTypes = opts.resourceTypes.filter(t => VALID_DNR_RESOURCE_TYPES.includes(t));
        break;

      case 'regex':
        baseRule.condition.regexFilter = rule.pattern;
        baseRule.condition.isUrlFilterCaseSensitive = !rule.flags.includes('i');
        if (opts.initiatorDomains?.length) baseRule.condition.initiatorDomains = opts.initiatorDomains;
        if (opts.resourceTypes?.length) baseRule.condition.resourceTypes = opts.resourceTypes.filter(t => VALID_DNR_RESOURCE_TYPES.includes(t));
        break;

      case 'elemhide':
      case 'extcss':
      case 'scriptlet':
      case 'elemhide_exception':
      case 'html_filter':
        // These require content script injection, NOT DNR
        return null;

      default:
        return null;
    }

    // Validate resource types
    if (baseRule.condition.resourceTypes && baseRule.condition.resourceTypes.length === 0) {
      baseRule.condition.resourceTypes = ALL_RESOURCE_TYPES.filter(t => t !== 'main_frame');
    } else if (!baseRule.condition.resourceTypes) {
      baseRule.condition.resourceTypes = ALL_RESOURCE_TYPES.filter(t => t !== 'main_frame');
    }

    // Set priority: allow rules (exceptions) get higher priority
    if (rule.isException) baseRule.priority = 2;
    if (opts.important) baseRule.priority = 3;

    // Validate rule
    if (!this.validateDnrRule(baseRule)) {
      return null;
    }

    return baseRule;
  }

  static validateDnrRule(rule) {
    if (!rule || typeof rule !== 'object') return false;
    if (!rule.id || typeof rule.id !== 'number') return false;
    if (!rule.action || !rule.action.type) return false;
    if (!rule.condition || !rule.condition.urlFilter && !rule.condition.regexFilter) return false;
    if (!rule.condition.resourceTypes || !Array.isArray(rule.condition.resourceTypes)) return false;
    if (rule.condition.resourceTypes.length === 0) return false;
    return true;
  }
}

// ========== FILTER LIST MANAGER ==========
class FilterListManager {
  constructor(options = {}) {
    this.lists = new Map();
    this.parser = new ABPParser({ debug: options.debug });
    this.converter = DNRConverter;
    this.cache = new Map();
    this.updateQueue = new Set();
    this.isUpdating = false;
    this.maxCacheAge = options.maxCacheAge || 7 * 24 * 60 * 60 * 1000; // 7 days
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000
    };
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
        lastError: null
      });
    }

    // Load cached rules
    await this.loadCache();

    // Initial fetch for enabled lists
    const enabled = Array.from(this.lists.values()).filter(l => l.enabled);
    await Promise.allSettled(enabled.map(l => this.fetchAndParse(l)));
  }

  /**
   * Fetch and parse a filter list with ETag/Last-Modified, exponential backoff, and cache fallback
   */
  async fetchAndParse(list) {
    const wrappedFetch = errorHandler.wrap(this._fetchAndParse.bind(this), {
      retries: this.retryConfig.maxRetries,
      delay: this.retryConfig.baseDelay,
      fallback: async (error, l) => this._fallbackToCache(l),
      shouldRetry: (error) => this._isRetryableError(error)
    });

    return await wrappedFetch(list);
  }

  async _fetchAndParse(list) {
    const headers = {};
    if (list.etag) headers['If-None-Match'] = list.etag;
    if (list.lastModified) headers['If-Modified-Since'] = list.lastModified;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(list.url, {
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 304) {
        // Not modified - use cached version
        return false;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      const etag = response.headers.get('etag');
      const lastModified = response.headers.get('last-modified');

      // Parse with error recovery
      const parsed = this.parser.parse(text, list.id);

      if (parsed.length === 0) {
        throw new Error('No valid rules parsed');
      }

      // Convert to DNR
      const dnrRules = this.converter.convert(parsed, list.ruleIdBase, list.id);

      // Update list metadata
      this.lists.set(list.id, {
        ...list,
        rules: dnrRules,
        lastUpdated: new Date().toISOString(),
        etag,
        lastModified,
        errorCount: 0,
        consecutiveFailures: 0,
        lastError: null
      });

      // Save to cache with compression
      await this.saveCache(list.id, dnrRules, list.lastUpdated, etag, lastModified);

      console.log(`[FilterList] ${list.name}: ${dnrRules.length} DNR rules (cached)`);
      return true;
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
      return false; // Indicate we used cache, didn't fetch new
    }

    // No cache available
    this.lists.set(list.id, {
      ...list,
      errorCount: (list.errorCount || 0) + 1,
      consecutiveFailures: (list.consecutiveFailures || 0) + 1,
      lastError: 'No cache available'
    });
    return false;
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
    const enabled = Array.from(this.lists.values()).filter(l => l.enabled);
    const results = await Promise.allSettled(enabled.map(l => this.fetchAndParse(l)));

    const updated = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value === true) {
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
        rulesets[id] = list.rules.filter(r => this.converter.validateDnrRule(r));
      }
    }
    return rulesets;
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
        url: list.url
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
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.sync.set({ filterLists: lists });
      }
    } catch (error) {
      errorHandler.log(error, { context: 'saveSettings' });
    }
  }

  /**
   * Load cached rules from storage with decompression
   */
  async loadCache() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) return;

      const { filterListCache } = await chrome.storage.local.get('filterListCache');
      if (!filterListCache) return;

      for (const [id, data] of Object.entries(filterListCache)) {
        if (this.lists.has(id) && data.rules) {
          // Check cache age
          if (data.lastUpdated) {
            const age = Date.now() - new Date(data.lastUpdated).getTime();
            if (age > this.maxCacheAge) {
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
      errorHandler.log(error, { context: 'loadCache' });
    }
  }

  /**
   * Save rules to cache with compression (using JSON compression)
   */
  async saveCache(id, rules, lastUpdated, etag, lastModified) {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) return;

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
      const { filterListCache = {} } = await chrome.storage.local.get('filterListCache');
      filterListCache[id] = cacheData;
      await chrome.storage.local.set({ filterListCache });
    } catch (error) {
      errorHandler.log(error, { context: 'saveCache', listId: id });
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
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const { filterListCache = {} } = await chrome.storage.local.get('filterListCache');
        delete filterListCache[id];
        await chrome.storage.local.set({ filterListCache });
      }
    } catch (error) {
      errorHandler.log(error, { context: 'removeCustomList' });
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
}

export { DEFAULT_FILTER_LISTS, ABPParser, DNRConverter };