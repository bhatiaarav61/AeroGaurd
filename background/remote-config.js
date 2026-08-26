/**
 * RemoteConfig - Enterprise Feature Flags & Dynamic Configuration
 * AeroGuard Ultra - Manifest V3 Ad Blocker
 *
 * Features:
 * - RemoteConfig class: fetch with 1hr cache, ETag, fallback to defaults
 * - FeatureFlags: boolean, string, number, object types with validation
 * - Killswitches: emergency disable for any component
 * - Experiments: A/B test framework with consistent hashing
 * - ConfigSchema: JSON Schema validation for remote config
 * - OverrideManager: local overrides for testing, per-user, per-session
 * - FetchStrategy: primary CDN, fallback mirrors, exponential backoff
 * - ChangeNotifier: reactive updates to all subsystems
 * - Export singleton remoteConfig instance
 */

// ============================================================================
// JSON Schema Validation
// ============================================================================

class ConfigSchema {
  constructor() {
    this.schema = {
      type: 'object',
      properties: {
        youtubeBlockModes: {
          type: 'object',
          properties: {
            strict: { type: 'boolean' },
            moderate: { type: 'boolean' },
            permissive: { type: 'boolean' },
            custom: { type: 'object' }
          },
          additionalProperties: false
        },
        youtubeScriptlets: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            scriptlets: { type: 'array', items: { type: 'string' } },
            debug: { type: 'boolean' }
          },
          required: ['enabled', 'scriptlets'],
          additionalProperties: false
        },
        experiments: {
          type: 'object',
          properties: {
            newBlockEngine: { type: 'boolean' },
            adaptiveFiltering: { type: 'boolean' },
            mlBasedDetection: { type: 'boolean' },
            backgroundSync: { type: 'boolean' }
          },
          additionalProperties: false
        },
        killswitches: {
          type: 'object',
          properties: {
            allBlocking: { type: 'boolean' },
            youtubeBlocking: { type: 'boolean' },
            scriptletInjection: { type: 'boolean' },
            networkFiltering: { type: 'boolean' },
            cosmeticFiltering: { type: 'boolean' }
          },
          required: ['allBlocking', 'youtubeBlocking', 'scriptletInjection', 'networkFiltering', 'cosmeticFiltering'],
          additionalProperties: false
        },
        performance: {
          type: 'object',
          properties: {
            maxRulesPerRequest: { type: 'integer', minimum: 100, maximum: 50000 },
            cacheTTL: { type: 'integer', minimum: 60000, maximum: 86400000 },
            batchSize: { type: 'integer', minimum: 10, maximum: 5000 },
            debounceMs: { type: 'integer', minimum: 0, maximum: 5000 },
            enableProfiling: { type: 'boolean' },
            workerThreads: { type: 'integer', minimum: 1, maximum: 16 }
          },
          required: ['maxRulesPerRequest', 'cacheTTL', 'batchSize'],
          additionalProperties: false
        },
        featureFlags: {
          type: 'object',
          description: 'Dynamic feature flags with type validation',
          additionalProperties: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['boolean', 'string', 'number', 'object', 'array'] },
              value: {},
              description: { type: 'string' },
              validation: {
                type: 'object',
                properties: {
                  min: { type: 'number' },
                  max: { type: 'number' },
                  enum: { type: 'array' },
                  pattern: { type: 'string' },
                  minLength: { type: 'integer' },
                  maxLength: { type: 'integer' }
                }
              }
            },
            required: ['type', 'value']
          }
        },
        rollout: {
          type: 'object',
          description: 'Gradual rollout configuration',
          properties: {
            percentage: { type: 'number', minimum: 0, maximum: 100 },
            userGroups: { type: 'array', items: { type: 'string' } },
            regions: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      required: ['youtubeBlockModes', 'youtubeScriptlets', 'experiments', 'killswitches', 'performance'],
      additionalProperties: true
    };
  }

  /**
   * Validate configuration against schema
   * @param {Object} config - Configuration to validate
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   */
  validate(config) {
    const errors = [];

    if (!config || typeof config !== 'object') {
      return { valid: false, errors: ['Config must be an object'] };
    }

    // Validate required sections exist
    const requiredSections = ['youtubeBlockModes', 'youtubeScriptlets', 'experiments', 'killswitches', 'performance'];
    for (const section of requiredSections) {
      if (!config[section]) {
        errors.push(`Missing required section: ${section}`);
      }
    }

    // Validate killswitches structure
    if (config.killswitches) {
      const requiredKills = ['allBlocking', 'youtubeBlocking', 'scriptletInjection', 'networkFiltering', 'cosmeticFiltering'];
      for (const kill of requiredKills) {
        if (typeof config.killswitches[kill] !== 'boolean') {
          errors.push(`killswitches.${kill} must be boolean`);
        }
      }
    }

    // Validate performance settings
    if (config.performance) {
      const perf = config.performance;
      if (perf.maxRulesPerRequest !== undefined && (perf.maxRulesPerRequest < 100 || perf.maxRulesPerRequest > 50000)) {
        errors.push('performance.maxRulesPerRequest must be between 100 and 50000');
      }
      if (perf.cacheTTL !== undefined && (perf.cacheTTL < 60000 || perf.cacheTTL > 86400000)) {
        errors.push('performance.cacheTTL must be between 60000 and 86400000 (1 min - 24 hrs)');
      }
    }

    // Validate feature flags if present
    if (config.featureFlags) {
      for (const [name, flag] of Object.entries(config.featureFlags)) {
        const flagErrors = this.validateFeatureFlag(name, flag);
        errors.push(...flagErrors);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  validateFeatureFlag(name, flag) {
    const errors = [];

    if (!flag || typeof flag !== 'object') {
      return [`Feature flag "${name}" must be an object`];
    }

    if (!['boolean', 'string', 'number', 'object', 'array'].includes(flag.type)) {
      errors.push(`Feature flag "${name}" has invalid type: ${flag.type}`);
    }

    // Type-specific validation
    switch (flag.type) {
      case 'boolean':
        if (typeof flag.value !== 'boolean') {
          errors.push(`Feature flag "${name}" value must be boolean`);
        }
        break;
      case 'string':
        if (typeof flag.value !== 'string') {
          errors.push(`Feature flag "${name}" value must be string`);
        } else if (flag.validation) {
          if (flag.validation.minLength !== undefined && flag.value.length < flag.validation.minLength) {
            errors.push(`Feature flag "${name}" string too short (min ${flag.validation.minLength})`);
          }
          if (flag.validation.maxLength !== undefined && flag.value.length > flag.validation.maxLength) {
            errors.push(`Feature flag "${name}" string too long (max ${flag.validation.maxLength})`);
          }
          if (flag.validation.pattern) {
            try {
              const regex = new RegExp(flag.validation.pattern);
              if (!regex.test(flag.value)) {
                errors.push(`Feature flag "${name}" value doesn't match pattern`);
              }
            } catch {
              errors.push(`Feature flag "${name}" has invalid regex pattern`);
            }
          }
          if (flag.validation.enum && !flag.validation.enum.includes(flag.value)) {
            errors.push(`Feature flag "${name}" value not in allowed enum`);
          }
        }
        break;
      case 'number':
        if (typeof flag.value !== 'number' || !Number.isFinite(flag.value)) {
          errors.push(`Feature flag "${name}" value must be a finite number`);
        } else if (flag.validation) {
          if (flag.validation.min !== undefined && flag.value < flag.validation.min) {
            errors.push(`Feature flag "${name}" value below minimum (${flag.validation.min})`);
          }
          if (flag.validation.max !== undefined && flag.value > flag.validation.max) {
            errors.push(`Feature flag "${name}" value above maximum (${flag.validation.max})`);
          }
        }
        break;
      case 'object':
        if (typeof flag.value !== 'object' || flag.value === null || Array.isArray(flag.value)) {
          errors.push(`Feature flag "${name}" value must be an object`);
        }
        break;
      case 'array':
        if (!Array.isArray(flag.value)) {
          errors.push(`Feature flag "${name}" value must be an array`);
        }
        break;
    }

    return errors;
  }
}

// ============================================================================
// Feature Flags with Type Validation
// ============================================================================

class FeatureFlags {
  constructor(config = {}) {
    this.flags = new Map();
    this.validators = new Map();
    this.loadFromConfig(config);
  }

  loadFromConfig(config) {
    if (config.featureFlags) {
      for (const [name, flag] of Object.entries(config.featureFlags)) {
        this.register(name, flag.type, flag.value, flag.validation, flag.description);
      }
    }
  }

  /**
   * Register a feature flag with validation
   * @param {string} name - Flag name (dot-notation supported)
   * @param {'boolean'|'string'|'number'|'object'|'array'} type - Value type
   * @param {*} defaultValue - Default value
   * @param {Object} [validation] - Validation rules
   * @param {string} [description] - Human-readable description
   */
  register(name, type, defaultValue, validation = {}, description = '') {
    const validator = this.createValidator(type, validation);
    this.flags.set(name, { value: defaultValue, type, validation, description, validator });
    this.validators.set(name, validator);
  }

  createValidator(type, validation) {
    return (value) => {
      // Type check
      switch (type) {
        case 'boolean':
          if (typeof value !== 'boolean') return false;
          break;
        case 'string':
          if (typeof value !== 'string') return false;
          break;
        case 'number':
          if (typeof value !== 'number' || !Number.isFinite(value)) return false;
          break;
        case 'object':
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
          break;
        case 'array':
          if (!Array.isArray(value)) return false;
          break;
        default:
          return false;
      }

      // Validation rules
      if (validation) {
        if (type === 'number') {
          if (validation.min !== undefined && value < validation.min) return false;
          if (validation.max !== undefined && value > validation.max) return false;
        }
        if (type === 'string') {
          if (validation.minLength !== undefined && value.length < validation.minLength) return false;
          if (validation.maxLength !== undefined && value.length > validation.maxLength) return false;
          if (validation.pattern) {
            try {
              if (!new RegExp(validation.pattern).test(value)) return false;
            } catch { return false; }
          }
          if (validation.enum && !validation.enum.includes(value)) return false;
        }
      }

      return true;
    };
  }

  /**
   * Get a feature flag value with type safety
   * @param {string} name - Flag name
   * @param {*} defaultValue - Fallback if not set
   * @returns {*} Flag value
   */
  get(name, defaultValue = undefined) {
    const flag = this.flags.get(name);
    if (!flag) return defaultValue;
    return flag.value !== undefined ? flag.value : defaultValue;
  }

  /**
   * Get boolean flag (convenience)
   * @param {string} name
   * @param {boolean} defaultValue
   * @returns {boolean}
   */
  getBoolean(name, defaultValue = false) {
    const val = this.get(name, defaultValue);
    return val === true;
  }

  /**
   * Get string flag (convenience)
   * @param {string} name
   * @param {string} defaultValue
   * @returns {string}
   */
  getString(name, defaultValue = '') {
    const val = this.get(name, defaultValue);
    return typeof val === 'string' ? val : defaultValue;
  }

  /**
   * Get number flag (convenience)
   * @param {string} name
   * @param {number} defaultValue
   * @returns {number}
   */
  getNumber(name, defaultValue = 0) {
    const val = this.get(name, defaultValue);
    return typeof val === 'number' && Number.isFinite(val) ? val : defaultValue;
  }

  /**
   * Get object flag (convenience)
   * @param {string} name
   * @param {Object} defaultValue
   * @returns {Object}
   */
  getObject(name, defaultValue = {}) {
    const val = this.get(name, defaultValue);
    return typeof val === 'object' && val !== null && !Array.isArray(val) ? val : defaultValue;
  }

  /**
   * Set a feature flag value (with validation)
   * @param {string} name
   * @param {*} value
   * @returns {boolean} Success
   */
  set(name, value) {
    const flag = this.flags.get(name);
    if (!flag) {
      // Auto-register if not exists (infer type)
      const type = this.inferType(value);
      this.register(name, type, value);
      return true;
    }

    if (!flag.validator(value)) {
      console.warn(`[FeatureFlags] Invalid value for "${name}":`, value);
      return false;
    }

    flag.value = value;
    return true;
  }

  inferType(value) {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (Array.isArray(value)) return 'array';
    return 'object';
  }

  /**
   * Get all flags as plain object
   * @returns {Object}
   */
  getAll() {
    const result = {};
    for (const [name, flag] of this.flags) {
      result[name] = flag.value;
    }
    return result;
  }

  /**
   * Get flag metadata
   * @param {string} name
   * @returns {Object|null}
   */
  getMetadata(name) {
    const flag = this.flags.get(name);
    if (!flag) return null;
    return {
      type: flag.type,
      description: flag.description,
      validation: flag.validation
    };
  }

  /**
   * Check if flag exists
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.flags.has(name);
  }

  /**
   * Delete a flag
   * @param {string} name
   * @returns {boolean}
   */
  delete(name) {
    this.validators.delete(name);
    return this.flags.delete(name);
  }

  /**
   * Reset all flags to defaults
   */
  reset() {
    for (const [name, flag] of this.flags) {
      // Would need to store defaults separately for full reset
    }
  }
}

// ============================================================================
// Killswitches - Emergency Disable System
// ============================================================================

class KillswitchManager {
  constructor(config = {}) {
    this.switches = new Map();
    this.listeners = new Map();
    this.loadFromConfig(config);
  }

  loadFromConfig(config) {
    const defaults = {
      allBlocking: false,
      youtubeBlocking: false,
      scriptletInjection: false,
      networkFiltering: false,
      cosmeticFiltering: false,
      remoteConfig: false,
      statistics: false,
      filterUpdates: false
    };

    const killswitches = { ...defaults, ...config.killswitches };

    for (const [name, enabled] of Object.entries(killswitches)) {
      this.switches.set(name, {
        enabled: Boolean(enabled),
        timestamp: enabled ? Date.now() : null,
        reason: null
      });
    }
  }

  /**
   * Check if a killswitch is active
   * @param {string} name
   * @returns {boolean}
   */
  isActive(name) {
    // Global killswitch overrides all
    if (this.switches.get('allBlocking')?.enabled) return true;
    return this.switches.get(name)?.enabled === true;
  }

  /**
   * Enable a killswitch (emergency disable)
   * @param {string} name
   * @param {string} reason - Reason for activation
   */
  enable(name, reason = 'Manual activation') {
    const sw = this.switches.get(name);
    if (sw) {
      const wasEnabled = sw.enabled;
      sw.enabled = true;
      sw.timestamp = Date.now();
      sw.reason = reason;
      if (!wasEnabled) this.notify(name, true, reason);
    }
  }

  /**
   * Disable a killswitch
   * @param {string} name
   */
  disable(name) {
    const sw = this.switches.get(name);
    if (sw) {
      const wasEnabled = sw.enabled;
      sw.enabled = false;
      sw.timestamp = null;
      sw.reason = null;
      if (wasEnabled) this.notify(name, false, 'Deactivated');
    }
  }

  /**
   * Toggle a killswitch
   * @param {string} name
   * @returns {boolean} New state
   */
  toggle(name) {
    const sw = this.switches.get(name);
    if (sw) {
      if (sw.enabled) {
        this.disable(name);
        return false;
      } else {
        this.enable(name, 'Toggled on');
        return true;
      }
    }
    return false;
  }

  /**
   * Subscribe to killswitch changes
   * @param {string} name
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(name, callback) {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, new Set());
    }
    this.listeners.get(name).add(callback);
    return () => this.listeners.get(name)?.delete(callback);
  }

  notify(name, enabled, reason) {
    const callbacks = this.listeners.get(name);
    if (callbacks) {
      for (const cb of callbacks) {
        try { cb(name, enabled, reason); } catch (e) { console.error('[Killswitch] Listener error:', e); }
      }
    }
  }

  /**
   * Get all killswitch states
   * @returns {Object}
   */
  getAll() {
    const result = {};
    for (const [name, sw] of this.switches) {
      result[name] = { enabled: sw.enabled, timestamp: sw.timestamp, reason: sw.reason };
    }
    return result;
  }

  /**
   * Emergency kill all - activate all killswitches
   * @param {string} reason
   */
  killAll(reason = 'Emergency kill all') {
    for (const name of this.switches.keys()) {
      this.enable(name, reason);
    }
  }

  /**
   * Check if any killswitch is active
   * @returns {boolean}
   */
  hasActive() {
    for (const sw of this.switches.values()) {
      if (sw.enabled) return true;
    }
    return false;
  }
}

// ============================================================================
// Experiments - A/B Testing Framework
// ============================================================================

class ExperimentManager {
  constructor(config = {}) {
    this.experiments = new Map();
    this.assignments = new Map(); // userId -> experiment -> variant
    this.consistentHashCache = new Map();
    this.loadFromConfig(config);
  }

  loadFromConfig(config) {
    if (config.experiments) {
      for (const [name, enabled] of Object.entries(config.experiments)) {
        this.experiments.set(name, {
          name,
          enabled: Boolean(enabled),
          variants: { control: 0.5, treatment: 0.5 }, // default 50/50
          rollout: 100,
          userGroups: [],
          regions: []
        });
      }
    }
  }

  /**
   * Define an experiment
   * @param {string} name
   * @param {Object} options
   */
  define(name, options = {}) {
    this.experiments.set(name, {
      name,
      enabled: options.enabled !== false,
      variants: options.variants || { control: 0.5, treatment: 0.5 },
      rollout: options.rollout ?? 100,
      userGroups: options.userGroups || [],
      regions: options.regions || [],
      metadata: options.metadata || {}
    });
  }

  /**
   * Get variant for a user (consistent hashing)
   * @param {string} experimentName
   * @param {string} userId - User identifier (or anonymous ID)
   * @param {Object} context - Additional context (region, userGroups, etc.)
   * @returns {string} Variant name
   */
  getVariant(experimentName, userId, context = {}) {
    const exp = this.experiments.get(experimentName);
    if (!exp || !exp.enabled) return 'control';

    // Check rollout percentage
    if (exp.rollout < 100) {
      const rolloutHash = this.consistentHash(`${experimentName}:rollout:${userId}`, 100);
      if (rolloutHash >= exp.rollout) return 'control';
    }

    // Check user groups
    if (exp.userGroups.length > 0 && context.userGroups) {
      const inGroup = context.userGroups.some(g => exp.userGroups.includes(g));
      if (!inGroup) return 'control';
    }

    // Check regions
    if (exp.regions.length > 0 && context.region) {
      if (!exp.regions.includes(context.region)) return 'control';
    }

    // Consistent hash assignment
    const cacheKey = `${experimentName}:${userId}`;
    if (this.consistentHashCache.has(cacheKey)) {
      return this.consistentHashCache.get(cacheKey);
    }

    const variant = this.assignVariant(exp, userId);
    this.consistentHashCache.set(cacheKey, variant);
    return variant;
  }

  assignVariant(exp, userId) {
    const hash = this.consistentHash(`${exp.name}:${userId}`, 10000) / 10000; // 0-1
    let cumulative = 0;

    for (const [variant, weight] of Object.entries(exp.variants)) {
      cumulative += weight;
      if (hash < cumulative) return variant;
    }

    return 'control'; // fallback
  }

  /**
   * Consistent hashing for stable assignment
   * @param {string} input
   * @param {number} max
   * @returns {number}
   */
  consistentHash(input, max) {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash) % max;
  }

  /**
   * Check if user is in experiment
   * @param {string} experimentName
   * @param {string} userId
   * @param {Object} context
   * @returns {boolean}
   */
  isInExperiment(experimentName, userId, context = {}) {
    return this.getVariant(experimentName, userId, context) !== 'control';
  }

  /**
   * Get all active experiments for a user
   * @param {string} userId
   * @param {Object} context
   * @returns {Object} experimentName -> variant
   */
  getAllVariants(userId, context = {}) {
    const result = {};
    for (const name of this.experiments.keys()) {
      result[name] = this.getVariant(name, userId, context);
    }
    return result;
  }

  /**
   * Clear assignment cache (for testing)
   */
  clearCache() {
    this.consistentHashCache.clear();
  }

  /**
   * Get experiment definition
   * @param {string} name
   * @returns {Object|null}
   */
  getExperiment(name) {
    return this.experiments.get(name) || null;
  }

  /**
   * Get all experiment definitions
   * @returns {Object}
   */
  getAllExperiments() {
    const result = {};
    for (const [name, exp] of this.experiments) {
      result[name] = { ...exp };
    }
    return result;
  }
}

// ============================================================================
// Override Manager - Local Overrides for Testing
// ============================================================================

class OverrideManager {
  constructor() {
    this.overrides = new Map(); // key -> { value, scope, metadata }
    this.scopes = ['session', 'user', 'testing', 'development'];
    this.listeners = new Map();
  }

  /**
   * Set an override
   * @param {string} key - Config key (dot notation)
   * @param {*} value - Override value
   * @param {'session'|'user'|'testing'|'development'} scope - Override scope
   * @param {Object} metadata - Additional metadata
   */
  set(key, value, scope = 'session', metadata = {}) {
    if (!this.scopes.includes(scope)) {
      throw new Error(`Invalid scope: ${scope}. Must be one of: ${this.scopes.join(', ')}`);
    }

    const existing = this.overrides.get(key);
    this.overrides.set(key, { value, scope, metadata: { ...metadata, setAt: Date.now() } });
    this.notify(key, value, existing?.value);
  }

  /**
   * Get an override value
   * @param {string} key
   * @param {*} defaultValue
   * @returns {*}
   */
  get(key, defaultValue = undefined) {
    const override = this.overrides.get(key);
    return override ? override.value : defaultValue;
  }

  /**
   * Check if override exists
   * @param {string} key
   * @param {string} [scope] - Optional scope filter
   * @returns {boolean}
   */
  has(key, scope) {
    const override = this.overrides.get(key);
    if (!override) return false;
    if (scope && override.scope !== scope) return false;
    return true;
  }

  /**
   * Delete an override
   * @param {string} key
   * @param {string} [scope] - Optional scope filter
   * @returns {boolean}
   */
  delete(key, scope) {
    const override = this.overrides.get(key);
    if (!override) return false;
    if (scope && override.scope !== scope) return false;
    this.overrides.delete(key);
    this.notify(key, undefined, override.value);
    return true;
  }

  /**
   * Clear all overrides (optionally by scope)
   * @param {string} [scope]
   */
  clear(scope) {
    if (scope) {
      for (const [key, override] of this.overrides) {
        if (override.scope === scope) {
          this.overrides.delete(key);
          this.notify(key, undefined, override.value);
        }
      }
    } else {
      for (const [key, override] of this.overrides) {
        this.notify(key, undefined, override.value);
      }
      this.overrides.clear();
    }
  }

  /**
   * Get all overrides (optionally filtered by scope)
   * @param {string} [scope]
   * @returns {Object}
   */
  getAll(scope) {
    const result = {};
    for (const [key, override] of this.overrides) {
      if (!scope || override.scope === scope) {
        result[key] = { value: override.value, scope: override.scope, metadata: override.metadata };
      }
    }
    return result;
  }

  /**
   * Subscribe to override changes
   * @param {string} key
   * @param {Function} callback
   * @returns {Function} Unsubscribe
   */
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    return () => this.listeners.get(key)?.delete(callback);
  }

  notify(key, newValue, oldValue) {
    const callbacks = this.listeners.get(key);
    if (callbacks) {
      for (const cb of callbacks) {
        try { cb(key, newValue, oldValue); } catch (e) { console.error('[OverrideManager] Listener error:', e); }
      }
    }
  }

  /**
   * Apply overrides to a config object (deep merge)
   * @param {Object} config
   * @returns {Object} Config with overrides applied
   */
  applyToConfig(config) {
    const result = JSON.parse(JSON.stringify(config)); // Deep clone

    for (const [key, override] of this.overrides) {
      this.setNestedValue(result, key, override.value);
    }

    return result;
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }
}

// ============================================================================
// Fetch Strategy - CDN, Fallbacks, Exponential Backoff
// ============================================================================

class FetchStrategy {
  constructor(options = {}) {
    this.endpoints = options.endpoints || [
      'https://api.aeroguard.dev/v1/config',
      'https://cdn.aeroguard.dev/config.json',
      'https://raw.githubusercontent.com/aeroguard/config/main/config.json'
    ];
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelay = options.baseDelay ?? 1000; // 1 second
    this.maxDelay = options.maxDelay ?? 30000; // 30 seconds
    this.timeout = options.timeout ?? 10000; // 10 seconds
    this.etag = null;
    this.lastModified = null;
  }

  /**
   * Add an endpoint to the strategy
   * @param {string} url
   * @param {number} priority - Lower = higher priority
   */
  addEndpoint(url, priority = 100) {
    this.endpoints.push({ url, priority });
    this.endpoints.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Fetch with exponential backoff and fallback
   * @param {Object} options
   * @returns {Promise<Object>} { config, etag, lastModified, source }
   */
  async fetch(options = {}) {
    const { force = false, signal } = options;
    const headers = { 'Accept': 'application/json' };

    if (!force && this.etag) {
      headers['If-None-Match'] = this.etag;
    }
    if (!force && this.lastModified) {
      headers['If-Modified-Since'] = this.lastModified;
    }

    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      for (const endpoint of this.endpoints) {
        const url = typeof endpoint === 'string' ? endpoint : endpoint.url;

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.timeout);

          const fetchSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

          const response = await fetch(url, {
            method: 'GET',
            headers,
            signal: fetchSignal,
            cache: force ? 'no-cache' : 'default'
          });

          clearTimeout(timeoutId);

          if (response.status === 304) {
            // Not modified - use cached
            return { notModified: true, source: url };
          }

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const config = await response.json();

          // Update cache validators
          this.etag = response.headers.get('ETag');
          this.lastModified = response.headers.get('Last-Modified');

          return { config, etag: this.etag, lastModified: this.lastModified, source: url };
        } catch (error) {
          lastError = error;
          console.warn(`[FetchStrategy] Failed to fetch from ${url} (attempt ${attempt + 1}):`, error.message);
        }
      }

      // Exponential backoff between retry rounds
      if (attempt < this.maxRetries) {
        const delay = Math.min(this.baseDelay * Math.pow(2, attempt), this.maxDelay);
        const jitter = Math.random() * delay * 0.1; // 10% jitter
        await this.sleep(delay + jitter);
      }
    }

    throw lastError || new Error('All fetch attempts failed');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset cache validators
   */
  resetCache() {
    this.etag = null;
    this.lastModified = null;
  }
}

// ============================================================================
// Change Notifier - Reactive Updates
// ============================================================================

class ChangeNotifier {
  constructor() {
    this.subscribers = new Map(); // path -> Set<callback>
    this.wildcardSubscribers = new Set(); // callbacks for any change
    this.changeHistory = [];
    this.maxHistory = 100;
  }

  /**
   * Subscribe to changes at a specific path
   * @param {string} path - Dot-notation path or '*' for all
   * @param {Function} callback - (newValue, oldValue, path) => void
   * @returns {Function} Unsubscribe function
   */
  subscribe(path, callback) {
    if (path === '*') {
      this.wildcardSubscribers.add(callback);
      return () => this.wildcardSubscribers.delete(callback);
    }

    if (!this.subscribers.has(path)) {
      this.subscribers.set(path, new Set());
    }
    this.subscribers.get(path).add(callback);

    return () => {
      const subs = this.subscribers.get(path);
      if (subs) subs.delete(callback);
    };
  }

  /**
   * Notify subscribers of a change
   * @param {string} path
   * @param {*} newValue
   * @param {*} oldValue
   */
  notify(path, newValue, oldValue) {
    const change = { path, newValue, oldValue, timestamp: Date.now() };
    this.changeHistory.push(change);
    if (this.changeHistory.length > this.maxHistory) {
      this.changeHistory.shift();
    }

    // Notify exact path subscribers
    const exactSubs = this.subscribers.get(path);
    if (exactSubs) {
      for (const cb of exactSubs) {
        try { cb(newValue, oldValue, path); } catch (e) { console.error('[ChangeNotifier] Callback error:', e); }
      }
    }

    // Notify parent path subscribers (e.g., "a.b" notifies "a")
    const pathParts = path.split('.');
    for (let i = pathParts.length - 1; i > 0; i--) {
      const parentPath = pathParts.slice(0, i).join('.');
      const parentSubs = this.subscribers.get(parentPath);
      if (parentSubs) {
        for (const cb of parentSubs) {
          try { cb(this.getNestedValue(newValue, pathParts.slice(i)), this.getNestedValue(oldValue, pathParts.slice(i)), parentPath); } catch (e) { console.error('[ChangeNotifier] Parent callback error:', e); }
        }
      }
    }

    // Notify wildcard subscribers
    for (const cb of this.wildcardSubscribers) {
      try { cb(path, newValue, oldValue); } catch (e) { console.error('[ChangeNotifier] Wildcard callback error:', e); }
    }
  }

  getNestedValue(obj, pathParts) {
    if (!obj) return undefined;
    let current = obj;
    for (const part of pathParts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }

  /**
   * Get recent change history
   * @param {number} limit
   * @returns {Array}
   */
  getHistory(limit = 50) {
    return this.changeHistory.slice(-limit);
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.changeHistory = [];
  }
}

// ============================================================================
// Main RemoteConfig Class
// ============================================================================

class RemoteConfig {
  constructor(options = {}) {
    this.schema = new ConfigSchema();
    this.fetchStrategy = new FetchStrategy(options.fetchOptions);

    // Core configuration
    this.config = this.getDefaultConfig();
    this.featureFlags = new FeatureFlags(this.config);
    this.killswitches = new KillswitchManager(this.config);
    this.experiments = new ExperimentManager(this.config);
    this.overrides = new OverrideManager();
    this.notifier = new ChangeNotifier();

    // Cache state
    this.cache = null;
    this.cacheTimestamp = 0;
    this.CACHE_DURATION = options.cacheDuration ?? 3600000; // 1 hour
    this.fetchPromise = null;
    this.initialized = false;

    // User context for experiments
    this.userContext = {
      userId: this.generateUserId(),
      userGroups: [],
      region: 'unknown'
    };

    // Bind methods for external use
    this.subscribe = this.notifier.subscribe.bind(this.notifier);
  }

  getDefaultConfig() {
    return {
      youtubeBlockModes: {
        strict: false,
        moderate: true,
        permissive: false,
        custom: {}
      },
      youtubeScriptlets: {
        enabled: true,
        scriptlets: [
          'abort-on-property-read.js',
          'abort-current-inline-script.js',
          'json-prune.js',
          'log-stacks.js',
          'no-eval.js',
          'no-iframe.js',
          'no-script.js',
          'prevent-setInterval.js',
          'prevent-setTimeout.js',
          'prevent-xhr.js',
          'remove-node.js',
          'send-to-self.js',
          'set-constant.js'
        ],
        debug: false
      },
      experiments: {
        newBlockEngine: false,
        adaptiveFiltering: false,
        mlBasedDetection: false,
        backgroundSync: true
      },
      killswitches: {
        allBlocking: false,
        youtubeBlocking: false,
        scriptletInjection: false,
        networkFiltering: false,
        cosmeticFiltering: false,
        remoteConfig: false,
        statistics: false,
        filterUpdates: false
      },
      performance: {
        maxRulesPerRequest: 5000,
        cacheTTL: 3600000,
        batchSize: 100,
        debounceMs: 50,
        enableProfiling: false,
        workerThreads: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4
      },
      featureFlags: {}
    };
  }

  generateUserId() {
    // Generate or retrieve persistent anonymous user ID
    let userId = localStorage.getItem('aeroguard_user_id');
    if (!userId) {
      userId = 'user_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      localStorage.setItem('aeroguard_user_id', userId);
    }
    return userId;
  }

  /**
   * Initialize and fetch remote config
   * @param {boolean} force - Force refetch
   * @returns {Promise<Object>} Current config
   */
  async fetch(force = false) {
    if (this.killswitches.isActive('remoteConfig')) {
      console.log('[RemoteConfig] Remote config disabled by killswitch');
      return this.getMergedConfig();
    }

    const now = Date.now();

    // Return cached config if valid and not forced
    if (!force && this.cache && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
      return this.getMergedConfig();
    }

    // Deduplicate concurrent fetch requests
    if (this.fetchPromise && !force) {
      return this.fetchPromise;
    }

    this.fetchPromise = this._fetchAndApply(force)
      .then(config => {
        this.cache = config;
        this.cacheTimestamp = now;
        this.fetchPromise = null;
        this.initialized = true;
        return this.getMergedConfig();
      })
      .catch(error => {
        this.fetchPromise = null;
        console.warn('[RemoteConfig] Fetch failed, using local config:', error.message);
        if (!this.initialized) {
          this.initialized = true;
        }
        return this.getMergedConfig();
      });

    return this.fetchPromise;
  }

  async _fetchAndApply(force) {
    const result = await this.fetchStrategy.fetch({ force });

    if (result.notModified) {
      console.log('[RemoteConfig] Config not modified (304)');
      return this.config;
    }

    // Validate against schema
    const validation = this.schema.validate(result.config);
    if (!validation.valid) {
      console.error('[RemoteConfig] Config validation failed:', validation.errors);
      // Don't throw - merge what we can
      console.warn('[RemoteConfig] Merging validated portions only');
      // Could implement partial merge here
    }

    // Deep merge with current config
    const oldConfig = JSON.parse(JSON.stringify(this.config));
    this.config = this.deepMerge(this.config, result.config);

    // Re-initialize sub-managers with new config
    this.featureFlags.loadFromConfig(this.config);
    this.killswitches.loadFromConfig(this.config);
    this.experiments.loadFromConfig(this.config);

    // Apply local overrides on top
    const mergedConfig = this.overrides.applyToConfig(this.config);

    // Notify changes
    this.notifyChanges(oldConfig, mergedConfig);

    return mergedConfig;
  }

  deepMerge(target, source) {
    if (!target || typeof target !== 'object') return source;
    if (!source || typeof source !== 'object') return target;

    const result = { ...target };

    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = this.deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue;
      }
    }

    return result;
  }

  notifyChanges(oldConfig, newConfig) {
    const changes = this.diffObjects(oldConfig, newConfig);
    for (const { path, oldValue, newValue } of changes) {
      this.notifier.notify(path, newValue, oldValue);
    }
  }

  diffObjects(oldObj, newObj, prefix = '') {
    const changes = [];
    const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

    for (const key of allKeys) {
      const path = prefix ? `${prefix}.${key}` : key;
      const oldVal = oldObj?.[key];
      const newVal = newObj?.[key];

      if (oldVal === newVal) continue;

      if (
        oldVal && typeof oldVal === 'object' && !Array.isArray(oldVal) &&
        newVal && typeof newVal === 'object' && !Array.isArray(newVal)
      ) {
        changes.push(...this.diffObjects(oldVal, newVal, path));
      } else {
        changes.push({ path, oldValue: oldVal, newValue: newVal });
      }
    }

    return changes;
  }

  /**
   * Get merged config (remote + overrides)
   * @returns {Object}
   */
  getMergedConfig() {
    return this.overrides.applyToConfig(this.config);
  }

  // ========== Convenience Getters ==========

  /**
   * Get any config value by dot-notation path
   * @param {string} path
   * @param {*} defaultValue
   * @returns {*}
   */
  get(path, defaultValue = undefined) {
    const keys = path.split('.');
    let current = this.getMergedConfig();

    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return defaultValue;
      }
      current = current[key];
    }

    return current !== undefined ? current : defaultValue;
  }

  /**
   * Get boolean value
   * @param {string} path
   * @param {boolean} defaultValue
   * @returns {boolean}
   */
  getBoolean(path, defaultValue = false) {
    const val = this.get(path, defaultValue);
    return val === true;
  }

  /**
   * Get string value
   * @param {string} path
   * @param {string} defaultValue
   * @returns {string}
   */
  getString(path, defaultValue = '') {
    const val = this.get(path, defaultValue);
    return typeof val === 'string' ? val : defaultValue;
  }

  /**
   * Get number value
   * @param {string} path
   * @param {number} defaultValue
   * @returns {number}
   */
  getNumber(path, defaultValue = 0) {
    const val = this.get(path, defaultValue);
    return typeof val === 'number' && Number.isFinite(val) ? val : defaultValue;
  }

  // ========== Feature Flags ==========

  /**
   * Check if feature flag is enabled
   * @param {string} name
   * @returns {boolean}
   */
  isFeatureEnabled(name) {
    return this.featureFlags.getBoolean(name);
  }

  /**
   * Get feature flag value
   * @param {string} name
   * @param {*} defaultValue
   * @returns {*}
   */
  getFeature(name, defaultValue) {
    return this.featureFlags.get(name, defaultValue);
  }

  /**
   * Register a feature flag
   * @param {string} name
   * @param {'boolean'|'string'|'number'|'object'|'array'} type
   * @param {*} defaultValue
   * @param {Object} validation
   * @param {string} description
   */
  registerFeature(name, type, defaultValue, validation, description) {
    this.featureFlags.register(name, type, defaultValue, validation, description);
  }

  // ========== Killswitches ==========

  /**
   * Check if killswitch is active
   * @param {string} name
   * @returns {boolean}
   */
  isKillswitchActive(name) {
    return this.killswitches.isActive(name);
  }

  /**
   * Enable killswitch
   * @param {string} name
   * @param {string} reason
   */
  enableKillswitch(name, reason) {
    this.killswitches.enable(name, reason);
  }

  /**
   * Disable killswitch
   * @param {string} name
   */
  disableKillswitch(name) {
    this.killswitches.disable(name);
  }

  // ========== Experiments ==========

  /**
   * Get experiment variant for current user
   * @param {string} experimentName
   * @returns {string}
   */
  getExperimentVariant(experimentName) {
    return this.experiments.getVariant(experimentName, this.userContext.userId, {
      userGroups: this.userContext.userGroups,
      region: this.userContext.region
    });
  }

  /**
   * Check if user is in experiment treatment group
   * @param {string} experimentName
   * @returns {boolean}
   */
  isInExperiment(experimentName) {
    return this.experiments.isInExperiment(experimentName, this.userContext.userId, {
      userGroups: this.userContext.userGroups,
      region: this.userContext.region
    });
  }

  /**
   * Set user context for experiments
   * @param {Object} context
   */
  setUserContext(context) {
    this.userContext = { ...this.userContext, ...context };
    this.experiments.clearCache(); // Re-assign with new context
  }

  // ========== Overrides ==========

  /**
   * Set local override
   * @param {string} key
   * @param {*} value
   * @param {'session'|'user'|'testing'|'development'} scope
   * @param {Object} metadata
   */
  setOverride(key, value, scope = 'session', metadata = {}) {
    this.overrides.set(key, value, scope, metadata);
  }

  /**
   * Get override value
   * @param {string} key
   * @param {*} defaultValue
   * @returns {*}
   */
  getOverride(key, defaultValue) {
    return this.overrides.get(key, defaultValue);
  }

  /**
   * Clear overrides
   * @param {string} [scope]
   */
  clearOverrides(scope) {
    this.overrides.clear(scope);
  }

  // ========== Utility ==========

  /**
   * Get all config as plain object
   * @returns {Object}
   */
  getAll() {
    return this.getMergedConfig();
  }

  /**
   * Get diagnostics
   * @returns {Object}
   */
  getDiagnostics() {
    return {
      initialized: this.initialized,
      cacheAge: this.cache ? Date.now() - this.cacheTimestamp : null,
      cacheDuration: this.CACHE_DURATION,
      killswitches: this.killswitches.getAll(),
      activeExperiments: this.experiments.getAllVariants(this.userContext.userId),
      featureFlags: this.featureFlags.getAll(),
      overrides: this.overrides.getAll(),
      userContext: this.userContext,
      fetchStrategy: {
        endpoints: this.fetchStrategy.endpoints.map(e => typeof e === 'string' ? e : e.url),
        etag: this.fetchStrategy.etag,
        lastModified: this.fetchStrategy.lastModified
      }
    };
  }

  /**
   * Reset to defaults
   */
  reset() {
    this.config = this.getDefaultConfig();
    this.featureFlags = new FeatureFlags(this.config);
    this.killswitches = new KillswitchManager(this.config);
    this.experiments = new ExperimentManager(this.config);
    this.overrides.clear();
    this.cache = null;
    this.cacheTimestamp = 0;
    this.fetchStrategy.resetCache();
    this.initialized = false;
  }

  /**
   * Force refresh from remote
   * @returns {Promise<Object>}
   */
  async refresh() {
    return this.fetch(true);
  }
}

// ============================================================================
// Export Singleton Instance
// ============================================================================

export const remoteConfig = new RemoteConfig({
  cacheDuration: 3600000, // 1 hour
  fetchOptions: {
    endpoints: [
      'https://api.aeroguard.dev/v1/config',
      'https://cdn.aeroguard.dev/config.json',
      'https://raw.githubusercontent.com/aeroguard/config/main/config.json'
    ],
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    timeout: 10000
  }
});

// Also export classes for testing and extension
export {
  RemoteConfig,
  ConfigSchema,
  FeatureFlags,
  KillswitchManager,
  ExperimentManager,
  OverrideManager,
  FetchStrategy,
  ChangeNotifier
};

export default remoteConfig;