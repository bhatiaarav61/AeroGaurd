/**
 * Cloaking Detector — Blocked vs allowed comparison, response diffing, behavioral fingerprinting
 * Detects when servers serve different content based on ad blocker presence
 */

export class CloakingDetector {
  constructor(context = window, options = {}) {
    this.context = context;
    this.config = {
      comparisonThreshold: options.comparisonThreshold || 0.3,
      minResponseSize: options.minResponseSize || 100,
      maxResponseSize: options.maxResponseSize || 1024 * 1024,
      testInterval: options.testInterval || 60 * 60 * 1000, // 1 hour
      enableBehavioralFingerprinting: options.enableBehavioralFingerprinting !== false,
      behavioralSampleRate: options.behavioralSampleRate || 0.1,
      enableDOMTracking: options.enableDOMTracking !== false,
      enableJSTracking: options.enableJSTracking !== false,
      enableNetworkTracking: options.enableNetworkTracking !== false,
      enableStorageTracking: options.enableStorageTracking !== false,
      enableTimingTracking: options.enableTimingTracking !== false,
      fingerprintDepth: options.fingerprintDepth || 'medium', // 'light', 'medium', 'deep'
      ...options
    };

    this.baselineResponses = new Map(); // url -> { blocked, allowed, lastTest }
    this.detections = [];
    this.testTimer = null;

    // Behavioral fingerprinting state
    this.behavioralProfiles = new Map(); // url -> { blocked: profile, allowed: profile }
    this.domMutationLog = [];
    this.jsExecutionLog = [];
    this.networkLog = [];
    this.storageLog = [];
    this.timingLog = [];
    this.observer = null;
    this.jsHooks = new Map();
    this.originalFetch = null;
    this.originalXHR = null;
    this.originalStorage = null;
    this.isTracking = false;
    this.currentMode = null; // 'blocked' | 'allowed'
  }

  /**
   * Initialize cloaking detection
   */
  initialize() {
    // Start periodic testing
    this._startPeriodicTesting();

    // Listen for responses to compare
    this._setupResponseListener();

    // Initialize behavioral fingerprinting if enabled
    if (this.config.enableBehavioralFingerprinting) {
      this._initializeBehavioralFingerprinting();
    }

    console.log('[CloakingDetector] Initialized');
  }

  /**
   * Initialize behavioral fingerprinting - hooks into DOM, JS execution, network, storage, timing
   */
  _initializeBehavioralFingerprinting() {
    if (this.config.enableDOMTracking) {
      this._setupDOMObserver();
    }
    if (this.config.enableJSTracking) {
      this._setupJSExecutionTracking();
    }
    if (this.config.enableNetworkTracking) {
      this._setupNetworkTracking();
    }
    if (this.config.enableStorageTracking) {
      this._setupStorageTracking();
    }
    if (this.config.enableTimingTracking) {
      this._setupTimingTracking();
    }
    this.isTracking = true;
  }

  /**
   * Start behavioral tracking in a specific mode (blocked or allowed)
   */
  startBehavioralTracking(mode) {
    this.currentMode = mode;
    this._clearBehavioralLogs();
    console.log(`[CloakingDetector] Started behavioral tracking in ${mode} mode`);
  }

  /**
   * Stop behavioral tracking and generate fingerprint
   */
  stopBehavioralTracking(url) {
    if (!this.currentMode) return null;

    const profile = this._generateBehavioralProfile(url, this.currentMode);
    this._storeBehavioralProfile(url, this.currentMode, profile);
    this.currentMode = null;
    return profile;
  }

  /**
   * Set up DOM mutation observer
   */
  _setupDOMObserver() {
    if (this.observer) return;

    this.observer = new MutationObserver((mutations) => {
      if (!this.isTracking || !this.currentMode) return;

      for (const mutation of mutations) {
        this.domMutationLog.push({
          type: mutation.type,
          target: this._getElementSelector(mutation.target),
          addedNodes: mutation.addedNodes.length,
          removedNodes: mutation.removedNodes.length,
          attributeName: mutation.attributeName,
          oldValue: mutation.oldValue,
          timestamp: Date.now()
        });
      }
    });

    this.observer.observe(this.context.document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true
    });
  }

  /**
   * Set up JavaScript execution tracking
   */
  _setupJSExecutionTracking() {
    // Hook eval, Function constructor, setTimeout/setInterval
    const originalEval = this.context.eval;
    this.jsHooks.set('eval', originalEval);
    this.context.eval = (...args) => {
      if (this.isTracking && this.currentMode) {
        this.jsExecutionLog.push({
          type: 'eval',
          code: args[0]?.substring(0, 500),
          stack: this._getStackTrace(),
          timestamp: Date.now()
        });
      }
      return originalEval.apply(this.context, args);
    };

    const originalFunction = this.context.Function;
    this.jsHooks.set('Function', originalFunction);
    this.context.Function = (...args) => {
      if (this.isTracking && this.currentMode) {
        this.jsExecutionLog.push({
          type: 'Function_constructor',
          code: args[args.length - 1]?.substring(0, 500),
          stack: this._getStackTrace(),
          timestamp: Date.now()
        });
      }
      return new originalFunction(...args);
    };

    const originalSetTimeout = this.context.setTimeout;
    this.jsHooks.set('setTimeout', originalSetTimeout);
    this.context.setTimeout = (fn, delay, ...args) => {
      if (this.isTracking && this.currentMode && typeof fn === 'function') {
        this.jsExecutionLog.push({
          type: 'setTimeout',
          delay,
          functionName: fn.name || 'anonymous',
          stack: this._getStackTrace(),
          timestamp: Date.now()
        });
      }
      return originalSetTimeout.call(this.context, fn, delay, ...args);
    };

    const originalSetInterval = this.context.setInterval;
    this.jsHooks.set('setInterval', originalSetInterval);
    this.context.setInterval = (fn, delay, ...args) => {
      if (this.isTracking && this.currentMode && typeof fn === 'function') {
        this.jsExecutionLog.push({
          type: 'setInterval',
          delay,
          functionName: fn.name || 'anonymous',
          stack: this._getStackTrace(),
          timestamp: Date.now()
        });
      }
      return originalSetInterval.call(this.context, fn, delay, ...args);
    };
  }

  /**
   * Set up network request tracking
   */
  _setupNetworkTracking() {
    // Hook fetch
    this.originalFetch = this.context.fetch;
    this.context.fetch = async (input, init) => {
      const startTime = performance.now();
      const url = typeof input === 'string' ? input : input.url;

      if (this.isTracking && this.currentMode) {
        this.networkLog.push({
          type: 'fetch_request',
          url,
          method: init?.method || 'GET',
          headers: init?.headers ? Object.fromEntries(
            new Headers(init.headers).entries()
          ) : {},
          timestamp: Date.now()
        });
      }

      try {
        const response = await this.originalFetch(input, init);
        const duration = performance.now() - startTime;

        if (this.isTracking && this.currentMode) {
          this.networkLog.push({
            type: 'fetch_response',
            url,
            status: response.status,
            statusText: response.statusText,
            contentType: response.headers.get('content-type'),
            contentLength: response.headers.get('content-length'),
            duration,
            timestamp: Date.now()
          });
        }

        return response;
      } catch (error) {
        if (this.isTracking && this.currentMode) {
          this.networkLog.push({
            type: 'fetch_error',
            url,
            error: error.message,
            duration: performance.now() - startTime,
            timestamp: Date.now()
          });
        }
        throw error;
      }
    };

    // Hook XMLHttpRequest
    this.originalXHR = this.context.XMLHttpRequest;
    const self = this;
    this.context.XMLHttpRequest = function() {
      const xhr = new self.originalXHR();
      const originalOpen = xhr.open;
      const originalSend = xhr.send;
      let requestUrl, requestMethod, requestHeaders = {};
      let startTime;

      xhr.open = function(method, url, ...args) {
        requestUrl = url;
        requestMethod = method;
        return originalOpen.apply(this, [method, url, ...args]);
      };

      xhr.setRequestHeader = function(header, value) {
        requestHeaders[header] = value;
        return xhr.setRequestHeader.call(xhr, header, value);
      };

      xhr.send = function(body) {
        startTime = performance.now();

        if (self.isTracking && self.currentMode) {
          self.networkLog.push({
            type: 'xhr_request',
            url: requestUrl,
            method: requestMethod,
            headers: { ...requestHeaders },
            timestamp: Date.now()
          });
        }

        xhr.addEventListener('loadend', () => {
          if (self.isTracking && self.currentMode) {
            self.networkLog.push({
              type: 'xhr_response',
              url: requestUrl,
              status: xhr.status,
              statusText: xhr.statusText,
              contentType: xhr.getResponseHeader('content-type'),
              contentLength: xhr.getResponseHeader('content-length'),
              duration: performance.now() - startTime,
              timestamp: Date.now()
            });
          }
        });

        return originalSend.call(this, body);
      };

      return xhr;
    };
  }

  /**
   * Set up storage tracking
   */
  _setupStorageTracking() {
    // Hook localStorage
    this.originalStorage = {
      localStorage: this.context.localStorage,
      sessionStorage: this.context.sessionStorage
    };

    const hookStorage = (storage, storageName) => {
      const originalSetItem = storage.setItem;
      const originalRemoveItem = storage.removeItem;
      const originalClear = storage.clear;

      storage.setItem = function(key, value) {
        if (self.isTracking && self.currentMode) {
          self.storageLog.push({
            type: 'setItem',
            storage: storageName,
            key,
            valueLength: value?.length || 0,
            timestamp: Date.now()
          });
        }
        return originalSetItem.call(this, key, value);
      };

      storage.removeItem = function(key) {
        if (self.isTracking && self.currentMode) {
          self.storageLog.push({
            type: 'removeItem',
            storage: storageName,
            key,
            timestamp: Date.now()
          });
        }
        return originalRemoveItem.call(this, key);
      };

      storage.clear = function() {
        if (self.isTracking && self.currentMode) {
          self.storageLog.push({
            type: 'clear',
            storage: storageName,
            timestamp: Date.now()
          });
        }
        return originalClear.call(this);
      };
    };

    const self = this;
    hookStorage(this.context.localStorage, 'localStorage');
    hookStorage(this.context.sessionStorage, 'sessionStorage');

    // Hook IndexedDB
    const originalIndexedDB = this.context.indexedDB;
    if (originalIndexedDB) {
      const originalOpen = originalIndexedDB.open;
      this.context.indexedDB.open = function(name, version) {
        const request = originalOpen.call(this, name, version);
        if (self.isTracking && self.currentMode) {
          self.storageLog.push({
            type: 'indexedDB_open',
            name,
            version,
            timestamp: Date.now()
          });
        }
        return request;
      };
    }
  }

  /**
   * Set up timing tracking
   */
  _setupTimingTracking() {
    // Track navigation timing
    if (this.context.performance && this.context.performance.timing) {
      const timing = this.context.performance.timing;
      this.timingLog.push({
        type: 'navigation_timing',
        navigationStart: timing.navigationStart,
        domLoading: timing.domLoading,
        domInteractive: timing.domInteractive,
        domContentLoadedEventStart: timing.domContentLoadedEventStart,
        domComplete: timing.domComplete,
        loadEventStart: timing.loadEventStart,
        timestamp: Date.now()
      });
    }

    // Track resource timing
    if (this.context.performance && this.context.performance.getEntriesByType) {
      const resources = this.context.performance.getEntriesByType('resource');
      for (const resource of resources) {
        this.timingLog.push({
          type: 'resource_timing',
          name: resource.name,
          initiatorType: resource.initiatorType,
          duration: resource.duration,
          startTime: resource.startTime,
          transferSize: resource.transferSize,
          encodedBodySize: resource.encodedBodySize,
          decodedBodySize: resource.decodedBodySize,
          timestamp: Date.now()
        });
      }
    }

    // Track paint timing
    if (this.context.performance && this.context.performance.getEntriesByType) {
      const paints = this.context.performance.getEntriesByType('paint');
      for (const paint of paints) {
        this.timingLog.push({
          type: 'paint_timing',
          name: paint.name,
          startTime: paint.startTime,
          duration: paint.duration,
          timestamp: Date.now()
        });
      }
    }

    // Set up PerformanceObserver for ongoing timing
    if (this.context.PerformanceObserver) {
      try {
        const observer = new PerformanceObserver((list) => {
          if (!this.isTracking || !this.currentMode) return;

          for (const entry of list.getEntries()) {
            this.timingLog.push({
              type: entry.entryType,
              name: entry.name,
              startTime: entry.startTime,
              duration: entry.duration,
              ...(entry.transferSize ? { transferSize: entry.transferSize } : {}),
              ...(entry.encodedBodySize ? { encodedBodySize: entry.encodedBodySize } : {}),
              timestamp: Date.now()
            });
          }
        });

        observer.observe({ entryTypes: ['resource', 'paint', 'navigation', 'largest-contentful-paint', 'first-input', 'layout-shift'] });
        this.jsHooks.set('PerformanceObserver', observer);
      } catch (e) {
        // PerformanceObserver not fully supported
      }
    }
  }

  /**
   * Clear behavioral logs
   */
  _clearBehavioralLogs() {
    this.domMutationLog = [];
    this.jsExecutionLog = [];
    this.networkLog = [];
    this.storageLog = [];
    this.timingLog = [];
  }

  /**
   * Generate behavioral fingerprint profile
   */
  _generateBehavioralProfile(url, mode) {
    const depth = this.config.fingerprintDepth;
    const profile = {
      url,
      mode,
      timestamp: Date.now(),
      depth,
      dom: this._analyzeDOMMutations(),
      js: this._analyzeJSExecution(),
      network: this._analyzeNetworkActivity(),
      storage: this._analyzeStorageActivity(),
      timing: this._analyzeTimingPatterns(),
      // Structural signatures for comparison
      signatures: this._computeStructuralSignatures()
    };

    return profile;
  }

  /**
   * Analyze DOM mutations and create summary
   */
  _analyzeDOMMutations() {
    if (this.domMutationLog.length === 0) {
      return { mutationCount: 0, addedNodes: 0, removedNodes: 0, attributeChanges: 0, details: [] };
    }

    const mutationsByType = {};
    let addedNodes = 0;
    let removedNodes = 0;
    let attributeChanges = 0;

    for (const mutation of this.domMutationLog) {
      mutationsByType[mutation.type] = (mutationsByType[mutation.type] || 0) + 1;
      addedNodes += mutation.addedNodes || 0;
      removedNodes += mutation.removedNodes || 0;
      if (mutation.attributeName) attributeChanges++;
    }

    // For deep fingerprinting, include element selectors
    const details = this.config.fingerprintDepth === 'deep'
      ? this.domMutationLog.slice(-50).map(m => ({
          type: m.type,
          target: m.target,
          added: m.addedNodes,
          removed: m.removedNodes,
          attr: m.attributeName
        }))
      : [];

    return {
      mutationCount: this.domMutationLog.length,
      addedNodes,
      removedNodes,
      attributeChanges,
      mutationsByType,
      details
    };
  }

  /**
   * Analyze JavaScript execution and create summary
   */
  _analyzeJSExecution() {
    if (this.jsExecutionLog.length === 0) {
      return { executionCount: 0, evalCount: 0, functionConstructorCount: 0, timeoutCount: 0, intervalCount: 0, details: [] };
    }

    const execByType = {};
    for (const exec of this.jsExecutionLog) {
      execByType[exec.type] = (execByType[exec.type] || 0) + 1;
    }

    const details = this.config.fingerprintDepth === 'deep'
      ? this.jsExecutionLog.slice(-50).map(e => ({
          type: e.type,
          code: e.code?.substring(0, 200),
          delay: e.delay,
          functionName: e.functionName
        }))
      : [];

    return {
      executionCount: this.jsExecutionLog.length,
      evalCount: execByType.eval || 0,
      functionConstructorCount: execByType.Function_constructor || 0,
      timeoutCount: execByType.setTimeout || 0,
      intervalCount: execByType.setInterval || 0,
      executionsByType: execByType,
      details
    };
  }

  /**
   * Analyze network activity and create summary
   */
  _analyzeNetworkActivity() {
    if (this.networkLog.length === 0) {
      return { requestCount: 0, responseCount: 0, errorCount: 0, totalDuration: 0, domains: new Set(), details: [] };
    }

    const requests = this.networkLog.filter(n => n.type.endsWith('_request'));
    const responses = this.networkLog.filter(n => n.type.endsWith('_response'));
    const errors = this.networkLog.filter(n => n.type.endsWith('_error'));

    const domains = new Set();
    let totalDuration = 0;

    for (const resp of responses) {
      try {
        const url = new URL(resp.url);
        domains.add(url.hostname);
      } catch (e) {}
      totalDuration += resp.duration || 0;
    }

    const details = this.config.fingerprintDepth === 'deep'
      ? this.networkLog.slice(-50).map(n => ({
          type: n.type,
          url: n.url,
          method: n.method,
          status: n.status,
          duration: n.duration,
          contentType: n.contentType
        }))
      : [];

    return {
      requestCount: requests.length,
      responseCount: responses.length,
      errorCount: errors.length,
      totalDuration,
      uniqueDomains: domains.size,
      domains: Array.from(domains),
      details
    };
  }

  /**
   * Analyze storage activity and create summary
   */
  _analyzeStorageActivity() {
    if (this.storageLog.length === 0) {
      return { operationCount: 0, localStorageOps: 0, sessionStorageOps: 0, indexedDBOps: 0, details: [] };
    }

    const opsByStorage = {};
    for (const op of this.storageLog) {
      opsByStorage[op.storage] = (opsByStorage[op.storage] || 0) + 1;
    }

    const details = this.config.fingerprintDepth === 'deep'
      ? this.storageLog.slice(-50).map(s => ({
          type: s.type,
          storage: s.storage,
          key: s.key,
          valueLength: s.valueLength
        }))
      : [];

    return {
      operationCount: this.storageLog.length,
      localStorageOps: opsByStorage.localStorage || 0,
      sessionStorageOps: opsByStorage.sessionStorage || 0,
      indexedDBOps: opsByStorage.indexedDB || 0,
      operationsByStorage: opsByStorage,
      details
    };
  }

  /**
   * Analyze timing patterns and create summary
   */
  _analyzeTimingPatterns() {
    if (this.timingLog.length === 0) {
      return { entryCount: 0, navigationTiming: null, resourceCount: 0, paintCount: 0, details: [] };
    }

    const byType = {};
    for (const entry of this.timingLog) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
    }

    const navigationTiming = this.timingLog.find(t => t.type === 'navigation_timing');
    const resourceCount = byType.resource_timing || 0;
    const paintCount = byType.paint_timing || 0;

    const details = this.config.fingerprintDepth === 'deep'
      ? this.timingLog.slice(-50).map(t => ({
          type: t.type,
          name: t.name,
          startTime: t.startTime,
          duration: t.duration
        }))
      : [];

    return {
      entryCount: this.timingLog.length,
      navigationTiming,
      resourceCount,
      paintCount,
      timingByType: byType,
      details
    };
  }

  /**
   * Compute structural signatures for the page
   */
  _computeStructuralSignatures() {
    const signatures = {};

    // DOM structure signature
    if (this.context.document) {
      signatures.domStructure = this._computeDOMStructureHash();
      signatures.elementCounts = this._countElementsByTag();
      signatures.idCount = this.context.document.querySelectorAll('[id]').length;
      signatures.classCount = this.context.document.querySelectorAll('[class]').length;
    }

    // Script signature
    signatures.scriptCount = this.context.document?.querySelectorAll('script').length || 0;
    signatures.inlineScriptCount = this.context.document?.querySelectorAll('script:not([src])').length || 0;
    signatures.externalScriptCount = this.context.document?.querySelectorAll('script[src]').length || 0;

    // Style signature
    signatures.styleCount = this.context.document?.querySelectorAll('style').length || 0;
    signatures.linkStylesheetCount = this.context.document?.querySelectorAll('link[rel="stylesheet"]').length || 0;

    // Image signature
    signatures.imageCount = this.context.document?.querySelectorAll('img').length || 0;

    // Iframe signature
    signatures.iframeCount = this.context.document?.querySelectorAll('iframe').length || 0;

    return signatures;
  }

  /**
   * Compute a hash of the DOM structure
   */
  _computeDOMStructureHash() {
    if (!this.context.document) return null;

    const walker = this.context.document.createTreeWalker(
      this.context.document.body,
      NodeFilter.SHOW_ELEMENT,
      null,
      false
    );

    let structure = '';
    let nodeCount = 0;
    const maxNodes = this.config.fingerprintDepth === 'deep' ? 10000 : 1000;

    while (walker.nextNode() && nodeCount < maxNodes) {
      const node = walker.currentNode;
      structure += node.tagName.toLowerCase();
      if (node.id) structure += '#' + node.id;
      if (node.className) structure += '.' + node.className.split(' ').join('.');
      nodeCount++;
    }

    // Simple hash
    let hash = 0;
    for (let i = 0; i < structure.length; i++) {
      hash = ((hash << 5) - hash) + structure.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(16);
  }

  /**
   * Count elements by tag name
   */
  _countElementsByTag() {
    if (!this.context.document) return {};

    const counts = {};
    const allElements = this.context.document.querySelectorAll('*');
    for (const el of allElements) {
      counts[el.tagName.toLowerCase()] = (counts[el.tagName.toLowerCase()] || 0) + 1;
    }
    return counts;
  }

  /**
   * Get CSS selector for an element
   */
  _getElementSelector(element) {
    if (!element || element === this.context.document) return 'document';
    if (element.id) return '#' + element.id;

    let selector = element.tagName.toLowerCase();
    if (element.className) {
      selector += '.' + element.className.split(' ').filter(c => c).join('.');
    }
    return selector;
  }

  /**
   * Get stack trace
   */
  _getStackTrace() {
    try {
      throw new Error();
    } catch (e) {
      return e.stack?.split('\n').slice(2, 6).join('\n') || '';
    }
  }

  /**
   * Compare DOM mutation profiles
   */
  _compareDOMProfiles(blocked, allowed) {
    const differences = [];

    if (!blocked || !allowed) {
      return { differences, similarity: 1 };
    }

    // Compare mutation counts
    const mutationCountDiff = Math.abs(blocked.mutationCount - allowed.mutationCount);
    const mutationCountRatio = mutationCountDiff / Math.max(blocked.mutationCount, allowed.mutationCount, 1);

    if (mutationCountRatio > this.config.comparisonThreshold) {
      differences.push({
        type: 'mutation_count',
        severity: mutationCountRatio > 0.5 ? 'high' : 'medium',
        blocked: blocked.mutationCount,
        allowed: allowed.mutationCount,
        ratio: mutationCountRatio,
        description: `DOM mutation count differs by ${(mutationCountRatio * 100).toFixed(1)}%`
      });
    }

    // Compare added/removed nodes
    const addedDiff = Math.abs(blocked.addedNodes - allowed.addedNodes);
    if (addedDiff > 5) {
      differences.push({
        type: 'added_nodes',
        severity: 'medium',
        blocked: blocked.addedNodes,
        allowed: allowed.addedNodes,
        diff: addedDiff,
        description: `Added nodes differ: ${blocked.addedNodes} vs ${allowed.addedNodes}`
      });
    }

    const removedDiff = Math.abs(blocked.removedNodes - allowed.removedNodes);
    if (removedDiff > 5) {
      differences.push({
        type: 'removed_nodes',
        severity: 'medium',
        blocked: blocked.removedNodes,
        allowed: allowed.removedNodes,
        diff: removedDiff,
        description: `Removed nodes differ: ${blocked.removedNodes} vs ${allowed.removedNodes}`
      });
    }

    // Compare attribute changes
    const attrDiff = Math.abs(blocked.attributeChanges - allowed.attributeChanges);
    if (attrDiff > 5) {
      differences.push({
        type: 'attribute_changes',
        severity: 'medium',
        blocked: blocked.attributeChanges,
        allowed: allowed.attributeChanges,
        diff: attrDiff,
        description: `Attribute changes differ: ${blocked.attributeChanges} vs ${allowed.attributeChanges}`
      });
    }

    // Compare mutation types
    const allTypes = new Set([...Object.keys(blocked.mutationsByType || {}), ...Object.keys(allowed.mutationsByType || {})]);
    for (const type of allTypes) {
      const bCount = blocked.mutationsByType?.[type] || 0;
      const aCount = allowed.mutationsByType?.[type] || 0;
      if (bCount !== aCount && Math.abs(bCount - aCount) > 2) {
        differences.push({
          type: 'mutation_type',
          mutationType: type,
          blocked: bCount,
          allowed: aCount,
          description: `Mutation type '${type}' count differs: ${bCount} vs ${aCount}`
        });
      }
    }

    return { differences, similarity: 1 - Math.min(1, differences.length * 0.1) };
  }

  /**
   * Compare JS execution profiles
   */
  _compareJSProfiles(blocked, allowed) {
    const differences = [];

    if (!blocked || !allowed) {
      return { differences, similarity: 1 };
    }

    // Compare execution counts
    const execCountDiff = Math.abs(blocked.executionCount - allowed.executionCount);
    const execCountRatio = execCountDiff / Math.max(blocked.executionCount, allowed.executionCount, 1);

    if (execCountRatio > this.config.comparisonThreshold) {
      differences.push({
        type: 'execution_count',
        severity: execCountRatio > 0.5 ? 'high' : 'medium',
        blocked: blocked.executionCount,
        allowed: allowed.executionCount,
        ratio: execCountRatio,
        description: `JS execution count differs by ${(execCountRatio * 100).toFixed(1)}%`
      });
    }

    // Compare specific execution types
    const allTypes = new Set([...Object.keys(blocked.executionsByType || {}), ...Object.keys(allowed.executionsByType || {})]);
    for (const type of allTypes) {
      const bCount = blocked.executionsByType?.[type] || 0;
      const aCount = allowed.executionsByType?.[type] || 0;
      if (bCount !== aCount && Math.abs(bCount - aCount) > 1) {
        differences.push({
          type: 'execution_type',
          executionType: type,
          blocked: bCount,
          allowed: aCount,
          description: `Execution type '${type}' count differs: ${bCount} vs ${aCount}`
        });
      }
    }

    // Compare eval usage (highly suspicious)
    const evalDiff = (blocked.evalCount || 0) - (allowed.evalCount || 0);
    if (evalDiff !== 0) {
      differences.push({
        type: 'eval_usage',
        severity: evalDiff > 0 ? 'high' : 'medium',
        blocked: blocked.evalCount || 0,
        allowed: allowed.evalCount || 0,
        diff: evalDiff,
        description: `Eval usage differs: ${blocked.evalCount || 0} vs ${allowed.evalCount || 0}`
      });
    }

    return { differences, similarity: 1 - Math.min(1, differences.length * 0.15) };
  }

  /**
   * Compare network activity profiles
   */
  _compareNetworkProfiles(blocked, allowed) {
    const differences = [];

    if (!blocked || !allowed) {
      return { differences, similarity: 1 };
    }

    // Compare request/response counts
    const reqDiff = Math.abs(blocked.requestCount - allowed.requestCount);
    const reqRatio = reqDiff / Math.max(blocked.requestCount, allowed.requestCount, 1);

    if (reqRatio > this.config.comparisonThreshold) {
      differences.push({
        type: 'request_count',
        severity: reqRatio > 0.5 ? 'high' : 'medium',
        blocked: blocked.requestCount,
        allowed: allowed.requestCount,
        ratio: reqRatio,
        description: `Network request count differs by ${(reqRatio * 100).toFixed(1)}%`
      });
    }

    // Compare error counts
    if (blocked.errorCount !== allowed.errorCount) {
      differences.push({
        type: 'error_count',
        severity: 'high',
        blocked: blocked.errorCount,
        allowed: allowed.errorCount,
        description: `Network errors differ: ${blocked.errorCount} vs ${allowed.errorCount}`
      });
    }

    // Compare domains
    const blockedDomains = new Set(blocked.domains || []);
    const allowedDomains = new Set(allowed.domains || []);
    const onlyBlocked = [...blockedDomains].filter(d => !allowedDomains.has(d));
    const onlyAllowed = [...allowedDomains].filter(d => !blockedDomains.has(d));

    if (onlyBlocked.length > 0 || onlyAllowed.length > 0) {
      differences.push({
        type: 'domain_differences',
        severity: 'high',
        blockedOnly: onlyBlocked,
        allowedOnly: onlyAllowed,
        description: `Domains accessed differ: ${onlyBlocked.length} blocked-only, ${onlyAllowed.length} allowed-only`
      });
    }

    // Compare total duration
    const durationDiff = Math.abs(blocked.totalDuration - allowed.totalDuration);
    if (durationDiff > 1000) { // More than 1 second difference
      differences.push({
        type: 'total_duration',
        severity: 'medium',
        blocked: blocked.totalDuration,
        allowed: allowed.totalDuration,
        diff: durationDiff,
        description: `Total network duration differs by ${durationDiff.toFixed(0)}ms`
      });
    }

    return { differences, similarity: 1 - Math.min(1, differences.length * 0.15) };
  }

  /**
   * Compare storage activity profiles
   */
  _compareStorageProfiles(blocked, allowed) {
    const differences = [];

    if (!blocked || !allowed) {
      return { differences, similarity: 1 };
    }

    // Compare operation counts
    const opDiff = Math.abs(blocked.operationCount - allowed.operationCount);
    const opRatio = opDiff / Math.max(blocked.operationCount, allowed.operationCount, 1);

    if (opRatio > this.config.comparisonThreshold) {
      differences.push({
        type: 'operation_count',
        severity: opRatio > 0.5 ? 'high' : 'medium',
        blocked: blocked.operationCount,
        allowed: allowed.operationCount,
        ratio: opRatio,
        description: `Storage operation count differs by ${(opRatio * 100).toFixed(1)}%`
      });
    }

    // Compare by storage type
    const allStorages = new Set([...Object.keys(blocked.operationsByStorage || {}), ...Object.keys(allowed.operationsByStorage || {})]);
    for (const storage of allStorages) {
      const bCount = blocked.operationsByStorage?.[storage] || 0;
      const aCount = allowed.operationsByStorage?.[storage] || 0;
      if (bCount !== aCount) {
        differences.push({
          type: 'storage_type',
          storage,
          blocked: bCount,
          allowed: aCount,
          description: `${storage} operations differ: ${bCount} vs ${aCount}`
        });
      }
    }

    return { differences, similarity: 1 - Math.min(1, differences.length * 0.1) };
  }

  /**
   * Compare timing profiles
   */
  _compareTimingProfiles(blocked, allowed) {
    const differences = [];

    if (!blocked || !allowed) {
      return { differences, similarity: 1 };
    }

    // Compare navigation timing
    if (blocked.navigationTiming && allowed.navigationTiming) {
      const navKeys = ['domLoading', 'domInteractive', 'domContentLoadedEventStart', 'domComplete', 'loadEventStart'];
      for (const key of navKeys) {
        const bVal = blocked.navigationTiming[key];
        const aVal = allowed.navigationTiming[key];
        if (bVal && aVal) {
          const diff = Math.abs(bVal - aVal);
          if (diff > 100) { // 100ms threshold
            differences.push({
              type: 'navigation_timing',
              metric: key,
              severity: diff > 500 ? 'high' : 'medium',
              blocked: bVal,
              allowed: aVal,
              diff,
              description: `Navigation timing '${key}' differs by ${diff}ms`
            });
          }
        }
      }
    }

    // Compare resource counts
    const resDiff = Math.abs(blocked.resourceCount - allowed.resourceCount);
    if (resDiff > 5) {
      differences.push({
        type: 'resource_count',
        severity: 'medium',
        blocked: blocked.resourceCount,
        allowed: allowed.resourceCount,
        diff: resDiff,
        description: `Resource count differs: ${blocked.resourceCount} vs ${allowed.resourceCount}`
      });
    }

    // Compare paint counts
    if (blocked.paintCount !== allowed.paintCount) {
      differences.push({
        type: 'paint_count',
        severity: 'medium',
        blocked: blocked.paintCount,
        allowed: allowed.paintCount,
        description: `Paint events differ: ${blocked.paintCount} vs ${allowed.paintCount}`
      });
    }

    return { differences, similarity: 1 - Math.min(1, differences.length * 0.1) };
  }

  /**
   * Compare structural signatures
   */
  _compareSignatures(blocked, allowed) {
    const differences = [];

    if (!blocked || !allowed) {
      return { differences, similarity: 1 };
    }

    // Compare DOM structure hash
    if (blocked.domStructure && allowed.domStructure && blocked.domStructure !== allowed.domStructure) {
      differences.push({
        type: 'dom_structure',
        severity: 'high',
        blocked: blocked.domStructure,
        allowed: allowed.domStructure,
        description: 'DOM structure hash differs - completely different DOM structure'
      });
    }

    // Compare element counts
    const allTags = new Set([...Object.keys(blocked.elementCounts || {}), ...Object.keys(allowed.elementCounts || {})]);
    for (const tag of allTags) {
      const bCount = blocked.elementCounts?.[tag] || 0;
      const aCount = allowed.elementCounts?.[tag] || 0;
      if (bCount !== aCount && Math.abs(bCount - aCount) > 2) {
        differences.push({
          type: 'element_count',
          tag,
          blocked: bCount,
          allowed: aCount,
          diff: Math.abs(bCount - aCount),
          description: `<${tag}> count differs: ${bCount} vs ${aCount}`
        });
      }
    }

    // Compare script counts
    const scriptKeys = ['scriptCount', 'inlineScriptCount', 'externalScriptCount'];
    for (const key of scriptKeys) {
      const bCount = blocked[key] || 0;
      const aCount = allowed[key] || 0;
      if (bCount !== aCount) {
        differences.push({
          type: 'script_count',
          metric: key,
          blocked: bCount,
          allowed: aCount,
          description: `${key} differs: ${bCount} vs ${aCount}`
        });
      }
    }

    // Compare style counts
    const styleKeys = ['styleCount', 'linkStylesheetCount'];
    for (const key of styleKeys) {
      const bCount = blocked[key] || 0;
      const aCount = allowed[key] || 0;
      if (bCount !== aCount) {
        differences.push({
          type: 'style_count',
          metric: key,
          blocked: bCount,
          allowed: aCount,
          description: `${key} differs: ${bCount} vs ${aCount}`
        });
      }
    }

    // Compare image/iframe counts
    const mediaKeys = ['imageCount', 'iframeCount'];
    for (const key of mediaKeys) {
      const bCount = blocked[key] || 0;
      const aCount = allowed[key] || 0;
      if (bCount !== aCount) {
        differences.push({
          type: 'media_count',
          metric: key,
          blocked: bCount,
          allowed: aCount,
          description: `${key} differs: ${bCount} vs ${aCount}`
        });
      }
    }

    // Compare ID/class counts
    if (blocked.idCount !== allowed.idCount) {
      differences.push({
        type: 'id_count',
        blocked: blocked.idCount,
        allowed: allowed.idCount,
        description: `Elements with ID differ: ${blocked.idCount} vs ${allowed.idCount}`
      });
    }

    if (blocked.classCount !== allowed.classCount) {
      differences.push({
        type: 'class_count',
        blocked: blocked.classCount,
        allowed: allowed.classCount,
        description: `Elements with class differ: ${blocked.classCount} vs ${allowed.classCount}`
      });
    }

    return { differences, similarity: 1 - Math.min(1, differences.length * 0.05) };
  }

  /**
   * Calculate confidence from behavioral differences
   */
  _calculateBehavioralConfidence(differences) {
    let confidence = 0;

    for (const diff of differences) {
      const severity = diff.severity || 'medium';
      const weight = severity === 'high' ? 0.25 : severity === 'medium' ? 0.15 : 0.05;

      // Additional weight based on type
      let typeWeight = 1;
      switch (diff.type) {
        case 'dom_structure':
        case 'content_hash':
        case 'eval_usage':
        case 'domain_differences':
        case 'error_count':
          typeWeight = 2;
          break;
        case 'mutation_count':
        case 'execution_count':
        case 'request_count':
        case 'operation_count':
        case 'navigation_timing':
          typeWeight = 1.5;
          break;
      }

      confidence += weight * typeWeight;
    }

    return Math.min(1, confidence);
  }

  /**
   * Store behavioral profile for comparison
   */
  _storeBehavioralProfile(url, mode, profile) {
    const key = this._normalizeUrl(url);
    if (!this.behavioralProfiles.has(key)) {
      this.behavioralProfiles.set(key, { blocked: null, allowed: null });
    }
    this.behavioralProfiles.get(key)[mode] = profile;
  }

  /**
   * Compare behavioral profiles between blocked and allowed modes
   */
  compareBehavioralProfiles(url) {
    const key = this._normalizeUrl(url);
    const profiles = this.behavioralProfiles.get(key);

    if (!profiles || !profiles.blocked || !profiles.allowed) {
      return { compared: false, reason: 'Insufficient profiles' };
    }

    const comparison = {
      url,
      timestamp: Date.now(),
      cloakingDetected: false,
      confidence: 0,
      differences: [],
      profiles: { blocked: profiles.blocked, allowed: profiles.allowed }
    };

    // Compare DOM mutations
    const domDiff = this._compareDOMProfiles(profiles.blocked.dom, profiles.allowed.dom);
    if (domDiff.differences.length > 0) {
      comparison.differences.push({ type: 'dom_behavior', ...domDiff });
    }

    // Compare JS execution
    const jsDiff = this._compareJSProfiles(profiles.blocked.js, profiles.allowed.js);
    if (jsDiff.differences.length > 0) {
      comparison.differences.push({ type: 'js_behavior', ...jsDiff });
    }

    // Compare network activity
    const netDiff = this._compareNetworkProfiles(profiles.blocked.network, profiles.allowed.network);
    if (netDiff.differences.length > 0) {
      comparison.differences.push({ type: 'network_behavior', ...netDiff });
    }

    // Compare storage activity
    const storageDiff = this._compareStorageProfiles(profiles.blocked.storage, profiles.allowed.storage);
    if (storageDiff.differences.length > 0) {
      comparison.differences.push({ type: 'storage_behavior', ...storageDiff });
    }

    // Compare timing patterns
    const timingDiff = this._compareTimingProfiles(profiles.blocked.timing, profiles.allowed.timing);
    if (timingDiff.differences.length > 0) {
      comparison.differences.push({ type: 'timing_behavior', ...timingDiff });
    }

    // Compare structural signatures
    const sigDiff = this._compareSignatures(profiles.blocked.signatures, profiles.allowed.signatures);
    if (sigDiff.differences.length > 0) {
      comparison.differences.push({ type: 'structural_signatures', ...sigDiff });
    }

    // Calculate confidence
    if (comparison.differences.length > 0) {
      comparison.cloakingDetected = true;
      comparison.confidence = this._calculateBehavioralConfidence(comparison.differences);
      this.detections.push(comparison);
    }

    return comparison;
  }

  /**
   * Set up listener for responses (would integrate with network stack)
   */
  _setupResponseListener() {
    // This would be called by the network stack when responses arrive
    // For now, expose a method to be called externally
    this.context.__aeroguardRecordResponse = (url, response, isBlocked) => {
      this.recordResponse(url, response, isBlocked);
    };
  }

  /**
   * Record a response for comparison
   */
  recordResponse(url, response, isBlocked) {
    const key = this._normalizeUrl(url);

    if (!this.baselineResponses.has(key)) {
      this.baselineResponses.set(key, {
        blocked: null,
        allowed: null,
        lastTest: 0,
        testCount: 0
      });
    }

    const entry = this.baselineResponses.get(key);

    if (isBlocked) {
      entry.blocked = {
        status: response.status,
        headers: this._serializeHeaders(response.headers),
        contentLength: response.contentLength || 0,
        contentType: response.headers?.get('content-type') || '',
        contentHash: response.contentHash || null,
        timestamp: Date.now()
      };
    } else {
      entry.allowed = {
        status: response.status,
        headers: this._serializeHeaders(response.headers),
        contentLength: response.contentLength || 0,
        contentType: response.headers?.get('content-type') || '',
        contentHash: response.contentHash || null,
        timestamp: Date.now()
      };
    }

    // If we have both, compare
    if (entry.blocked && entry.allowed) {
      this._compareAndDetect(key, entry);
    }
  }

  /**
   * Compare blocked vs allowed responses
   */
  _compareAndDetect(url, entry) {
    const detection = {
      url,
      timestamp: Date.now(),
      cloakingDetected: false,
      confidence: 0,
      differences: []
    };

    const { blocked, allowed } = entry;

    // 1. Compare status codes
    if (blocked.status !== allowed.status) {
      detection.differences.push({
        type: 'status_code',
        severity: 'high',
        blocked: blocked.status,
        allowed: allowed.status,
        description: `Status code differs: ${blocked.status} vs ${allowed.status}`
      });
    }

    // 2. Compare content length
    if (blocked.contentLength > 0 && allowed.contentLength > 0) {
      const lengthDiff = Math.abs(blocked.contentLength - allowed.contentLength);
      const lengthRatio = lengthDiff / Math.max(blocked.contentLength, allowed.contentLength);

      if (lengthRatio > this.config.comparisonThreshold) {
        detection.differences.push({
          type: 'content_length',
          severity: lengthRatio > 0.5 ? 'high' : 'medium',
          blocked: blocked.contentLength,
          allowed: allowed.contentLength,
          ratio: lengthRatio,
          description: `Content length differs by ${(lengthRatio * 100).toFixed(1)}%`
        });
      }
    }

    // 3. Compare content type
    if (blocked.contentType !== allowed.contentType) {
      detection.differences.push({
        type: 'content_type',
        severity: 'medium',
        blocked: blocked.contentType,
        allowed: allowed.contentType,
        description: `Content type differs: ${blocked.contentType} vs ${allowed.contentType}`
      });
    }

    // 4. Compare content hash (if available)
    if (blocked.contentHash && allowed.contentHash && blocked.contentHash !== allowed.contentHash) {
      detection.differences.push({
        type: 'content_hash',
        severity: 'high',
        blocked: blocked.contentHash,
        allowed: allowed.contentHash,
        description: 'Content hash differs - completely different content served'
      });
    }

    // 5. Compare headers
    const headerDiffs = this._compareHeaders(blocked.headers, allowed.headers);
    if (headerDiffs.length > 0) {
      detection.differences.push({
        type: 'headers',
        severity: 'medium',
        differences: headerDiffs,
        description: `${headerDiffs.length} header(s) differ`
      });
    }

    // 6. Compare response body structure (if both are HTML/JSON)
    if ((blocked.contentType.includes('html') && allowed.contentType.includes('html')) ||
        (blocked.contentType.includes('json') && allowed.contentType.includes('json'))) {
      // Note: Actual content comparison requires storing response bodies
      // This is a placeholder for structure comparison
      // In production, would compare DOM tree structure or JSON schema
    }

    // 7. Compare behavioral profiles if available
    const behavioralComparison = this.compareBehavioralProfiles(url);
    if (behavioralComparison.compared && behavioralComparison.cloakingDetected) {
      detection.differences.push({
        type: 'behavioral',
        severity: 'high',
        confidence: behavioralComparison.confidence,
        differences: behavioralComparison.differences,
        description: `Behavioral fingerprinting detected cloaking with ${(behavioralComparison.confidence * 100).toFixed(0)}% confidence`
      });
    }

    // Calculate confidence
    if (detection.differences.length > 0) {
      detection.cloakingDetected = true;
      detection.confidence = this._calculateConfidence(detection.differences);
      this.detections.push(detection);

      console.warn('[CloakingDetector] Cloaking detected for:', url, detection);
    }

    return detection;
  }

  _compareHeaders(blockedHeaders, allowedHeaders) {
    const differences = [];
    const allKeys = new Set([...Object.keys(blockedHeaders || {}), ...Object.keys(allowedHeaders || {})]);

    for (const key of allKeys) {
      const bVal = blockedHeaders[key];
      const aVal = allowedHeaders[key];

      if (bVal !== aVal) {
        differences.push({
          header: key,
          blocked: bVal,
          allowed: aVal
        });
      }
    }

    return differences;
  }

  _calculateConfidence(differences) {
    let confidence = 0;

    for (const diff of differences) {
      switch (diff.type) {
        case 'status_code':
          confidence += 0.4;
          break;
        case 'content_hash':
          confidence += 0.5;
          break;
        case 'content_length':
          confidence += 0.2 * Math.min(1, diff.ratio * 2);
          break;
        case 'content_type':
          confidence += 0.2;
          break;
        case 'headers':
          confidence += 0.1 * Math.min(1, diff.differences.length / 5);
          break;
      }
    }

    return Math.min(1, confidence);
  }

  _serializeHeaders(headers) {
    const obj = {};
    if (headers) {
      for (const [key, value] of headers.entries()) {
        obj[key.toLowerCase()] = value;
      }
    }
    return obj;
  }

  _normalizeUrl(url) {
    try {
      const u = new URL(url);
      // Remove query parameters that might vary
      const trackingParams = ['fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', '_ga', '_gid', 'session_id', 'click_id'];
      for (const param of trackingParams) {
        u.searchParams.delete(param);
      }
      u.hash = '';
      return u.toString();
    } catch {
      return url;
    }
  }

  /**
   * Active cloaking test - make paired requests
   */
  async testUrl(url, fetchFn) {
    const key = this._normalizeUrl(url);

    // Make request with ad blocker simulated
    const blockedResponse = await this._makeTestRequest(url, fetchFn, true);

    // Make request without ad blocker
    const allowedResponse = await this._makeTestRequest(url, fetchFn, false);

    this.recordResponse(url, blockedResponse, true);
    this.recordResponse(url, allowedResponse, false);

    return this._compareAndDetect(key, this.baselineResponses.get(key));
  }

  async _makeTestRequest(url, fetchFn, simulateBlocked) {
    try {
      const headers = simulateBlocked ? {
        'X-Adblock': 'true',
        'X-Adblocker': 'true',
        'X-Ad-Block': 'true'
      } : {};

      const response = await fetchFn(url, { headers });

      let contentHash = null;
      if (response.headers.get('content-type')?.includes('text')) {
        const text = await response.text().catch(() => '');
        contentHash = await this._hashString(text);
      }

      return {
        status: response.status,
        headers: this._serializeHeaders(response.headers),
        contentLength: parseInt(response.headers.get('content-length') || '0'),
        contentType: response.headers.get('content-type') || '',
        contentHash
      };
    } catch (e) {
      return { status: 0, headers: {}, contentLength: 0, contentType: '', contentHash: null, error: e.message };
    }
  }

  async _hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await this.context.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Start periodic testing of known URLs
   */
  _startPeriodicTesting() {
    this.testTimer = setInterval(() => {
      this._runPeriodicTests();
    }, this.config.testInterval);

    // Initial test after 30 seconds
    setTimeout(() => this._runPeriodicTests(), 30000);
  }

  _runPeriodicTests() {
    // Test a sample of URLs that we've seen both blocked and allowed
    const testable = Array.from(this.baselineResponses.entries())
      .filter(([_, entry]) => entry.blocked && entry.allowed && entry.testCount < 10)
      .slice(0, 5); // Test max 5 per interval

    for (const [url, entry] of testable) {
      entry.testCount++;
      // In production, would make actual test requests
      // this._recompare(url, entry);
    }
  }

  /**
   * Get all cloaking detections
   */
  getDetections() {
    return [...this.detections].sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get detections for specific URL
   */
  getDetectionsForUrl(url) {
    const key = this._normalizeUrl(url);
    return this.detections.filter(d => this._normalizeUrl(d.url) === key);
  }

  /**
   * Get statistics
   */
  getStats() {
    const cloakingDetected = this.detections.filter(d => d.cloakingDetected).length;
    const highConfidence = this.detections.filter(d => d.confidence > 0.7).length;

    return {
      totalTests: this.baselineResponses.size,
      cloakingDetected,
      highConfidenceDetections: highConfidence,
      totalDetections: this.detections.length,
      avgConfidence: this.detections.length > 0
        ? this.detections.reduce((sum, d) => sum + d.confidence, 0) / this.detections.length
        : 0
    };
  }

  /**
   * Clear all data
   */
  clear() {
    this.baselineResponses.clear();
    this.detections = [];
  }

  /**
   * Cleanup
   */
  cleanup() {
    if (this.testTimer) {
      clearInterval(this.testTimer);
      this.testTimer = null;
    }

    // Restore original functions
    if (this.jsHooks.has('eval')) {
      this.context.eval = this.jsHooks.get('eval');
    }
    if (this.jsHooks.has('Function')) {
      this.context.Function = this.jsHooks.get('Function');
    }
    if (this.jsHooks.has('setTimeout')) {
      this.context.setTimeout = this.jsHooks.get('setTimeout');
    }
    if (this.jsHooks.has('setInterval')) {
      this.context.setInterval = this.jsHooks.get('setInterval');
    }
    if (this.originalFetch) {
      this.context.fetch = this.originalFetch;
    }
    if (this.originalXHR) {
      this.context.XMLHttpRequest = this.originalXHR;
    }
    if (this.originalStorage) {
      this.context.localStorage = this.originalStorage.localStorage;
      this.context.sessionStorage = this.originalStorage.sessionStorage;
    }
    if (this.jsHooks.has('PerformanceObserver')) {
      this.jsHooks.get('PerformanceObserver').disconnect();
    }

    // Disconnect DOM observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    this.jsHooks.clear();
    this.isTracking = false;
    this.currentMode = null;

    delete this.context.__aeroguardRecordResponse;
  }

  /**
   * Get behavioral profiles for a URL
   */
  getBehavioralProfiles(url) {
    const key = this._normalizeUrl(url);
    return this.behavioralProfiles.get(key) || { blocked: null, allowed: null };
  }

  /**
   * Get all behavioral profiles
   */
  getAllBehavioralProfiles() {
    return Object.fromEntries(this.behavioralProfiles);
  }

  /**
   * Export detections for analysis
   */
  exportDetections() {
    return {
      timestamp: Date.now(),
      detections: this.detections,
      stats: this.getStats(),
      behavioralProfiles: this.getAllBehavioralProfiles()
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let cloakingDetectorInstance = null;

export function getCloakingDetector(context = window, options = {}) {
  if (!cloakingDetectorInstance) {
    cloakingDetectorInstance = new CloakingDetector(context, options);
  }
  return cloakingDetectorInstance;
}

export function resetCloakingDetector() {
  if (cloakingDetectorInstance) {
    cloakingDetectorInstance.cleanup();
  }
  cloakingDetectorInstance = null;
}