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
  'object-subrequest': 'xmlhttprequest',
  subdocument: 'sub_frame',
  document: 'main_frame',
  elemhide: 'other',
  generichide: 'other',
  genericblock: 'other',
  other: 'other',
  font: 'font',
  media: 'media',
  websocket: 'websocket',
  webrtc: 'other',
  ping: 'ping',
  csp: 'csp_report',  // DNR uses csp_report, not csp
  cookie: null,       // cosmetic-only in uBO: no network equivalent
};

// Recursive mapping for excluded types - only valid DNR resource types
// Valid DNR resource types per Chrome extension API:
// https://developer.chrome.com/docs/extensions/reference/declarativeNetRequest/#type-RuleCondition
const ALL_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
  'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket',
  'webtransport', 'webbundle', 'other'
];

// ABP option name -> canonical ABP resource name before RESOURCE_TYPE_MAP lookup
const TYPE_ALIASES = {
  css: 'stylesheet',
  xhr: 'xmlhttprequest',
  frame: 'sub_frame',
  doc: 'document',
  beacon: 'ping',
  popup: 'document',
  webrtc: 'other',
  websocket: 'websocket',
  webtransport: 'webtransport',
  webbundle: 'webbundle'
};

const VALID_REQUEST_METHODS = ['connect', 'delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'other'];

/**
 * Split a "$domain=a.com|~b.com" style option value.
 * Public-suffix wildcards (shell.*, gmx.*) cannot be expressed in DNR and are
 * dropped instead of being widened into an over-broad rule.
 */
function splitDomainOption(value) {
  const domains = [];
  const excludedDomains = [];
  const dropped = [];
  for (const part of String(value).split('|')) {
    let entry = part.trim();
    if (!entry) continue;
    const excluded = entry.startsWith('~');
    if (excluded) entry = entry.slice(1);
    if (entry.includes('*') || !/^[a-z0-9.-]+$/i.test(entry)) {
      dropped.push(entry);
      continue;
    }
    const clean = entry.toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    if (!clean) continue;
    if (excluded) excludedDomains.push(clean);
    else domains.push(clean);
  }
  return { domains, excludedDomains, dropped };
}


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
    requestDomains: [],
    methods: [],
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
    important: false,
    unsupported: false,
    allTypes: false
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
          const split = splitDomainOption(value);
          options.domains.push(...split.domains);
          options.excludedDomains.push(...split.excludedDomains);
        }
        break;
      case '~domain':
        if (value) {
          const split = splitDomainOption(value);
          options.excludedDomains.push(...split.domains);
        }
        break;

      // Resource type options (ABP/uBO/AdGuard names and short aliases)
      case 'script':
      case 'image':
      case 'stylesheet':
      case 'css':
      case 'object':
      case 'object-subrequest':
      case 'xmlhttprequest':
      case 'xhr':
      case 'subdocument':
      case 'frame':
      case 'document':
      case 'doc':
      case 'other':
      case 'font':
      case 'media':
      case 'websocket':
      case 'webrtc':
      case 'webtransport':
      case 'webbundle':
      case 'ping':
      case 'beacon':
      case 'popup':
      case 'elemhide':
      case 'all':
        if (key === 'all') {
          options.resourceTypes = ALL_RESOURCE_TYPES.slice();
          options.allTypes = true;
          break;
        }
        options.resourceTypes.push(TYPE_ALIASES[key] || key);
        break;

      // Cosmetic/content-op hints (handled by cosmetic layer): the network
      // request itself still blocks like uBO ($generichide only skips *generic*
      // hiding, enforced via #@# rules in the cosmetic engine).
      case 'generichide':
      case 'genericblock':
      case 'specifichide':
      case 'ghide':
        break;

      case 'ehide':
      case 'shide':
      case 'inline-script':
      case 'inline-font':
      case 'webrtc':
      case 'sitekey':
      case 'cookie':
      case 'badfilter':
      case 'empty':
      case 'mp4':
        options.unsupported = true;
        break;

      // $csp=... cannot be represented in DNR
      case 'csp':
        if (value) options.unsupported = true;
        break;

      // Response-rewriting / non-DNR-expressible options: dropping the
      // option INVERTS the filter's meaning (e.g. $replace rewrites ad
      // placeholders inside a response - converting it to a block rule
      // takes down the whole endpoint, like YouTube's /youtubei API).
      case 'replace':
      case 'uritransform':
      case 'uritransition':
      case 'jsonprune':
      case 'permissions':
      case 'deduplicate':
      case 'redirect-rule':
      case 'noop':
        options.unsupported = true;
        break;

      // $removeparam=... -> redirect with a query transform
      case 'removeparam':
        if (value) {
          options.removeParams = value.split('|').map(p => p.trim()).filter(p => /^[a-zA-Z0-9_.-]+$/.test(p));
          if (options.removeParams.length === 0) options.unsupported = true;
        }
        break;

      // $to=example.com -> requestDomains, $from=example.com -> initiator doms
      case 'to':
        if (value) options.requestDomains.push(...splitDomainOption(value).domains);
        break;
      case 'from':
        if (value) options.domains.push(...splitDomainOption(value).domains);
        break;

      case 'important':
        options.important = true;
        break;
      case '~important':
        options.unsupported = true;
        break;
      case 'first-party':
      case '1p':
        options.domainType = 'firstParty';
        break;
      case '~first-party':
      case '~1p':
        options.domainType = 'thirdParty';
        break;

      case '~script':
      case '~image':
      case '~stylesheet':
      case '~css':
      case '~object':
      case '~xmlhttprequest':
      case '~xhr':
      case '~object-subrequest':
      case '~subdocument':
      case '~frame':
      case '~document':
      case '~doc':
      case '~elemhide':
      case '~other':
      case '~font':
      case '~media':
      case '~websocket':
      case '~ping':
      case '~beacon':
      case '~csp':
      case '~popup':
        options.excludedResourceTypes.push(TYPE_ALIASES[key.slice(1)] || key.slice(1));
        break;

      // Third-party options
      case 'third-party':
      case '3p':
        options.domainType = 'thirdParty';
        break;
      case '~third-party':
      case '~3p':
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

      // Redirects need bundled surrogate files: treat as plain block rules.
      case 'redirect':
      case 'redirect-rule':
        options.redirect = value || null;
        break;

    }
  }
}

/**
 * Convert an ABP url pattern into a DNR urlFilter.
 * DNR supports the same core syntax (`*`, `^`, `|`, `||`), so the pattern is
 * only cleaned up - never truncated, which is what made older builds over-block.
 *
 * @param {string} pattern - ABP url pattern (without options)
 * @returns {string|null} DNR urlFilter or null when it cannot be represented
 */
export function convertToUrlFilter(pattern, options = {}) {
  if (pattern === undefined || pattern === null) return null;
  let urlFilter = String(pattern).trim();

  if (urlFilter === '' || urlFilter === '*') return '*';
  if (isRegexFilter(urlFilter)) return null; // handled by convertToRegexFilter()

  // '~' is ABP-only negation syntax, never valid inside a DNR urlFilter
  if (urlFilter.includes('~')) return null;
  // ASCII only (Chrome requirement)
  if (!isAsciiPattern(urlFilter)) return null;

  // Collapse wildcard runs ('**' is invalid, '***' is meaningless)
  urlFilter = urlFilter.replace(/\*{2,}/g, '*');

  // A trailing '|' anchors to the end of the URL, which DNR cannot express
  urlFilter = urlFilter.replace(/\|+$/, '');
  // Only a single leading '|' or the '||' domain anchor are valid
  urlFilter = urlFilter.replace(/^\|(?!\|)/, '|');

  if (urlFilter === '' || urlFilter === '*' || urlFilter === '|' || urlFilter === '||' || urlFilter === '^') {
    return '*';
  }
  return urlFilter;
}

export function isRegexFilter(pattern) {
  return typeof pattern === 'string' && pattern.length > 2 && pattern.startsWith('/') && pattern.endsWith('/');
}

export function isAsciiPattern(value) {
  return !/[\u0000-\u001f\u007f-\uffff]/.test(value);
}

/**
 * Check whether a regex can run on Chrome's RE2 engine.
 */
export function isRe2Safe(pattern) {
  if (!pattern || !isAsciiPattern(pattern)) return false;
  // Reject lookahead/lookbehind only — (?:...) and (?P<name>...) ARE valid RE2.
  if (/\(\?[=!]|\(\?<[=!]/.test(pattern)) return false;
  if (/\\[1-9]/.test(pattern)) return false;     // backreferences
  if (/\\$/.test(pattern)) return false;         // trailing escape swallows the closing quote
  return true;
}

/**
 * Chrome load-time check for regexFilter (RE2 subset, <=1024 chars, compilable).
 * Returns an error string, or null when the pattern is safe to ship.
 */
export function validateRegexFilter(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0) return 'empty regexFilter';
  if (pattern.length > 1024) return `regexFilter exceeds 1024 chars (${pattern.length})`;
  if (!isAsciiPattern(pattern)) return 'regexFilter is not ASCII';
  if (!isRe2Safe(pattern)) return 'regexFilter uses RE2-unsupported construct';
  try {
    // RE2 named groups (?P<n>) do not compile in JS — translate for the probe.
    // eslint-disable-next-line no-unused-vars
    const _probe = new RegExp(pattern.replace(/\(\?P</g, '(?<'));
  } catch (e) {
    return `regexFilter not compilable: ${e.message}`;
  }
  return null;
}

/**
 * Extract the source of an ABP regex filter ('/foo/' -> 'foo').
 */
export function convertToRegexFilter(pattern) {
  if (!isRegexFilter(pattern)) return null;
  const source = pattern.slice(1, -1);
  if (source.length === 0 || source.length > 1024) return null;
  if (!isRe2Safe(source)) return null;
  try {
    // eslint-disable-next-line no-unused-vars
    const _probe = new RegExp(source.replace(/\(\?P</g, '(?<'));
  } catch {
    return null;
  }
  return source;
}


/**
 * Convert parsed ABP filter to DNR rule
 * @param {Object} parsed - Parsed filter from parseAbpFilter
 * @param {number} ruleId - Unique rule ID
 * @param {string} listKey - Filter list key
 * @param {string} originalFilter - Original filter string (for proper urlFilter)
 * @returns {Object|null} DNR rule or null if invalid
 */
export function createDnrRule(parsed, ruleId, listKey = '', originalFilter = '') {
  if (!parsed || !parsed.options) return null;
  const { urlPattern, options, isException } = parsed;
  if (options.unsupported) return null;

  // Prefer the original filter text: it still carries the ||domain^ prefix
  // that parseAbpFilter() split off.
  const rawFilter = originalFilter || urlPattern || '';
  const urlPart = rawFilter.split('$')[0].trim();

  const condition = {};
  if (isRegexFilter(urlPart)) {
    const regexSource = convertToRegexFilter(urlPart);
    if (!regexSource) return null;
    condition.regexFilter = regexSource;
  } else {
    const urlFilter = convertToUrlFilter(urlPart, options);
    if (!urlFilter) return null;
    condition.urlFilter = urlFilter;
  }

  // Resource types: only set them when the filter is type-specific, otherwise
  // the rule applies to every request type (same as Brave/uBO defaults).
  const toDnrTypes = (types) => [...new Set(types.map(t => RESOURCE_TYPE_MAP[t] || t))].filter(t => ALL_RESOURCE_TYPES.includes(t));
  if (options.resourceTypes.length > 0) {
    const types = toDnrTypes(options.resourceTypes);
    if (types.length === 0) return null;
    condition.resourceTypes = types;
  }
  if (options.excludedResourceTypes.length > 0) {
    const excluded = toDnrTypes(options.excludedResourceTypes);
    if (excluded.length > 0) condition.excludedResourceTypes = excluded;
  }

  // Initiator restrictions come from $domain= / $from= only.
  // parsed.domains holds the ||domain^ part, which describes the *request*
  // URL; without the original filter text it becomes a requestDomains filter.
  const initiatorDomains = [...new Set(options.domains)];
  const excludedInitiatorDomains = [...new Set(options.excludedDomains)];
  const requestDomains = [...new Set([
    ...options.requestDomains,
    ...(originalFilter ? [] : parsed.domains)
  ])];
  if (initiatorDomains.length > 0) condition.domains = initiatorDomains;
  if (excludedInitiatorDomains.length > 0) condition.excludedDomains = excludedInitiatorDomains;
  if (requestDomains.length > 0) condition.requestDomains = requestDomains;
  if (options.methods.length > 0) condition.requestMethods = [...new Set(options.methods)];
  if (options.domainType === 'firstParty' || options.domainType === 'thirdParty') {
    condition.domainType = options.domainType;
  }
  if (options.matchCase) condition.isUrlFilterCaseSensitive = true;

  // Action
  let action;
  let priority = isException ? 2 : 1;
  if (isException) {
    action = { type: 'allow' };
  } else if (options.removeParams.length > 0) {
    // $removeparam -> strip the query parameter with a URL transform
    action = { type: 'redirect', redirect: { transform: { queryTransform: { removeParams: options.removeParams } } } };
  } else {
    // $redirect needs a bundled surrogate resource: block instead of breaking
    action = { type: 'block' };
  }
  if (options.important) priority += 2;

  return { id: ruleId, priority, action, condition };
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
  if (!rule.id || typeof rule.id !== 'number' || !Number.isInteger(rule.id) || rule.id < 1) return false;
  if (!rule.action || !rule.action.type) return false;
  if (!rule.condition || (!rule.condition.urlFilter && !rule.condition.regexFilter)) return false;
  if (rule.condition.resourceTypes !== undefined &&
      (!Array.isArray(rule.condition.resourceTypes) || rule.condition.resourceTypes.length === 0)) return false;
  return true;
}

/**
 * Collect the targets of $badfilter lines so the build script can drop both
 * the cancelled filter and the badfilter itself.
 */
export function collectBadFilters(text) {
  const bad = new Set();
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) continue;
    const optionIndex = trimmed.indexOf('$');
    if (optionIndex === -1) continue;
    const options = trimmed.slice(optionIndex + 1).split(',').map(o => o.trim());
    if (!options.includes('badfilter')) continue;
    bad.add(trimmed.slice(0, optionIndex));
  }
  return bad;
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
  convertToRegexFilter,
  isRegexFilter,
  isRe2Safe,
  validateRegexFilter,
  isAsciiPattern,
  createDnrRule,
  parseFilterList,
  collectBadFilters,
  validateDnrRule,
  filterValidRules,
  RESOURCE_TYPE_MAP,
  ALL_RESOURCE_TYPES
};