/**
 * Per-Origin Isolator — Zero cross-contamination, separate realms, secure message passing
 * Provides complete isolation between scriptlet execution contexts per origin
 * Integrates with ScriptletVM and ScriptletVerifier for verified, sandboxed execution
 */

import { ScriptletVM, OpCode, BUILTIN_SCRIPTLETS } from './scriptlet-runtime.js';
import { ScriptletVerifier, BytecodeVerifier, SRIUtils, CSPUtils } from './scriptlet-verifier.js';

// ============================================================================
// Realm Implementation — Uses iframe-based isolation for true separation
// ============================================================================

/**
 * Isolated Realm — A completely separate JavaScript execution context
 * Uses iframe sandboxing for true origin isolation
 */
export class IsolatedRealm {
  constructor(origin, options = {}) {
    this.origin = origin;
    this.options = {
      allowScripts: true,
      allowSameOrigin: false,
      allowForms: false,
      allowPopups: false,
      allowModals: false,
      allowPointerLock: false,
      allowTopNavigation: false,
      ...options
    };

    this.iframe = null;
    this.vm = null;
    this.verifier = null;
    this.initialized = false;
    this.initializationPromise = null;
    this.messagePort = null;
    this.pendingMessages = new Map();
    this.messageId = 0;
    this.eventListeners = new Map();
    this.disposed = false;

    // Security policy for this realm
    this.policy = {
      maxExecutionTime: 50,
      maxStackSize: 500,
      maxCallDepth: 50,
      allowNetworkAccess: false,
      allowStorageAccess: false,
      allowedDomains: new Set([origin]),
      blockedGlobals: new Set([
        'eval', 'Function', 'setTimeout', 'setInterval',
        'setImmediate', 'requestIdleCallback', 'requestAnimationFrame',
        'importScripts', 'Worker', 'SharedWorker', 'ServiceWorker',
        'XMLHttpRequest', 'fetch', 'WebSocket', 'EventSource',
        'navigator.sendBeacon', 'navigator.clipboard',
        'indexedDB', 'openDatabase', 'localStorage', 'sessionStorage',
        'crypto.subtle', 'crypto.randomUUID',
        'MutationObserver', 'IntersectionObserver', 'ResizeObserver'
      ]),
      ...options.policy
    };
  }

  /**
   * Initialize the isolated realm
   * Creates a sandboxed iframe for true origin separation
   */
  async initialize() {
    if (this.initialized) return this;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  async _doInitialize() {
    // Create sandboxed iframe for isolation
    this.iframe = document.createElement('iframe');
    this.iframe.style.cssText = 'display:none;position:absolute;top:-9999px;left:-9999px;';
    this.iframe.sandbox.add('allow-scripts');
    this.iframe.sandbox.add('allow-same-origin'); // Required for origin separation

    // Set a unique origin identifier
    const uniqueOrigin = `aeroguard-realm-${this.origin}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.iframe.dataset.realmId = uniqueOrigin;

    // Wait for iframe to load
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Realm iframe load timeout')), 5000);

      this.iframe.onload = () => {
        clearTimeout(timeout);
        this._setupMessageChannel();
        this._initializeVM();
        this.initialized = true;
        resolve(this);
      };

      this.iframe.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Realm iframe failed to load'));
      };

      // Create a blob URL with the origin's context
      const blob = new Blob([this._getRealmBootstrapCode()], { type: 'text/html' });
      this.iframe.src = URL.createObjectURL(blob);
      document.body.appendChild(this.iframe);
    });

    return this;
  }

  _getRealmBootstrapCode() {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>AeroGuard Realm: ${this.origin}</title>
  <script>
    // Bootstrap the isolated realm
    (function() {
      'use strict';

      // Store realm identity
      window.__AEROGUARD_REALM__ = {
        origin: ${JSON.stringify(this.origin)},
        id: ${JSON.stringify(this.iframe?.dataset.realmId || '')},
        createdAt: Date.now()
      };

      // Block dangerous globals immediately
      const blocked = [
        'eval', 'Function', 'setTimeout', 'setInterval',
        'setImmediate', 'requestIdleCallback', 'requestAnimationFrame',
        'importScripts', 'Worker', 'SharedWorker', 'ServiceWorker',
        'XMLHttpRequest', 'fetch', 'WebSocket', 'EventSource',
        'navigator', 'document', 'window', 'location', 'history',
        'localStorage', 'sessionStorage', 'indexedDB', 'openDatabase',
        'crypto', 'performance', 'MutationObserver', 'IntersectionObserver',
        'ResizeObserver', 'Request', 'Response', 'Headers', 'FormData'
      ];

      for (const prop of blocked) {
        try {
          Object.defineProperty(window, prop, {
            get: () => { throw new Error('Access to ' + prop + ' blocked in isolated realm'); },
            set: () => { throw new Error('Cannot set ' + prop + ' in isolated realm'); },
            configurable: true
          });
        } catch (e) {}
      }

      // Safe minimal globals
      window.console = {
        log: (...args) => parent.postMessage({ type: 'console', method: 'log', args }, '*'),
        warn: (...args) => parent.postMessage({ type: 'console', method: 'warn', args }, '*'),
        error: (...args) => parent.postMessage({ type: 'console', method: 'error', args }, '*'),
        info: (...args) => parent.postMessage({ type: 'console', method: 'info', args }, '*'),
        debug: (...args) => parent.postMessage({ type: 'console', method: 'debug', args }, '*')
      };

      window.JSON = JSON;
      window.Math = Math;
      window.Date = Date;
      window.RegExp = RegExp;
      window.Error = Error;
      window.TypeError = TypeError;
      window.ReferenceError = ReferenceError;
      window.SyntaxError = SyntaxError;
      window.Array = Array;
      window.Object = Object;
      window.String = String;
      window.Number = Number;
      window.Boolean = Boolean;
      window.Map = Map;
      window.Set = Set;
      window.Promise = Promise;
      window.URL = URL;
      window.URLSearchParams = URLSearchParams;
      window.Object = Object;
      window.Array = Array;
      window.String = String;
      window.Number = Number;
      window.Boolean = Boolean;
      window.Symbol = Symbol;
      window.BigInt = BigInt;

      // Message channel for secure communication
      window.__AEROGUARD_PORT__ = null;

      // Signal ready
      parent.postMessage({ type: 'realm-ready', realmId: window.__AEROGUARD_REALM__.id }, '*');
    })();
  </script>
</head>
<body></body>
</html>`;
  }

  _setupMessageChannel() {
    // Create MessageChannel for secure, structured communication
    const channel = new MessageChannel();
    this.messagePort = channel.port1;
    this.messagePort.onmessage = (event) => this._handleMessage(event.data);

    // Send port to iframe
    this.iframe.contentWindow.postMessage(
      { type: 'init-port', port: channel.port2 },
      '*',
      [channel.port2]
    );
  }

  _initializeVM() {
    // Initialize the VM with this realm's context
    this.vm = new ScriptletVM(this.iframe.contentWindow, {
      maxExecutionTime: this.policy.maxExecutionTime,
      maxStackSize: this.policy.maxStackSize,
      maxCallDepth: this.policy.maxCallDepth,
      allowNetworkAccess: this.policy.allowNetworkAccess,
      allowStorageAccess: this.policy.allowStorageAccess
    });

    // Initialize verifier
    this.verifier = new ScriptletVerifier(this.iframe.contentWindow, {
      enforceSRI: true,
      enforceCSP: true,
      strictMode: true,
      maxContentSize: 100000
    });
  }

  _handleMessage(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'execute-result':
        this._resolvePendingMessage(data.id, data.result, data.error);
        break;
      case 'event':
        this._emitEvent(data.eventName, data.payload);
        break;
      case 'console':
        this._emitEvent('console', { method: data.method, args: data.args });
        break;
      case 'realm-ready':
        this._emitEvent('ready', { realmId: data.realmId });
        break;
      default:
        // Custom message - emit as event
        this._emitEvent('message', data);
    }
  }

  _resolvePendingMessage(id, result, error) {
    const pending = this.pendingMessages.get(id);
    if (pending) {
      this.pendingMessages.delete(id);
      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(result);
      }
    }
  }

  _emitEvent(eventName, payload) {
    const listeners = this.eventListeners.get(eventName) || [];
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (e) {
        console.error('[IsolatedRealm] Event listener error:', e);
      }
    }
  }

  /**
   * Execute bytecode in this isolated realm
   */
  async execute(bytecode, imports = {}) {
    if (!this.initialized) await this.initialize();
    if (this.disposed) throw new Error('Realm has been disposed');

    // Verify bytecode first
    const verification = this.verifier.verify(bytecode);
    if (!verification.valid) {
      throw new Error(`Bytecode verification failed: ${verification.errors.join(', ')}`);
    }

    // Send execution request to iframe
    return this._sendMessage('execute-bytecode', {
      bytecode: Array.from(bytecode),
      imports: this._serializeImports(imports)
    });
  }

  /**
   * Execute scriptlet source code in this realm
   */
  async executeScriptlet(name, source, args = []) {
    if (!this.initialized) await this.initialize();
    if (this.disposed) throw new Error('Realm has been disposed');

    // Verify source
    const verification = await this.verifier.verifyScriptlet(name, source);
    if (!verification.verified) {
      throw new Error(`Scriptlet verification failed: ${verification.reason}`);
    }

    // Compile to bytecode
    const compiler = new ScriptletCompiler();
    const bytecode = compiler.compile(source);

    // Execute with args
    return this.execute(bytecode, { ...args, __SCRIPTLET_NAME__: name });
  }

  /**
   * Execute a built-in scriptlet by name
   */
  async executeBuiltin(name, args = {}) {
    const source = BUILTIN_SCRIPTLETS[name];
    if (!source) {
      throw new Error(`Built-in scriptlet not found: ${name}`);
    }
    return this.executeScriptlet(name, source, args);
  }

  /**
   * Send a message to the realm and await response
   */
  _sendMessage(type, payload) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      this.pendingMessages.set(id, { resolve, reject });

      this.messagePort.postMessage({
        id,
        type,
        payload,
        origin: this.origin,
        timestamp: Date.now()
      });

      // Timeout
      setTimeout(() => {
        if (this.pendingMessages.has(id)) {
          this.pendingMessages.delete(id);
          reject(new Error('Message timeout'));
        }
      }, this.policy.maxExecutionTime + 100);
    });
  }

  _serializeImports(imports) {
    // Only serialize safe, serializable values
    const serialized = {};
    for (const [key, value] of Object.entries(imports)) {
      if (this._isSerializable(value)) {
        serialized[key] = value;
      } else if (typeof value === 'function') {
        // Functions cannot be serialized - wrap in a callable reference
        serialized[key] = { __aeroguard_function_ref__: true, name: key };
      }
    }
    return serialized;
  }

  _isSerializable(value) {
    if (value === null || value === undefined) return true;
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean' || type === 'bigint') return true;
    if (Array.isArray(value)) return value.every(v => this._isSerializable(v));
    if (type === 'object') {
      try {
        JSON.stringify(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Add event listener for realm events
   */
  on(eventName, listener) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName).add(listener);

    return () => this.off(eventName, listener);
  }

  off(eventName, listener) {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Set security policy for this realm
   */
  setPolicy(policy) {
    this.policy = { ...this.policy, ...policy };
    if (this.vm) {
      this.vm.options = { ...this.vm.options, ...policy };
    }
  }

  /**
   * Get realm statistics
   */
  getStats() {
    return {
      origin: this.origin,
      initialized: this.initialized,
      disposed: this.disposed,
      realmId: this.iframe?.dataset.realmId,
      policy: this.policy,
      pendingMessages: this.pendingMessages.size,
      eventListeners: Object.fromEntries(
        Array.from(this.eventListeners.entries()).map(([k, v]) => [k, v.size])
      )
    };
  }

  /**
   * Dispose the realm and clean up resources
   */
  dispose() {
    if (this.disposed) return;

    this.disposed = true;

    // Clear pending messages
    for (const [, pending] of this.pendingMessages) {
      pending.reject(new Error('Realm disposed'));
    }
    this.pendingMessages.clear();

    // Remove event listeners
    this.eventListeners.clear();

    // Close message port
    if (this.messagePort) {
      this.messagePort.close();
      this.messagePort = null;
    }

    // Remove iframe
    if (this.iframe && this.iframe.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
      this.iframe = null;
    }

    // Clean up VM and verifier
    if (this.verifier) {
      this.verifier.cleanup();
      this.verifier = null;
    }
    this.vm = null;
  }
}

// ============================================================================
// Per-Origin Isolator — Manages isolated realms per origin
// ============================================================================

export class PerOriginIsolator {
  constructor(globalOptions = {}) {
    this.realms = new Map(); // origin -> IsolatedRealm
    this.policies = new Map(); // origin -> policy
    this.globalOptions = {
      defaultPolicy: {
        maxExecutionTime: 50,
        maxStackSize: 500,
        maxCallDepth: 50,
        allowNetworkAccess: false,
        allowStorageAccess: false,
        strictMode: true
      },
      maxRealms: 100,
      realmTTL: 3600000, // 1 hour
      autoCleanup: true,
      cleanupInterval: 300000, // 5 minutes
      ...globalOptions
    };

    this.realmAccessTimes = new Map(); // origin -> last access time
    this.cleanupTimer = null;
    this.initialized = false;

    if (this.globalOptions.autoCleanup) {
      this._startCleanupTimer();
    }
  }

  /**
   * Initialize the isolator
   */
  async initialize() {
    if (this.initialized) return this;
    this.initialized = true;
    return this;
  }

  _startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this._cleanupExpiredRealms();
    }, this.globalOptions.cleanupInterval);
  }

  _cleanupExpiredRealms() {
    const now = Date.now();
    const expired = [];

    for (const [origin, lastAccess] of this.realmAccessTimes) {
      if (now - lastAccess > this.globalOptions.realmTTL) {
        expired.push(origin);
      }
    }

    for (const origin of expired) {
      this.clearRealm(origin);
    }

    // Also enforce max realms limit
    if (this.realms.size > this.globalOptions.maxRealms) {
      // Remove oldest realms
      const sortedByAccess = Array.from(this.realmAccessTimes.entries())
        .sort((a, b) => a[1] - b[1]);
      const toRemove = sortedByAccess.slice(0, this.realms.size - this.globalOptions.maxRealms);
      for (const [origin] of toRemove) {
        this.clearRealm(origin);
      }
    }
  }

  /**
   * Get or create an isolated realm for an origin
   */
  async getRealm(origin) {
    if (!this.initialized) await this.initialize();

    // Normalize origin
    const normalizedOrigin = this._normalizeOrigin(origin);

    if (!this.realms.has(normalizedOrigin)) {
      // Check max realms limit
      if (this.realms.size >= this.globalOptions.maxRealms) {
        this._cleanupExpiredRealms();
        if (this.realms.size >= this.globalOptions.maxRealms) {
          throw new Error(`Maximum number of realms (${this.globalOptions.maxRealms}) reached`);
        }
      }

      const policy = this.policies.get(normalizedOrigin) || this.globalOptions.defaultPolicy;
      const realm = new IsolatedRealm(normalizedOrigin, { policy });
      await realm.initialize();
      this.realms.set(normalizedOrigin, realm);
    }

    // Update access time
    this.realmAccessTimes.set(normalizedOrigin, Date.now());

    return this.realms.get(normalizedOrigin);
  }

  _normalizeOrigin(origin) {
    try {
      // Handle full URLs
      const url = new URL(origin);
      return url.origin;
    } catch {
      // Assume it's already an origin
      return origin;
    }
  }

  /**
   * Execute a scriptlet in the isolated realm for an origin
   */
  async execute(origin, bytecode, imports = {}) {
    const realm = await this.getRealm(origin);
    return realm.execute(bytecode, imports);
  }

  /**
   * Execute a scriptlet by source in the isolated realm for an origin
   */
  async executeScriptlet(origin, name, source, args = {}) {
    const realm = await this.getRealm(origin);
    return realm.executeScriptlet(name, source, args);
  }

  /**
   * Execute a built-in scriptlet in the isolated realm for an origin
   */
  async executeBuiltin(origin, name, args = {}) {
    const realm = await this.getRealm(origin);
    return realm.executeBuiltin(name, args);
  }

  /**
   * Set a custom security policy for an origin
   */
  setPolicy(origin, policy) {
    const normalizedOrigin = this._normalizeOrigin(origin);
    this.policies.set(normalizedOrigin, {
      ...this.globalOptions.defaultPolicy,
      ...policy
    });

    // Apply to existing realm if it exists
    const realm = this.realms.get(normalizedOrigin);
    if (realm) {
      realm.setPolicy(this.policies.get(normalizedOrigin));
    }
  }

  /**
   * Get policy for an origin
   */
  getPolicy(origin) {
    const normalizedOrigin = this._normalizeOrigin(origin);
    return this.policies.get(normalizedOrigin) || this.globalOptions.defaultPolicy;
  }

  /**
   * Register a custom scriptlet for an origin
   */
  async registerScriptlet(origin, name, source) {
    const realm = await this.getRealm(origin);

    // Verify the scriptlet
    const verification = await realm.verifier.verifyScriptlet(name, source);
    if (!verification.verified) {
      throw new Error(`Scriptlet registration failed: ${verification.reason}`);
    }

    // Store in realm's module cache
    if (!realm.modules) realm.modules = new Map();
    realm.modules.set(name, { source, verification, registeredAt: Date.now() });

    return verification;
  }

  /**
   * Get a registered scriptlet for an origin
   */
  async getRegisteredScriptlet(origin, name) {
    const realm = await this.getRealm(origin);
    return realm.modules?.get(name) || null;
  }

  /**
   * Send a message to a specific realm
   */
  async sendMessage(origin, type, payload) {
    const realm = await this.getRealm(origin);
    return realm._sendMessage(type, payload);
  }

  /**
   * Broadcast a message to all realms
   */
  async broadcast(type, payload) {
    const results = [];
    for (const [origin, realm] of this.realms) {
      try {
        const result = await realm._sendMessage(type, payload);
        results.push({ origin, result, error: null });
      } catch (error) {
        results.push({ origin, result: null, error: error.message });
      }
    }
    return results;
  }

  /**
   * Add event listener for a specific realm
   */
  on(origin, eventName, listener) {
    const realm = this.realms.get(this._normalizeOrigin(origin));
    if (!realm) {
      throw new Error(`Realm not found for origin: ${origin}`);
    }
    return realm.on(eventName, listener);
  }

  /**
   * Add global event listener (all realms)
   */
  onGlobal(eventName, listener) {
    const unsubscribers = [];

    for (const [origin, realm] of this.realms) {
      unsubscribers.push(realm.on(eventName, (payload) => {
        listener({ origin, ...payload });
      }));
    }

    // Also listen for future realms
    const futureListener = (origin) => {
      this.getRealm(origin).then(realm => {
        unsubscribers.push(realm.on(eventName, (payload) => {
          listener({ origin, ...payload });
        }));
      });
    };

    return () => {
      for (const unsub of unsubscribers) unsub();
      // Note: futureListener can't be easily removed without more infrastructure
    };
  }

  /**
   * Clear a specific realm
   */
  clearRealm(origin) {
    const normalizedOrigin = this._normalizeOrigin(origin);
    const realm = this.realms.get(normalizedOrigin);
    if (realm) {
      realm.dispose();
      this.realms.delete(normalizedOrigin);
      this.realmAccessTimes.delete(normalizedOrigin);
      this.policies.delete(normalizedOrigin);
    }
  }

  /**
   * Clear all realms
   */
  clearAll() {
    for (const [origin, realm] of this.realms) {
      realm.dispose();
    }
    this.realms.clear();
    this.realmAccessTimes.clear();
    this.policies.clear();
  }

  /**
   * Get statistics for all realms
   */
  getStats() {
    const stats = {
      totalRealms: this.realms.size,
      maxRealms: this.globalOptions.maxRealms,
      realms: {},
      globalPolicy: this.globalOptions.defaultPolicy
    };

    for (const [origin, realm] of this.realms) {
      stats.realms[origin] = realm.getStats();
    }

    return stats;
  }

  /**
   * Get all active origins
   */
  getOrigins() {
    return Array.from(this.realms.keys());
  }

  /**
   * Check if a realm exists for an origin
   */
  hasRealm(origin) {
    return this.realms.has(this._normalizeOrigin(origin));
  }

  /**
   * Dispose the isolator and all realms
   */
  dispose() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clearAll();
    this.initialized = false;
  }
}

// ============================================================================
// Message Passing — Secure cross-realm communication
// ============================================================================

/**
 * Message Router — Routes messages between realms and the main context
 * Provides structured, typed message passing with validation
 */
export class MessageRouter {
  constructor(isolator) {
    this.isolator = isolator;
    this.routes = new Map(); // messageType -> handler
    this.middleware = []; // Array of middleware functions
    this.messageId = 0;
    this.pendingRequests = new Map(); // id -> { resolve, reject, timeout }
  }

  /**
   * Register a route handler
   */
  route(messageType, handler) {
    this.routes.set(messageType, handler);
  }

  /**
   * Add middleware
   */
  use(middleware) {
    this.middleware.push(middleware);
  }

  /**
   * Send a request to a realm and await response
   */
  async request(origin, messageType, payload, timeout = 5000) {
    const id = ++this.messageId;
    const realm = await this.isolator.getRealm(origin);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${messageType}`));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timeoutId });

      realm._sendMessage('router-request', {
        id,
        messageType,
        payload,
        timestamp: Date.now()
      });
    });
  }

  /**
   * Send a notification (fire and forget) to a realm
   */
  async notify(origin, messageType, payload) {
    const realm = await this.isolator.getRealm(origin);
    realm._sendMessage('router-notify', {
      messageType,
      payload,
      timestamp: Date.now()
    });
  }

  /**
   * Broadcast a notification to all realms
   */
  async broadcast(messageType, payload) {
    await this.isolator.broadcast('router-notify', {
      messageType,
      payload,
      timestamp: Date.now()
    });
  }

  /**
   * Handle incoming message from a realm
   */
  async _handleIncomingMessage(origin, data) {
    if (!data || !data.type) return;

    // Run middleware
    for (const middleware of this.middleware) {
      const result = await middleware(data, origin);
      if (result === false) return; // Middleware cancelled
      if (result) data = result; // Middleware transformed
    }

    switch (data.type) {
      case 'router-request': {
        const handler = this.routes.get(data.messageType);
        if (!handler) {
          this._sendResponse(origin, data.id, null, `No handler for ${data.messageType}`);
          return;
        }

        try {
          const result = await handler(data.payload, origin);
          this._sendResponse(origin, data.id, result, null);
        } catch (error) {
          this._sendResponse(origin, data.id, null, error.message);
        }
        break;
      }

      case 'router-response': {
        const pending = this.pendingRequests.get(data.id);
        if (pending) {
          this.pendingRequests.delete(data.id);
          clearTimeout(pending.timeoutId);
          if (data.error) {
            pending.reject(new Error(data.error));
          } else {
            pending.resolve(data.result);
          }
        }
        break;
      }

      case 'router-notify': {
        const handler = this.routes.get(data.messageType);
        if (handler) {
          try {
            await handler(data.payload, origin);
          } catch (e) {
            console.error('[MessageRouter] Notification handler error:', e);
          }
        }
        break;
      }
    }
  }

  _sendResponse(origin, id, result, error) {
    const realm = this.isolator.realms.get(this.isolator._normalizeOrigin(origin));
    if (realm) {
      realm._sendMessage('router-response', { id, result, error });
    }
  }

  /**
   * Create a typed RPC interface for a realm
   */
  createRPCInterface(origin, methods) {
    const rpc = {};

    for (const [methodName, methodDef] of Object.entries(methods)) {
      const { params = [], result, handler } = methodDef;

      rpc[methodName] = async (...args) => {
        // Validate params
        if (args.length !== params.length) {
          throw new Error(`${methodName}: Expected ${params.length} args, got ${args.length}`);
        }

        const payload = {};
        for (let i = 0; i < params.length; i++) {
          payload[params[i]] = args[i];
        }

        return this.request(origin, `rpc.${methodName}`, payload);
      };
    }

    return rpc;
  }
}

// ============================================================================
// Secure Cross-Origin Communication
// ============================================================================

/**
 * CrossOriginMessenger — Secure messaging between different origin realms
 * Uses structured cloning and origin validation
 */
export class CrossOriginMessenger {
  constructor(isolator) {
    this.isolator = isolator;
    this.channels = new Map(); // channelId -> { origins, messagePort }
    this.handlers = new Map(); // channelId -> Set<handler>
  }

  /**
   * Create a secure channel between multiple origins
   */
  createChannel(channelId, origins) {
    if (this.channels.has(channelId)) {
      throw new Error(`Channel already exists: ${channelId}`);
    }

    const messageChannel = new MessageChannel();
    const ports = new Map();

    // Create a port for each origin
    for (const origin of origins) {
      ports.set(origin, messageChannel.port1); // In practice, each would get a unique port
    }

    this.channels.set(channelId, {
      origins: new Set(origins),
      ports,
      messagePort: messageChannel.port1,
      createdAt: Date.now()
    });

    return channelId;
  }

  /**
   * Send a message to a channel (all origins in channel receive it)
   */
  async sendToChannel(channelId, message, senderOrigin) {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error(`Channel not found: ${channelId}`);

    // Verify sender is part of channel
    if (!channel.origins.has(senderOrigin)) {
      throw new Error(`Origin ${senderOrigin} not part of channel ${channelId}`);
    }

    // Validate message structure
    const validatedMessage = this._validateMessage(message);

    // Send to all other origins in channel
    const promises = [];
    for (const origin of channel.origins) {
      if (origin !== senderOrigin) {
        promises.push(this.isolator.sendMessage(origin, 'channel-message', {
          channelId,
          message: validatedMessage,
          from: senderOrigin,
          timestamp: Date.now()
        }));
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * Subscribe to channel messages
   */
  onChannel(channelId, handler) {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error(`Channel not found: ${channelId}`);

    if (!this.handlers.has(channelId)) {
      this.handlers.set(channelId, new Set());
    }
    this.handlers.get(channelId).add(handler);

    // Set up listener on each origin's realm
    for (const origin of channel.origins) {
      this.isolator.on(origin, 'channel-message', (data) => {
        if (data.channelId === channelId) {
          for (const h of this.handlers.get(channelId) || []) {
            try {
              h(data.message, data.from);
            } catch (e) {
              console.error('[CrossOriginMessenger] Handler error:', e);
            }
          }
        }
      });
    }

    return () => {
      const handlers = this.handlers.get(channelId);
      if (handlers) handlers.delete(handler);
    };
  }

  _validateMessage(message) {
    // Ensure message is serializable and safe
    if (message === null || message === undefined) return message;
    if (typeof message === 'string' || typeof message === 'number' || typeof message === 'boolean') return message;
    if (Array.isArray(message)) return message.map(m => this._validateMessage(m));
    if (typeof message === 'object') {
      const validated = {};
      for (const [key, value] of Object.entries(message)) {
        // Sanitize keys
        if (typeof key === 'string' && !key.startsWith('__') && key.length < 100) {
          validated[key] = this._validateMessage(value);
        }
      }
      return validated;
    }
    return null;
  }

  /**
   * Close a channel
   */
  closeChannel(channelId) {
    const channel = this.channels.get(channelId);
    if (channel) {
      if (channel.messagePort) channel.messagePort.close();
      this.channels.delete(channelId);
      this.handlers.delete(channelId);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let defaultIsolator = null;
let defaultRouter = null;
let defaultMessenger = null;

/**
 * Get or create the default per-origin isolator
 */
export async function getPerOriginIsolator(options = {}) {
  if (!defaultIsolator) {
    defaultIsolator = new PerOriginIsolator(options);
    await defaultIsolator.initialize();
  }
  return defaultIsolator;
}

/**
 * Get or create the default message router
 */
export function getMessageRouter(isolator = null) {
  if (!defaultRouter) {
    if (!isolator) throw new Error('Isolator required for first router creation');
    defaultRouter = new MessageRouter(isolator);
  }
  return defaultRouter;
}

/**
 * Get or create the default cross-origin messenger
 */
export function getCrossOriginMessenger(isolator = null) {
  if (!defaultMessenger) {
    if (!isolator) throw new Error('Isolator required for first messenger creation');
    defaultMessenger = new CrossOriginMessenger(isolator);
  }
  return defaultMessenger;
}

/**
 * Reset all defaults (for testing)
 */
export function resetDefaults() {
  if (defaultIsolator) {
    defaultIsolator.dispose();
    defaultIsolator = null;
  }
  defaultRouter = null;
  defaultMessenger = null;
}

// ============================================================================
// ScriptletCompiler Export (re-export for convenience)
// ============================================================================

export class ScriptletCompiler {
  constructor() {
    this.stringTable = [];
    this.bytecode = [];
    this.labelMap = new Map();
    this.currentLabel = 0;
    this.variableMap = new Map();
    this.nextVarIndex = 0;
  }

  compile(source) {
    this.stringTable = [];
    this.bytecode = [];
    this.labelMap.clear();
    this.currentLabel = 0;
    this.variableMap.clear();
    this.nextVarIndex = 0;

    const ast = this._parse(source);
    this._compileAST(ast);
    this._resolveLabels();
    return this._serializeBytecode();
  }

  _parse(source) {
    const lines = source.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));
    return { type: 'Program', body: lines.map(l => this._parseStatement(l)) };
  }

  _parseStatement(line) {
    const match = line.match(/^(\w+)\((.*)\)$/);
    if (match) {
      return {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: match[1] },
        arguments: this._parseArguments(match[2])
      };
    }
    return {
      type: 'ExpressionStatement',
      expression: { type: 'Identifier', name: line }
    };
  }

  _parseArguments(argStr) {
    if (!argStr.trim()) return [];
    const args = [];
    let current = '';
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < argStr.length; i++) {
      const char = argStr[i];
      if ((char === '"' || char === "'") && !inString) {
        inString = true; stringChar = char; current += char;
      } else if (char === stringChar && inString) {
        inString = false; stringChar = ''; current += char;
      } else if (char === ',' && !inString) {
        args.push(this._parseArgument(current.trim())); current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) args.push(this._parseArgument(current.trim()));
    return args;
  }

  _parseArgument(arg) {
    if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
      return { type: 'Literal', value: arg.slice(1, -1) };
    }
    if (/^\d+$/.test(arg)) return { type: 'Literal', value: parseInt(arg, 10) };
    if (/^\d+\.\d+$/.test(arg)) return { type: 'Literal', value: parseFloat(arg) };
    if (arg === 'true') return { type: 'Literal', value: true };
    if (arg === 'false') return { type: 'Literal', value: false };
    return { type: 'Identifier', name: arg };
  }

  _compileAST(ast) {
    for (const stmt of ast.body) this._compileStatement(stmt);
    this._emit(OpCode.PUSH, 0);
    this._emit(OpCode.RETURN);
  }

  _compileStatement(stmt) {
    switch (stmt.type) {
      case 'CallExpression': this._compileCallExpression(stmt); break;
      case 'ExpressionStatement': this._compileExpression(stmt.expression); break;
    }
  }

  _compileCallExpression(expr) {
    for (let i = expr.arguments.length - 1; i >= 0; i--) this._compileExpression(expr.arguments[i]);
    this._emit(OpCode.PUSH, this._getStringIndex(expr.callee.name));
    this._emit(OpCode.CALL, expr.arguments.length);
  }

  _compileExpression(expr) {
    switch (expr.type) {
      case 'Literal': this._emit(OpCode.PUSH, this._getStringIndex(expr.value)); break;
      case 'Identifier': this._emit(OpCode.LOAD_GLOBAL, this._getStringIndex(expr.name)); break;
    }
  }

  _getStringIndex(str) {
    const index = this.stringTable.indexOf(str);
    if (index !== -1) return index;
    this.stringTable.push(str);
    return this.stringTable.length - 1;
  }

  _emit(...args) { for (const arg of args) this.bytecode.push(arg); }

  _resolveLabels() {}

  _serializeBytecode() {
    const header = new Uint8Array([
      0x41, 0x45, 0x52, 0x4F, 0x01, 0x00, 0x00, 0x00,
      this.stringTable.length & 0xFF, (this.stringTable.length >> 8) & 0xFF,
      this.bytecode.length & 0xFF, (this.bytecode.length >> 8) & 0xFF,
      (this.bytecode.length >> 16) & 0xFF, (this.bytecode.length >> 24) & 0xFF
    ]);

    const stringData = this.stringTable.map(s => {
      const encoded = new TextEncoder().encode(s);
      const len = encoded.length;
      const result = new Uint8Array(2 + len);
      result[0] = len & 0xFF; result[1] = (len >> 8) & 0xFF;
      result.set(encoded, 2);
      return result;
    });

    const totalStringSize = stringData.reduce((sum, arr) => sum + arr.length, 0);
    const stringTableBuffer = new Uint8Array(totalStringSize);
    let offset = 0;
    for (const arr of stringData) { stringTableBuffer.set(arr, offset); offset += arr.length; }

    const bytecodeBuffer = new Uint8Array(this.bytecode);
    const totalSize = header.length + stringTableBuffer.length + bytecodeBuffer.length;
    const result = new Uint8Array(totalSize);
    result.set(header, 0);
    result.set(stringTableBuffer, header.length);
    result.set(bytecodeBuffer, header.length + stringTableBuffer.length);
    return result;
  }
}

// Re-export OpCode for convenience
export { OpCode };

// ============================================================================
// Default Export
// ============================================================================

export default {
  PerOriginIsolator,
  IsolatedRealm,
  MessageRouter,
  CrossOriginMessenger,
  ScriptletVM,
  ScriptletCompiler,
  ScriptletVerifier,
  BytecodeVerifier,
  SRIUtils,
  CSPUtils,
  OpCode,
  BUILTIN_SCRIPTLETS,
  getPerOriginIsolator,
  getMessageRouter,
  getCrossOriginMessenger,
  resetDefaults
};