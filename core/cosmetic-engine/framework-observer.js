/**
 * Framework Observer — React/Vue/Angular/Svelte/Vanilla hydration awareness
 * Detects framework components and waits for hydration before filtering
 */

// ============================================================================
// Framework Detection
// ============================================================================

export const Framework = {
  REACT: 'react',
  VUE: 'vue',
  ANGULAR: 'angular',
  SVELTE: 'svelte',
  SOLID: 'solid',
  PREACT: 'preact',
  LIT: 'lit',
  ALPINE: 'alpine',
  VANILLA: 'vanilla'
};

const FRAMEWORK_DETECTORS = {
  [Framework.REACT]: {
    detect: () => window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__,
    rootAttr: 'data-reactroot',
    componentAttr: 'data-reactid',
    hydrationEvent: 'react-hydration-complete'
  },
  [Framework.VUE]: {
    detect: () => window.Vue || window.__VUE_DEVTOOLS_GLOBAL_HOOK__,
    rootAttr: 'data-v-app',
    componentAttr: 'data-v-',
    hydrationEvent: 'vue-hydration-complete'
  },
  [Framework.ANGULAR]: {
    detect: () => window.ng || window.angular,
    rootAttr: 'ng-app',
    componentAttr: 'ng-version',
    hydrationEvent: 'angular-hydration-complete'
  },
  [Framework.SVELTE]: {
    detect: () => window.__SVELTE_DEVTOOLS__,
    rootAttr: 'data-svelte',
    componentAttr: 'data-svelte-',
    hydrationEvent: 'svelte-hydration-complete'
  },
  [Framework.SOLID]: {
    detect: () => window.Solid || window.__SOLID_DEVTOOLS__,
    rootAttr: 'data-solid',
    componentAttr: 'data-solid-',
    hydrationEvent: 'solid-hydration-complete'
  },
  [Framework.PREACT]: {
    detect: () => window.preact || window.__PREACT_DEVTOOLS__,
    rootAttr: 'data-preact',
    componentAttr: 'data-preact-',
    hydrationEvent: 'preact-hydration-complete'
  },
  [Framework.LIT]: {
    detect: () => window.litHtml || window.LitElement,
    rootAttr: 'data-lit',
    componentAttr: 'data-lit-',
    hydrationEvent: 'lit-hydration-complete'
  },
  [Framework.ALPINE]: {
    detect: () => window.Alpine,
    rootAttr: 'x-data',
    componentAttr: 'x-',
    hydrationEvent: 'alpine-hydration-complete'
  }
};

// ============================================================================
// Event Emitter
// ============================================================================

class EventEmitter {
  constructor() {
    this.events = new Map();
    this.onceEvents = new Map();
  }

  on(event, callback) {
    if (!this.events.has(event)) this.events.set(event, []);
    this.events.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.events.has(event)) return;
    const callbacks = this.events.get(event);
    const index = callbacks.indexOf(callback);
    if (index !== -1) callbacks.splice(index, 1);
  }

  once(event, callback) {
    if (!this.onceEvents.has(event)) this.onceEvents.set(event, []);
    this.onceEvents.get(event).push(callback);
  }

  emit(event, data) {
    // Regular listeners
    if (this.events.has(event)) {
      for (const callback of this.events.get(event)) {
        try { callback(data); } catch (e) { console.error('[FrameworkObserver] Listener error:', e); }
      }
    }

    // Once listeners
    if (this.onceEvents.has(event)) {
      for (const callback of this.onceEvents.get(event)) {
        try { callback(data); } catch (e) { console.error('[FrameworkObserver] Once listener error:', e); }
      }
      this.onceEvents.delete(event);
    }
  }
}

// ============================================================================
// Framework Observer
// ============================================================================

export class FrameworkObserver extends EventEmitter {
  constructor(context = window) {
    super();
    this.context = context;
    this.document = context.document;

    this.detectedFrameworks = new Set();
    this.frameworkRoots = new Map(); // framework -> [root elements]
    this.hydrationStatus = new Map(); // framework -> 'pending' | 'complete' | 'failed'
    this.hydrationTimeouts = new Map();
    this.componentLifecycleHooks = new Map(); // framework -> { event: [callbacks] }
    this.protectedElements = new WeakSet();
    this.controlledElements = new WeakSet();

    this.config = {
      hydrationTimeout: 10000,
      observeMutations: true,
      protectControlledComponents: true
    };
  }

  configure(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Initialize framework detection and observation
   */
  initialize() {
    // Detect frameworks immediately
    this._detectFrameworks();

    // Observe DOM for framework roots
    if (this.config.observeMutations) {
      this._setupMutationObserver();
    }

    // Listen for framework-specific hydration events
    this._listenForHydrationEvents();

    // Periodic check for late-loading frameworks
    this._startPeriodicDetection();

    console.log('[FrameworkObserver] Initialized with frameworks:', Array.from(this.detectedFrameworks));
  }

  _detectFrameworks() {
    for (const [framework, detector] of Object.entries(FRAMEWORK_DETECTORS)) {
      if (detector.detect()) {
        this.detectedFrameworks.add(framework);
        this.hydrationStatus.set(framework, 'pending');
        this._findFrameworkRoots(framework);
      }
    }
  }

  _findFrameworkRoots(framework) {
    const detector = FRAMEWORK_DETECTORS[framework];
    if (!detector) return;

    const roots = [];
    try {
      // Find root elements by attribute
      const rootElements = this.document.querySelectorAll(`[${detector.rootAttr}]`);
      for (const root of rootElements) {
        roots.push(root);
        this._markElementProtected(root, framework);
      }

      // Also check for components
      const componentElements = this.document.querySelectorAll(`[${detector.componentAttr}]`);
      for (const comp of componentElements) {
        this._markElementControlled(comp, framework);
      }
    } catch (e) { /* ignore */ }

    this.frameworkRoots.set(framework, roots);

    // If no roots found but framework detected, check body
    if (roots.length === 0 && this.detectedFrameworks.has(framework)) {
      this.hydrationStatus.set(framework, 'complete');
      this.emit('hydration-complete', { element: this.document.body, framework });
    }
  }

  _markElementProtected(element, framework) {
    this.protectedElements.add(element);
    element.dataset.aeroguardFramework = framework;
    element.dataset.aeroguardProtected = 'true';
  }

  _markElementControlled(element, framework) {
    this.controlledElements.add(element);
    element.dataset.aeroguardFramework = framework;
    element.dataset.aeroguardControlled = 'true';
  }

  _setupMutationObserver() {
    this.mutationObserver = new this.context.MutationObserver(mutations => {
      let shouldCheck = false;
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length) {
          for (const node of m.addedNodes) {
            if (node.nodeType === this.context.Node.ELEMENT_NODE) {
              this._checkForFrameworkElements(node);
              shouldCheck = true;
            }
          }
        }
      }
      if (shouldCheck) {
        this._debouncedFrameworkCheck();
      }
    });

    this.mutationObserver.observe(this.document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: Object.values(FRAMEWORK_DETECTORS).flatMap(d => [d.rootAttr, d.componentAttr])
    });
  }

  _debouncedFrameworkCheck() {
    clearTimeout(this._frameworkCheckTimeout);
    this._frameworkCheckTimeout = setTimeout(() => {
      this._detectFrameworks();
    }, 100);
  }

  _checkForFrameworkElements(element) {
    for (const [framework, detector] of Object.entries(FRAMEWORK_DETECTORS)) {
      if (!this.detectedFrameworks.has(framework) && detector.detect()) {
        this.detectedFrameworks.add(framework);
        this.hydrationStatus.set(framework, 'pending');
        this._findFrameworkRoots(framework);
        this.emit('framework-detected', { framework });
      }

      // Check for new roots
      if (element.hasAttribute && element.hasAttribute(detector.rootAttr)) {
        this._markElementProtected(element, framework);
        const roots = this.frameworkRoots.get(framework) || [];
        roots.push(element);
        this.frameworkRoots.set(framework, roots);
      }

      // Check for components
      if (element.hasAttribute && element.hasAttribute(detector.componentAttr)) {
        this._markElementControlled(element, framework);
      }
    }
  }

  _listenForHydrationEvents() {
    // Listen for custom hydration events dispatched by frameworks
    for (const [framework, detector] of Object.entries(FRAMEWORK_DETECTORS)) {
      if (detector.hydrationEvent) {
        this.document.addEventListener(detector.hydrationEvent, (e) => {
          this._onHydrationComplete(e.detail?.element || e.target, framework);
        });
      }
    }
  }

  _onHydrationComplete(element, framework) {
    if (this.hydrationStatus.get(framework) === 'complete') return;

    this.hydrationStatus.set(framework, 'complete');
    clearTimeout(this.hydrationTimeouts.get(framework));

    this.emit('hydration-complete', { element, framework });
    this.emit('ready-for-filtering', { root: element, framework });

    console.log(`[FrameworkObserver] ${framework} hydration complete`);
  }

  _startPeriodicDetection() {
    this.detectionInterval = setInterval(() => {
      const before = this.detectedFrameworks.size;
      this._detectFrameworks();
      if (this.detectedFrameworks.size > before) {
        console.log('[FrameworkObserver] New frameworks detected:', Array.from(this.detectedFrameworks));
      }
    }, 5000);
  }

  // ============================================================================
  #region PUBLIC API
  // ============================================================================

  /**
   * Check if element is protected (framework root)
   */
  isElementProtected(element) {
    return this.protectedElements.has(element) || element.hasAttribute('data-aeroguard-protected');
  }

  /**
   * Check if element is controlled by a framework (component)
   */
  isElementControlled(element) {
    return this.controlledElements.has(element) || element.hasAttribute('data-aeroguard-controlled');
  }

  /**
   * Check if hiding this element would break a controlled component
   */
  wouldBreakControlled(element) {
    if (!this.config.protectControlledComponents) return false;

    // Check if element or any ancestor is controlled
    let current = element;
    while (current) {
      if (this.isElementControlled(current)) return true;
      current = current.parentElement;
    }
    return false;
  }

  /**
   * Get detected frameworks
   */
  getDetectedFrameworks() {
    return Array.from(this.detectedFrameworks);
  }

  /**
   * Get framework roots
   */
  getFrameworkRoots() {
    const result = [];
    for (const [framework, roots] of this.frameworkRoots) {
      for (const root of roots) {
        result.push({ element: root, framework });
      }
    }
    return result;
  }

  /**
   * Wait for framework hydration
   */
  async waitForHydration(framework, timeout = this.config.hydrationTimeout) {
    if (this.hydrationStatus.get(framework) === 'complete') return true;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.hydrationStatus.set(framework, 'failed');
        this.off('hydration-complete', handler);
        resolve(false);
      }, timeout);

      const handler = (data) => {
        if (data.framework === framework) {
          clearTimeout(timer);
          this.off('hydration-complete', handler);
          resolve(true);
        }
      };

      this.once('hydration-complete', handler);
    });
  }

  /**
   * Register component lifecycle hook
   */
  onComponentLifecycle(framework, event, callback) {
    if (!this.componentLifecycleHooks.has(framework)) {
      this.componentLifecycleHooks.set(framework, new Map());
    }
    const hooks = this.componentLifecycleHooks.get(framework);
    if (!hooks.has(event)) hooks.set(event, []);
    hooks.get(event).push(callback);
  }

  /**
   * Emit component lifecycle event
   */
  emitComponentLifecycle(framework, event, data) {
    const hooks = this.componentLifecycleHooks.get(framework);
    if (!hooks) return;
    const callbacks = hooks.get(event);
    if (!callbacks) return;
    for (const callback of callbacks) {
      try { callback(data); } catch (e) { console.error('[FrameworkObserver] Lifecycle hook error:', e); }
    }
  }

  getMetrics() {
    return {
      detectedFrameworks: Array.from(this.detectedFrameworks),
      hydrationStatus: Object.fromEntries(this.hydrationStatus),
      protectedElements: this.protectedElements.size,
      controlledElements: this.controlledElements.size,
      frameworkRoots: Object.fromEntries(
        Array.from(this.frameworkRoots.entries()).map(([k, v]) => [k, v.length])
      )
    };
  }

  cleanup() {
    if (this.mutationObserver) this.mutationObserver.disconnect();
    if (this.detectionInterval) clearInterval(this.detectionInterval);
    for (const timer of this.hydrationTimeouts.values()) clearTimeout(timer);
    this.events.clear();
    this.onceEvents.clear();
    this.componentLifecycleHooks.clear();
    this.detectedFrameworks.clear();
    this.frameworkRoots.clear();
    this.hydrationStatus.clear();
  }
}

// ============================================================================
// React-specific hooks
// ============================================================================

function setupReactHooks(observer) {
  // Hook into React's hydration
  if (window.React && window.ReactDOM) {
    const originalHydrate = window.ReactDOM.hydrate || window.ReactDOM.hydrateRoot;
    if (originalHydrate) {
      window.ReactDOM.hydrate = function(...args) {
        const result = originalHydrate.apply(this, args);
        if (args[1] instanceof Element) {
          observer._onHydrationComplete(args[1], Framework.REACT);
        }
        return result;
      };
    }
  }

  // Listen for React DevTools
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__.on('commitFiberRoot', (id, root) => {
      if (root.current && root.current.stateNode) {
        observer._markElementControlled(root.current.stateNode, Framework.REACT);
      }
    });
  }
}

// ============================================================================
// Vue-specific hooks
// ============================================================================

function setupVueHooks(observer) {
  if (window.Vue) {
    const originalMount = window.Vue.prototype.$mount;
    window.Vue.prototype.$mount = function(...args) {
      const result = originalMount.apply(this, args);
      if (this.$el) {
        observer._markElementControlled(this.$el, Framework.VUE);
      }
      return result;
    };

    // Vue 3
    if (window.Vue.version && window.Vue.version.startsWith('3')) {
      const originalCreateApp = window.Vue.createApp;
      window.Vue.createApp = function(...args) {
        const app = originalCreateApp.apply(this, args);
        const originalMount = app.mount;
        app.mount = function(selector) {
          const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
          const result = originalMount.call(this, selector);
          if (el) observer._markElementProtected(el, Framework.VUE);
          return result;
        };
        return app;
      };
    }
  }
}

// ============================================================================
// Angular-specific hooks
// ============================================================================

function setupAngularHooks(observer) {
  if (window.ng && window.ng.probe) {
    // Angular 2+
    const originalBootstrap = window.ng.platformBrowser?.bootstrapModule;
    if (originalBootstrap) {
      window.ng.platformBrowser.bootstrapModule = function(...args) {
        return originalBootstrap.apply(this, args).then(moduleRef => {
          const components = moduleRef.injector.get(window.ng.core.ComponentFactoryResolver);
          // Mark components as controlled
          return moduleRef;
        });
      };
    }
  }

  // AngularJS
  if (window.angular) {
    const originalBootstrap = window.angular.bootstrap;
    window.angular.bootstrap = function(element, modules, config) {
      const result = originalBootstrap.apply(this, arguments);
      if (element) observer._markElementProtected(element[0] || element, Framework.ANGULAR);
      return result;
    };
  }
}

// ============================================================================
// Svelte-specific hooks
// ============================================================================

function setupSvelteHooks(observer) {
  if (window.__SVELTE_DEVTOOLS__) {
    window.__SVELTE_DEVTOOLS__.on('component:mounted', (component) => {
      if (component.$$.fragment) {
        observer._markElementControlled(component.$$.fragment.firstChild?.parentElement, Framework.SVELTE);
      }
    });
  }
}

// ============================================================================
// Singleton
// ============================================================================

let frameworkObserverInstance = null;

export function getFrameworkObserver(context = window) {
  if (!frameworkObserverInstance) {
    frameworkObserverInstance = new FrameworkObserver(context);
    frameworkObserverInstance.initialize();

    // Setup framework-specific hooks
    setupReactHooks(frameworkObserverInstance);
    setupVueHooks(frameworkObserverInstance);
    setupAngularHooks(frameworkObserverInstance);
    setupSvelteHooks(frameworkObserverInstance);
  }
  return frameworkObserverInstance;
}

export function resetFrameworkObserver() {
  if (frameworkObserverInstance) {
    frameworkObserverInstance.cleanup();
  }
  frameworkObserverInstance = null;
}