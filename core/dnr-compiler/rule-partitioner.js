/**
 * RulePartitioner - Partitions DNR rules across multiple rulesets for optimal performance
 *
 * Features:
 * - Distributes 200K rules across 20 rulesets
 * - Strategy: by list source (easylist, easyprivacy, etc.) then by priority/action
 * - Load balancing: even distribution respecting 150K static limit
 * - Priority distribution: high-priority rules (allow, important) in lower-ID rulesets
 * - Dynamic rulesets: reserves 2 for user custom and session rules
 * - Regex ruleset: dedicated ruleset for regex rules (max 2000)
 * - Session ruleset: dedicated ruleset for session rules (max 5000)
 * - Validation: verifies limits, no ID collisions, all rulesets valid
 */

class RulePartitioner {
  constructor(options = {}) {
    this.maxRulesets = options.maxRulesets || 20;
    this.maxStaticRules = options.maxStaticRules || 150000;
    this.maxRegexRules = options.maxRegexRules || 2000;
    this.maxSessionRules = options.maxSessionRules || 5000;
    this.reservedDynamicRulesets = options.reservedDynamicRulesets || 2;

    // Internal state
    this.rulesets = [];
    this.ruleIdCounter = 1;
    this.usedIds = new Set();
    this.stats = {
      totalRules: 0,
      staticRules: 0,
      dynamicRules: 0,
      regexRules: 0,
      sessionRules: 0,
      bySource: {},
      byAction: {},
      byPriority: {}
    };
  }

  /**
   * Main partition method - distributes rules across rulesets
   * @param {Array} rules - Array of DNR rule objects
   * @param {Object} options - Partition options
   * @returns {Object} Partitioned rulesets with metadata
   */
  partition(rules, options = {}) {
    // Reset state
    this._reset();

    // Validate input
    this._validateInput(rules);

    // Categorize rules
    const categorized = this._categorizeRules(rules);

    // Calculate ruleset allocation
    const allocation = this._calculateAllocation(categorized);

    // Distribute rules to rulesets
    this._distributeRules(categorized, allocation);

    // Validate result
    const validation = this._validatePartition();

    return {
      rulesets: this.rulesets,
      stats: this.stats,
      validation,
      allocation
    };
  }

  /**
   * Reset internal state for new partition
   */
  _reset() {
    this.rulesets = [];
    this.ruleIdCounter = 1;
    this.usedIds = new Set();
    this.stats = {
      totalRules: 0,
      staticRules: 0,
      dynamicRules: 0,
      regexRules: 0,
      sessionRules: 0,
      bySource: {},
      byAction: {},
      byPriority: {}
    };
  }

  /**
   * Validate input rules
   */
  _validateInput(rules) {
    if (!Array.isArray(rules)) {
      throw new Error('Rules must be an array');
    }

    // Allow up to 200K total rules as per requirements
    // The actual limits are enforced per ruleset type during distribution
    const maxTotalRules = 200000;
    if (rules.length > maxTotalRules) {
      throw new Error(`Total rules (${rules.length}) exceeds maximum allowed (${maxTotalRules})`);
    }

    // Check for duplicate IDs in input
    const inputIds = new Set();
    for (const rule of rules) {
      if (rule.id && inputIds.has(rule.id)) {
        throw new Error(`Duplicate rule ID in input: ${rule.id}`);
      }
      if (rule.id) inputIds.add(rule.id);
    }
  }

  /**
   * Categorize rules by source, action, priority, and type
   */
  _categorizeRules(rules) {
    const categorized = {
      static: [],
      regex: [],
      session: [],
      dynamic: [],
      bySource: {},
      byAction: {},
      byPriority: {}
    };

    for (const rule of rules) {
      // Update stats
      this.stats.totalRules++;
      this.stats.bySource[rule.source || 'unknown'] = (this.stats.bySource[rule.source || 'unknown'] || 0) + 1;
      this.stats.byAction[rule.action || 'block'] = (this.stats.byAction[rule.action || 'block'] || 0) + 1;
      this.stats.byPriority[rule.priority || 1] = (this.stats.byPriority[rule.priority || 1] || 0) + 1;

      // Determine rule type
      const isRegex = rule.condition && (rule.condition.regexFilter || rule.condition.urlFilter?.includes('*'));
      const isSession = rule.condition && rule.condition.sessionOnly === true;
      const isDynamic = rule.condition && (rule.condition.initiator || rule.condition.requestDomains || rule.condition.excludedRequestDomains);
      const isAllow = rule.action === 'allow' || rule.action === 'allowAllRequests';

      // Assign to category
      if (isSession) {
        categorized.session.push({ ...rule, _isAllow: isAllow, _priority: rule.priority || 1 });
        this.stats.sessionRules++;
      } else if (isRegex) {
        categorized.regex.push({ ...rule, _isAllow: isAllow, _priority: rule.priority || 1 });
        this.stats.regexRules++;
      } else if (isDynamic) {
        categorized.dynamic.push({ ...rule, _isAllow: isAllow, _priority: rule.priority || 1 });
        this.stats.dynamicRules++;
      } else {
        categorized.static.push({ ...rule, _isAllow: isAllow, _priority: rule.priority || 1 });
        this.stats.staticRules++;
      }

      // Group by source for balanced distribution
      const source = rule.source || 'unknown';
      if (!categorized.bySource[source]) {
        categorized.bySource[source] = { static: [], regex: [], session: [], dynamic: [] };
      }
      if (isSession) categorized.bySource[source].session.push(rule);
      else if (isRegex) categorized.bySource[source].regex.push(rule);
      else if (isDynamic) categorized.bySource[source].dynamic.push(rule);
      else categorized.bySource[source].static.push(rule);

      // Group by action
      const action = rule.action || 'block';
      if (!categorized.byAction[action]) categorized.byAction[action] = [];
      categorized.byAction[action].push(rule);

      // Group by priority
      const priority = rule.priority || 1;
      if (!categorized.byPriority[priority]) categorized.byPriority[priority] = [];
      categorized.byPriority[priority].push(rule);
    }

    return categorized;
  }

  /**
   * Calculate optimal ruleset allocation
   */
  _calculateAllocation(categorized) {
    const availableRulesets = this.maxRulesets - this.reservedDynamicRulesets; // Reserve 2 for dynamic/session

    // Only allocate rulesets for types that have rules
    const needsRegexRuleset = categorized.regex.length > 0;
    const needsSessionRuleset = categorized.session.length > 0;

    // Cap static rules at maxStaticRules (150000 total)
    const staticRulesToUse = Math.min(categorized.static.length, this.maxStaticRules);

    const staticRulesets = availableRulesets - (needsRegexRuleset ? 1 : 0) - (needsSessionRuleset ? 1 : 0);

    const allocation = {
      static: {
        rulesets: Math.max(1, staticRulesets),
        rulesPerRuleset: 0,
        totalRules: staticRulesToUse
      },
      regex: {
        rulesets: needsRegexRuleset ? 1 : 0,
        rulesPerRuleset: 0,
        totalRules: Math.min(categorized.regex.length, this.maxRegexRules * (needsRegexRuleset ? 1 : 0))
      },
      session: {
        rulesets: needsSessionRuleset ? 1 : 0,
        rulesPerRuleset: 0,
        totalRules: Math.min(categorized.session.length, this.maxSessionRules * (needsSessionRuleset ? 1 : 0))
      },
      dynamic: {
        rulesets: this.reservedDynamicRulesets,
        rulesPerRuleset: 0,
        totalRules: categorized.dynamic.length
      }
    };

    // Calculate rules per ruleset for static (capped at maxStaticRules total)
    if (allocation.static.rulesets > 0) {
      allocation.static.rulesPerRuleset = Math.ceil(allocation.static.totalRules / allocation.static.rulesets);
    }

    // Calculate rules per ruleset for regex
    if (needsRegexRuleset) {
      allocation.regex.rulesets = Math.ceil(categorized.regex.length / this.maxRegexRules);
      allocation.regex.rulesPerRuleset = this.maxRegexRules;
      allocation.regex.totalRules = Math.min(categorized.regex.length, allocation.regex.rulesets * this.maxRegexRules);
    }

    // Calculate rules per ruleset for session
    if (needsSessionRuleset) {
      allocation.session.rulesets = Math.ceil(categorized.session.length / this.maxSessionRules);
      allocation.session.rulesPerRuleset = this.maxSessionRules;
      allocation.session.totalRules = Math.min(categorized.session.length, allocation.session.rulesets * this.maxSessionRules);
    }

    // Final check: ensure total doesn't exceed maxRulesets
    const totalRulesets = allocation.static.rulesets + allocation.regex.rulesets + allocation.session.rulesets + allocation.dynamic.rulesets;
    if (totalRulesets > this.maxRulesets) {
      // Reduce static rulesets if needed
      const excess = totalRulesets - this.maxRulesets;
      allocation.static.rulesets = Math.max(1, allocation.static.rulesets - excess);
      allocation.static.rulesPerRuleset = Math.ceil(allocation.static.totalRules / allocation.static.rulesets);
    }

    return allocation;
  }

  /**
   * Distribute rules to rulesets based on allocation
   */
  _distributeRules(categorized, allocation) {
    let rulesetId = 1;

    // First: Create static rulesets with priority distribution
    // High-priority (allow, important) rules go to lower-ID rulesets for precedence
    const staticRulesets = this._createStaticRulesets(categorized.static, allocation.static, rulesetId);
    rulesetId += staticRulesets.length;

    // Second: Create regex ruleset(s)
    const regexRulesets = this._createRegexRulesets(categorized.regex, allocation.regex, rulesetId);
    rulesetId += regexRulesets.length;

    // Third: Create session ruleset(s)
    const sessionRulesets = this._createSessionRulesets(categorized.session, allocation.session, rulesetId);
    rulesetId += sessionRulesets.length;

    // Fourth: Create dynamic rulesets (user custom + session)
    const dynamicRulesets = this._createDynamicRulesets(categorized.dynamic, allocation.dynamic, rulesetId);

    // Combine all rulesets in order (static first for precedence, then regex, session, dynamic)
    this.rulesets = [
      ...staticRulesets,
      ...regexRulesets,
      ...sessionRulesets,
      ...dynamicRulesets
    ];
  }

  /**
   * Create static rulesets with priority-based distribution
   */
  _createStaticRulesets(staticRules, allocation, startId) {
    const rulesets = [];
    const numRulesets = allocation.rulesets;
    const rulesPerRuleset = allocation.rulesPerRuleset;
    const maxRules = allocation.totalRules; // Cap at maxStaticRules

    // Sort rules: high priority (allow, high priority number) first for lower ruleset IDs
    const sortedRules = [...staticRules].sort((a, b) => {
      // Allow rules first (higher precedence)
      if (a._isAllow !== b._isAllow) return b._isAllow - a._isAllow;
      // Then by priority (higher priority first)
      return b._priority - a._priority;
    });

    // Take only the allowed number of rules (cap at maxStaticRules)
    const rulesToDistribute = sortedRules.slice(0, maxRules);

    // Distribute evenly across rulesets
    for (let i = 0; i < numRulesets; i++) {
      const start = i * rulesPerRuleset;
      const end = Math.min(start + rulesPerRuleset, rulesToDistribute.length);
      const rulesetRules = rulesToDistribute.slice(start, end);

      if (rulesetRules.length === 0) break;

      const ruleset = this._createRuleset(
        startId + i,
        rulesetRules,
        'static',
        `static-${i + 1}`,
        {
          maxRules: rulesPerRuleset,
          priority: i + 1, // Lower ID = higher precedence
          isStatic: true
        }
      );

      rulesets.push(ruleset);
    }

    return rulesets;
  }

  /**
   * Create regex ruleset(s)
   */
  _createRegexRulesets(regexRules, allocation, startId) {
    const rulesets = [];
    const numRulesets = allocation.rulesets;
    const rulesPerRuleset = allocation.rulesPerRuleset;
    const maxRules = allocation.totalRules;

    // Sort regex rules by priority
    const sortedRules = [...regexRules].sort((a, b) => {
      if (a._isAllow !== b._isAllow) return b._isAllow - a._isAllow;
      return b._priority - a._priority;
    });

    // Take only the allowed number of rules
    const rulesToDistribute = sortedRules.slice(0, maxRules);

    for (let i = 0; i < numRulesets; i++) {
      const start = i * rulesPerRuleset;
      const end = Math.min(start + rulesPerRuleset, rulesToDistribute.length);
      const rulesetRules = rulesToDistribute.slice(start, end);

      if (rulesetRules.length === 0) break;

      const ruleset = this._createRuleset(
        startId + i,
        rulesetRules,
        'regex',
        `regex-${i + 1}`,
        {
          maxRules: this.maxRegexRules,
          priority: 100 + i, // Lower precedence than static
          isStatic: true,
          isRegex: true
        }
      );

      rulesets.push(ruleset);
    }

    return rulesets;
  }

  /**
   * Create session ruleset(s)
   */
  _createSessionRulesets(sessionRules, allocation, startId) {
    const rulesets = [];
    const numRulesets = allocation.rulesets;
    const rulesPerRuleset = allocation.rulesPerRuleset;
    const maxRules = allocation.totalRules;

    // Sort session rules by priority
    const sortedRules = [...sessionRules].sort((a, b) => {
      if (a._isAllow !== b._isAllow) return b._isAllow - a._isAllow;
      return b._priority - a._priority;
    });

    // Take only the allowed number of rules
    const rulesToDistribute = sortedRules.slice(0, maxRules);

    for (let i = 0; i < numRulesets; i++) {
      const start = i * rulesPerRuleset;
      const end = Math.min(start + rulesPerRuleset, rulesToDistribute.length);
      const rulesetRules = rulesToDistribute.slice(start, end);

      if (rulesetRules.length === 0) break;

      const ruleset = this._createRuleset(
        startId + i,
        rulesetRules,
        'session',
        `session-${i + 1}`,
        {
          maxRules: this.maxSessionRules,
          priority: 200 + i, // Lower precedence
          isStatic: true,
          isSession: true
        }
      );

      rulesets.push(ruleset);
    }

    return rulesets;
  }

  /**
   * Create dynamic rulesets (user custom rules + session rules)
   */
  _createDynamicRulesets(dynamicRules, allocation, startId) {
    const rulesets = [];
    const numRulesets = allocation.rulesets; // Should be 2

    // Ruleset 1: User custom rules (allow/block user-defined)
    const userCustomRuleset = this._createRuleset(
      startId,
      [],
      'dynamic',
      'user-custom',
      {
        maxRules: 50000, // Generous limit for user rules
        priority: 1, // Highest precedence for user rules
        isStatic: false,
        isDynamic: true,
        isUserCustom: true
      }
    );
    rulesets.push(userCustomRuleset);

    // Ruleset 2: Session rules (temporary, cleared on browser restart)
    const sessionRuleset = this._createRuleset(
      startId + 1,
      [],
      'dynamic',
      'session-rules',
      {
        maxRules: 50000,
        priority: 2, // Second highest for session rules
        isStatic: false,
        isDynamic: true,
        isSessionRules: true
      }
    );
    rulesets.push(sessionRuleset);

    return rulesets;
  }

  /**
   * Create a single ruleset object
   */
  _createRuleset(id, rules, type, name, options = {}) {
    // Assign IDs to rules that don't have them
    const rulesWithIds = rules.map(rule => {
      let ruleId = rule.id;
      if (!ruleId || this.usedIds.has(ruleId)) {
        ruleId = this._generateUniqueId();
      }
      this.usedIds.add(ruleId);
      return { ...rule, id: ruleId };
    });

    const ruleset = {
      id,
      name,
      type,
      enabled: true,
      rules: rulesWithIds,
      ruleCount: rulesWithIds.length,
      options: {
        maxRules: options.maxRules || this.maxStaticRules,
        priority: options.priority || 1,
        isStatic: options.isStatic || false,
        isRegex: options.isRegex || false,
        isSession: options.isSession || false,
        isDynamic: options.isDynamic || false,
        isUserCustom: options.isUserCustom || false,
        isSessionRules: options.isSessionRules || false
      }
    };

    return ruleset;
  }

  /**
   * Generate a unique rule ID
   */
  _generateUniqueId() {
    let id;
    do {
      id = this.ruleIdCounter++;
    } while (this.usedIds.has(id));
    return id;
  }

  /**
   * Validate the partition result
   */
  _validatePartition() {
    const errors = [];
    const warnings = [];

    // Check total rulesets
    if (this.rulesets.length > this.maxRulesets) {
      errors.push(`Too many rulesets: ${this.rulesets.length} > ${this.maxRulesets}`);
    }

    // Check each ruleset
    const rulesetIds = new Set();
    let totalStaticRules = 0;
    let totalRegexRules = 0;
    let totalSessionRules = 0;

    for (const ruleset of this.rulesets) {
      // Check ID uniqueness
      if (rulesetIds.has(ruleset.id)) {
        errors.push(`Duplicate ruleset ID: ${ruleset.id}`);
      }
      rulesetIds.add(ruleset.id);

      // Check rule count limits
      if (ruleset.options.isStatic && !ruleset.options.isRegex && !ruleset.options.isSession) {
        totalStaticRules += ruleset.ruleCount;
        if (ruleset.ruleCount > this.maxStaticRules) {
          errors.push(`Static ruleset ${ruleset.id} exceeds limit: ${ruleset.ruleCount} > ${this.maxStaticRules}`);
        }
      }

      if (ruleset.options.isRegex) {
        totalRegexRules += ruleset.ruleCount;
        if (ruleset.ruleCount > this.maxRegexRules) {
          errors.push(`Regex ruleset ${ruleset.id} exceeds limit: ${ruleset.ruleCount} > ${this.maxRegexRules}`);
        }
      }

      if (ruleset.options.isSession) {
        totalSessionRules += ruleset.ruleCount;
        if (ruleset.ruleCount > this.maxSessionRules) {
          errors.push(`Session ruleset ${ruleset.id} exceeds limit: ${ruleset.ruleCount} > ${this.maxSessionRules}`);
        }
      }

      // Check for ID collisions within ruleset
      const ruleIds = new Set();
      for (const rule of ruleset.rules) {
        if (ruleIds.has(rule.id)) {
          errors.push(`Duplicate rule ID ${rule.id} in ruleset ${ruleset.id}`);
        }
        ruleIds.add(rule.id);
      }

      // Validate ruleset structure
      if (!ruleset.id || !ruleset.name || !ruleset.rules) {
        errors.push(`Invalid ruleset structure: ${JSON.stringify(ruleset)}`);
      }
    }

    // Check total static rules limit
    if (totalStaticRules > this.maxStaticRules) {
      errors.push(`Total static rules (${totalStaticRules}) exceeds limit (${this.maxStaticRules})`);
    }

    // Check total regex rules limit
    if (totalRegexRules > this.maxRegexRules * this.rulesets.filter(r => r.options.isRegex).length) {
      warnings.push(`Total regex rules (${totalRegexRules}) may exceed recommended limits`);
    }

    // Check priority ordering (lower ID = higher precedence for static rulesets)
    const staticRulesets = this.rulesets.filter(r => r.options.isStatic && !r.options.isRegex && !r.options.isSession);
    for (let i = 1; i < staticRulesets.length; i++) {
      if (staticRulesets[i].id < staticRulesets[i - 1].id) {
        warnings.push(`Static ruleset priority ordering may be incorrect: ${staticRulesets[i].id} before ${staticRulesets[i - 1].id}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalRulesets: this.rulesets.length,
        totalStaticRules,
        totalRegexRules,
        totalSessionRules,
        totalRules: this.stats.totalRules
      }
    };
  }

  /**
   * Get ruleset by ID
   */
  getRuleset(id) {
    return this.rulesets.find(r => r.id === id);
  }

  /**
   * Get ruleset by name
   */
  getRulesetByName(name) {
    return this.rulesets.find(r => r.name === name);
  }

  /**
   * Export rulesets in DNR manifest format
   */
  exportToManifest() {
    return this.rulesets.map(ruleset => ({
      id: ruleset.id,
      enabled: ruleset.enabled,
      path: `rulesets/${ruleset.name}.json` // Path for static rulesets
    }));
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }
}

/**
 * Helper function to partition rules - main entry point
 * @param {Array} rules - Array of DNR rule objects
 * @param {Object} options - Partition options
 * @returns {Object} Partitioned rulesets with metadata
 */
function partitionRules(rules, options = {}) {
  const partitioner = new RulePartitioner(options);
  return partitioner.partition(rules, options);
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RulePartitioner, partitionRules };
}

// ES module export
export { RulePartitioner, partitionRules };

// Global export for browser
if (typeof window !== 'undefined') {
  window.RulePartitioner = RulePartitioner;
  window.partitionRules = partitionRules;
}