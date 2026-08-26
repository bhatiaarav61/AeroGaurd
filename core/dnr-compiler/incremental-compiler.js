/**
 * IncrementalCompiler - Diff-based DNR rule updates with <50ms performance
 *
 * Features:
 * - IncrementalCompiler class: compileDiff(oldRules, newRules) -> { added, removed, modified }
 * - RuleFingerprint: hash of action + condition for fast comparison
 * - DiffAlgorithm: Hash-map based O(N+M) diff, optimized for sorted inputs
 * - ChangeDetection: identify added/removed/modified by fingerprint
 * - PartialRecompile: only recompile affected rulesets, preserve unchanged
 * - BatchApplication: chrome.declarativeNetRequest.updateDynamicRules with minimal operations
 * - PerformanceTarget: <50ms for 10K rule diff, <200ms for 100K
 * - RollbackSupport: snapshot before apply, automatic rollback on quota error
 * - DirtyTracker: list-level change detection for minimal recompilation
 */

// ============================================================================
// FAST FINGERPRINT GENERATION
// ============================================================================

// Pre-computed fingerprint parts for common condition/action patterns
// LRU Cache for fingerprints
class FP_LRUCache {
  constructor(maxSize = 200000) {
    this.maxSize = maxSize;
    this.map = new Map();
  }

  get(key) {
    const value = this.map.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Remove least recently used (first entry)
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
    this.map.set(key, value);
  }

  clear() { this.map.clear(); }
  get size() { return this.map.size; }
}

const FP_CACHE = new FP_LRUCache(200000);

/**
 * RuleFingerprint - Fast comparison key for DNR rules
 * Uses canonical string representation as fingerprint (no hashing overhead)
 * Optimized for V8: avoids object allocation, uses string concatenation
 */
class RuleFingerprint {
  /**
   * Generate fingerprint for a DNR rule - ultra-fast path
   * @param {Object} rule - DNR rule object
   * @returns {string} Canonical string for fast comparison
   */
  static generate(rule) {
    if (!rule || !rule.condition || !rule.action) return 'invalid';

    // Fast path: check cache for rules with IDs
    if (rule.id != null) {
      const cached = FP_CACHE.get(rule.id);
      if (cached !== undefined) return cached;
    }

    const c = rule.condition;
    const a = rule.action;

    // Build fingerprint using array join (fastest in V8)
    // Order: action, urlFilter, regexFilter, resourceTypes, domains, thirdParty, caseSensitive, redirect, allow
    let fp = 'act:' + a.type;

    if (c.urlFilter) fp += '|uf:' + c.urlFilter;
    if (c.regexFilter) fp += '|rf:' + c.regexFilter;

    if (c.resourceTypes?.length) {
      const rts = c.resourceTypes;
      // Inline sort for small arrays
      for (let i = 1; i < rts.length; i++) {
        const key = rts[i];
        let j = i - 1;
        while (j >= 0 && rts[j] > key) {
          rts[j + 1] = rts[j];
          j--;
        }
        rts[j + 1] = key;
      }
      fp += '|rt:' + rts.join(',');
    }

    if (c.initiatorDomains?.length) fp += '|id:' + c.initiatorDomains.sort().join(',');
    if (c.excludedInitiatorDomains?.length) fp += '|eid:' + c.excludedInitiatorDomains.sort().join(',');
    if (c.requestDomains?.length) fp += '|rd:' + c.requestDomains.sort().join(',');
    if (c.excludedRequestDomains?.length) fp += '|erd:' + c.excludedRequestDomains.sort().join(',');
    if (c.thirdParty !== undefined) fp += '|tp:' + (c.thirdParty ? '1' : '0');
    if (c.isUrlFilterCaseSensitive) fp += '|cs:1';
    if (c.domainType) fp += '|dt:' + c.domainType;

    if (a.redirect) {
      const r = a.redirect;
      fp += '|redir:' + (r.url || r.regexSubstitution || r.transform?.queryTransform?.removeParams?.join(',') || '');
    }
    if (a.allow) fp += '|allow:1';
    if (rule.priority && rule.priority !== 1) fp += '|pri:' + rule.priority;

    // Cache for rules with IDs (LRU handles eviction)
    if (rule.id != null) {
      FP_CACHE.set(rule.id, fp);
    }

    return fp;
  }

  /**
   * Generate fingerprint from components (for comparison without full rule)
   * @param {Object} action - Action object
   * @param {Object} condition - Condition object
   * @returns {string} Fingerprint
   */
  static fromComponents(action, condition) {
    const rule = { action, condition };
    return this.generate(rule);
  }

  /**
   * Compare two fingerprints - direct string equality
   * @param {string} fp1 - First fingerprint
   * @param {string} fp2 - Second fingerprint
   * @returns {boolean}
   */
  static equals(fp1, fp2) {
    return fp1 === fp2;
  }

  /** Clear fingerprint cache */
  static clearCache() {
    FP_CACHE.clear();
  }

  /** Get cache stats for monitoring */
  static getCacheStats() {
    return { size: FP_CACHE.size, max: FP_CACHE.maxSize };
  }
}

// ============================================================================
// DIFF ALGORITHM - O(N+M) HASH-MAP BASED
// ============================================================================

/**
 * DiffAlgorithm - Optimized diff using hash maps for O(N+M) performance
 * Supports both sorted and unsorted inputs
 */
class DiffAlgorithm {
  /**
   * Compute diff between two arrays using fingerprints (hash-map approach)
   * Optimized for <50ms on 10K rules
   * @param {Array} oldArray - Old rules array
   * @param {Array} newArray - New rules array
   * @param {Function} getFingerprint - Function to get fingerprint from rule
   * @returns {Object} { added, removed, modified, unchanged }
   */
  static diff(oldArray, newArray, getFingerprint) {
    // Edge cases
    if (!oldArray?.length) {
      return {
        added: newArray?.map((r, i) => ({ rule: r, newIndex: i, fingerprint: getFingerprint(r) })) || [],
        removed: [], modified: [], unchanged: []
      };
    }
    if (!newArray?.length) {
      return {
        added: [],
        removed: oldArray.map((r, i) => ({ rule: r, oldIndex: i, fingerprint: getFingerprint(r) })),
        modified: [], unchanged: []
      };
    }

    // Pre-compute all fingerprints (single pass)
    const oldFps = new Array(oldArray.length);
    const newFps = new Array(newArray.length);
    for (let i = 0; i < oldArray.length; i++) oldFps[i] = getFingerprint(oldArray[i]);
    for (let i = 0; i < newArray.length; i++) newFps[i] = getFingerprint(newArray[i]);

    // Build hash maps: fingerprint -> [indices]
    const oldMap = new Map();
    const newMap = new Map();

    for (let i = 0; i < oldFps.length; i++) {
      const fp = oldFps[i];
      const arr = oldMap.get(fp);
      if (arr) arr.push(i);
      else oldMap.set(fp, [i]);
    }
    for (let i = 0; i < newFps.length; i++) {
      const fp = newFps[i];
      const arr = newMap.get(fp);
      if (arr) arr.push(i);
      else newMap.set(fp, [i]);
    }

    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    // Track matched old indices per fingerprint
    const matchedOld = new Map();

    // Process new rules - O(M)
    for (const [fp, newIndices] of newMap) {
      const oldIndices = oldMap.get(fp);

      if (!oldIndices) {
        // All new with this fingerprint are added
        for (const idx of newIndices) {
          added.push({ rule: newArray[idx], newIndex: idx, fingerprint: fp });
        }
        continue;
      }

      // Get or create matched set for this fingerprint
      let matched = matchedOld.get(fp);
      if (!matched) {
        matched = new Set();
        matchedOld.set(fp, matched);
      }

      // Match new to old
      for (const newIdx of newIndices) {
        let found = false;

        // Try to find unmatched old with same priority (unchanged)
        for (let j = 0; j < oldIndices.length; j++) {
          if (matched.has(j)) continue;
          const oldIdx = oldIndices[j];
          const oldRule = oldArray[oldIdx];
          const newRule = newArray[newIdx];

          // Priority is the only thing that can differ with same fingerprint
          if ((oldRule.priority || 1) === (newRule.priority || 1)) {
            unchanged.push({
              rule: newRule,
              oldIndex: oldIdx,
              newIndex: newIdx,
              fingerprint: fp
            });
            matched.add(j);
            found = true;
            break;
          }
        }

        if (!found) {
          // No exact priority match - check if any unmatched old exists (modified)
          for (let j = 0; j < oldIndices.length; j++) {
            if (!matched.has(j)) {
              const oldIdx = oldIndices[j];
              modified.push({
                oldRule: oldArray[oldIdx],
                newRule: newArray[newIdx],
                oldIndex: oldIdx,
                newIndex: newIdx,
                oldFingerprint: fp,
                newFingerprint: fp
              });
              matched.add(j);
              found = true;
              break;
            }
          }
        }

        if (!found) {
          // More new than old with this fingerprint
          added.push({ rule: newArray[newIdx], newIndex: newIdx, fingerprint: fp });
        }
      }
    }

    // Unmatched old = removed - O(N)
    for (const [fp, oldIndices] of oldMap) {
      const matched = matchedOld.get(fp) || new Set();
      for (let j = 0; j < oldIndices.length; j++) {
        if (!matched.has(j)) {
          removed.push({ rule: oldArray[oldIndices[j]], oldIndex: oldIndices[j], fingerprint: fp });
        }
      }
    }

    return { added, removed, modified, unchanged };
  }

  /**
   * Optimized diff for pre-sorted arrays by fingerprint - two-pointer O(N+M)
   * Use when inputs are already sorted by fingerprint (e.g., from partitioned rulesets)
   * @param {Array} oldArray - Old rules (sorted by fingerprint)
   * @param {Array} newArray - New rules (sorted by fingerprint)
   * @param {Function} getFingerprint - Fingerprint function
   * @returns {Object} Diff result
   */
  static diffSorted(oldArray, newArray, getFingerprint) {
    const oldFps = oldArray.map(getFingerprint);
    const newFps = newArray.map(getFingerprint);

    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    let i = 0, j = 0;
    while (i < oldFps.length && j < newFps.length) {
      const cmp = oldFps[i].localeCompare(newFps[j]);
      if (cmp < 0) {
        removed.push({ rule: oldArray[i], oldIndex: i, fingerprint: oldFps[i] });
        i++;
      } else if (cmp > 0) {
        added.push({ rule: newArray[j], newIndex: j, fingerprint: newFps[j] });
        j++;
      } else {
        // Same fingerprint - check priority
        const oldRule = oldArray[i];
        const newRule = newArray[j];
        if ((oldRule.priority || 1) === (newRule.priority || 1)) {
          unchanged.push({ rule: newRule, oldIndex: i, newIndex: j, fingerprint: oldFps[i] });
        } else {
          modified.push({
            oldRule, newRule,
            oldIndex: i, newIndex: j,
            oldFingerprint: oldFps[i], newFingerprint: newFps[j]
          });
        }
        i++; j++;
      }
    }

    while (i < oldFps.length) {
      removed.push({ rule: oldArray[i], oldIndex: i, fingerprint: oldFps[i] });
      i++;
    }
    while (j < newFps.length) {
      added.push({ rule: newArray[j], newIndex: j, fingerprint: newFps[j] });
      j++;
    }

    return { added, removed, modified, unchanged };
  }

  /**
   * Diff for a single list - optimized for list-level updates
   * @param {Array} oldRules - Old rules
   * @param {Array} newRules - New rules
   * @param {Function} getFingerprint - Fingerprint function
   * @returns {Object} Diff with list-level metadata
   */
  static diffList(oldRules, newRules, getFingerprint) {
    const diff = this.diff(oldRules, newRules, getFingerprint);
    return {
      ...diff,
      stats: {
        oldCount: oldRules.length,
        newCount: newRules.length,
        addedCount: diff.added.length,
        removedCount: diff.removed.length,
        modifiedCount: diff.modified.length,
        unchangedCount: diff.unchanged.length,
        changeRatio: (diff.added.length + diff.removed.length + diff.modified.length) /
                    Math.max(oldRules.length, newRules.length, 1)
      }
    };
  }
}

// ============================================================================
// CHANGE DETECTION WITH PERFORMANCE MONITORING
// ============================================================================

class ChangeDetection {
  constructor(options = {}) {
    this.useSortedDiff = options.useSortedDiff !== false;
    this.fpCache = new Map();
  }

  /**
   * Detect changes between old and new rule sets
   * @param {Array} oldRules - Old DNR rules
   * @param {Array} newRules - New DNR rules
   * @returns {Object} Change detection result with stats
   */
  detectChanges(oldRules, newRules) {
    const startTime = performance.now();

    // Use fingerprint directly (no wrapper objects)
    const getFp = (r) => RuleFingerprint.generate(r);

    // Choose algorithm based on whether arrays appear sorted
    let diff;
    if (this.useSortedDiff && this._isSortedByFp(oldRules, getFp) && this._isSortedByFp(newRules, getFp)) {
      diff = DiffAlgorithm.diffSorted(oldRules, newRules, getFp);
    } else {
      diff = DiffAlgorithm.diff(oldRules, newRules, getFp);
    }

    const elapsed = performance.now() - startTime;

    return {
      ...diff,
      stats: {
        oldCount: oldRules.length,
        newCount: newRules.length,
        addedCount: diff.added.length,
        removedCount: diff.removed.length,
        modifiedCount: diff.modified.length,
        unchangedCount: diff.unchanged.length,
        elapsedMs: elapsed,
        changeRatio: (diff.added.length + diff.removed.length + diff.modified.length) /
                     Math.max(oldRules.length, newRules.length, 1)
      }
    };
  }

  _isSortedByFp(arr, getFp) {
    if (!arr.length) return true;
    let prev = getFp(arr[0]);
    for (let i = 1; i < arr.length; i++) {
      const curr = getFp(arr[i]);
      if (prev > curr) return false;
      prev = curr;
    }
    return true;
  }

  clearCache() { this.fpCache.clear(); }
}

// ============================================================================
// PARTIAL RECOMPILE - ONLY AFFECTED RULESETS
// ============================================================================

class PartialRecompile {
  constructor(options = {}) {
    this.rulePartitioner = options.rulePartitioner;
    this.dnrConverter = options.dnrConverter;
  }

  /**
   * Recompile only affected rulesets based on changes
   * @param {Object} changes - Change detection result
   * @param {Array} currentRulesets - Current partitioned rulesets
   * @returns {Object} { updatedRulesets, affectedRulesetIds, recompileStats }
   */
  recompile(changes, currentRulesets) {
    const startTime = performance.now();
    const affectedRulesetIds = new Set();
    const updatedRulesets = [];

    // Build fingerprint -> ruleset mapping using fingerprints from changes
    // This avoids regenerating fingerprints for all rules
    const fpToRuleset = new Map();
    for (const ruleset of currentRulesets) {
      for (const rule of ruleset.rules) {
        const fp = RuleFingerprint.generate(rule);
        fpToRuleset.set(fp, ruleset.id);
      }
    }

    // Track affected rulesets using fingerprints from changes
    for (const change of changes.added) {
      const rsid = fpToRuleset.get(change.fingerprint);
      if (rsid) affectedRulesetIds.add(rsid);
    }
    for (const change of changes.removed) {
      const rsid = fpToRuleset.get(change.fingerprint);
      if (rsid) affectedRulesetIds.add(rsid);
    }
    for (const change of changes.modified) {
      const rsid = fpToRuleset.get(change.oldFingerprint) || fpToRuleset.get(change.newFingerprint);
      if (rsid) affectedRulesetIds.add(rsid);
    }

    // Recompile affected rulesets only
    for (const ruleset of currentRulesets) {
      if (affectedRulesetIds.has(ruleset.id)) {
        const updated = this._applyChangesToRuleset(ruleset, changes);
        updatedRulesets.push(updated);
      } else {
        // Unchanged - keep reference (immutable)
        updatedRulesets.push(ruleset);
      }
    }

    const elapsed = performance.now() - startTime;

    return {
      updatedRulesets,
      affectedRulesetIds: Array.from(affectedRulesetIds),
      recompileStats: {
        totalRulesets: currentRulesets.length,
        affectedRulesets: affectedRulesetIds.size,
        elapsedMs: elapsed
      }
    };
  }

  /**
   * Apply changes to a single ruleset - optimized
   */
  _applyChangesToRuleset(ruleset, changes) {
    let rules = ruleset.rules;

    // Build removal set
    const removedFps = new Set();
    for (const c of changes.removed) removedFps.add(c.fingerprint);

    // Filter and map in single pass
    const newRules = [];
    const modifiedFps = new Map();
    for (const c of changes.modified) {
      modifiedFps.set(c.oldFingerprint, c.newRule);
    }

    for (const rule of rules) {
      const fp = RuleFingerprint.generate(rule);
      if (removedFps.has(fp)) continue;
      if (modifiedFps.has(fp)) {
        newRules.push({ ...modifiedFps.get(fp) });
        modifiedFps.delete(fp);
      } else {
        newRules.push(rule);
      }
    }

    // Add new rules
    for (const c of changes.added) {
      newRules.push({ ...c.rule });
    }

    // Reassign sequential IDs
    for (let i = 0; i < newRules.length; i++) {
      newRules[i].id = i + 1;
    }

    return {
      ...ruleset,
      rules: newRules,
      ruleCount: newRules.length
    };
  }
}

// ============================================================================
// BATCH APPLICATION - MINIMAL CHROME API CALLS
// ============================================================================

class BatchApplication {
  constructor(options = {}) {
    this.maxBatchSize = options.maxBatchSize || 5000;
    this.onProgress = options.onProgress || (() => {});
  }

  /**
   * Apply changes to Chrome DNR API
   * @param {Object} changes - Change detection result
   * @param {Object} options - { chrome }
   * @returns {Promise<Object>} Application result
   */
  async applyChanges(changes, { chrome }) {
    if (!chrome?.declarativeNetRequest) {
      throw new Error('chrome.declarativeNetRequest API not available');
    }

    const startTime = performance.now();
    const results = { added: 0, removed: 0, modified: 0, errors: [], elapsedMs: 0 };

    try {
      // Build operation arrays
      const removeRuleIds = changes.removed.map(c => c.rule?.id || c.id).filter(Boolean);
      const addRules = changes.added.map(c => c.rule).filter(r => r?.id);
      const updateRules = changes.modified.map(c => c.newRule).filter(r => r?.id);

      this.onProgress({ stage: 'prepare', removeCount: removeRuleIds.length, addCount: addRules.length, updateCount: updateRules.length });

      // Batch remove
      if (removeRuleIds.length) {
        await this._batchOperation(removeRuleIds, 'removeRuleIds', chrome);
        results.removed = removeRuleIds.length;
      }

      // Batch add
      if (addRules.length) {
        await this._batchOperation(addRules, 'addRules', chrome);
        results.added = addRules.length;
      }

      // Batch update (remove + add)
      if (updateRules.length) {
        const updateIds = updateRules.map(r => r.id);
        await this._batchOperation(updateIds, 'removeRuleIds', chrome);
        await this._batchOperation(updateRules, 'addRules', chrome);
        results.modified = updateRules.length;
      }

      results.elapsedMs = performance.now() - startTime;
      this.onProgress({ stage: 'complete', ...results });
      return results;

    } catch (error) {
      results.errors.push(error.message);
      results.elapsedMs = performance.now() - startTime;
      throw error;
    }
  }

  async _batchOperation(items, operation, chrome) {
    for (let i = 0; i < items.length; i += this.maxBatchSize) {
      const batch = items.slice(i, i + this.maxBatchSize);
      await chrome.declarativeNetRequest.updateDynamicRules({ [operation]: batch });
      this.onProgress({ stage: operation, processed: Math.min(i + this.maxBatchSize, items.length), total: items.length });
    }
  }

  /** Get current dynamic rules from Chrome */
  async getCurrentRules(chrome) {
    return new Promise((resolve, reject) => {
      chrome.declarativeNetRequest.getDynamicRules(rules => {
        chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(rules);
      });
    });
  }
}

// ============================================================================
// ROLLBACK SUPPORT - SNAPSHOT & AUTO-ROLLBACK
// ============================================================================

class RollbackSupport {
  constructor(options = {}) {
    this.maxSnapshots = options.maxSnapshots || 10;
    this.snapshots = [];
  }

  /** Create snapshot of current rulesets */
  createSnapshot(rulesets) {
    const snapshot = {
      timestamp: Date.now(),
      rulesets: rulesets.map(rs => ({
        id: rs.id,
        name: rs.name,
        type: rs.type,
        enabled: rs.enabled,
        rules: rs.rules.map(r => ({ ...r })),
        ruleCount: rs.ruleCount,
        options: { ...rs.options }
      })),
      totalRules: rulesets.reduce((sum, rs) => sum + rs.ruleCount, 0)
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
    return snapshot;
  }

  /** Rollback to a specific snapshot */
  async rollback(snapshot, chrome) {
    if (!chrome?.declarativeNetRequest) throw new Error('Chrome API not available for rollback');

    const startTime = performance.now();
    let removed = 0, added = 0;
    const errors = [];

    try {
      // Get current dynamic rules
      const currentRules = await new Promise((resolve, reject) => {
        chrome.declarativeNetRequest.getDynamicRules(rules => {
          chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(rules);
        });
      });

      // Remove all current
      const currentIds = currentRules.map(r => r.id);
      if (currentIds.length) {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: currentIds });
        removed = currentIds.length;
      }

      // Add snapshot dynamic rules
      const dynamicRules = [];
      for (const rs of snapshot.rulesets) {
        if (rs.options?.isDynamic || rs.options?.isUserCustom || rs.options?.isSessionRules) {
          dynamicRules.push(...rs.rules);
        }
      }

      if (dynamicRules.length) {
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules: dynamicRules });
        added = dynamicRules.length;
      }

      return { success: true, removed, added, elapsedMs: performance.now() - startTime, errors };
    } catch (error) {
      errors.push(error.message);
      return { success: false, removed, added, elapsedMs: performance.now() - startTime, errors };
    }
  }

  /** Rollback to last snapshot */
  async rollbackToLast(chrome) {
    if (!this.snapshots.length) throw new Error('No snapshots available');
    return this.rollback(this.snapshots[this.snapshots.length - 1], chrome);
  }

  getSnapshots() { return [...this.snapshots]; }
  clearSnapshots() { this.snapshots = []; }
}

// ============================================================================
// PERFORMANCE MONITOR - TARGET ENFORCEMENT
// ============================================================================

class PerformanceMonitor {
  constructor(options = {}) {
    this.targets = {
      diff10k: options.diff10kMs || 50,
      diff100k: options.diff100kMs || 200,
      apply10k: options.apply10kMs || 100,
      apply100k: options.apply100kMs || 500
    };
    this.measurements = [];
  }

  record(operation, ruleCount, elapsedMs) {
    const target = this._getTarget(operation, ruleCount);
    const measurement = { operation, ruleCount, elapsedMs, target, passed: elapsedMs <= target, timestamp: Date.now() };
    this.measurements.push(measurement);
    return measurement;
  }

  _getTarget(op, count) {
    if (op === 'diff') {
      if (count <= 10000) return this.targets.diff10k;
      if (count <= 100000) return this.targets.diff100k;
      return this.targets.diff100k * (count / 100000);
    }
    if (op === 'apply') {
      if (count <= 10000) return this.targets.apply10k;
      if (count <= 100000) return this.targets.apply100k;
      return this.targets.apply100k * (count / 100000);
    }
    return Infinity;
  }

  getReport() {
    const byOp = {};
    for (const m of this.measurements) {
      (byOp[m.operation] ||= []).push(m);
    }
    const report = {};
    for (const [op, ms] of Object.entries(byOp)) {
      const passed = ms.filter(m => m.passed).length;
      const avg = ms.reduce((a, b) => a + b.elapsedMs, 0) / ms.length;
      const max = Math.max(...ms.map(m => m.elapsedMs));
      report[op] = { count: ms.length, passed, avg: Math.round(avg), max, passRate: (passed / ms.length * 100).toFixed(1) + '%' };
    }
    return report;
  }

  clear() { this.measurements = []; }
  getTargets() { return { ...this.targets }; }
}

// ============================================================================
// DIRTY TRACKING - LIST-LEVEL CHANGE DETECTION
// ============================================================================

class DirtyTracker {
  constructor() {
    this.dirtyLists = new Set();
    this.dirtyRulesets = new Set();
    this.listHashes = new Map(); // listId -> hash
    this.listTimestamps = new Map(); // listId -> last modified
  }

  /**
   * Check if a list needs recompilation using fast hash
   * @param {string} listId - List identifier
   * @param {Array} newRules - New rules for the list
   * @returns {boolean} true if dirty
   */
  isDirty(listId, newRules) {
    const newHash = this._hashRules(newRules);
    const oldHash = this.listHashes.get(listId);

    if (oldHash === undefined) {
      this.listHashes.set(listId, newHash);
      this.listTimestamps.set(listId, Date.now());
      this.dirtyLists.add(listId);
      return true;
    }

    if (oldHash !== newHash) {
      this.listHashes.set(listId, newHash);
      this.listTimestamps.set(listId, Date.now());
      this.dirtyLists.add(listId);
      return true;
    }

    return false;
  }

  /** Mark a list as clean after successful compilation */
  markClean(listId) {
    this.dirtyLists.delete(listId);
  }

  /** Mark a ruleset as dirty */
  markRulesetDirty(rulesetId) {
    this.dirtyRulesets.add(rulesetId);
  }

  /** Get all dirty lists */
  getDirtyLists() { return Array.from(this.dirtyLists); }

  /** Get all dirty rulesets */
  getDirtyRulesets() { return Array.from(this.dirtyRulesets); }

  /** Clear all dirty state */
  clear() {
    this.dirtyLists.clear();
    this.dirtyRulesets.clear();
  }

  /** Get timestamp of last change for a list */
  getLastModified(listId) { return this.listTimestamps.get(listId) || 0; }

  /** Fast hash: length + first/last ID + sum */
  _hashRules(rules) {
    if (!rules?.length) return 'empty';
    const sorted = [...rules].sort((a, b) => (a.id || 0) - (b.id || 0));
    return `${rules.length}:${sorted[0].id || 0}:${sorted[sorted.length - 1].id || 0}:${rules.reduce((s, r) => s + (r.id || 0), 0)}`;
  }
}

// ============================================================================
// MAIN INCREMENTAL COMPILER
// ============================================================================

class IncrementalCompiler {
  constructor(options = {}) {
    this.options = {
      useSortedDiff: options.useSortedDiff !== false,
      maxBatchSize: options.maxBatchSize || 5000,
      enableRollback: options.enableRollback !== false,
      onProgress: options.onProgress || (() => {}),
      ...options
    };

    // Components
    this.fingerprint = RuleFingerprint;
    this.diffAlgorithm = DiffAlgorithm;
    this.changeDetection = new ChangeDetection({ useSortedDiff: this.options.useSortedDiff });
    this.partialRecompile = new PartialRecompile(options);
    this.batchApplication = new BatchApplication({
      maxBatchSize: this.options.maxBatchSize,
      onProgress: this.options.onProgress
    });
    this.rollbackSupport = new RollbackSupport({ maxSnapshots: options.maxSnapshots || 10 });
    this.performanceMonitor = new PerformanceMonitor(options.performanceTargets);
    this.dirtyTracker = new DirtyTracker();

    // State
    this.lastRules = null;
    this.lastRulesets = null;
    this.lastSnapshot = null;
  }

  /**
   * Main entry: compile diff between old and new rules
   * Target: <50ms for 10K rules
   * @param {Array} oldRules - Previous DNR rules
   * @param {Array} newRules - New DNR rules
   * @returns {Object} Compilation result with changes
   */
  compileDiff(oldRules, newRules) {
    const totalStart = performance.now();

    // Direct diff using hash-map (fastest path)
    const getFp = (r) => this.fingerprint.generate(r);
    const diffStart = performance.now();
    const diff = this.diffAlgorithm.diff(oldRules || [], newRules || [], getFp);
    const diffTime = performance.now() - diffStart;

    // Build result with fingerprints preserved for downstream
    const result = {
      added: diff.added.map(c => ({ ...c.rule, fingerprint: c.fingerprint })),
      removed: diff.removed.map(c => ({ ...c.rule, fingerprint: c.fingerprint })),
      modified: diff.modified.map(c => ({ ...c.newRule, fingerprint: c.newFingerprint, oldFingerprint: c.oldFingerprint })),
      unchanged: diff.unchanged.map(c => ({ ...c.rule, fingerprint: c.fingerprint })),
      stats: {
        oldCount: oldRules?.length || 0,
        newCount: newRules?.length || 0,
        addedCount: diff.added.length,
        removedCount: diff.removed.length,
        modifiedCount: diff.modified.length,
        unchangedCount: diff.unchanged.length,
        diffTimeMs: diffTime,
        totalTimeMs: performance.now() - totalStart
      }
    };

    // Record performance
    this.performanceMonitor.record('diff', (oldRules?.length || 0) + (newRules?.length || 0), diffTime);

    // Update state
    this.lastRules = newRules;

    return result;
  }

  /**
   * Compile diff for a specific list (with dirty tracking)
   * @param {string} listId - List identifier
   * @param {Array} oldRules - Previous rules for this list
   * @param {Array} newRules - New rules for this list
   * @returns {Object|null} Compilation result or null if not dirty
   */
  compileDiffForList(listId, oldRules, newRules) {
    if (!this.dirtyTracker.isDirty(listId, newRules)) {
      return null; // Clean - no recompilation needed
    }
    const result = this.compileDiff(oldRules, newRules);
    this.dirtyTracker.markClean(listId);
    return result;
  }

  /**
   * Apply changes to Chrome DNR with rollback support
   * @param {Object} changes - Result from compileDiff
   * @param {Object} chrome - Chrome API object
   * @param {Array} currentRulesets - Current partitioned rulesets (for snapshot)
   * @returns {Promise<Object>} Application result
   */
  async applyChanges(changes, chrome, currentRulesets) {
    const applyStart = performance.now();

    // Snapshot for rollback
    if (this.options.enableRollback && currentRulesets) {
      this.lastSnapshot = this.rollbackSupport.createSnapshot(currentRulesets);
      this.lastRulesets = currentRulesets;
    }

    try {
      // Convert to batch format
      const batchChanges = {
        added: changes.added.map(r => ({ rule: r, fingerprint: this.fingerprint.generate(r) })),
        removed: changes.removed.map(r => ({ rule: r, fingerprint: this.fingerprint.generate(r) })),
        modified: changes.modified.map(r => ({ newRule: r, fingerprint: this.fingerprint.generate(r) }))
      };

      const result = await this.batchApplication.applyChanges(batchChanges, { chrome });

      const elapsed = performance.now() - applyStart;
      this.performanceMonitor.record('apply', changes.added.length + changes.removed.length + changes.modified.length, elapsed);

      return { ...result, totalTimeMs: elapsed };
    } catch (error) {
      // Auto-rollback on failure
      if (this.options.enableRollback && this.lastSnapshot) {
        this.options.onProgress({ stage: 'rollback', error: error.message });
        const rollbackResult = await this.rollbackSupport.rollback(this.lastSnapshot, chrome);
        if (rollbackResult.success) {
          return { ...rollbackResult, rolledBack: true, originalError: error.message, totalTimeMs: performance.now() - applyStart };
        }
      }
      throw error;
    }
  }

  /**
   * Full incremental update: diff + apply + recompile
   * @param {Array} oldRules - Previous rules
   * @param {Array} newRules - New rules
   * @param {Object} chrome - Chrome API
   * @param {Array} currentRulesets - Current rulesets
   * @returns {Promise<Object>} Complete update result
   */
  async incrementalUpdate(oldRules, newRules, chrome, currentRulesets) {
    const totalStart = performance.now();

    this.options.onProgress({ stage: 'diff', oldCount: oldRules?.length || 0, newCount: newRules?.length || 0 });
    const diff = this.compileDiff(oldRules, newRules);

    this.options.onProgress({ stage: 'recompile' });
    const recompileResult = this.partialRecompile.recompile(diff, currentRulesets);

    this.options.onProgress({ stage: 'apply' });
    const applyResult = await this.applyChanges(diff, chrome, recompileResult.updatedRulesets);

    const totalTime = performance.now() - totalStart;

    return {
      diff,
      recompile: recompileResult,
      apply: applyResult,
      updatedRulesets: recompileResult.updatedRulesets,
      stats: {
        totalTimeMs: totalTime,
        diffTimeMs: diff.stats.diffTimeMs,
        applyTimeMs: applyResult.elapsedMs,
        recompileTimeMs: recompileResult.recompileStats.elapsedMs
      }
    };
  }

  /**
   * Incremental update with dirty tracking (processes only changed lists)
   * @param {Object} lists - { listId: { oldRules, newRules } }
   * @param {Object} chrome - Chrome API
   * @param {Array} currentRulesets - Current partitioned rulesets
   * @returns {Promise<Object>} Complete update result
   */
  async incrementalUpdateByList(lists, chrome, currentRulesets) {
    const totalStart = performance.now();
    const allChanges = { added: [], removed: [], modified: [], unchanged: [] };
    const listResults = {};

    // Process only dirty lists
    for (const [listId, { oldRules, newRules }] of Object.entries(lists)) {
      const listResult = this.compileDiffForList(listId, oldRules, newRules);
      if (listResult) {
        listResults[listId] = listResult;
        allChanges.added.push(...listResult.added);
        allChanges.removed.push(...listResult.removed);
        allChanges.modified.push(...listResult.modified);
        allChanges.unchanged.push(...listResult.unchanged);
      }
    }

    // Early return if no changes
    if (!allChanges.added.length && !allChanges.removed.length && !allChanges.modified.length) {
      return {
        diff: allChanges,
        recompile: { updatedRulesets: currentRulesets, affectedRulesetIds: [], recompileStats: { totalRulesets: currentRulesets.length, affectedRulesets: 0, elapsedMs: 0 } },
        apply: { added: 0, removed: 0, modified: 0, elapsedMs: 0 },
        updatedRulesets: currentRulesets,
        stats: { totalTimeMs: performance.now() - totalStart, diffTimeMs: 0, applyTimeMs: 0, recompileTimeMs: 0 }
      };
    }

    this.options.onProgress({ stage: 'recompile' });
    const recompileResult = this.partialRecompile.recompile(allChanges, currentRulesets);

    this.options.onProgress({ stage: 'apply' });
    const applyResult = await this.applyChanges(allChanges, chrome, recompileResult.updatedRulesets);

    const totalTime = performance.now() - totalStart;

    return {
      diff: allChanges,
      listResults,
      recompile: recompileResult,
      apply: applyResult,
      updatedRulesets: recompileResult.updatedRulesets,
      stats: {
        totalTimeMs: totalTime,
        diffTimeMs: Object.values(listResults).reduce((s, r) => s + (r.stats?.diffTimeMs || 0), 0),
        applyTimeMs: applyResult.elapsedMs,
        recompileTimeMs: recompileResult.recompileStats.elapsedMs
      }
    };
  }

  /** Quick diff preview without applying */
  previewDiff(oldRules, newRules) { return this.compileDiff(oldRules, newRules); }

  /** Get performance report */
  getPerformanceReport() { return this.performanceMonitor.getReport(); }

  /** Get last snapshot */
  getLastSnapshot() { return this.lastSnapshot; }

  /** Get dirty tracker */
  getDirtyTracker() { return this.dirtyTracker; }

  /** Manual rollback */
  async rollback(chrome) { return this.rollbackSupport.rollbackToLast(chrome); }

  /** Reset compiler state */
  reset() {
    this.lastRules = null;
    this.lastRulesets = null;
    this.lastSnapshot = null;
    this.changeDetection.clearCache();
    this.performanceMonitor.clear();
    this.dirtyTracker.clear();
    RuleFingerprint.clearCache();
  }
}

// ============================================================================
// FACTORY & EXPORTS
// ============================================================================

/** Create incremental compiler with defaults */
export function createIncrementalCompiler(options = {}) {
  return new IncrementalCompiler(options);
}

/** Quick diff without compiler instance */
export function quickDiff(oldRules, newRules) {
  return new IncrementalCompiler().compileDiff(oldRules, newRules);
}

// Named exports (classes and types)
export {
  RuleFingerprint,
  DiffAlgorithm,
  ChangeDetection,
  PartialRecompile,
  BatchApplication,
  RollbackSupport,
  PerformanceMonitor,
  DirtyTracker,
  IncrementalCompiler
};