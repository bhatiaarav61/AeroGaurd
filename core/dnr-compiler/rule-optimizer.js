/**
 * Rule Optimizer — Trie dedup, subsumption lattice, priority optimization
 * Allow-before-block, specificity sorting, redundancy elimination
 */

import { VALID_DNR_RESOURCE_TYPES } from './abp-parser.js';

// ============================================================================
// Trie-based Deduplication
// ============================================================================

class RuleTrie {
  constructor() {
    this.root = { children: new Map(), rules: [] };
  }

  insert(rule) {
    let node = this.root;
    const pattern = rule.condition?.urlFilter || rule.condition?.regexFilter || '';
    const segments = this._segmentPattern(pattern);

    for (const segment of segments) {
      if (!node.children.has(segment)) {
        node.children.set(segment, { children: new Map(), rules: [] });
      }
      node = node.children.get(segment);
    }
    node.rules.push(rule);
  }

  findDuplicates() {
    const duplicates = [];
    this._collectDuplicates(this.root, [], duplicates);
    return duplicates;
  }

  _collectDuplicates(node, path, duplicates) {
    if (node.rules.length > 1) {
      duplicates.push({ path: [...path], rules: node.rules });
    }
    for (const [segment, child] of node.children) {
      this._collectDuplicates(child, [...path, segment], duplicates);
    }
  }

  _segmentPattern(pattern) {
    // Break pattern into segments for trie
    if (!pattern) return [''];
    return pattern.split(/(\|\||\^|\*|\/|\?)/).filter(s => s);
  }
}

// ============================================================================
// Rule Optimizer
// ============================================================================

export class RuleOptimizer {
  constructor() {
    this.stats = { original: 0, optimized: 0, duplicatesRemoved: 0, merged: 0, redundantRemoved: 0, subsumed: 0 };
  }

  optimize(rules, listName) {
    this.stats = { original: rules.length, optimized: 0, duplicatesRemoved: 0, merged: 0, redundantRemoved: 0, subsumed: 0 };
    console.log(`[Optimizer] ${listName}: ${rules.length} rules`);

    let optimized = this.removeExactDuplicates(rules);
    optimized = this.removeSubsumedRules(optimized);
    optimized = this.mergeSimilarRules(optimized);
    optimized = this.sortByPriorityAndSpecificity(optimized);
    optimized = this.reassignSequentialIds(optimized);

    this.stats.optimized = optimized.length;
    console.log(`[Optimizer] ${listName}: ${this.stats.original} -> ${this.stats.optimized} (dup: ${this.stats.duplicatesRemoved}, subsumed: ${this.stats.subsumed}, merged: ${this.stats.merged}, redundant: ${this.stats.redundantRemoved})`);
    return optimized;
  }

  // 1. Exact duplicate removal using trie
  removeExactDuplicates(rules) {
    const trie = new RuleTrie();
    for (const rule of rules) {
      trie.insert(rule);
    }

    const duplicates = trie.findDuplicates();
    const toRemove = new Set();

    for (const dup of duplicates) {
      // Keep highest priority rule
      const sorted = dup.rules.sort((a, b) => (b.priority || 1) - (a.priority || 1));
      for (let i = 1; i < sorted.length; i++) {
        toRemove.add(sorted[i].id);
        this.stats.duplicatesRemoved++;
      }
    }

    return rules.filter(r => !toRemove.has(r.id));
  }

  // 2. Remove subsumed rules (covered by broader rule)
  removeSubsumedRules(rules) {
    // Separate allow and block rules
    const allowRules = rules.filter(r => r.action?.type === 'allow');
    const blockRules = rules.filter(r => r.action?.type === 'block');
    const otherRules = rules.filter(r => !['block', 'allow'].includes(r.action?.type));

    const optimizedAllow = this._removeSubsumedInGroup(allowRules);
    const optimizedBlock = this._removeSubsumedInGroup(blockRules);

    return [...optimizedAllow, ...optimizedBlock, ...otherRules];
  }

  _removeSubsumedInGroup(rules) {
    if (rules.length < 2) return rules;

    const nonSubsumed = [];
    for (let i = 0; i < rules.length; i++) {
      const ruleA = rules[i];
      let subsumed = false;

      for (let j = 0; j < rules.length; j++) {
        if (i === j) continue;
        const ruleB = rules[j];
        if (this._covers(ruleB, ruleA)) {
          subsumed = true;
          this.stats.subsumed++;
          break;
        }
      }

      if (!subsumed) nonSubsumed.push(ruleA);
    }
    return nonSubsumed;
  }

  _covers(ruleA, ruleB) {
    // ruleA covers ruleB if A is broader (matches superset of B)
    const a = ruleA.condition || {}, b = ruleB.condition || {};

    // Same action required
    if (JSON.stringify(ruleA.action) !== JSON.stringify(ruleB.action)) return false;

    // urlFilter: A covers B if A's pattern is prefix of B's
    if (a.urlFilter && b.urlFilter) {
      if (!this._urlFilterCovers(a.urlFilter, b.urlFilter)) return false;
    } else if (b.urlFilter && !a.urlFilter) return false;

    // regexFilter
    if (a.regexFilter && b.regexFilter) {
      if (a.regexFilter !== b.regexFilter) return false;
    } else if (b.regexFilter && !a.regexFilter) return false;

    // resourceTypes: A must allow all types B allows
    if (a.resourceTypes && b.resourceTypes) {
      const aSet = new Set(a.resourceTypes), bSet = new Set(b.resourceTypes);
      if (!this._setCovers(aSet, bSet)) return false;
    } else if (b.resourceTypes && !a.resourceTypes) return false;

    // initiatorDomains
    if (a.initiatorDomains && b.initiatorDomains) {
      const aSet = new Set(a.initiatorDomains), bSet = new Set(b.initiatorDomains);
      if (!this._setCovers(aSet, bSet)) return false;
    } else if (b.initiatorDomains && !a.initiatorDomains) return false;

    // excludedInitiatorDomains: A excludes MORE = more specific
    if (a.excludedInitiatorDomains && b.excludedInitiatorDomains) {
      const aEx = new Set(a.excludedInitiatorDomains), bEx = new Set(b.excludedInitiatorDomains);
      for (const d of aEx) if (!bEx.has(d)) return false;
    }

    // requestDomains
    if (a.requestDomains && b.requestDomains) {
      const aSet = new Set(a.requestDomains), bSet = new Set(b.requestDomains);
      if (!this._setCovers(aSet, bSet)) return false;
    } else if (b.requestDomains && !a.requestDomains) return false;

    // domainType
    if (a.domainType && b.domainType && a.domainType !== b.domainType) return false;

    // Priority: broader rule should have lower/equal priority
    if ((ruleA.priority || 1) > (ruleB.priority || 1)) return false;

    return true;
  }

  _urlFilterCovers(a, b) {
    // ||example.com^ covers ||example.com/path^
    if (a.endsWith('^') && b.startsWith(a.slice(0, -1))) return true;
    if (a.endsWith('*') && b.startsWith(a.slice(0, -1))) return true;
    if (a === b) return true;
    return false;
  }

  _setCovers(a, b) {
    if (a.size === 0) return true; // no restriction = covers all
    if (b.size === 0) return false;
    for (const item of b) if (!a.has(item)) return false;
    return true;
  }

  // 3. Merge similar rules (same action, resourceTypes, domains)
  mergeSimilarRules(rules) {
    const blockRules = rules.filter(r => r.action?.type === 'block');
    const allowRules = rules.filter(r => r.action?.type === 'allow');
    const otherRules = rules.filter(r => !['block', 'allow'].includes(r.action?.type));

    return [
      ...this._mergeRuleGroup(blockRules),
      ...this._mergeRuleGroup(allowRules),
      ...otherRules
    ];
  }

  _mergeRuleGroup(rules) {
    if (rules.length < 2) return rules;

    // Group by resourceTypes + initiatorDomains + requestDomains
    const groups = new Map();
    for (const rule of rules) {
      const rt = (rule.condition?.resourceTypes || []).sort().join(',');
      const id = (rule.condition?.initiatorDomains || []).sort().join(',');
      const ex = (rule.condition?.excludedInitiatorDomains || []).sort().join(',');
      const rd = (rule.condition?.requestDomains || []).sort().join(',');
      const key = `${rule.action.type}:${rt}:${id}:${ex}:${rd}`;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(rule);
    }

    const merged = [];
    for (const [, group] of groups) {
      if (group.length === 1) {
        merged.push(group[0]);
        continue;
      }

      // DNR doesn't support OR in urlFilter, so we keep separate rules
      // But we can merge if they have identical conditions except urlFilter
      // and the urlFilters can be combined
      for (const rule of group) {
        merged.push(rule);
      }
    }
    return merged;
  }

  // 4. Sort: priority desc, allow before block, specificity desc
  sortByPriorityAndSpecificity(rules) {
    return rules.sort((a, b) => {
      const pa = a.priority || 1, pb = b.priority || 1;
      if (pa !== pb) return pb - pa; // Higher priority first

      const aa = a.action?.type, ba = b.action?.type;
      if (aa === 'allow' && ba === 'block') return -1; // Allow before block
      if (aa === 'block' && ba === 'allow') return 1;

      return this._specificity(b) - this._specificity(a); // More specific first
    });
  }

  _specificity(rule) {
    const c = rule.condition || {};
    let s = 0;
    if (c.urlFilter) s += 10;
    if (c.regexFilter) s += 15;
    if (c.initiatorDomains?.length) s += c.initiatorDomains.length * 2;
    if (c.excludedInitiatorDomains?.length) s += c.excludedInitiatorDomains.length;
    if (c.requestDomains?.length) s += c.requestDomains.length * 2;
    if (c.resourceTypes?.length) s += c.resourceTypes.length;
    if (c.isUrlFilterCaseSensitive) s += 1;
    if (c.domainType) s += 2;
    return s;
  }

  reassignSequentialIds(rules) {
    return rules.map((r, i) => ({ ...r, id: i + 1 }));
  }

  getStats() {
    return { ...this.stats };
  }
}

export default RuleOptimizer;