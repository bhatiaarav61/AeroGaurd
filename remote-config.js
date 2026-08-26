/**
 * RemoteConfig - Feature flag and configuration management
 * Provides fetch with caching, feature flag checks, and deep merge utilities
 */

class RemoteConfig {
  constructor() {
    this.config = {
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
        cosmeticFiltering: false
      },
      performance: {
        maxRulesPerRequest: 5000,
        cacheTTL: 3600000,
        batchSize: 100,
        debounceMs: 50,
        enableProfiling: false,
        workerThreads: navigator.hardwareConcurrency || 4
      }
    };

    this.cache = null;
    this.cacheTimestamp = 0;
    this.CACHE_DURATION = 3600000; // 1 hour in ms
    this.fetchPromise = null;
  }

  /**
   * Fetch remote configuration with 1-hour cache
   * @param {boolean} force - Force refetch ignoring cache
   * @returns {Promise<Object>} Configuration object
   */
  async fetch(force = false) {
    const now = Date.now();

    // Return cached config if valid and not forced
    if (!force && this.cache && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
      return this.cache;
    }

    // Deduplicate concurrent fetch requests
    if (this.fetchPromise && !force) {
      return this.fetchPromise;
    }

    this.fetchPromise = this._fetchRemoteConfig()
      .then(config => {
        this.cache = config;
        this.cacheTimestamp = now;
        this.config = this.deepMerge(this.config, config);
        this.fetchPromise = null;
        return this.config;
      })
      .catch(error => {
        this.fetchPromise = null;
        console.warn('[RemoteConfig] Fetch failed, using local config:', error);
        return this.config;
      });

    return this.fetchPromise;
  }

  /**
   * Internal fetch implementation
   * @returns {Promise<Object>} Remote configuration
   */
  async _fetchRemoteConfig() {
    // In production, this would fetch from a remote endpoint
    // For now, return empty config to use defaults
    const response = await fetch('https://api.aeroguard.dev/v1/config', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      },
      // Short timeout for remote config
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Check if a feature flag is enabled
   * @param {string} path - Dot-notation path to flag (e.g., 'youtubeBlockModes.strict')
   * @returns {boolean} Whether the flag is enabled
   */
  isEnabled(path) {
    const value = this.get(path);
    return value === true;
  }

  /**
   * Get a configuration value by dot-notation path
   * @param {string} path - Dot-notation path (e.g., 'performance.maxRulesPerRequest')
   * @param {*} defaultValue - Default value if path not found
   * @returns {*} Configuration value
   */
  get(path, defaultValue = undefined) {
    const keys = path.split('.');
    let current = this.config;

    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return defaultValue;
      }
      current = current[key];
    }

    return current !== undefined ? current : defaultValue;
  }

  /**
   * Deep merge two objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} Merged object
   */
  deepMerge(target, source) {
    if (!target || typeof target !== 'object') {
      return source;
    }
    if (!source || typeof source !== 'object') {
      return target;
    }

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

  /**
   * Set a configuration value (for testing or runtime updates)
   * @param {string} path - Dot-notation path
   * @param {*} value - Value to set
   */
  set(path, value) {
    const keys = path.split('.');
    let current = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Reset to default configuration
   */
  reset() {
    this.config = {
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
        cosmeticFiltering: false
      },
      performance: {
        maxRulesPerRequest: 5000,
        cacheTTL: 3600000,
        batchSize: 100,
        debounceMs: 50,
        enableProfiling: false,
        workerThreads: navigator.hardwareConcurrency || 4
      }
    };
    this.cache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Get all configuration as a plain object
   * @returns {Object} Complete configuration
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Check if any killswitch is active
   * @returns {boolean}
   */
  hasActiveKillswitch() {
    return Object.values(this.config.killswitches).some(v => v === true);
  }

  /**
   * Get active experiment names
   * @returns {string[]}
   */
  getActiveExperiments() {
    return Object.entries(this.config.experiments)
      .filter(([, enabled]) => enabled === true)
      .map(([name]) => name);
  }
}

// Export global singleton instance
export const remoteConfig = new RemoteConfig();

// Also export class for testing
export { RemoteConfig };

// Default export for convenience
export default remoteConfig;