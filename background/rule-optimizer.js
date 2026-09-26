/**
 * Rule Optimizer - validates, normalizes and compacts declarativeNetRequest rules.
 *
 * The same module is used by the runtime (dynamic rules) and by the offline
 * build script (build-rules.js) so both paths emit identical, valid rules.
 * It deliberately has no chrome.* dependency.
 */

// Chrome resource types: extensions/common/api/declarative_net_request.idl
export const VALID_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
  'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket',
  'webtransport', 'webbundle', 'other'
];

export const VALID_ACTION_TYPES = [
  'block', 'redirect', 'allow', 'upgradeScheme', 'modifyHeaders', 'allowAllRequests'
];

export const VALID_REQUEST_METHODS = [
  'connect', 'delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'other'
];

const CONDITION_KEYS = new Set([
  'urlFilter', 'regexFilter', 'isUrlFilterCaseSensitive',
  'initiatorDomains', 'excludedInitiatorDomains',
  'requestDomains', 'excludedRequestDomains',
  'resourceTypes', 'excludedResourceTypes',
  'requestMethods', 'excludedRequestMethods',
  'domainType', 'tabIds', 'excludedTabIds',
  'domains', 'excludedDomains'
]);

const ACTION_KEYS = new Set(['type', 'redirect', 'requestHeaders', 'responseHeaders']);
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
const MAX_RULE_ID = 2147483647;

// ID ranges keep static, dynamic and user rules apart (rule ids must be unique).
export const ID_RANGES = {
  staticBase: 100000,           // one 100k slot per static ruleset
  runtimeUpdateBase: 100000000, // fetched list updates
  customBase: 900000000,        // user custom rules
  allowlistBase: 950000000,     // per-site shields / allowlist
  sessionBase: 990000000        // temporary/session rules
};

function isAscii(value) {
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001f\u007f-\uffff]/.test(value);
}

/**
 * regexFilter must compile as RE2. Chromium rejects lookaheads/lookbehinds
 * and backreferences, and a trailing backslash makes the whole extension
 * fail to load - so validate here and never emit a broken regex.
 */
export function isValidRegexFilter(re) {
  if (typeof re !== 'string' || re.length === 0 || re.length > 1024) return false;
  if (!isAscii(re)) return false;
  // Lookahead/lookbehind only — (?:...) and (?P<name>...) ARE valid RE2.
  if (/\(\?[=!]|\(\?<[=!]/.test(re)) return false;
  if (/\\[1-9]/.test(re)) return false;    // backreference
  if (/\\$/.test(re)) return false;        // trailing escape breaks Chrome RE2 load
  try {
    new RegExp(re.replace(/\(\?P</g, '(?<'));
    return true;
  } catch {
    return false;
  }
}

function isValidDomain(domain) {
  return typeof domain === 'string' && domain.length > 0 && domain.length <= 253 &&
    isAscii(domain) && DOMAIN_RE.test(domain);
}

function cleanDomainList(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    const domain = entry.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    if (!isValidDomain(domain)) continue;
    if (!out.includes(domain)) out.push(domain);
  }
  return out.length > 0 ? out : null;
}

export function isValidUrlFilter(urlFilter) {
  if (typeof urlFilter !== 'string' || urlFilter.length === 0) return false;
  if (!isAscii(urlFilter)) return false;
  if (urlFilter.includes('~') || urlFilter.includes('**')) return false;
  for (let i = 0; i < urlFilter.length; i++) {
    if (urlFilter[i] === '|' && i !== 0 && i !== 1) return false;
  }
  if (urlFilter.startsWith('||') && (urlFilter[2] === '*' || urlFilter[2] === '^')) return false;
  return true;
}

/**
 * Classify a ||-anchored urlFilter's host: the host string when it has at
 * least two labels (a real domain requests may be pinned to), false when the
 * anchor is a bare TLD like ||com^ (matches half the internet - never safe),
 * and null when the filter is not ||-anchored.
 */
export function urlFilterAnchorHost(urlFilter) {
  if (typeof urlFilter !== 'string' || !urlFilter.startsWith('||')) return null;
  const raw = urlFilter.slice(2).split(/[\/^*|?#[\]]/)[0].toLowerCase();
  if (!raw || !raw.includes('.')) return false;
  return raw;
}

/**
 * Query params that are safe to strip from ANY request (well-known tracking
 * parameters only). Global removeparam rules with arbitrary names (AID, CID,
 * CP, source, ...) strip signature/token parameters from signed image and
 * video URLs and break media loading - they are only safe on navigations or
 * when domain-scoped by the list that wrote them.
 */
export const SAFE_STRIP_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic', 'utm_experiment',
  'utm_social', 'utm_brand', 'utm_campaign_id', 'utm_placeholder',
  'gclid', 'gclsrc', 'dclid', 'wbraid', 'gbraid', 'yclid', 's_kwcid',
  'fbclid', 'igshid', 'igsh', 'twclid', 'ttclid', 'tclid', 'li_fat_id',
  'msclkid', 'cvid', 'ocid', 'mc_cid', 'mc_eid', 'mkt_tok', 'vero_id', 'vero_conv',
  'elqtrackid', 'elqtrack', '_hsenc', '_hsmi', 'hsctatracking', 'hsa_cam', 'hsa_grp',
  'hsa_ad', 'hsa_src', 'hsa_tgt', 'hsa_kw', 'hsa_mt', 'hsa_net', 'hsa_ver', 'hsa_acc',
  'ascsubtag', 'pd_rd_w', 'pd_rd_r', 'pf_rd_p', 'pf_rd_r', 'pf_rd_s', 'psc', 'smid',
  'spia', 'sr_id', 'rb_clickid', 'sscid', 'oly_anon_id', 'oly_enc_id', 'epik', 'sc_eh',
  'rdtcid', 'sp_cm_campaign', 'spm', 'spm_id_from', 'vd_source', 'share_source',
  'vn_cid', 'trk_contact', 'trk_msg', 'trk_module', 'trk_sid', 'gdfbclk', 'wickedid',
  'tw_adid', 'tw_campaign', 'originalreferer', 'googleanalytics__ga', 'yclid2'
]);

/**
 * Redirect-transform (query stripping) rules are safe only when:
 *   - domain-scoped by the list that wrote them (requestDomains present), or
 *   - they strip well-known tracking params and act on navigations only.
 * Everything else is repaired: params filtered to the whitelist and the rule
 * restricted to main_frame.
 */
function enforceRedirectSafety(condition, action) {
  if (action.type !== 'redirect') return true;
  const qt = action.redirect?.transform?.queryTransform;
  if (!qt || !Array.isArray(qt.removeParams)) return true;

  const scoped = (condition.requestDomains || []).some((d) => d.includes('.'));
  if (scoped) return true;

  const kept = qt.removeParams.filter((p) => SAFE_STRIP_PARAMS.has(String(p).toLowerCase()));
  if (kept.length === 0) return false;
  if (kept.length !== qt.removeParams.length) qt.removeParams = kept;
  condition.resourceTypes = ['main_frame'];
  return true;
}

/**
 * Block rules must never be able to take down whole sites. Enforced here so
 * the build pipeline, custom subscriptions and runtime rules are all covered:
 *   - Wildcard-everything blocks (urlFilter "*" / regex ".*") are dropped
 *     unless pinned to hosts via requestDomains/initiatorDomains.
 *   - TLD-wide anchors (||com^, ||com/) are dropped outright - they match
 *     every site under that TLD.
 *   - Otherwise, main_frame blocking requires the request host to be pinned
 *     by a multi-label || anchor or multi-label requestDomains. Unscoped
 *     rules keep blocking subresources but can no longer break navigation.
 */
function enforceBlockSafety(condition, action) {
  if (action.type !== 'block') return true;

  const scope = (condition.requestDomains || []).filter((d) => d.includes('.'));
  const initiatorScope = condition.initiatorDomains || [];
  const wild = condition.urlFilter === '*' || condition.regexFilter === '.*';
  const anchor = urlFilterAnchorHost(condition.urlFilter);
  const pinned = scope.length > 0 || typeof anchor === 'string';

  if (wild && scope.length === 0 && initiatorScope.length === 0) return false;
  if (anchor === false) return false;

  const effectiveMain = !condition.resourceTypes || condition.resourceTypes.includes('main_frame');
  if (effectiveMain && !pinned) {
    if (condition.resourceTypes) {
      const rest = condition.resourceTypes.filter((t) => t !== 'main_frame');
      if (rest.length === 0) return false;
      condition.resourceTypes = rest;
    } else {
      condition.resourceTypes = VALID_RESOURCE_TYPES.filter((t) => t !== 'main_frame');
    }
  }
  return true;
}

/**
 * Validate a single rule. Returns an array of problems (empty = valid).
 */
export function validateRule(rule) {
  const errors = [];
  if (!rule || typeof rule !== 'object') return ['rule must be an object'];
  const id = rule.id;
  if (!Number.isInteger(id) || id < 1 || id > MAX_RULE_ID) errors.push(`invalid id: ${id}`);
  if (rule.priority !== undefined && (!Number.isInteger(rule.priority) || rule.priority < 1)) {
    errors.push(`invalid priority: ${rule.priority}`);
  }
  const action = rule.action;
  if (!action || !VALID_ACTION_TYPES.includes(action.type)) {
    errors.push(`invalid action.type: ${action && action.type}`);
  } else {
    for (const key of Object.keys(action)) {
      if (!ACTION_KEYS.has(key)) errors.push(`unsupported action key: ${key}`);
    }
    if (action.type === 'redirect' && (!action.redirect || !Object.keys(action.redirect).length)) {
      errors.push('redirect action without payload');
    }
    if (action.type === 'modifyHeaders' && !action.requestHeaders && !action.responseHeaders) {
      errors.push('modifyHeaders without headers');
    }
  }
  const condition = rule.condition;
  if (!condition || typeof condition !== 'object') {
    errors.push('missing condition');
    return errors;
  }
  for (const key of Object.keys(condition)) {
    if (!CONDITION_KEYS.has(key)) errors.push(`unsupported condition key: ${key}`);
  }
  const urlFilter = condition.urlFilter;
  const regexFilter = condition.regexFilter;
  if (urlFilter === undefined && regexFilter === undefined) errors.push('missing urlFilter/regexFilter');
  if (urlFilter !== undefined && regexFilter !== undefined) errors.push('both urlFilter and regexFilter');
  if (urlFilter !== undefined && !isValidUrlFilter(urlFilter)) errors.push(`invalid urlFilter: ${urlFilter}`);
  if (regexFilter !== undefined && !isValidRegexFilter(regexFilter)) {
    errors.push(`invalid regexFilter: ${regexFilter}`);
  }
  for (const key of ['initiatorDomains', 'excludedInitiatorDomains', 'requestDomains', 'excludedRequestDomains']) {
    const list = condition[key];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length === 0) errors.push(`${key} must be a non-empty array`);
    else if (list.some((d) => !isValidDomain(d))) errors.push(`${key} contains invalid domains`);
  }
  if (condition.resourceTypes !== undefined) {
    if (!Array.isArray(condition.resourceTypes) || condition.resourceTypes.length === 0) {
      errors.push('resourceTypes must be a non-empty array');
    } else if (condition.resourceTypes.some((t) => !VALID_RESOURCE_TYPES.includes(t))) {
      errors.push('resourceTypes contains invalid values');
    }
    if (action && action.type === 'allowAllRequests' &&
        condition.resourceTypes.some((t) => t !== 'main_frame' && t !== 'sub_frame')) {
      errors.push('allowAllRequests only supports main_frame/sub_frame');
    }
  } else if (action && action.type === 'allowAllRequests') {
    errors.push('allowAllRequests requires resourceTypes');
  }
  if (condition.excludedResourceTypes &&
      (!Array.isArray(condition.excludedResourceTypes) ||
       condition.excludedResourceTypes.some((t) => !VALID_RESOURCE_TYPES.includes(t)))) {
    errors.push('excludedResourceTypes contains invalid values');
  }
  for (const key of ['requestMethods', 'excludedRequestMethods']) {
    if (condition[key] &&
        (!Array.isArray(condition[key]) || condition[key].some((m) => !VALID_REQUEST_METHODS.includes(m)))) {
      errors.push(`${key} contains invalid methods`);
    }
  }
  if (condition.domainType !== undefined && !['firstParty', 'thirdParty'].includes(condition.domainType)) {
    errors.push(`invalid domainType: ${condition.domainType}`);
  }
  return errors;
}

/**
 * Normalize a rule: migrate deprecated keys, drop empty/invalid lists,
 * return null when the rule cannot be represented in DNR.
 */
export function sanitizeRule(rule) {
  if (!rule || typeof rule !== 'object') return null;
  const condition = { ...(rule.condition || {}) };
  const action = { ...(rule.action || {}) };

  // 'domains' is the deprecated alias of initiatorDomains
  if (condition.domains) condition.initiatorDomains = [...(condition.initiatorDomains || []), ...condition.domains];
  if (condition.excludedDomains) {
    condition.excludedInitiatorDomains = [...(condition.excludedInitiatorDomains || []), ...condition.excludedDomains];
  }
  delete condition.domains;
  delete condition.excludedDomains;

  const hadIncludeList = Boolean(condition.initiatorDomains || condition.requestDomains);
  for (const key of ['initiatorDomains', 'excludedInitiatorDomains', 'requestDomains', 'excludedRequestDomains']) {
    if (!(key in condition)) continue;
    const cleaned = cleanDomainList(condition[key]);
    if (cleaned) condition[key] = cleaned;
    else {
      delete condition[key];
      if (key === 'initiatorDomains' || key === 'requestDomains') return null; // would match everything
    }
  }
  if (hadIncludeList && !condition.initiatorDomains && !condition.requestDomains &&
      !condition.excludedInitiatorDomains && !condition.excludedRequestDomains) {
    return null;
  }

  if (!action.type || !VALID_ACTION_TYPES.includes(action.type)) return null;

  if (condition.resourceTypes) {
    let types = [...new Set(condition.resourceTypes)].filter((t) => VALID_RESOURCE_TYPES.includes(t));
    if (action.type === 'allowAllRequests') types = types.filter((t) => t === 'main_frame' || t === 'sub_frame');
    if (types.length === 0) return null;
    condition.resourceTypes = types;
  } else if (action.type === 'allowAllRequests') {
    condition.resourceTypes = ['main_frame'];
  }
  if (condition.excludedResourceTypes) {
    const excluded = [...new Set(condition.excludedResourceTypes)].filter((t) => VALID_RESOURCE_TYPES.includes(t));
    if (excluded.length === 0) delete condition.excludedResourceTypes;
    else condition.excludedResourceTypes = excluded;
  }
  for (const key of ['requestMethods', 'excludedRequestMethods']) {
    if (!condition[key]) continue;
    const methods = [...new Set(condition[key])].filter((m) => VALID_REQUEST_METHODS.includes(m));
    if (methods.length === 0) delete condition[key];
    else condition[key] = methods;
  }
  if (condition.domainType && !['firstParty', 'thirdParty'].includes(condition.domainType)) {
    delete condition.domainType;
  }

  // ASCII-only: strip urlFilters we cannot represent
  if (typeof condition.urlFilter === 'string' && !isValidUrlFilter(condition.urlFilter)) {
    delete condition.urlFilter;
  }
  // Repair or drop regexFilters Chrome would reject outright.
  // Trailing-escape patterns (e.g. /...\/) fail RE2 in DNR; only strip
  // *lone* trailing backslashes, never a legitimate \/ path separator (uBO
  // emits those in img/ad-path filters that must keep matching).
  if (typeof condition.regexFilter === 'string') {
    condition.regexFilter = condition.regexFilter.replace(/(^|[^\\])(?:\\\\)*\\$/, '$1');
    if (!isValidRegexFilter(condition.regexFilter)) delete condition.regexFilter;
  }
  if (!condition.urlFilter && !condition.regexFilter) return null;

  // Never emit block rules that can take down whole sites (ERR_BLOCKED_BY_CLIENT
  // for every page): filter lists occasionally contain ||com^$document or bare
  // wildcard rules that must not survive verbatim into DNR.
  if (!enforceBlockSafety(condition, action)) return null;

  // Query-stripping transforms must never touch signed media/image URLs:
  // global (unscoped) strips are whitelisted to known tracking params and
  // restricted to navigations.
  if (!enforceRedirectSafety(condition, action)) return null;

  if (action.redirect) {
    const redirect = { ...action.redirect };
    for (const key of Object.keys(redirect)) {
      if (!['url', 'extensionPath', 'transform'].includes(key)) delete redirect[key];
    }
    if (Object.keys(redirect).length === 0) return null;
    action.redirect = redirect;
  }


  // Chrome rejects rules where the same value appears in both an include
  // and an exclude list ("includes and excludes the same resource").
  // Honor the negation: drop overlapped values from the include list;
  // if nothing remains to include, the rule cannot be expressed - drop it.
  const includeExcludePairs = [
    ['resourceTypes', 'excludedResourceTypes'],
    ['requestDomains', 'excludedRequestDomains'],
    ['initiatorDomains', 'excludedInitiatorDomains'],
    ['requestMethods', 'excludedRequestMethods'],
    ['tabIds', 'excludedTabIds']
  ];
  for (const [incKey, excKey] of includeExcludePairs) {
    if (!Array.isArray(condition[incKey]) || !Array.isArray(condition[excKey])) continue;
    const filtered = condition[incKey].filter((v) => !condition[excKey].includes(v));
    if (filtered.length === 0) return null;
    condition[incKey] = filtered;
  }

  const sanitized = { id: rule.id, priority: rule.priority || 1, action, condition };
  return validateRule(sanitized).length === 0 ? sanitized : null;
}

export class RuleOptimizer {
  /** Remove duplicates (same action + condition) and invalid rules. */
  dedupe(rules) {
    const seen = new Set();
    const out = [];
    for (const rule of rules) {
      const sanitized = sanitizeRule(rule);
      if (!sanitized) continue;
      const key = JSON.stringify([sanitized.action, sanitized.condition, sanitized.priority]);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(sanitized);
    }
    return out;
  }

  /** Sanitize + dedupe + assign ids from a base offset. */
  optimize(rules, listKey = '', baseId = null) {
    const cleaned = this.dedupe(rules);
    const base = baseId === null ? (ID_RANGES.runtimeUpdateBase + this.hashOffset(listKey)) : baseId;
    let next = base;
    for (const rule of cleaned) {
      rule.id = next++;
      if (rule.id > MAX_RULE_ID - 1) rule.id = MAX_RULE_ID - 1;
    }
    return cleaned;
  }

  hashOffset(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) % 900000;
    }
    return hash * 100;
  }

  /** Split rules into chunks accepted by updateDynamicRules(). */
  chunk(rules, size = 4000) {
    const chunks = [];
    for (let i = 0; i < rules.length; i += size) chunks.push(rules.slice(i, i + size));
    return chunks;
  }
}

export default { RuleOptimizer, sanitizeRule, validateRule, isValidUrlFilter, ID_RANGES, VALID_RESOURCE_TYPES };
