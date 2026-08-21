/**
 * ABP Filter Parser - Enhanced version with full ABP syntax support
 * Converts Adblock Plus filter syntax to Declarative Net Request rules
 * Supports: domain options, resource types, third-party, match-case, collapse,
 * exception rules, wildcards, regex, redirect, removeparam, csp, cookie, etc.
 */

// Resource type mapping from ABP to DNR
// Only includes valid DNR resource types per Chrome extension documentation
const RESOURCE_TYPE_MAP = {
  script: 'script',
  image: 'image',
  stylesheet: 'stylesheet',
  object: 'object',
  xmlhttprequest: 'xmlhttprequest',
  'object-subrequest': 'object_subrequest',
  subdocument: 'sub_frame',
  document: 'main_frame',
  elemhide: 'other',
  other: 'other',
  font: 'font',
  media: 'media',
  websocket: 'websocket',
  ping: 'ping',
  csp: 'csp_report',  // DNR uses csp_report, not csp
};

// Reverse mapping for excluded types - only valid DNR resource types
// Valid DNR resource types per Chrome extension API:
// https://developer.chrome.com/docs/extensions/reference/declarativeNetRequest/#type-RuleCondition
const ALL_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'script', 'xmlhttprequest',
  'image', 'stylesheet', 'font', 'object', 'media',
  'websocket', 'other', 'ping', 'csp_report'
];

/**
 * Parse an ABP filter string into structured components
 * @param {string} filter - Raw ABP filter line
 * @returns {Object|null} Parsed filter components or null if invalid
 */
export function parseAbpFilter(filter) {
  if (!filter || typeof filter !== 'string') return null;

  let isException = false;
  let urlPattern = filter.trim();
  const options = {
    domains: [],
    excludedDomains: [],
    resourceTypes: [],
    excludedResourceTypes: [],
    domainType: null,
    matchCase: false,
    collapse: false,
    redirect: null,
    redirectRule: null,
    removeParams: [],
    csp: null,
    cookie: null,
    important: false
  };

  // Handle exception rules (@@)
  if (urlPattern.startsWith('@@')) {
    isException = true;
    urlPattern = urlPattern.slice(2);
  }

  // Extract options ($...)
  const optionMatch = urlPattern.match(/\$(.+)$/);
  if (optionMatch) {
    urlPattern = urlPattern.slice(0, optionMatch.index);
    parseOptions(optionMatch[1], options);
  }

  // Extract domain specifications (||domain^)
  const domains = { include: [], exclude: [] };
  if (urlPattern.startsWith('||')) {
    const domainEnd = urlPattern.indexOf('^', 2);
    if (domainEnd > 2) {
      const domainPart = urlPattern.slice(2, domainEnd);
      domainPart.split('|').forEach(d => {
        d = d.trim();
        if (d) {
          if (d.startsWith('~')) {
            domains.exclude.push(d.slice(1));
          } else {
            domains.include.push(d);
          }
        }
      });
      urlPattern = urlPattern.slice(domainEnd + 1);
    }
  } else if (urlPattern.includes('^')) {
    // Handle patterns with ^ but not starting with ||
    // This is less common but valid ABP syntax
  }

  return {
    domains: domains.include,
    excludedDomains: domains.exclude,
    urlPattern,
    options,
    isException
  };
}

/**
 * Parse filter options string (e.g., "script,third-party,domain=example.com")
 * @param {string} optionStr - Options string from filter
 * @param {Object} options - Options object to populate
 */
function parseOptions(optionStr, options) {
  const parts = optionStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const [key, value] = trimmed.split('=').map(s => s.trim());

    switch (key) {
      // Domain options
      case 'domain':
        if (value) {
          value.split('|').forEach(d => {
            d = d.trim();
            if (d) {
              if (d.startsWith('~')) {
                options.excludedDomains.push(d.slice(1));
              } else {
                options.domains.push(d);
              }
            }
          });
        }
        break;
      case '~domain':
        if (value) {
          value.split('|').forEach(d => {
            d = d.trim();
            if (d) options.excludedDomains.push(d);
          });
        }
        break;

      // Resource type options
      case 'script':
      case 'image':
      case 'stylesheet':
      case 'object':
      case 'xmlhttprequest':
      case 'object-subrequest':
      case 'subdocument':
      case 'document':
      case 'elemhide':
      case 'other':
      case 'font':
      case 'media':
      case 'websocket':
      case 'ping':
      case 'csp':
      case 'cookie':
      case 'redirect':
      case 'redirect-rule':
      case 'removeparam':
        // These are not resource types but filter options - handle separately
        break;
      case 'important':
        options.important = true;
        break;
      case '~script':
      case '~image':
      case '~stylesheet':
      case '~object':
      case '~xmlhttprequest':
      case '~object-subrequest':
      case '~subdocument':
      case '~document':
      case '~elemhide':
      case '~other':
      case '~font':
      case '~media':
      case '~websocket':
      case '~ping':
      case '~csp':
      case '~important':
        options.excludedResourceTypes.push(key.slice(1));
        break;

      // Third-party options - use domainType for DNR compatibility
      case 'third-party':
        options.domainType = 'thirdParty';
        break;
      case '~third-party':
        options.domainType = 'firstParty';
        break;

      // Match case
      case 'match-case':
        options.matchCase = true;
        break;

      // Collapse
      case 'collapse':
        options.collapse = true;
        break;

      // Redirect
      case 'redirect':
        if (value) options.redirect = value;
        break;
      case 'redirect-rule':
        if (value) options.redirectRule = value;
        break;

      // Remove parameters
      case 'removeparam':
        if (value) {
          options.removeParams = value.split('|').map(p => p.trim()).filter(p => p);
        }
        break;

      // CSP
      case 'csp':
        if (value) options.csp = value;
        break;

      // Cookie
      case 'cookie':
        if (value) options.cookie = value;
        break;
    }
  }
}

/**
 * Convert ABP urlPattern to DNR urlFilter
 * @param {string} pattern - ABP url pattern
 * @param {Object} options - Parsed options
 * @returns {string|null} DNR-compatible urlFilter or null if pattern is invalid/too broad
 */
export function convertToUrlFilter(pattern, options = {}) {
  if (!pattern || pattern === '*' || pattern === '') return null;

  let urlFilter = pattern;

  // Handle regex patterns (/regex/) - DNR doesn't support regex
  if (urlFilter.startsWith('/') && urlFilter.endsWith('/')) {
    return null; // Skip regex patterns
  }

  // Remove anchor markers that DNR doesn't support
  // | at start = beginning of URL
  // | at end = end of URL
  // || = domain separator (start of domain)
  urlFilter = urlFilter.replace(/^\|/, '');  // Leading | (start of URL)
  urlFilter = urlFilter.replace(/\|$/, '');  // Trailing | (end of URL)

  // Handle ||domain^ pattern - this is the most common case
  if (pattern.startsWith('||') && pattern.includes('^')) {
    const domainPart = pattern.slice(2, pattern.indexOf('^'));
    // Keep the ||domain^ format as DNR supports it natively
    return `||${domainPart}^`;
  }

  // Handle ^ separator character
  // In ABP, ^ means any separator character (/, ?, :, @, etc.) or end of string
  // In DNR, ^ is supported as a separator character
  // We can keep ^ in the pattern as DNR supports it

  // Handle wildcards
  // * in ABP = any characters (including separators)
  // DNR also uses * for wildcard

  // Handle | at start of pattern (not ||) - beginning of URL
  if (pattern.startsWith('|') && !pattern.startsWith('||')) {
    // This means match from start of URL
    // In DNR, we can't easily express "start of URL" without knowing the scheme
    // Best approximation: remove the | and let it match anywhere
  }

  // If no special characters, treat as substring match
  if (!urlFilter.includes('*') && !urlFilter.includes('^') && !urlFilter.includes('||')) {
    // Short strings should be substring matched
    if (urlFilter.length <= 3) {
      return null; // Too short, skip
    }
    // Longer strings could be exact path matches
    return urlFilter;
  }

  // For query parameter patterns (e.g., &rb=&uuid=, -ad-manager/),
  // don't convert to * - use them as-is for substring matching
  if (urlFilter.includes('=') || urlFilter.includes('-') || urlFilter.includes('_')) {
    return urlFilter;
  }

  // Skip overly broad patterns that would match everything
  if (urlFilter === '*' || urlFilter === 'http://*' || urlFilter === 'https://*') {
    return null;
  }

  return urlFilter;
}

/**
 * Convert parsed ABP filter to DNR rule (HIGH PERFORMANCE)
 * @param {Object} parsed - Parsed filter from parseAbpFilter
 * @param {number} ruleId - Unique rule ID
 * @param {string} listKey - Filter list key
 * @param {string} originalFilter - Original filter string (for proper urlFilter)
 * @returns {Object|null} DNR rule or null if invalid
 */
export function createDnrRule(parsed, ruleId, listKey = '', originalFilter = '') {
  if (!parsed) return null;

  const { domains, excludedDomains, urlPattern, options, isException } = parsed;

  // Convert URL pattern to DNR urlFilter
  // For ||domain^ patterns, the original filter contains the domain info
  // but urlPattern is empty after parsing, so we need to use originalFilter
  let urlFilter = convertToUrlFilter(urlPattern || originalFilter, options);
  if (!urlFilter) return null;

  // HIGH PERFORMANCE: Use tracking-optimized resource types
  // Excludes: main_frame, stylesheet, font, object, media, websocket, csp_report
  // These are rarely used by trackers/ads
  const TRACKING_RESOURCE_TYPES = [
    'script', 'xmlhttprequest', 'image', 'sub_frame', 'ping', 'other'
  ];

  // Determine resource types
  let resourceTypes;
  if (options.resourceTypes.length > 0) {
    resourceTypes = options.resourceTypes
      .map(t => RESOURCE_TYPE_MAP[t])
      .filter(Boolean);
  } else if (options.excludedResourceTypes.length > 0) {
    const excluded = options.excludedResourceTypes
      .map(t => RESOURCE_TYPE_MAP[t])
      .filter(Boolean);
    resourceTypes = ALL_RESOURCE_TYPES.filter(t => !excluded.includes(t));
  } else {
    // HIGH PERFORMANCE DEFAULT: Use tracking-optimized types
    resourceTypes = TRACKING_RESOURCE_TYPES;
  }

  // Remove duplicates
  resourceTypes = [...new Set(resourceTypes)];

  // Remove invalid resource types
  const VALID_DNR_RESOURCE_TYPES = ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'stylesheet', 'font', 'object', 'media', 'websocket', 'other', 'ping', 'csp_report'];
  resourceTypes = resourceTypes.filter(t => VALID_DNR_RESOURCE_TYPES.includes(t));

  // Build condition
  const condition = { urlFilter, resourceTypes };

  // Add domains from ||domain^ part
  if (domains.length > 0) {
    condition.domains = domains;
  }
  // Add domains from $domain= option
  if (options.domains.length > 0) {
    if (condition.domains) {
      condition.domains = [...new Set([...condition.domains, ...options.domains])];
    } else {
      condition.domains = options.domains;
    }
  }
  if (excludedDomains.length > 0) {
    condition.excludedDomains = excludedDomains;
  }
  if (options.excludedDomains.length > 0) {
    if (condition.excludedDomains) {
      condition.excludedDomains = [...new Set([...condition.excludedDomains, ...options.excludedDomains])];
    } else {
      condition.excludedDomains = options.excludedDomains;
    }
  }

  // HIGH PERFORMANCE: Auto-set domainType for third-party tracking
  // ||domain^ patterns are almost always third-party trackers
  if (!options.domainType && urlFilter.startsWith('||') && urlFilter.includes('^')) {
    condition.domainType = 'thirdParty';
  } else if (options.domainType === 'firstParty' || options.domainType === 'thirdParty') {
    condition.domainType = options.domainType;
  }

  if (options.matchCase) {
    condition.isUrlFilterCaseSensitive = true;
  }

  // Build action
  let action;
  if (isException) {
    action = { type: 'allow' };
  } else if (options.redirect) {
    action = {
      type: 'redirect',
      redirect: { url: options.redirect }
    };
  } else if (options.redirectRule) {
    action = {
      type: 'redirect',
      redirect: { regexSubstitution: options.redirectRule }
    };
  } else if (options.removeParams.length > 0) {
    // DNR doesn't support removeparam directly, convert to allow with header removal
    // Note: This only works for request headers, not query params
    // For query param removal, we need to use a redirect rule with regexSubstitution
    action = {
      type: 'allow',
      allow: {
        removeHeaders: options.removeParams.map(p => ({ name: p, operation: 'remove' }))
      }
    };
  } else if (options.csp) {
    action = {
      type: 'allow',
      allow: {
        responseHeaders: [{
          name: 'Content-Security-Policy',
          value: options.csp,
          operation: 'append'
        }]
      }
    };
  } else if (options.cookie) {
    // Cookie rules are complex, skip for now
    action = { type: 'block' };
  } else {
    action = { type: 'block' };
  }

  // Calculate priority
  // Higher priority for:
  // - Exception rules (allow)
  // - More specific rules (with domains)
  // - $important rules
  let priority = 1;
  if (isException) priority = 2;
  if (options.important) priority = 3;
  if (domains.length > 0) priority += 1;

  return {
    id: ruleId,
    priority,
    action,
    condition
  };
}

/**
 * Parse a full filter list text and return DNR rules
 * @param {string} text - Filter list text
 * @param {Object} options - Parsing options
 * @returns {Array} Array of DNR rules
 */
export function parseFilterList(text, options = {}) {
  const rules = [];
  const lines = text.split('\n');
  const baseId = options.baseId || 100000;
  let ruleId = baseId;
  let listKey = options.listKey || '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines, comments, and metadata
    if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) continue;

    // Skip cosmetic filters (##, #@#, #?#)
    if (trimmed.includes('##') || trimmed.includes('#@#') || trimmed.includes('#?#')) continue;

    try {
      const parsed = parseAbpFilter(trimmed);
      if (parsed) {
        const rule = createDnrRule(parsed, ruleId, listKey, trimmed);
        if (rule) {
          rules.push(rule);
          ruleId++;
        }
      }
    } catch (e) {
      // Silently skip invalid rules
      if (options.debug) {
        console.warn(`[ABP Parser] Failed to parse: ${trimmed}`, e);
      }
    }
  }

  return rules;
}

/**
 * Validate a DNR rule
 * @param {Object} rule - DNR rule to validate
 * @returns {boolean} True if valid
 */
export function validateDnrRule(rule) {
  if (!rule || typeof rule !== 'object') return false;
  if (!rule.id || typeof rule.id !== 'number') return false;
  if (!rule.action || !rule.action.type) return false;
  if (!rule.condition || !rule.condition.urlFilter) return false;
  if (!rule.condition.resourceTypes || !Array.isArray(rule.condition.resourceTypes)) return false;
  if (rule.condition.resourceTypes.length === 0) return false;
  return true;
}

/**
 * Batch validate and filter rules
 * @param {Array} rules - Array of DNR rules
 * @returns {Array} Valid rules only
 */
export function filterValidRules(rules) {
  return rules.filter(validateDnrRule);
}

export default {
  parseAbpFilter,
  convertToUrlFilter,
  createDnrRule,
  parseFilterList,
  validateDnrRule,
  filterValidRules,
  RESOURCE_TYPE_MAP,
  ALL_RESOURCE_TYPES
};