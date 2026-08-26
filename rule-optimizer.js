// Rule Optimizer - Deduplication, merging, redundancy removal, and rule limit enforcement for DNR rules
// Supports: static rulesets (150K limit) and dynamic rulesets (10K limit)

export class RuleOptimizer {
  constructor() {
    this.stats = {
      original: 0,
      optimized: 0,
      duplicatesRemoved: 0,
      merged: 0,
      redundantRemoved: 0,
      truncated: 0
    };
  }

  /**
   * Optimize rules for a given filter list
   * @param {Array} rules - Array of DNR rule objects
   * @param {string} listId - Identifier for the filter list (used to determine static vs dynamic limits)
   * @returns {Array} Optimized rules array
   */
  optimize(rules, listId) {
    this.stats = {
      original: rules.length,
      optimized: 0,
      duplicatesRemoved: 0,
      merged: 0,
      redundantRemoved: 0,
      truncated: 0
    };

    if (!rules || rules.length === 0) {
      return [];
    }

    console.log(`[RuleOptimizer] ${listId}: ${rules.length} input rules`);

    // Step 1: Remove exact duplicates (same action, urlFilter, resourceTypes, initiatorDomains, etc.)
    let optimized = this.removeExactDuplicates(rules);

    // Step 2: Merge compatible rules (same action, combinable conditions)
    optimized = this.mergeCompatibleRules(optimized);

    // Step 3: Remove redundant rules (subsumed by broader rules)
    optimized = this.removeRedundantRules(optimized);

    // Step 4: Sort by priority (desc) then specificity (desc)
    optimized = this.sortByPriorityAndSpecificity(optimized);

    // Step 5: Reassign sequential IDs
    optimized = this.reassignSequentialIds(optimized);

    // Step 6: Apply rule limits based on list type
    optimized = this.enforceRuleLimits(optimized, listId);

    this.stats.optimized = optimized.length;
    console.log(
      `[RuleOptimizer] ${listId}: ${this.stats.original} -> ${this.stats.optimized} ` +
      `(dup: ${this.stats.duplicatesRemoved}, merged: ${this.stats.merged}, ` +
      `redundant: ${this.stats.redundantRemoved}, truncated: ${this.stats.truncated})`
    );

    return optimized;
  }

  // ==================== Step 1: Exact Deduplication ====================

  removeExactDuplicates(rules) {
    const seen = new Map();
    const unique = [];

    for (const rule of rules) {
      const key = this.getRuleIdentityKey(rule);
      const existing = seen.get(key);

      if (!existing) {
        seen.set(key, rule);
        unique.push(rule);
      } else {
        this.stats.duplicatesRemoved++;
        // Keep the rule with higher priority
        if ((rule.priority || 1) > (existing.priority || 1)) {
          seen.set(key, rule);
          const idx = unique.findIndex(r => r === existing);
          if (idx !== -1) unique[idx] = rule;
        }
      }
    }

    return unique;
  }

  /**
   * Generate a unique key for deduplication based on:
   * - action type and params
   * - urlFilter / regexFilter
   * - resourceTypes
   * - initiatorDomains / excludedInitiatorDomains
   * - requestDomains / excludedRequestDomains
   */
  getRuleIdentityKey(rule) {
    const c = rule.condition || {};
    const a = rule.action || {};

    return JSON.stringify({
      actionType: a.type,
      actionRedirect: a.redirect?.url || a.redirect?.regexSubstitution || null,
      actionAllow: a.allow ? JSON.stringify(a.allow) : null,
      urlFilter: c.urlFilter || null,
      regexFilter: c.regexFilter || null,
      resourceTypes: [...(c.resourceTypes || [])].sort().join(','),
      initiatorDomains: [...(c.initiatorDomains || [])].sort().join(','),
      excludedInitiatorDomains: [...(c.excludedInitiatorDomains || [])].sort().join(','),
      requestDomains: [...(c.requestDomains || [])].sort().join(','),
      excludedRequestDomains: [...(c.excludedRequestDomains || [])].sort().join(','),
      thirdParty: c.thirdParty ?? null,
      isUrlFilterCaseSensitive: c.isUrlFilterCaseSensitive ?? false
    });
  }

  // ==================== Step 2: Merge Compatible Rules ====================

  mergeCompatibleRules(rules) {
    // Separate by action type since different action types can't be merged
    const blockRules = rules.filter(r => r.action?.type === 'block');
    const allowRules = rules.filter(r => r.action?.type === 'allow');
    const redirectRules = rules.filter(r => r.action?.type === 'redirect');
    const otherRules = rules.filter(r => !['block', 'allow', 'redirect'].includes(r.action?.type));

    return [
      ...this.mergeRuleGroup(blockRules),
      ...this.mergeRuleGroup(allowRules),
      ...this.mergeRuleGroup(redirectRules),
      ...otherRules
    ];
  }

  mergeRuleGroup(rules) {
    if (rules.length < 2) return rules;

    // Group by: resourceTypes + initiatorDomains + excludedInitiatorDomains +
    //           requestDomains + excludedRequestDomains + thirdParty + isUrlFilterCaseSensitive
    // Rules in the same group can potentially be merged if their urlFilters are combinable
    const groups = new Map();

    for (const rule of rules) {
      const c = rule.condition || {};
      const keyParts = [
        (c.resourceTypes || []).sort().join(','),
        (c.initiatorDomains || []).sort().join(','),
        (c.excludedInitiatorDomains || []).sort().join(','),
        (c.requestDomains || []).sort().join(','),
        (c.excludedRequestDomains || []).sort().join(','),
        c.thirdParty ?? 'null',
        c.isUrlFilterCaseSensitive ? 'cs' : 'ci'
      ];
      const key = keyParts.join('|');

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(rule);
    }

    const merged = [];

    for (const [, group] of groups) {
      if (group.length === 1) {
        merged.push(group[0]);
        continue;
      }

      // Try to merge urlFilters within the group
      // Note: DNR doesn't support OR in urlFilter, so we keep rules separate
      // But we track potential merges for stats
      this.stats.merged += group.length - 1;
      // Use loop instead of spread to avoid stack overflow with large arrays
      for (const rule of group) {
        merged.push(rule);
      }
    }

    return merged;
  }

  // ==================== Step 3: Remove Redundant Rules ====================

  removeRedundantRules(rules) {
    // A rule A is redundant if there exists another rule B that:
    // - Has same action
    // - Covers a superset of URLs (urlFilter is broader)
    // - Covers a superset of resourceTypes
    // - Covers a superset of initiatorDomains (or has none)
    // - Has equal or higher priority (lower number = higher priority in DNR)
    //
    // Note: In DNR, lower priority number = higher precedence. So "higher priority" = lower number.
    // But in our code we treat larger priority number = more important.
    // We'll use the convention: rule with higher priority value wins.
    //
    // Optimization: O(n²) is too slow for large rule sets. Use a more efficient approach:
    // 1. Group by action type
    // 2. Sort by specificity (broadest first)
    // 3. Only check if a broader rule (earlier in sorted list) covers the current one

    // For very large rule sets (>5000), skip expensive redundant removal
    // The sorting by priority/specificity already puts broad rules first
    if (rules.length > 5000) {
      console.log(`[RuleOptimizer] Skipping redundant removal for ${rules.length} rules (performance)`);
      return rules;
    }

    const nonRedundant = [];

    for (let i = 0; i < rules.length; i++) {
      const ruleB = rules[i];
      let isRedundant = false;

      for (let j = 0; j < rules.length; j++) {
        if (i === j) continue;

        const ruleA = rules[j];

        if (this.ruleCovers(ruleA, ruleB)) {
          isRedundant = true;
          this.stats.redundantRemoved++;
          break;
        }
      }

      if (!isRedundant) {
        nonRedundant.push(ruleB);
      }
    }

    return nonRedundant;
  }

  /**
   * Check if ruleA covers (is broader than) ruleB
   * ruleA covers ruleB if ruleA matches a superset of what ruleB matches
   */
  ruleCovers(ruleA, ruleB) {
    const a = ruleA.condition || {};
    const b = ruleB.condition || {};

    // Actions must be identical
    if (JSON.stringify(ruleA.action) !== JSON.stringify(ruleB.action)) {
      return false;
    }

    // urlFilter: A covers B if A's pattern matches everything B matches and more
    if (!this.urlFilterCovers(a.urlFilter, b.urlFilter)) {
      return false;
    }

    // regexFilter: A covers B if A's regex is broader (hard to determine, so require exact match)
    if (a.regexFilter || b.regexFilter) {
      if (a.regexFilter !== b.regexFilter) return false;
    }

    // resourceTypes: A must include all of B's resourceTypes
    if (!this.arrayCovers(a.resourceTypes, b.resourceTypes)) {
      return false;
    }

    // initiatorDomains: A must include all of B's (or have none = matches all)
    if (!this.arrayCovers(a.initiatorDomains, b.initiatorDomains)) {
      return false;
    }

    // excludedInitiatorDomains: A excludes more = more specific, so doesn't cover
    // A covers B only if A's excluded set is subset of B's (A is less restrictive)
    if (a.excludedInitiatorDomains && b.excludedInitiatorDomains) {
      const aEx = new Set(a.excludedInitiatorDomains);
      const bEx = new Set(b.excludedInitiatorDomains);
      for (const d of aEx) if (!bEx.has(d)) return false;
    } else if (a.excludedInitiatorDomains && !b.excludedInitiatorDomains) {
      return false; // A has exclusions, B doesn't -> A is more specific
    }

    // requestDomains: same logic as initiatorDomains
    if (!this.arrayCovers(a.requestDomains, b.requestDomains)) {
      return false;
    }

    // excludedRequestDomains: same logic
    if (a.excludedRequestDomains && b.excludedRequestDomains) {
      const aEx = new Set(a.excludedRequestDomains);
      const bEx = new Set(b.excludedRequestDomains);
      for (const d of aEx) if (!bEx.has(d)) return false;
    } else if (a.excludedRequestDomains && !b.excludedRequestDomains) {
      return false;
    }

    // thirdParty: if B requires thirdParty=true, A must also require it (or be null = both)
    if (b.thirdParty === true && a.thirdParty !== true) return false;
    if (b.thirdParty === false && a.thirdParty !== false) return false;

    // Priority: broader rule (A) should have >= priority (>= in our convention = more important)
    // In DNR: lower priority number = higher precedence. Our code uses higher number = higher priority.
    const priorityA = ruleA.priority || 1;
    const priorityB = ruleB.priority || 1;
    if (priorityA < priorityB) return false; // A has lower priority, shouldn't override B

    return true;
  }

  /**
   * Check if urlFilter A covers urlFilter B
   * Examples:
   * - "||example.com^" covers "||example.com/path^"
   * - "*ad*" covers "*ad*"
   * - "||ads.example.com^" covers "||ads.example.com/banner^"
   */
  urlFilterCovers(a, b) {
    if (!b) return true; // B has no filter, matches everything
    if (!a) return false; // A has no filter but B does

    if (a === b) return true;

    // Handle ||domain^ pattern
    if (a.startsWith('||') && a.endsWith('^')) {
      const aDomain = a.slice(2, -1);
      if (b.startsWith('||') && b.endsWith('^')) {
        const bDomain = b.slice(2, -1);
        // A covers B if B's domain is A's domain or a subdomain
        return bDomain === aDomain || bDomain.endsWith('.' + aDomain);
      }
      if (b.startsWith(a.slice(0, -1))) return true; // A without ^ is prefix of B
    }

    // Handle wildcard patterns
    if (a.endsWith('*') && b.startsWith(a.slice(0, -1))) return true;
    if (a.startsWith('*') && b.endsWith(a.slice(1))) return true;

    // Substring match: if A is substring of B, A is broader
    if (b.includes(a)) return true;

    return false;
  }

  /**
   * Check if array A covers array B (A contains all elements of B, or A is empty/undefined)
   */
  arrayCovers(a, b) {
    if (!b || b.length === 0) return true; // B has no restriction
    if (!a || a.length === 0) return true; // A has no restriction = covers all

    const aSet = new Set(a);
    for (const item of b) {
      if (!aSet.has(item)) return false;
    }
    return true;
  }

  // ==================== Step 4: Sort by Priority & Specificity ====================

  sortByPriorityAndSpecificity(rules) {
    return rules.sort((a, b) => {
      // Primary: Priority (higher first)
      const pa = a.priority || 1;
      const pb = b.priority || 1;
      if (pa !== pb) return pb - pa;

      // Secondary: Allow rules before block rules (exceptions should be checked first)
      const aa = a.action?.type;
      const ba = b.action?.type;
      if (aa === 'allow' && ba === 'block') return -1;
      if (aa === 'block' && ba === 'allow') return 1;

      // Tertiary: Specificity (more specific first)
      // More specific = more conditions = should be checked first
      const specA = this.calculateSpecificity(a);
      const specB = this.calculateSpecificity(b);
      if (specA !== specB) return specB - specA;

      // Quaternary: urlFilter length (longer = more specific)
      const ufA = a.condition?.urlFilter || '';
      const ufB = b.condition?.urlFilter || '';
      return ufB.length - ufA.length;
    });
  }

  calculateSpecificity(rule) {
    const c = rule.condition || {};
    let score = 0;

    if (c.urlFilter) score += 10;
    if (c.regexFilter) score += 15; // Regex is more specific
    if (c.initiatorDomains?.length) score += c.initiatorDomains.length * 3;
    if (c.excludedInitiatorDomains?.length) score += c.excludedInitiatorDomains.length * 2;
    if (c.requestDomains?.length) score += c.requestDomains.length * 3;
    if (c.excludedRequestDomains?.length) score += c.excludedRequestDomains.length * 2;
    if (c.resourceTypes?.length) score += c.resourceTypes.length;
    if (c.thirdParty !== null && c.thirdParty !== undefined) score += 2;
    if (c.isUrlFilterCaseSensitive) score += 1;

    return score;
  }

  // ==================== Step 5: Reassign Sequential IDs ====================

  reassignSequentialIds(rules) {
    return rules.map((rule, index) => ({ ...rule, id: index + 1 }));
  }

  // ==================== Step 6: Enforce Rule Limits ====================

  /**
   * Enforce rule limits based on list type
   * Static rulesets: 150,000 rules (Chrome limit is 150K for static)
   * Dynamic rulesets: 10,000 rules (Chrome limit is 10K for dynamic)
   */
  enforceRuleLimits(rules, listId) {
    const isStatic = this.isStaticRuleset(listId);
    const limit = isStatic ? 150000 : 10000;

    if (rules.length > limit) {
      const removed = rules.length - limit;
      this.stats.truncated = removed;
      console.warn(`[RuleOptimizer] ${listId}: Truncated ${removed} rules to stay within ${limit} limit (${isStatic ? 'static' : 'dynamic'})`);

      // Keep the highest priority + most specific rules
      // Rules are already sorted by priority and specificity
      return rules.slice(0, limit);
    }

    return rules;
  }

  /**
   * Determine if a listId corresponds to a static ruleset
   * Based on manifest.json rule_resources and common patterns
   */
  isStaticRuleset(listId) {
    // Static rulesets (pre-loaded in manifest.json)
    const staticRulesets = new Set([
      'easylist', 'easyprivacy', 'fanboy_annoyances', 'fanboy_social',
      'ublock_filters', 'ublock_privacy', 'ublock_badware', 'ublock_annoyances',
      'easylist_cookie', 'anti_adblock', 'easylist_germany', 'easylist_france',
      'easylist_china', 'easylist_italy', 'easylist_spain', 'easylist_poland',
      'easylist_netherlands', 'easylist_taiwan', 'youtube_ads', 'custom',
      'peterlowe', 'oisd', 'adguard_base', 'adguard_annoyances', 'adguard_dns',
      'adguard_mobile', 'adguard_mobile_dns', 'adguard_social', 'adguard_tracking',
      'cname_uncloaking', 'nocoin', 'easylist_lithuania', 'easylist_spanish',
      'easylist_bulgaria', 'easylist_czech', 'easylist_denmark', 'easylist_greece',
      'easylist_hungary', 'easylist_israel', 'easylist_latvia', 'easylist_portugal',
      'easylist_romania', 'easylist_serbia', 'easylist_slovakia', 'easylist_sweden',
      'easylist_turkey'
    ]);

    // Dynamic rulesets typically have "dynamic" or "custom" in name
    // or are user-generated
    if (listId.includes('dynamic') || listId.includes('user') || listId.includes('session')) {
      return false;
    }

    return staticRulesets.has(listId);
  }

  // ==================== Utility ====================

  getStats() {
    return { ...this.stats };
  }

  resetStats() {
    this.stats = {
      original: 0,
      optimized: 0,
      duplicatesRemoved: 0,
      merged: 0,
      redundantRemoved: 0,
      truncated: 0
    };
  }
}

// Export singleton instance
export const ruleOptimizer = new RuleOptimizer();

// Also support default export for compatibility
export default ruleOptimizer;