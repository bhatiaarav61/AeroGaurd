// Rule Optimizer - Deduplication, merging, and optimization for DNR rules
export class RuleOptimizer {
  constructor() {
    this.stats = { original: 0, optimized: 0, duplicatesRemoved: 0, merged: 0, redundantRemoved: 0 };
  }

  optimize(rules, listName) {
    this.stats = { original: rules.length, optimized: 0, duplicatesRemoved: 0, merged: 0, redundantRemoved: 0 };
    console.log(`[Optimizer] ${listName}: ${rules.length} rules`);

    let optimized = this.removeExactDuplicates(rules);
    optimized = this.mergeSimilarRules(optimized);
    optimized = this.removeRedundantRules(optimized);
    optimized = this.sortByPriorityAndSpecificity(optimized);
    optimized = this.reassignSequentialIds(optimized);

    this.stats.optimized = optimized.length;
    console.log(`[Optimizer] ${listName}: ${this.stats.original} -> ${this.stats.optimized} (dup: ${this.stats.duplicatesRemoved}, merged: ${this.stats.merged}, redundant: ${this.stats.redundantRemoved})`);
    return optimized;
  }

  // 1. Exact duplicate removal
  removeExactDuplicates(rules) {
    const seen = new Map();
    const unique = [];
    for (const rule of rules) {
      const key = this.getRuleKey(rule);
      if (!seen.has(key)) {
        seen.set(key, rule);
        unique.push(rule);
      } else {
        this.stats.duplicatesRemoved++;
        // Keep higher priority
        const existing = seen.get(key);
        if (rule.priority > existing.priority) {
          seen.set(key, rule);
          const idx = unique.findIndex(r => r === existing);
          if (idx !== -1) unique[idx] = rule;
        }
      }
    }
    return unique;
  }

  getRuleKey(rule) {
    const c = rule.condition || {};
    return JSON.stringify({
      action: rule.action,
      urlFilter: c.urlFilter,
      regexFilter: c.regexFilter,
      resourceTypes: c.resourceTypes?.sort().join(','),
      initiatorDomains: c.initiatorDomains?.sort().join(','),
      excludedInitiatorDomains: c.excludedInitiatorDomains?.sort().join(','),
      requestDomains: c.requestDomains?.sort().join(','),
      excludedRequestDomains: c.excludedRequestDomains?.sort().join(',')
    });
  }

  // 2. Merge similar rules (same action, resourceTypes, domains)
  mergeSimilarRules(rules) {
    const blockRules = rules.filter(r => r.action?.type === 'block');
    const allowRules = rules.filter(r => r.action?.type === 'allow');
    const otherRules = rules.filter(r => !['block','allow'].includes(r.action?.type));

    return [
      ...this.mergeRuleGroup(blockRules),
      ...this.mergeRuleGroup(allowRules),
      ...otherRules
    ];
  }

  mergeRuleGroup(rules) {
    if (rules.length < 2) return rules;

    // Group by resourceTypes + domains
    const groups = new Map();
    for (const rule of rules) {
      const rt = (rule.condition?.resourceTypes || []).sort().join(',');
      const id = (rule.condition?.initiatorDomains || []).sort().join(',');
      const ex = (rule.condition?.excludedInitiatorDomains || []).sort().join(',');
      const key = `${rule.action.type}:${rt}:${id}:${ex}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(rule);
    }

    const merged = [];
    for (const [, group] of groups) {
      if (group.length === 1) { merged.push(group[0]); continue; }
      merged.push(...group);
      // DNR doesn't support OR in urlFilter, so we keep separate rules
    }
    return merged;
  }

  // 3. Remove redundant rules (covered by broader rule)
  removeRedundantRules(rules) {
    const nonRedundant = [];
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      let redundant = false;

      for (let j = 0; j < rules.length; j++) {
        if (i === j) continue;
        if (this.covers(rules[j], rule)) { redundant = true; break; }
      }

      if (!redundant) nonRedundant.push(rule);
    }
    return nonRedundant;
  }

  covers(ruleA, ruleB) {
    // ruleA covers ruleB if A is broader (matches superset of B)
    const a = ruleA.condition || {}, b = ruleB.condition || {};
    if (JSON.stringify(ruleA.action) !== JSON.stringify(ruleB.action)) return false;

    // urlFilter: A covers B if A's pattern is prefix of B's
    if (a.urlFilter && b.urlFilter) {
      if (!this.urlFilterCovers(a.urlFilter, b.urlFilter)) return false;
    } else if (b.urlFilter && !a.urlFilter) return false;

    // resourceTypes
    if (a.resourceTypes && b.resourceTypes) {
      const aSet = new Set(a.resourceTypes), bSet = new Set(b.resourceTypes);
      if (!this.setCovers(aSet, bSet)) return false;
    } else if (b.resourceTypes && !a.resourceTypes) return false;

    // initiatorDomains
    if (a.initiatorDomains && b.initiatorDomains) {
      const aSet = new Set(a.initiatorDomains), bSet = new Set(b.initiatorDomains);
      if (!this.setCovers(aSet, bSet)) return false;
    } else if (b.initiatorDomains && !a.initiatorDomains) return false;

    // excludedInitiatorDomains: A excludes MORE than B = more specific
    if (a.excludedInitiatorDomains && b.excludedInitiatorDomains) {
      const aEx = new Set(a.excludedInitiatorDomains), bEx = new Set(b.excludedInitiatorDomains);
      for (const d of aEx) if (!bEx.has(d)) return false;
    }

    // Priority: broader rule should have lower/equal priority
    if ((ruleA.priority || 1) > (ruleB.priority || 1)) return false;

    return true;
  }

  urlFilterCovers(a, b) {
    // ||example.com^ covers ||example.com/path^
    if (a.endsWith('^') && b.startsWith(a.slice(0, -1))) return true;
    if (a.endsWith('*') && b.startsWith(a.slice(0, -1))) return true;
    if (a === b) return true;
    return false;
  }

  setCovers(a, b) {
    if (a.size === 0) return true; // no restriction = covers all
    if (b.size === 0) return false;
    for (const item of b) if (!a.has(item)) return false;
    return true;
  }

  // 4. Sort: priority desc, allow before block, specificity desc
  sortByPriorityAndSpecificity(rules) {
    return rules.sort((a, b) => {
      const pa = a.priority || 1, pb = b.priority || 1;
      if (pa !== pb) return pb - pa;

      const aa = a.action?.type, ba = b.action?.type;
      if (aa === 'allow' && ba === 'block') return -1;
      if (aa === 'block' && ba === 'allow') return 1;

      return this.specificity(b) - this.specificity(a);
    });
  }

  specificity(rule) {
    const c = rule.condition || {};
    let s = 0;
    if (c.urlFilter) s += 10;
    if (c.regexFilter) s += 15;
    if (c.initiatorDomains?.length) s += c.initiatorDomains.length * 2;
    if (c.excludedInitiatorDomains?.length) s += c.excludedInitiatorDomains.length;
    if (c.requestDomains?.length) s += c.requestDomains.length * 2;
    if (c.resourceTypes?.length) s += c.resourceTypes.length;
    if (c.isUrlFilterCaseSensitive) s += 1;
    return s;
  }

  reassignSequentialIds(rules) {
    return rules.map((r, i) => ({ ...r, id: i + 1 }));
  }
}