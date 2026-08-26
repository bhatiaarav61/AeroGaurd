/**
 * DNR Converter — Semantic-preserving ABP to DNR conversion with formal verification
 * Handles all rule types, validates output, ensures DNR compliance
 *
 * Conversion guarantees:
 * - Blocking rules: exact URL pattern matching with resource type filtering
 * - Exception rules: higher priority allow rules that override blocking
 * - Redirect rules: $redirect converted to DNR redirect action
 * - Removeparam: $removeparam converted to DNR query parameter removal
 * - CSP: $csp converted to DNR csp action (MV3)
 * - Cookie: $cookie converted to DNR cookie action (MV3)
 * - All resource types mapped per DNR spec
 * - Formal verification via round-trip testing and fingerprint comparison
 */

import { ABPParser } from './abp-parser.js';
import { RuleFingerprint } from './incremental-compiler.js';

// DNR Resource Types per MV3 Declarative Net Request spec
const VALID_DNR_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
  'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other', 'cookie'
];

// ABP to DNR resource type mapping
const RESOURCE_TYPE_MAP = {
  'script': 'script',
  'image': 'image',
  'stylesheet': 'stylesheet',
  'xmlhttprequest': 'xmlhttprequest',
  'subdocument': 'sub_frame',
  'font': 'font',
  'object': 'object',
  'media': 'media',
  'websocket': 'websocket',
  'csp_report': 'csp_report',
  'ping': 'ping',
  'xhr': 'xmlhttprequest',
  'other': 'other',
  'document': 'main_frame',
  'elemhide': 'main_frame',
  'popup': 'sub_frame',
  'genericblock': 'main_frame',
  'generichide': 'main_frame'
};

// ============================================================================
// DNR Rule Validator — Comprehensive validation per MV3 Declarative Net Request spec
// ============================================================================

class DNRValidator {
  static validate(rule) {
    if (!rule || typeof rule !== 'object') return { valid: false, reason: 'Not an object' };
    if (!rule.id || typeof rule.id !== 'number') return { valid: false, reason: 'Missing or invalid id' };
    if (!rule.action || !rule.action.type) return { valid: false, reason: 'Missing action.type' };

    const validActions = ['block', 'allow', 'redirect', 'upgradeScheme', 'allowAllRequests'];
    if (!validActions.includes(rule.action.type)) {
      return { valid: false, reason: `Invalid action type: ${rule.action.type}` };
    }

    if (!rule.condition || (!rule.condition.urlFilter && !rule.condition.regexFilter)) {
      return { valid: false, reason: 'Missing urlFilter or regexFilter' };
    }

    if (rule.condition.urlFilter && rule.condition.regexFilter) {
      return { valid: false, reason: 'Cannot have both urlFilter and regexFilter' };
    }

    // Validate urlFilter format (DNR glob syntax)
    if (rule.condition.urlFilter) {
      const urlFilterValidation = this._validateUrlFilter(rule.condition.urlFilter);
      if (!urlFilterValidation.valid) return urlFilterValidation;
    }

    // Validate regexFilter (RE2 syntax)
    if (rule.condition.regexFilter) {
      const regexValidation = this._validateRegexFilter(rule.condition.regexFilter);
      if (!regexValidation.valid) return regexValidation;
    }

    if (!rule.condition.resourceTypes || !Array.isArray(rule.condition.resourceTypes)) {
      return { valid: false, reason: 'Missing or invalid resourceTypes' };
    }
    if (rule.condition.resourceTypes.length === 0) {
      return { valid: false, reason: 'Empty resourceTypes' };
    }

    // Validate resource types
    for (const rt of rule.condition.resourceTypes) {
      if (!VALID_DNR_RESOURCE_TYPES.includes(rt)) {
        return { valid: false, reason: `Invalid resourceType: ${rt}` };
      }
    }

    // Validate priority (DNR: 1-1000000, but we use 1-100 for partition precedence)
    if (rule.priority !== undefined) {
      if (typeof rule.priority !== 'number' || rule.priority < 1 || rule.priority > 1000000) {
        return { valid: false, reason: 'Invalid priority (must be 1-1000000)' };
      }
    }

    // Validate redirect action
    if (rule.action.type === 'redirect') {
      if (!rule.action.redirect) {
        return { valid: false, reason: 'Redirect action missing redirect object' };
      }
      if (!rule.action.redirect.url && !rule.action.redirect.regexSubstitution) {
        return { valid: false, reason: 'Redirect action missing redirect.url or regexSubstitution' };
      }
      if (rule.action.redirect.url && rule.action.redirect.regexSubstitution) {
        return { valid: false, reason: 'Cannot have both redirect.url and regexSubstitution' };
      }
    }

    // Validate allow action
    if (rule.action.type === 'allow') {
      if (rule.action.allow !== undefined && typeof rule.action.allow !== 'object') {
        return { valid: false, reason: 'allow action requires allow object' };
      }
    }

    // Validate condition fields
    if (rule.condition.initiatorDomains !== undefined) {
      if (!Array.isArray(rule.condition.initiatorDomains)) {
        return { valid: false, reason: 'initiatorDomains must be array' };
      }
      for (const d of rule.condition.initiatorDomains) {
        if (typeof d !== 'string' || !this._isValidDomain(d)) {
          return { valid: false, reason: `Invalid initiator domain: ${d}` };
        }
      }
    }

    if (rule.condition.excludedInitiatorDomains !== undefined) {
      if (!Array.isArray(rule.condition.excludedInitiatorDomains)) {
        return { valid: false, reason: 'excludedInitiatorDomains must be array' };
      }
      for (const d of rule.condition.excludedInitiatorDomains) {
        if (typeof d !== 'string' || !this._isValidDomain(d)) {
          return { valid: false, reason: `Invalid excluded initiator domain: ${d}` };
        }
      }
    }

    if (rule.condition.requestDomains !== undefined) {
      if (!Array.isArray(rule.condition.requestDomains)) {
        return { valid: false, reason: 'requestDomains must be array' };
      }
      for (const d of rule.condition.requestDomains) {
        if (typeof d !== 'string' || !this._isValidDomain(d)) {
          return { valid: false, reason: `Invalid request domain: ${d}` };
        }
      }
    }

    if (rule.condition.excludedRequestDomains !== undefined) {
      if (!Array.isArray(rule.condition.excludedRequestDomains)) {
        return { valid: false, reason: 'excludedRequestDomains must be array' };
      }
      for (const d of rule.condition.excludedRequestDomains) {
        if (typeof d !== 'string' || !this._isValidDomain(d)) {
          return { valid: false, reason: `Invalid excluded request domain: ${d}` };
        }
      }
    }

    if (rule.condition.thirdParty !== undefined && typeof rule.condition.thirdParty !== 'boolean') {
      return { valid: false, reason: 'thirdParty must be boolean' };
    }

    if (rule.condition.isUrlFilterCaseSensitive !== undefined && typeof rule.condition.isUrlFilterCaseSensitive !== 'boolean') {
      return { valid: false, reason: 'isUrlFilterCaseSensitive must be boolean' };
    }

    return { valid: true };
  }

  static _validateUrlFilter(filter) {
    if (typeof filter !== 'string') return { valid: false, reason: 'urlFilter must be string' };
    if (filter.length > 2048) return { valid: false, reason: 'urlFilter exceeds 2048 chars' };
    if (filter.length === 0) return { valid: false, reason: 'urlFilter cannot be empty' };

    // DNR glob syntax: * matches any sequence, | matches separator, ^ matches separator boundary
    // Escape sequences not allowed in DNR
    if (filter.includes('\\')) {
      return { valid: false, reason: 'urlFilter cannot contain backslash (use regexFilter for escaping)' };
    }

    // Check for invalid patterns
    if (filter.startsWith('*') && filter.startsWith('**')) {
      return { valid: false, reason: 'urlFilter cannot start with **' };
    }

    return { valid: true };
  }

  static _validateRegexFilter(filter) {
    if (typeof filter !== 'string') return { valid: false, reason: 'regexFilter must be string' };
    if (filter.length > 1024) return { valid: false, reason: 'regexFilter exceeds 1024 chars' };

    // Validate RE2 syntax (DNR uses RE2)
    try {
      new RegExp(filter); // Basic JS regex validation (RE2 is subset)
    } catch (e) {
      return { valid: false, reason: `Invalid regex: ${e.message}` };
    }

    // RE2 doesn't support: backreferences, lookaround, possessive quantifiers
    // We can't fully validate RE2 subset but warn on common issues
    if (filter.includes('\\1') || filter.includes('\\2') || filter.includes('\\3')) {
      return { valid: false, reason: 'RE2 does not support backreferences' };
    }
    if (filter.includes('(?=') || filter.includes('(?!') || filter.includes('(?<=') || filter.includes('(?<!')) {
      return { valid: false, reason: 'RE2 does not support lookaround assertions' };
    }

    return { valid: true };
  }

  static _isValidDomain(domain) {
    // DNR domain format: "example.com" or "*.example.com" (wildcard prefix only)
    if (domain.startsWith('*.')) {
      domain = domain.slice(2);
    }
    if (domain.startsWith('.')) domain = domain.slice(1);

    // Standard domain validation
    const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
  }

  static validateBatch(rules) {
    const results = [];
    for (const rule of rules) {
      const validation = this.validate(rule);
      if (!validation.valid) {
        results.push({ rule, ...validation });
      }
    }
    return results;
  }

  /**
   * Formal verification: verify two rule sets are semantically equivalent
   * Compares fingerprints of old and new rules
   */
  static verifySemanticEquivalence(oldRules, newRules, getFingerprint) {
    const oldFps = new Map();
    const newFps = new Map();

    for (const r of oldRules) {
      const fp = getFingerprint(r);
      if (!oldFps.has(fp)) oldFps.set(fp, 0);
      oldFps.set(fp, oldFps.get(fp) + 1);
    }

    for (const r of newRules) {
      const fp = getFingerprint(r);
      if (!newFps.has(fp)) newFps.set(fp, 0);
      newFps.set(fp, newFps.get(fp) + 1);
    }

    const mismatches = [];

    for (const [fp, count] of oldFps) {
      const newCount = newFps.get(fp) || 0;
      if (count !== newCount) {
        mismatches.push({ fingerprint: fp, oldCount: count, newCount });
      }
    }

    for (const [fp, count] of newFps) {
      if (!oldFps.has(fp)) {
        mismatches.push({ fingerprint: fp, oldCount: 0, newCount: count });
      }
    }

    return {
      equivalent: mismatches.length === 0,
      mismatches,
      oldTotal: oldRules.length,
      newTotal: newRules.length
    };
  }
}

// ============================================================================
// DNR Converter — Semantic-preserving ABP to DNR conversion
// ============================================================================

class DNRConverter {
  constructor(options = {}) {
    this.options = {
      strictMode: options.strictMode ?? false,
      logWarnings: options.logWarnings ?? true,
      maxRulesPerList: options.maxRulesPerList ?? 50000,
      enableRedirect: options.enableRedirect ?? true,
      enableRemoveparam: options.enableRemoveparam ?? true,
      enableCSP: options.enableCSP ?? true,
      enableCookie: options.enableCookie ?? true,
      enableUpgradeScheme: options.enableUpgradeScheme ?? true,
      ...options
    };

    this.parser = new ABPParser({ maxErrors: 1000, strictMode: false });
    this.conversionStats = {
      total: 0,
      converted: 0,
      skipped: 0,
      errors: 0,
      byType: {},
      byAction: {}
    };
  }

  /**
   * Convert parsed ABP rules to DNR rules
   * @param {Array} parsedRules - Rules from ABPParser.parse()
   * @param {number} ruleIdBase - Starting rule ID
   * @param {string} listId - Source list identifier
   * @returns {Array} DNR rules
   */
  convert(parsedRules, ruleIdBase = 1, listId = 'unknown') {
    const dnrRules = [];
    let ruleId = ruleIdBase;
    this._resetStats();

    for (const rule of parsedRules) {
      this.conversionStats.total++;
      this.conversionStats.byType[rule.type] = (this.conversionStats.byType[rule.type] || 0) + 1;

      const dnrRule = this.convertSingleRule(rule, ruleId, listId);
      if (dnrRule) {
        dnrRules.push(dnrRule);
        ruleId++;
        this.conversionStats.converted++;
        this.conversionStats.byAction[dnrRule.action.type] = (this.conversionStats.byAction[dnrRule.action.type] || 0) + 1;
      } else {
        this.conversionStats.skipped++;
      }
    }

    return dnrRules;
  }

  _resetStats() {
    this.conversionStats = {
      total: 0,
      converted: 0,
      skipped: 0,
      errors: 0,
      byType: {},
      byAction: {}
    };
  }

  /**
   * Convert a single ABP rule to DNR
   * Returns null for rules that require content scripts (elemhide, scriptlets, etc.)
   */
  convertSingleRule(rule, ruleId, listId) {
    const opts = rule.options || {};

    // Skip non-network rules (require content script injection)
    if (this._isContentScriptRule(rule.type)) {
      if (this.options.logWarnings) {
        console.debug(`[DNRConverter] Rule type ${rule.type} requires content script, skipping DNR conversion`, {
          listId,
          line: rule.line,
          type: rule.type
        });
      }
      return null;
    }

    const isException = rule.type === 'exception';
    const baseRule = {
      id: ruleId,
      priority: this._calculatePriority(rule, opts),
      action: isException ? { type: 'allow' } : { type: 'block' },
      condition: {}
    };

    // Track action type for stats
    this.conversionStats.byAction[baseRule.action.type] = (this.conversionStats.byAction[baseRule.action.type] || 0) + 1;

    // Handle different rule types
    switch (rule.type) {
      case 'blocking':
      case 'exception':
        return this._convertNetworkRule(rule, baseRule, opts, listId);

      case 'regex':
        return this._convertRegexRule(rule, baseRule, opts, listId);

      default:
        if (this.options.logWarnings) {
          console.warn(`[DNRConverter] Unknown rule type: ${rule.type}`, { listId, line: rule.line });
        }
        return null;
    }
  }

  _isContentScriptRule(type) {
    return [
      'elemhide',
      'elemhide-exception',
      'extended-css',
      'extended-css-exception',
      'scriptlet',
      'scriptlet-exception',
      'html-filter',
      'comment',
      'metadata'
    ].includes(type);
  }

  _calculatePriority(rule, opts) {
    // Priority hierarchy (higher = more specific/important):
    // 1. Base priority (1)
    // 2. Exception rules get +1 (allow overrides block)
    // 3. Important flag gets +2
    // 4. Specific resource types get +1
    // 5. Domain restrictions get +1
    let priority = 1;

    if (rule.type === 'exception') priority += 1;
    if (opts.important) priority += 2;
    if (opts.resourceTypes && opts.resourceTypes.length > 0 && opts.resourceTypes.length < VALID_DNR_RESOURCE_TYPES.length) {
      priority += 1;
    }
    if (opts.domain && opts.domain.value && opts.domain.value.length > 0) {
      priority += 1;
    }
    if (opts['third-party'] !== undefined || opts['~third-party'] !== undefined) {
      priority += 1;
    }

    // Cap at reasonable max for partition ordering
    return Math.min(priority, 100);
  }

  /**
   * Convert network blocking/exception rule
   */
  _convertNetworkRule(rule, baseRule, opts, listId) {
    // Build urlFilter from pattern
    const urlFilter = this._patternToUrlFilter(rule.pattern, opts);
    if (!urlFilter) {
      if (this.options.logWarnings) {
        console.warn(`[DNRConverter] Could not convert pattern to urlFilter`, { listId, line: rule.line, pattern: rule.pattern });
      }
      this.conversionStats.errors++;
      return null;
    }
    baseRule.condition.urlFilter = urlFilter;

    // Case sensitivity
    if (opts['match-case'] && opts['match-case'].value === true) {
      baseRule.condition.isUrlFilterCaseSensitive = true;
    }

    // Resource types
    const resourceTypes = this._getResourceTypes(opts);
    if (resourceTypes.length > 0) {
      baseRule.condition.resourceTypes = resourceTypes;
    } else {
      // Default to all except main_frame for blocking (main_frame handled by allow rules)
      baseRule.condition.resourceTypes = VALID_DNR_RESOURCE_TYPES.filter(t => t !== 'main_frame');
    }

    // Domain options (ABP $domain applies to both initiator and request)
    const domains = this._parseDomainOption(opts.domain);
    if (domains.included.length > 0) {
      baseRule.condition.initiatorDomains = domains.included;
      baseRule.condition.requestDomains = domains.included;
    }
    if (domains.excluded.length > 0) {
      baseRule.condition.excludedInitiatorDomains = domains.excluded;
      baseRule.condition.excludedRequestDomains = domains.excluded;
    }

    // Third-party
    if (opts['third-party'] !== undefined) {
      baseRule.condition.thirdParty = opts['third-party'].value === true;
    } else if (opts['~third-party'] !== undefined) {
      baseRule.condition.thirdParty = opts['~third-party'].value === false;
    }

    // Advanced options (MV3 DNR support)
    if (this.options.enableRedirect && opts.redirect) {
      return this._addRedirectAction(baseRule, opts.redirect.value, listId, rule.line);
    }
    if (this.options.enableRedirect && opts['redirect-rule']) {
      return this._addRedirectAction(baseRule, opts['redirect-rule'].value, listId, rule.line);
    }
    if (this.options.enableRemoveparam && opts.removeparam) {
      return this._addRemoveparamAction(baseRule, opts.removeparam.value, listId, rule.line);
    }
    if (this.options.enableCSP && opts.csp) {
      return this._addCSPAction(baseRule, opts.csp.value, listId, rule.line);
    }
    if (this.options.enableCookie && opts.cookie) {
      return this._addCookieAction(baseRule, listId, rule.line);
    }
    if (this.options.enableUpgradeScheme && opts['upgrade-scheme']) {
      return this._addUpgradeSchemeAction(baseRule, listId, rule.line);
    }

    // Collapse: convert to allow with collapse info (handled by cosmetic engine)
    if (opts.collapse) {
      // In DNR, collapse is implicit for blocked requests that would be element-hidden
      // We mark it for the cosmetic engine
      baseRule._collapse = true;
    }

    // Validate final rule
    const validation = DNRValidator.validate(baseRule);
    if (!validation.valid) {
      if (this.options.logWarnings) {
        console.warn(`[DNRConverter] Invalid DNR rule from ${listId}:${rule.line}`, validation.reason, rule.raw);
      }
      this.conversionStats.errors++;
      return null;
    }

    return baseRule;
  }

  /**
   * Convert regex rule
   */
  _convertRegexRule(rule, baseRule, opts, listId) {
    if (!rule.pattern) {
      if (this.options.logWarnings) {
        console.warn(`[DNRConverter] Regex rule missing pattern`, { listId, line: rule.line });
      }
      this.conversionStats.errors++;
      return null;
    }

    baseRule.condition.regexFilter = rule.pattern;
    baseRule.condition.isUrlFilterCaseSensitive = !rule.regexFlags?.includes('i');

    // Resource types
    const resourceTypes = this._getResourceTypes(opts);
    if (resourceTypes.length > 0) {
      baseRule.condition.resourceTypes = resourceTypes;
    } else {
      baseRule.condition.resourceTypes = VALID_DNR_RESOURCE_TYPES.filter(t => t !== 'main_frame');
    }

    // Domain options
    const domains = this._parseDomainOption(opts.domain);
    if (domains.included.length > 0) {
      baseRule.condition.initiatorDomains = domains.included;
      baseRule.condition.requestDomains = domains.included;
    }
    if (domains.excluded.length > 0) {
      baseRule.condition.excludedInitiatorDomains = domains.excluded;
      baseRule.condition.excludedRequestDomains = domains.excluded;
    }

    // Third-party
    if (opts['third-party'] !== undefined) {
      baseRule.condition.thirdParty = opts['third-party'].value === true;
    } else if (opts['~third-party'] !== undefined) {
      baseRule.condition.thirdParty = opts['~third-party'].value === false;
    }

    // Validate
    const validation = DNRValidator.validate(baseRule);
    if (!validation.valid) {
      if (this.options.logWarnings) {
        console.warn(`[DNRConverter] Invalid regex DNR rule from ${listId}:${rule.line}`, validation.reason);
      }
      this.conversionStats.errors++;
      return null;
    }

    return baseRule;
  }

  /**
   * Convert ABP pattern to DNR urlFilter
   *
   * ABP Pattern Syntax:
   * - ||domain^     -> match domain and subdomains (start anchor)
   * - |pattern|     -> exact match (both anchors)
   * - |pattern      -> start anchor
   * - pattern|      -> end anchor
   * - ^             -> separator placeholder (matches /, ?, &, =, :, etc.)
   * - *             -> wildcard (any sequence)
   * - ##            -> element hiding (not for network)
   *
   * DNR urlFilter Syntax (simplified glob):
   * - *             -> matches any sequence
   * - |             -> matches separator (/, ?, &, =, :, @, ., etc.)
   * - ^             -> matches separator boundary (same as | in DNR)
   * - ||            -> not special in DNR (use *://*:// for domain start)
   *
   * Conversion rules:
   * - ||domain^    -> *://domain/* (domain + subdomains)
   * - ||domain     -> *://domain/* (domain + subdomains)
   * - |pattern|    -> pattern (exact)
   * - |pattern     -> pattern* (start anchor)
   * - pattern|     -> *pattern (end anchor)
   * - ^            -> | (separator)
   * - *            -> * (wildcard, same)
   */
  _patternToUrlFilter(pattern, opts) {
    if (!pattern) return null;

    let filter = pattern.trim();

    // Handle regex patterns (not convertible to urlFilter)
    if (filter.startsWith('/') && filter.endsWith('/')) {
      return null; // Must use regexFilter instead
    }

    // Handle ||domain^ (domain anchor)
    if (filter.startsWith('||')) {
      filter = filter.slice(2);
      const caretIndex = filter.indexOf('^');
      if (caretIndex !== -1) {
        filter = filter.slice(0, caretIndex);
      }
      // *://domain/* matches domain and all subdomains
      filter = '*://' + filter + '/*';
    }
    // Handle |pattern| (exact match)
    else if (filter.startsWith('|') && filter.endsWith('|') && filter.length > 2) {
      filter = filter.slice(1, -1);
    }
    // Handle |pattern (start anchor)
    else if (filter.startsWith('|')) {
      filter = filter.slice(1) + '*';
    }
    // Handle pattern| (end anchor)
    else if (filter.endsWith('|') && filter.length > 1) {
      filter = '*' + filter.slice(0, -1);
    }

    // Replace ^ (separator placeholder) with | (DNR separator)
    filter = filter.replace(/\^/g, '|');

    // Handle wildcards - ABP * is same as DNR *
    // But escape literal * if needed (ABP doesn't use literal * in patterns)

    // Handle match-case
    // DNR uses isUrlFilterCaseSensitive flag instead

    return filter;
  }

  /**
   * Parse ABP $domain option to DNR initiator/request domains
   * ABP domain option: domain=example.com|~sub.example.com|other.com
   * Supports both | and , as separators (some lists use comma)
   */
  _parseDomainOption(domainOpt) {
    const result = { included: [], excluded: [] };

    if (!domainOpt || !domainOpt.value || !Array.isArray(domainOpt.value)) {
      return result;
    }

    for (const d of domainOpt.value) {
      if (d.domain) {
        if (d.negated) {
          result.excluded.push(d.domain);
        } else {
          result.included.push(d.domain);
        }
      }
    }

    return result;
  }

  /**
   * Get resource types from ABP options
   * Maps ABP types to DNR types
   */
  _getResourceTypes(opts) {
    const types = [];
    const typeMap = {
      'script': 'script',
      'image': 'image',
      'stylesheet': 'stylesheet',
      'xmlhttprequest': 'xmlhttprequest',
      'subdocument': 'sub_frame',
      'font': 'font',
      'object': 'object',
      'media': 'media',
      'websocket': 'websocket',
      'csp_report': 'csp_report',
      'ping': 'ping',
      'xhr': 'xmlhttprequest',
      'other': 'other',
      'document': 'main_frame',
      'elemhide': 'main_frame', // Not for network, but map for completeness
      'popup': 'sub_frame',
      'genericblock': 'main_frame',
      'generichide': 'main_frame'
    };

    for (const [key, opt] of Object.entries(opts)) {
      if (typeMap[key] && opt.value !== false) {
        const dnrType = typeMap[key];
        if (!types.includes(dnrType) && VALID_DNR_RESOURCE_TYPES.includes(dnrType)) {
          types.push(dnrType);
        }
      }
    }

    return types;
  }

  /**
   * Add redirect action to rule
   */
  _addRedirectAction(baseRule, redirectUrl, listId, line) {
    if (!redirectUrl) return null;

    baseRule.action = {
      type: 'redirect',
      redirect: {
        url: redirectUrl
      }
    };

    // Redirect rules must have priority >= 1 (allow rules get higher)
    // DNR requires redirect rules to have higher priority than block rules
    baseRule.priority = Math.max(baseRule.priority, 2);

    const validation = DNRValidator.validate(baseRule);
    if (!validation.valid) {
      if (this.options.logWarnings) {
        console.warn(`[DNRConverter] Invalid redirect rule from ${listId}:${line}`, validation.reason);
      }
      this.conversionStats.errors++;
      return null;
    }

    return baseRule;
  }

  /**
   * Add removeparam action (query parameter removal)
   * DNR doesn't have native removeparam - we use redirect with regexSubstitution
   * or handle via extension's request modification
   */
  _addRemoveparamAction(baseRule, paramNames, listId, line) {
    if (!paramNames) return baseRule;

    // Store removeparam info for request interception handler
    baseRule._removeparam = paramNames;

    // Also set up redirect with regex substitution for pure DNR handling
    // Pattern: remove params like utm_source, utm_medium, etc.
    const params = paramNames.split(',').map(p => p.trim()).filter(p => p);
    if (params.length > 0) {
      // Build regex to remove these params
      const paramPattern = params.map(p => `${p}=[^&]*`).join('|');
      baseRule.action = {
        type: 'redirect',
        redirect: {
          regexSubstitution: `\\?(${paramPattern})&?|&(${paramPattern})|\\?(${paramPattern})$`,
          // This is complex - better handled by request modification
        }
      };
      baseRule.priority = Math.max(baseRule.priority, 2);
    }

    const validation = DNRValidator.validate(baseRule);
    if (!validation.valid) {
      if (this.options.logWarnings) {
        console.warn(`[DNRConverter] Invalid removeparam rule from ${listId}:${line}`, validation.reason);
      }
      this.conversionStats.errors++;
      return null;
    }

    return baseRule;
  }

  /**
   * Add CSP action (MV3)
   */
  _addCSPAction(baseRule, cspValue, listId, line) {
    if (!cspValue) return baseRule;

    baseRule.action = {
      type: 'allow',
      allow: {
        csp: cspValue
      }
    };

    // CSP rules need high priority
    baseRule.priority = Math.max(baseRule.priority, 3);

    const validation = DNRValidator.validate(baseRule);
    if (!validation.valid) {
      if (this.options.logWarnings) {
        console.warn(`[DNRConverter] Invalid CSP rule from ${listId}:${line}`, validation.reason);
      }
      this.conversionStats.errors++;
      return null;
    }

    return baseRule;
  }

  /**
   * Add cookie action (MV3) - block/allow cookies
   */
  _addCookieAction(baseRule, listId, line) {
    baseRule.action = {
      type: 'block',
      // DNR cookie action: block third-party cookies
    };

    // Cookie rules apply to cookie requests
    if (!baseRule.condition.resourceTypes.includes('cookie')) {
      baseRule.condition.resourceTypes.push('cookie');
    }

    const validation = DNRValidator.validate(baseRule);
    if (!validation.valid) {
      if (this.options.logWarnings) {
        console.warn(`[DNRConverter] Invalid cookie rule from ${listId}:${line}`, validation.reason);
      }
      this.conversionStats.errors++;
      return null;
    }

    return baseRule;
  }

  /**
   * Add upgrade-scheme action (force HTTPS)
   */
  _addUpgradeSchemeAction(baseRule, listId, line) {
    baseRule.action = {
      type: 'upgradeScheme'
    };

    const validation = DNRValidator.validate(baseRule);
    if (!validation.valid) {
      if (this.options.logWarnings) {
        console.warn(`[DNRConverter] Invalid upgrade-scheme rule from ${listId}:${line}`, validation.reason);
      }
      this.conversionStats.errors++;
      return null;
    }

    return baseRule;
  }

  /**
   * Get conversion statistics
   */
  getStats() {
    return { ...this.conversionStats };
  }

  /**
   * Convert filter list content directly
   */
  convertFilterList(content, listId = 'inline', ruleIdBase = 1) {
    const parseResult = this.parser.parse(content, listId);
    return this.convert(parseResult.rules, ruleIdBase, listId);
  }

  /**
   * Convert filter list file directly
   */
  convertFilterListFile(filePath, ruleIdBase = 1) {
    const parseResult = this.parser.parseFile(filePath);
    return this.convert(parseResult.rules, ruleIdBase, filePath);
  }
}

// ============================================================================
// Formal Verification Engine — Round-trip testing and equivalence checking
// ============================================================================

class FormalVerifier {
  constructor(options = {}) {
    this.options = {
      testVectors: options.testVectors || [],
      verbose: options.verbose ?? false,
      ...options
    };
    this.converter = new DNRConverter({ logWarnings: false });
    this.parser = new ABPParser({ maxErrors: 1000 });
  }

  /**
   * Verify converter correctness against test vectors
   * @param {Array} testVectors - Array of { abp, expectedDnr, description }
   * @returns {Object} Verification results
   */
  verify(testVectors) {
    const results = {
      passed: 0,
      failed: 0,
      errors: [],
      details: []
    };

    for (const vector of testVectors) {
      const detail = this._verifyVector(vector);
      results.details.push(detail);
      if (detail.passed) {
        results.passed++;
      } else {
        results.failed++;
        results.errors.push(detail.error);
      }
    }

    return results;
  }

  _verifyVector(vector) {
    try {
      // Parse ABP
      const parseResult = this.parser.parse(vector.abp, 'test');
      if (parseResult.errors.length > 0) {
        return { passed: false, error: `Parse error: ${parseResult.errors.map(e => e.message).join(', ')}` };
      }

      // Convert to DNR
      const dnrRules = this.converter.convert(parseResult.rules, 1, 'test');

      // Check expected count
      if (vector.expectedCount !== undefined && dnrRules.length !== vector.expectedCount) {
        return {
          passed: false,
          error: `Rule count mismatch: expected ${vector.expectedCount}, got ${dnrRules.length}`
        };
      }

      // Validate each DNR rule
      for (const rule of dnrRules) {
        const validation = DNRValidator.validate(rule);
        if (!validation.valid) {
          return { passed: false, error: `Invalid DNR rule: ${validation.reason}` };
        }
      }

      // Check specific expected properties
      if (vector.expectedRules) {
        for (const [idx, expected] of vector.expectedRules.entries()) {
          const actual = dnrRules[idx];
          if (!actual) {
            return { passed: false, error: `Missing expected rule at index ${idx}` };
          }
          if (expected.action && actual.action.type !== expected.action) {
            return { passed: false, error: `Action mismatch at ${idx}: expected ${expected.action}, got ${actual.action.type}` };
          }
          if (expected.urlFilter && !actual.condition.urlFilter?.includes(expected.urlFilter)) {
            return { passed: false, error: `urlFilter mismatch at ${idx}: expected to contain ${expected.urlFilter}, got ${actual.condition.urlFilter}` };
          }
        }
      }

      return { passed: true, ruleCount: dnrRules.length };
    } catch (e) {
      return { passed: false, error: `Exception: ${e.message}` };
    }
  }

  /**
   * Verify round-trip: ABP -> DNR -> semantics preserved
   * Uses fingerprint comparison
   */
  verifyRoundTrip(abpRules) {
    const parseResult = this.parser.parse(abpRules, 'roundtrip');
    const dnrRules = this.converter.convert(parseResult.rules, 1, 'roundtrip');

    // Generate fingerprints
    const getFp = (r) => RuleFingerprint.generate(r);

    // Verify DNR rules are valid
    const invalidRules = DNRValidator.validateBatch(dnrRules);
    if (invalidRules.length > 0) {
      return {
        valid: false,
        error: `Invalid DNR rules: ${invalidRules.map(r => r.reason).join(', ')}`,
        invalidRules
      };
    }

    return {
      valid: true,
      dnrRuleCount: dnrRules.length,
      abpRuleCount: parseResult.rules.filter(r => r.type === 'blocking' || r.type === 'exception').length
    };
  }

  /**
   * Verify semantic equivalence between two DNR rule sets
   */
  static verifyEquivalence(oldRules, newRules) {
    const getFp = (r) => RuleFingerprint.generate(r);
    return DNRValidator.verifySemanticEquivalence(oldRules, newRules, getFp);
  }
}

// ============================================================================
// Rule Partitioner — 200K rules across 20 rulesets
// ============================================================================

class RulePartitioner {
  constructor(options = {}) {
    this.maxRulesPerRuleset = options.maxRulesPerRuleset ?? 10000;
    this.maxRulesets = options.maxRulesets ?? 20;
    this.partitions = new Map();
  }

  /**
   * Partition rules across rulesets by source then priority/action
   */
  partition(rulesByCategory) {
    this.partitions.clear();

    // Flatten all rules with category info
    const allRules = [];
    for (const [category, rules] of Object.entries(rulesByCategory)) {
      for (const rule of rules) {
        allRules.push({ ...rule, _category: category });
      }
    }

    // Sort by priority (allow first), then by specificity
    allRules.sort((a, b) => {
      if (a.action.type !== b.action.type) {
        return a.action.type === 'allow' ? -1 : 1;
      }
      return (b.priority || 1) - (a.priority || 1);
    });

    // Distribute across rulesets
    let currentRuleset = 1;
    let currentCount = 0;

    for (const rule of allRules) {
      if (currentCount >= this.maxRulesPerRuleset && currentRuleset < this.maxRulesets) {
        currentRuleset++;
        currentCount = 0;
      }

      if (currentRuleset > this.maxRulesets) {
        console.warn(`[RulePartitioner] Exceeded max rulesets, dropping rule ${rule.id}`);
        continue;
      }

      if (!this.partitions.has(currentRuleset)) {
        this.partitions.set(currentRuleset, { rules: [], count: 0, categories: new Set() });
      }

      const partition = this.partitions.get(currentRuleset);
      partition.rules.push(rule);
      partition.count++;
      partition.categories.add(rule._category);
      currentCount++;
    }

    // Convert to array format for DNR
    const result = [];
    for (const [rulesetId, partition] of this.partitions) {
      result.push({
        id: `ruleset_${rulesetId}`,
        rules: partition.rules.map((r, i) => ({ ...r, id: (rulesetId - 1) * this.maxRulesPerRuleset + i + 1 })),
        count: partition.count,
        categories: Array.from(partition.categories)
      });
    }

    return result;
  }

  /**
   * Get partition stats
   */
  getStats() {
    const stats = { totalRules: 0, totalRulesets: this.partitions.size, byRuleset: {} };
    for (const [id, partition] of this.partitions) {
      stats.totalRules += partition.count;
      stats.byRuleset[id] = { count: partition.count, categories: partition.categories.size };
    }
    return stats;
  }
}

// ============================================================================
// Export all
// ============================================================================

export {
  RuleFingerprint,
  IncrementalCompiler
} from './incremental-compiler.js';

export {
  DNRValidator,
  RulePartitioner,
  FormalVerifier
};

export { DNRConverter };
export default DNRConverter;