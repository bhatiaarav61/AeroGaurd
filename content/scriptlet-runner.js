/**
 * Scriptlet Runner v2 — Secure injection, error boundaries, per-origin isolation, hot-reload without refresh
 * Executes compiled scriptlets in MAIN world with full sandboxing and dynamic updates
 */

(() => {
  'use strict';

  const CONFIG = {
    debug: false,
    maxExecutionTime: 50,           // ms per scriptlet per frame
    trustedTypesPolicy: 'aeroguard-scriptlets',
    hotReloadEnabled: true,
    hotReloadInterval: 30000,       // ms between hot-reload checks
    maxRetries: 3,
    retryDelay: 1000,
    isolationLevel: 'strict'        // 'strict' | 'moderate' | 'permissive'
  };

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  const scriptletCache = new Map();           // name -> { code, version, hash, compiledAt, metadata }
  const executionStats = new Map();           // origin -> { executions, errors, totalTime, lastError }
  const errorBoundaries = new Map();          // name -> { failures, lastFailure, disabled }
  const executionContexts = new Map();        // origin -> isolated context
  const pendingExecutions = new Map();        // executionId -> { resolve, reject, timeout }
  let hotReloadTimer = null;
  let isInitialized = false;
  let currentVersion = 0;

  // ============================================================================
  // LOGGING
  // ============================================================================

  function log(...args) { if (CONFIG.debug) console.log('[ScriptletRunner]', ...args); }
  function warn(...args) { if (CONFIG.debug) console.warn('[ScriptletRunner]', ...args); }
  function error(...args) { if (CONFIG.debug) console.error('[ScriptletRunner]', ...args); }
  function debug(...args) { if (CONFIG.debug) console.debug('[ScriptletRunner]', ...args); }

  // ============================================================================
  // TRUSTED TYPES POLICY
  // ============================================================================

  function createTrustedTypesPolicy() {
    if (window.trustedTypes && !CONFIG.debug) {
      try {
        window.trustedTypes.createPolicy(CONFIG.trustedTypesPolicy, {
          createScriptURL: (url) => url,
          createScript: (script) => script,
          createHTML: (html) => html
        });
        log('Trusted Types policy created:', CONFIG.trustedTypesPolicy);
      } catch (e) {
        warn('Trusted Types policy creation failed:', e);
      }
    }
  }

  // ============================================================================
  // ERROR BOUNDARIES
  // ============================================================================

  class ErrorBoundary {
    constructor(name, options = {}) {
      this.name = name;
      this.maxFailures = options.maxFailures || 5;
      this.failureWindow = options.failureWindow || 60000; // 1 minute
      this.failures = [];
      this.disabled = false;
      this.lastFailure = null;
    }

    recordFailure(err) {
      const now = Date.now();
      this.failures.push({ error: err, timestamp: now });
      this.lastFailure = { error: err, timestamp: now };

      // Clean old failures outside window
      this.failures = this.failures.filter(f => now - f.timestamp < this.failureWindow);

      if (this.failures.length >= this.maxFailures) {
        this.disabled = true;
        error(`Error boundary triggered for ${this.name}: ${this.failures.length} failures in ${this.failureWindow}ms. Disabling scriptlet.`);
        this.notifyDisabled();
      }
    }

    recordSuccess() {
      this.failures = [];
      this.disabled = false;
    }

    isHealthy() {
      return !this.disabled && this.failures.length < this.maxFailures;
    }

    notifyDisabled() {
      chrome.runtime.sendMessage({
        type: 'SCRIPTLET_DISABLED',
        name: this.name,
        failures: this.failures.length,
        lastError: this.lastFailure?.error?.message
      }).catch(() => {});
    }

    reset() {
      this.failures = [];
      this.disabled = false;
      this.lastFailure = null;
    }

    getStatus() {
      return {
        name: this.name,
        disabled: this.disabled,
        failureCount: this.failures.length,
        lastFailure: this.lastFailure
      };
    }
  }

  function getErrorBoundary(name) {
    if (!errorBoundaries.has(name)) {
      errorBoundaries.set(name, new ErrorBoundary(name));
    }
    return errorBoundaries.get(name);
  }

  // ============================================================================
  // PER-ORIGIN ISOLATION
  // ============================================================================

  function createIsolatedContext(origin) {
    if (executionContexts.has(origin)) {
      return executionContexts.get(origin);
    }

    const isolatedWindow = createIsolatedWindow(origin);
    const isolatedDocument = createIsolatedDocument();
    const isolatedNavigator = createIsolatedNavigator();
    const isolatedConsole = createIsolatedConsole();
    const isolatedChrome = createIsolatedChrome();
    const isolatedLocation = createIsolatedLocation(origin);
    const isolatedHistory = createIsolatedHistory();
    const isolatedLocalStorage = createIsolatedStorage('localStorage');
    const isolatedSessionStorage = createIsolatedStorage('sessionStorage');

    const context = {
      window: isolatedWindow,
      document: isolatedDocument,
      navigator: isolatedNavigator,
      console: isolatedConsole,
      chrome: isolatedChrome,
      location: isolatedLocation,
      history: isolatedHistory,
      localStorage: isolatedLocalStorage,
      sessionStorage: isolatedSessionStorage,
      // Security: Prevent prototype pollution
      __proto__: null
    };

    // Freeze the context to prevent modification
    Object.freeze(context);
    Object.freeze(context.window);
    Object.freeze(context.document);
    Object.freeze(context.navigator);
    Object.freeze(context.console);
    Object.freeze(context.chrome);
    Object.freeze(context.location);
    Object.freeze(context.history);
    Object.freeze(context.localStorage);
    Object.freeze(context.sessionStorage);

    executionContexts.set(origin, context);
    return context;
  }

  function createIsolatedWindow(origin) {
    const isolatedLocation = createIsolatedLocation(origin);

    const allowedGlobals = {
      // Safe globals
      console: createIsolatedConsole(),
      Promise,
      fetch: fetch.bind(window),
      XMLHttpRequest,
      WebSocket,
      EventSource,
      performance,
      crypto,
      requestAnimationFrame: requestAnimationFrame.bind(window),
      cancelAnimationFrame: cancelAnimationFrame.bind(window),
      setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 1000)),
      setInterval: (fn, ms) => setInterval(fn, Math.max(ms || 1000, 1000)),
      clearTimeout,
      clearInterval,
      // Location (read-only)
      location: isolatedLocation,
      // Navigator (restricted)
      navigator: createIsolatedNavigator(),
      // Document (restricted)
      document: createIsolatedDocument(),
      // Chrome API (restricted)
      chrome: createIsolatedChrome(),
      // History (read-only)
      history: createIsolatedHistory(),
      // Storage (read-only)
      localStorage: createIsolatedStorage('localStorage'),
      sessionStorage: createIsolatedStorage('sessionStorage'),
      // Origin info
      origin,
      // Security: Block dangerous globals
      get eval() { throw new SecurityError('eval() not allowed in scriptlets'); },
      get Function() { throw new SecurityError('Function constructor not allowed in scriptlets'); },
      get setTimeout() { return (fn, ms) => setTimeout(fn, Math.min(ms || 0, 1000)); },
      get setInterval() { return (fn, ms) => setInterval(fn, Math.max(ms || 1000, 1000)); }
    };

    // Create a proxy that only exposes allowed globals
    const handler = {
      get(target, prop) {
        if (prop in allowedGlobals) return allowedGlobals[prop];

        // Block dangerous globals explicitly
        const dangerous = ['eval', 'Function', 'setTimeout', 'setInterval', 'Function', 'arguments', 'caller'];
        if (dangerous.includes(prop)) {
          throw new SecurityError(`${prop} not allowed in scriptlets`);
        }

        // Allow access to safe window properties
        const safeProps = ['innerWidth', 'innerHeight', 'devicePixelRatio', 'screen', 'self', 'window', 'parent', 'top', 'frames', 'name', 'closed', 'opener', 'length', 'frameElement'];
        if (safeProps.includes(prop)) {
          return target[prop];
        }

        // Block everything else
        warn(`Blocked access to window.${prop}`);
        return undefined;
      },
      set(target, prop, value) {
        // Prevent setting on protected properties
        if (prop in allowedGlobals) return true;
        return Reflect.set(target, prop, value);
      },
      has(target, prop) {
        return prop in allowedGlobals || ['innerWidth', 'innerHeight', 'devicePixelRatio'].includes(prop);
      },
      ownKeys(target) {
        return Object.keys(allowedGlobals).concat(['innerWidth', 'innerHeight', 'devicePixelRatio']);
      },
      getOwnPropertyDescriptor(target, prop) {
        if (prop in allowedGlobals) {
          return { configurable: true, enumerable: true, value: allowedGlobals[prop] };
        }
        return Object.getOwnPropertyDescriptor(target, prop);
      }
    };

    return new Proxy(window, handler);
  }

  function createIsolatedDocument() {
    const dangerousMethods = ['write', 'writeln', 'open', 'close', 'createElement', 'createElementNS', 'createDocumentFragment'];
    const dangerousProperties = ['cookie', 'domain', 'referrer', 'lastModified', 'readyState'];

    return new Proxy(document, {
      get(target, prop) {
        if (dangerousMethods.includes(prop)) {
          return () => { throw new SecurityError(`document.${prop}() not allowed in scriptlets`); };
        }
        if (dangerousProperties.includes(prop)) {
          warn(`Blocked access to document.${prop}`);
          return undefined;
        }
        const value = target[prop];
        // Wrap functions to maintain context
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, prop, value) {
        if (dangerousProperties.includes(prop)) {
          warn(`Blocked write to document.${prop}`);
          return true;
        }
        return Reflect.set(target, prop, value);
      }
    });
  }

  function createIsolatedNavigator() {
    const fingerprintingSurfaces = [
      'plugins', 'mimeTypes', 'hardwareConcurrency', 'deviceMemory',
      'connection', 'userAgentData', 'deviceMemory', 'maxTouchPoints',
      'vendor', 'vendorSub', 'productSub', 'buildID', 'oscpu', 'platform'
    ];

    return new Proxy(navigator, {
      get(target, prop) {
        if (fingerprintingSurfaces.includes(prop)) {
          debug(`Blocked fingerprinting surface: navigator.${prop}`);
          return undefined;
        }
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  }

  function createIsolatedConsole() {
    const methods = ['log', 'warn', 'error', 'info', 'debug', 'trace', 'group', 'groupEnd', 'groupCollapsed', 'time', 'timeEnd', 'timeLog'];
    const isolated = {};
    for (const method of methods) {
      isolated[method] = (...args) => console[method]('[Scriptlet]', ...args);
    }
    return isolated;
  }

  function createIsolatedChrome() {
    return Object.freeze({
      runtime: Object.freeze({
        sendMessage: (msg) => chrome.runtime.sendMessage(msg),
        onMessage: chrome.runtime.onMessage,
        getManifest: () => chrome.runtime.getManifest(),
        getURL: (path) => chrome.runtime.getURL(path),
        id: chrome.runtime.id,
        onInstalled: chrome.runtime.onInstalled,
        onStartup: chrome.runtime.onStartup,
        onUpdateAvailable: chrome.runtime.onUpdateAvailable,
        lastError: chrome.runtime.lastError
      }),
      storage: Object.freeze({
        sync: Object.freeze({
          get: chrome.storage.sync.get.bind(chrome.storage.sync),
          set: chrome.storage.sync.set.bind(chrome.storage.sync),
          remove: chrome.storage.sync.remove.bind(chrome.storage.sync),
          clear: chrome.storage.sync.clear.bind(chrome.storage.sync),
          onChanged: chrome.storage.sync.onChanged,
          QUOTA_BYTES: chrome.storage.sync.QUOTA_BYTES,
          MAX_ITEMS: chrome.storage.sync.MAX_ITEMS,
          MAX_WRITE_OPERATIONS_PER_HOUR: chrome.storage.sync.MAX_WRITE_OPERATIONS_PER_HOUR,
          MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE: chrome.storage.sync.MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE
        }),
        local: Object.freeze({
          get: chrome.storage.local.get.bind(chrome.storage.local),
          set: chrome.storage.local.set.bind(chrome.storage.local),
          remove: chrome.storage.local.remove.bind(chrome.storage.local),
          clear: chrome.storage.local.clear.bind(chrome.storage.local),
          onChanged: chrome.storage.local.onChanged,
          QUOTA_BYTES: chrome.storage.local.QUOTA_BYTES
        }),
        session: Object.freeze({
          get: chrome.storage.session.get.bind(chrome.storage.session),
          set: chrome.storage.session.set.bind(chrome.storage.session),
          remove: chrome.storage.session.remove.bind(chrome.storage.session),
          clear: chrome.storage.session.clear.bind(chrome.storage.session),
          onChanged: chrome.storage.session.onChanged
        })
      }),
      tabs: Object.freeze({
        query: chrome.tabs.query.bind(chrome.tabs),
        sendMessage: chrome.tabs.sendMessage.bind(chrome.tabs),
        onUpdated: chrome.tabs.onUpdated,
        onActivated: chrome.tabs.onActivated,
        onRemoved: chrome.tabs.onRemoved
      }),
      i18n: Object.freeze({
        getMessage: chrome.i18n.getMessage.bind(chrome.i18n),
        getAcceptLanguages: chrome.i18n.getAcceptLanguages.bind(chrome.i18n),
        getUILanguage: chrome.i18n.getUILanguage.bind(chrome.i18n)
      })
    });
  }

  function createIsolatedLocation(origin) {
    const url = new URL(origin);
    return Object.freeze({
      href: url.href,
      origin: url.origin,
      protocol: url.protocol,
      host: url.host,
      hostname: url.hostname,
      port: url.port,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      toString: () => url.href,
      toJSON: () => url.href,
      // Block navigation methods
      assign: () => { throw new SecurityError('location.assign not allowed'); },
      replace: () => { throw new SecurityError('location.replace not allowed'); },
      reload: () => { throw new SecurityError('location.reload not allowed'); }
    });
  }

  function createIsolatedHistory() {
    return Object.freeze({
      length: history.length,
      state: history.state,
      pushState: () => { throw new SecurityError('history.pushState not allowed'); },
      replaceState: () => { throw new SecurityError('history.replaceState not allowed'); },
      back: () => { throw new SecurityError('history.back not allowed'); },
      forward: () => { throw new SecurityError('history.forward not allowed'); },
      go: () => { throw new SecurityError('history.go not allowed'); }
    });
  }

  function createIsolatedStorage(type) {
    const storage = window[type];
    return Object.freeze({
      getItem: (key) => storage.getItem(key),
      setItem: () => { throw new SecurityError(`${type}.setItem not allowed`); },
      removeItem: () => { throw new SecurityError(`${type}.removeItem not allowed`); },
      clear: () => { throw new SecurityError(`${type}.clear not allowed`); },
      get length() { return storage.length; },
      key: (index) => storage.key(index)
    });
  }

  // ============================================================================
  // SCRIPTLET COMPILATION & VALIDATION
  // ============================================================================

  function compileScriptlet(code, name) {
    // Validate scriptlet code
    const validation = validateScriptlet(code, name);
    if (!validation.valid) {
      throw new Error(`Scriptlet validation failed: ${validation.errors.join(', ')}`);
    }

    // Wrap in strict mode and sandbox
    const wrappedCode = `
      'use strict';
      (function(sandbox) {
        const { window, document, navigator, console, chrome, location, history, localStorage, sessionStorage } = sandbox;
        ${code}
      })
    `;

    try {
      // Use Function constructor for isolation (no eval)
      const fn = new Function('sandbox', wrappedCode);
      return fn;
    } catch (e) {
      throw new Error(`Scriptlet compilation failed: ${e.message}`);
    }
  }

  function validateScriptlet(code, name) {
    const errors = [];
    const warnings = [];

    // Check for dangerous patterns
    const dangerousPatterns = [
      { pattern: /\beval\s*\(/, message: 'eval() usage detected' },
      { pattern: /\bFunction\s*\(/, message: 'Function constructor usage detected' },
      { pattern: /\bsetTimeout\s*\(\s*['"`]/, message: 'String setTimeout detected' },
      { pattern: /\bsetInterval\s*\(\s*['"`]/, message: 'String setInterval detected' },
      { pattern: /document\.(write|writeln|open|close)\s*\(/, message: 'Dangerous document method' },
      { pattern: /location\.(assign|replace|reload|href\s*=)/, message: 'Location manipulation' },
      { pattern: /history\.(pushState|replaceState|back|forward|go)\s*\(/, message: 'History manipulation' },
      { pattern: /localStorage\.(setItem|removeItem|clear)\s*\(/, message: 'Storage write attempt' },
      { pattern: /sessionStorage\.(setItem|removeItem|clear)\s*\(/, message: 'Storage write attempt' },
      { pattern: /__proto__|prototype|constructor/, message: 'Prototype pollution attempt' },
      { pattern: /Object\.defineProperty|Object\.assign|Object\.create/, message: 'Object manipulation' },
      { pattern: /Reflect\.(set|defineProperty|deleteProperty)/, message: 'Reflect API usage' },
      { pattern: /Proxy\s*\(/, message: 'Proxy constructor usage' },
      { pattern: /import\s*\(/, message: 'Dynamic import detected' },
      { pattern: /new\s+Worker/, message: 'Worker creation' },
      { pattern: /new\s+SharedWorker/, message: 'SharedWorker creation' },
      { pattern: /navigator\.(sendBeacon|credentials|mediaDevices)/, message: 'Privacy-sensitive API' }
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(code)) {
        if (CONFIG.isolationLevel === 'strict') {
          errors.push(message);
        } else {
          warnings.push(message);
        }
      }
    }

    // Check code size
    if (code.length > 100000) {
      warnings.push('Scriptlet exceeds 100KB size limit');
    }

    // Check for suspicious strings
    const suspiciousStrings = ['password', 'token', 'secret', 'api_key', 'apikey', 'auth', 'credential'];
    for (const str of suspiciousStrings) {
      if (code.toLowerCase().includes(str)) {
        warnings.push(`Potential sensitive data: ${str}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  function hashCode(code) {
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      const char = code.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  // ============================================================================
  // SCRIPTLET EXECUTION
  // ============================================================================

  async function executeScriptlet(scriptletCode, options = {}) {
    const {
      origin = location.origin,
      name = 'anonymous',
      timeout = CONFIG.maxExecutionTime,
      retries = CONFIG.maxRetries
    } = options;

    const boundary = getErrorBoundary(name);

    if (!boundary.isHealthy()) {
      return { success: false, error: `Scriptlet ${name} is disabled due to repeated failures` };
    }

    const executionId = `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startTime = performance.now();

    // Create isolated context for this origin
    const sandbox = createIsolatedContext(origin);

    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await withTimeout(
          executeInSandbox(scriptletCode, sandbox),
          timeout,
          `Scriptlet ${name} timed out after ${timeout}ms`
        );

        recordExecution(origin, performance.now() - startTime, true);
        boundary.recordSuccess();
        debug(`Scriptlet ${name} executed successfully in ${performance.now() - startTime}ms`);
        return { success: true, result, executionId, duration: performance.now() - startTime };

      } catch (e) {
        lastError = e;
        boundary.recordFailure(e);

        if (attempt < retries) {
          warn(`Scriptlet ${name} attempt ${attempt + 1} failed, retrying in ${CONFIG.retryDelay}ms:`, e.message);
          await sleep(CONFIG.retryDelay * (attempt + 1));
        }
      }
    }

    recordExecution(origin, performance.now() - startTime, false, lastError);
    error(`Scriptlet ${name} failed after ${retries + 1} attempts:`, lastError);
    return { success: false, error: lastError?.message, executionId, duration: performance.now() - startTime };
  }

  function executeInSandbox(scriptletCode, sandbox) {
    // Compile the scriptlet
    const fn = compileScriptlet(scriptletCode, 'anonymous');
    return fn(sandbox);
  }

  function withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        // Store timer for potential cleanup
        promise.timer = timer;
      })
    ]);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // EXECUTION STATS
  // ============================================================================

  function recordExecution(origin, duration, success, error = null) {
    if (!executionStats.has(origin)) {
      executionStats.set(origin, { executions: 0, errors: 0, totalTime: 0, lastError: null, avgTime: 0 });
    }
    const stats = executionStats.get(origin);
    stats.executions++;
    stats.totalTime += duration;
    stats.avgTime = stats.totalTime / stats.executions;
    if (!success) {
      stats.errors++;
      stats.lastError = error?.message || 'Unknown error';
    }
  }

  function getExecutionStats() {
    return Object.fromEntries(executionStats);
  }

  function getErrorBoundaryStatus() {
    return Object.fromEntries(
      Array.from(errorBoundaries.entries()).map(([name, boundary]) => [name, boundary.getStatus()])
    );
  }

  // ============================================================================
  // SCRIPTLET CACHE & HOT-RELOAD
  // ============================================================================

  function cacheScriptlet(name, code, metadata = {}) {
    const entry = {
      code,
      version: ++currentVersion,
      hash: hashCode(code),
      cachedAt: Date.now(),
      metadata: { ...metadata, name }
    };
    scriptletCache.set(name, entry);
    log(`Cached scriptlet: ${name} v${entry.version}`);
    return entry;
  }

  function getCachedScriptlet(name) {
    return scriptletCache.get(name);
  }

  function hasScriptletChanged(name, newCode) {
    const cached = scriptletCache.get(name);
    if (!cached) return true;
    return cached.hash !== hashCode(newCode);
  }

  function clearCache() {
    scriptletCache.clear();
    executionStats.clear();
    errorBoundaries.clear();
    executionContexts.clear();
    currentVersion = 0;
    log('Scriptlet cache cleared');
  }

  // ============================================================================
  // HOT-RELOAD SYSTEM
  // ============================================================================

  async function checkForUpdates() {
    if (!CONFIG.hotReloadEnabled) return;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SCRIPTLET_VERSIONS' });
      if (response && response.scriptlets) {
        let updated = false;
        for (const [name, info] of Object.entries(response.scriptlets)) {
          const cached = scriptletCache.get(name);
          if (!cached || cached.version !== info.version || cached.hash !== info.hash) {
            log(`Hot-reload: updating scriptlet ${name}`);
            await updateScriptlet(name, info.code, info);
            updated = true;
          }
        }
        if (updated) {
          log('Hot-reload complete: scriptlets updated');
          // Notify content scripts
          window.dispatchEvent(new CustomEvent('aeroguard:scriptlets-updated', { detail: { timestamp: Date.now() } }));
        }
      }
    } catch (e) {
      debug('Hot-reload check failed:', e.message);
    }
  }

  async function updateScriptlet(name, code, metadata = {}) {
    const boundary = getErrorBoundary(name);
    boundary.reset(); // Reset error boundary on update

    const entry = cacheScriptlet(name, code, metadata);
    log(`Scriptlet updated: ${name} v${entry.version}`);
    return entry;
  }

  async function startHotReload() {
    if (hotReloadTimer) return;
    hotReloadTimer = setInterval(checkForUpdates, CONFIG.hotReloadInterval);
    log('Hot-reload started, interval:', CONFIG.hotReloadInterval);
  }

  function stopHotReload() {
    if (hotReloadTimer) {
      clearInterval(hotReloadTimer);
      hotReloadTimer = null;
      log('Hot-reload stopped');
    }
  }

  function setHotReloadConfig(config) {
    if (config.enabled !== undefined) CONFIG.hotReloadEnabled = config.enabled;
    if (config.interval !== undefined) CONFIG.hotReloadInterval = config.interval;
    if (CONFIG.hotReloadEnabled) startHotReload(); else stopHotReload();
  }

  // ============================================================================
  // BATCH EXECUTION
  // ============================================================================

  async function executeScriptlets(scriptlets, options = {}) {
    const { parallel = false, stopOnError = false } = options;
    const results = [];

    if (parallel) {
      const promises = scriptlets.map(({ code, name, ...opts }) =>
        executeScriptlet(code, { name, ...opts })
      );
      const settled = await Promise.allSettled(promises);
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({ success: false, error: result.reason?.message });
        }
      }
    } else {
      for (const { code, name, ...opts } of scriptlets) {
        const result = await executeScriptlet(code, { name, ...opts });
        results.push(result);
        if (stopOnError && !result.success) break;
      }
    }

    return results;
  }

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================

  function handleMessage(msg, sender, sendResponse) {
    switch (msg.type) {
      case 'EXECUTE_SCRIPTLET':
        executeScriptlet(msg.code, { name: msg.name, origin: msg.origin, timeout: msg.timeout })
          .then(sendResponse);
        return true;

      case 'EXECUTE_SCRIPTLETS':
        executeScriptlets(msg.scriptlets, { parallel: msg.parallel, stopOnError: msg.stopOnError })
          .then(sendResponse);
        return true;

      case 'CACHE_SCRIPTLET':
        sendResponse(cacheScriptlet(msg.name, msg.code, msg.metadata));
        break;

      case 'GET_CACHED_SCRIPTLET':
        sendResponse(getCachedScriptlet(msg.name));
        break;

      case 'UPDATE_SCRIPTLET':
        updateScriptlet(msg.name, msg.code, msg.metadata).then(sendResponse);
        return true;

      case 'GET_SCRIPTLET_STATS':
        sendResponse({ stats: getExecutionStats(), boundaries: getErrorBoundaryStatus() });
        break;

      case 'CLEAR_SCRIPTLET_CACHE':
        clearCache();
        sendResponse({ success: true });
        break;

      case 'SET_HOT_RELOAD_CONFIG':
        setHotReloadConfig(msg.config);
        sendResponse({ success: true, config: CONFIG });
        break;

      case 'GET_HOT_RELOAD_STATUS':
        sendResponse({
          enabled: CONFIG.hotReloadEnabled,
          interval: CONFIG.hotReloadInterval,
          timerActive: !!hotReloadTimer,
          cachedScriptlets: Array.from(scriptletCache.keys())
        });
        break;

      case 'RESET_ERROR_BOUNDARY':
        if (msg.name) {
          getErrorBoundary(msg.name).reset();
        } else {
          errorBoundaries.forEach(b => b.reset());
        }
        sendResponse({ success: true });
        break;

      case 'PING':
        sendResponse({ pong: true, version: currentVersion, timestamp: Date.now() });
        break;
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function init() {
    if (isInitialized) return;
    isInitialized = true;

    createTrustedTypesPolicy();
    chrome.runtime.onMessage.addListener(handleMessage);

    // Start hot-reload if enabled
    if (CONFIG.hotReloadEnabled) {
      startHotReload();
    }

    // Notify background script
    chrome.runtime.sendMessage({
      type: 'CONTENT_SCRIPT_READY',
      url: location.href,
      script: 'scriptlet-runner',
      version: chrome.runtime.getManifest().version
    }).catch(() => {});

    // Handle page visibility for hot-reload optimization
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && CONFIG.hotReloadEnabled) {
        checkForUpdates();
      }
    });

    // Handle extension context invalidation
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === 'scriptlet-runner') {
        port.onDisconnect.addListener(() => {
          if (chrome.runtime.lastError) {
            warn('Extension context invalidated, cleaning up');
            stopHotReload();
            clearCache();
          }
        });
      }
    });

    log('Scriptlet runner v2 initialized');
  }

  // Initialize immediately if document is ready, otherwise wait
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  window.__aeroguardScriptlets = Object.freeze({
    // Execution
    executeScriptlet,
    executeScriptlets,

    // Cache management
    cacheScriptlet,
    getCachedScriptlet,
    hasScriptletChanged,
    clearCache,

    // Hot-reload
    startHotReload,
    stopHotReload,
    checkForUpdates,
    setHotReloadConfig,

    // Stats & monitoring
    getExecutionStats,
    getErrorBoundaryStatus,

    // Error boundaries
    getErrorBoundary,
    resetErrorBoundary: (name) => getErrorBoundary(name).reset(),

    // Config
    getConfig: () => ({ ...CONFIG }),
    setConfig: (config) => Object.assign(CONFIG, config)
  });

  // Export for module systems
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.__aeroguardScriptlets;
  }
})();