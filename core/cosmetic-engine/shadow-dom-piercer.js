/**
 * Shadow DOM Piercer — Open + Closed mode support
 * Recursive piercing, custom element handling, multiple access strategies
 *
 * Features:
 * - Open shadow roots: Full recursive piercing with querySelectorAll delegation
 * - Closed shadow roots: Multiple access strategies (ElementInternals, attachShadow hook, custom element wrappers)
 * - Custom element registry for known components with closed shadow roots
 * - MutationObserver-based dynamic shadow root detection
 * - Performance optimized with caching and batching
 * - Integration with CosmeticCoordinator for ad hiding
 */

// ============================================================================
// Types & Interfaces (JSDoc)
// ============================================================================

/**
 * @typedef {Object} ShadowRootInfo
 * @property {ShadowRoot} root
 * @property {Element} host
 * @property {'open'|'closed'} mode
 * @property {number} depth
 * @property {string} path - CSS path to host for debugging
 */

/**
 * @typedef {Object} PiercerStats
 * @property {number} openRootsPierced
 * @property {number} closedRootsHandled
 * @property {number} customElementsRegistered
 * @property {number} elementsQueried
 * @property {number} elementsHidden
 * @property {number} mutationEventsProcessed
 */

/**
 * @typedef {Object} ClosedModeStrategy
 * @property {string} name
 * @property {Function} canHandle
 * @property {Function} pierce
 * @property {number} priority
 */

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG = {
  // Open mode settings
  enableOpenMode: true,
  maxRecursionDepth: 50,
  maxElementsPerRoot: 10000,

  // Closed mode settings
  enableClosedMode: true,
  closedModeStrategies: [
    'element-internals',
    'attach-shadow-hook',
    'custom-element-wrapper',
    'mutation-observer',
    'known-elements-registry'
  ],

  // Custom element handling
  enableCustomElementHandling: true,
  autoRegisterKnownElements: true,
  customElementAccessors: {},

  // Performance
  enableCaching: true,
  cacheTimeoutMs: 30000,
  batchQueries: true,
  debounceMutationsMs: 50,

  // Debugging
  debugMode: false,
  logPiercing: false,
  logClosedMode: false
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate CSS path for debugging
 * @param {Element} element
 * @returns {string}
 */
function getElementPath(element) {
  if (!element) return 'unknown';
  const parts = [];
  let current = element;
  while (current && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${current.id}`;
      parts.unshift(selector);
      break;
    } else {
      let sibling = current;
      let index = 1;
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.tagName === current.tagName) index++;
      }
      if (index > 1) selector += `:nth-of-type(${index})`;
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(' > ') || 'html';
}

/**
 * Check if element is a custom element
 * @param {Element} element
 * @returns {boolean}
 */
function isCustomElement(element) {
  return element.tagName.includes('-') ||
         (element.constructor.name !== 'HTMLElement' &&
          element.constructor.name !== 'HTMLUnknownElement');
}

/**
 * Get shadow root mode safely
 * @param {ShadowRoot} shadowRoot
 * @returns {'open'|'closed'|'unknown'}
 */
function getShadowRootMode(shadowRoot) {
  try {
    return shadowRoot.mode;
  } catch (e) {
    return 'unknown';
  }
}

/**
 * Debounce function
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ============================================================================
// Closed Mode Strategies
// ============================================================================

/**
 * Strategy 1: ElementInternals (for form-associated custom elements)
 * Works when custom element uses ElementInternals.attachInternals()
 */
const ElementInternalsStrategy = {
  name: 'element-internals',
  priority: 100,

  canHandle(host) {
    return host && typeof host.attachInternals === 'function';
  },

  async pierce(host, piercer) {
    try {
      // ElementInternals gives access to shadow root internals
      const internals = host.attachInternals?.();
      if (internals && internals.shadowRoot) {
        return internals.shadowRoot;
      }

      // Some implementations expose shadowRoot via internals
      if (internals?.shadowRoot) {
        return internals.shadowRoot;
      }
    } catch (e) {
      // Not available
    }
    return null;
  }
};

/**
 * Strategy 2: attachShadow hook
 * Intercepts Element.prototype.attachShadow to capture closed shadow roots at creation time
 */
const AttachShadowHookStrategy = {
  name: 'attach-shadow-hook',
  priority: 90,

  canHandle(host) {
    return host instanceof Element;
  },

  pierce(host, piercer) {
    // The hook is set up globally, this just checks if we captured it
    return piercer._closedShadowRootCache.get(host) || null;
  }
};

/**
 * Strategy 3: Custom Element Wrapper
 * Wraps custom element constructor to intercept shadow root creation
 */
const CustomElementWrapperStrategy = {
  name: 'custom-element-wrapper',
  priority: 80,

  canHandle(host) {
    return isCustomElement(host) && host.shadowRoot === null;
  },

  pierce(host, piercer) {
    // Check if we have a registered accessor for this custom element
    const tagName = host.tagName.toLowerCase();
    const accessor = piercer._customElementAccessors.get(tagName);

    if (accessor) {
      try {
        return accessor(host);
      } catch (e) {
        piercer._log('Custom element accessor failed:', tagName, e);
      }
    }
    return null;
  }
};

/**
 * Strategy 4: MutationObserver on host
 * Observes host element for changes that might indicate shadow root content
 */
const MutationObserverStrategy = {
  name: 'mutation-observer',
  priority: 70,

  canHandle(host) {
    return host instanceof Element && host.shadowRoot === null;
  },

  pierce(host, piercer) {
    // Set up observer if not already done
    if (!piercer._closedModeObservers.has(host)) {
      piercer._setupClosedModeObserver(host);
    }
    return null; // Can't directly access, but observer will catch content
  }
};

/**
 * Strategy 5: Known Elements Registry
 * Pre-registered accessors for known custom elements (e.g., Google Ads, YouTube components)
 */
const KnownElementsRegistryStrategy = {
  name: 'known-elements-registry',
  priority: 60,

  canHandle(host) {
    const tagName = host.tagName.toLowerCase();
    return piercer._knownCustomElements.has(tagName);
  },

  pierce(host, piercer) {
    const tagName = host.tagName.toLowerCase();
    const info = piercer._knownCustomElements.get(tagName);

    if (info?.accessor) {
      try {
        return info.accessor(host);
      } catch (e) {
        piercer._log('Known element accessor failed:', tagName, e);
      }
    }
    return null;
  }
};

// All strategies sorted by priority
const CLOSED_MODE_STRATEGIES = [
  ElementInternalsStrategy,
  AttachShadowHookStrategy,
  CustomElementWrapperStrategy,
  MutationObserverStrategy,
  KnownElementsRegistryStrategy
].sort((a, b) => b.priority - a.priority);

// ============================================================================
// Main ShadowDOMPiercer Class
// ============================================================================

class ShadowDOMPiercer {
  /**
   * @param {Window|Object} context - Window or context with document
   * @param {Object} config - Configuration options
   */
  constructor(context = window, config = {}) {
    this.context = context;
    this.document = context.document;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Open mode tracking
    this._piercedOpenRoots = new WeakSet();
    this._openRootInfo = new Map(); // ShadowRoot -> ShadowRootInfo

    // Closed mode tracking
    this._closedShadowRootCache = new Map(); // host -> captured shadow root
    this._closedModeObservers = new Map(); // host -> MutationObserver
    this._closedModeStrategies = [...CLOSED_MODE_STRATEGIES];

    // Custom element handling
    this._customElementAccessors = new Map(); // tagName -> accessor function
    this._knownCustomElements = new Map(); // tagName -> { accessor, selectors, metadata }
    this._customElementConstructors = new Map(); // tagName -> original constructor
    this._customElementsDefineHook = null;

    // Store original functions for cleanup
    this._originalCustomElementsDefine = this.context.customElements.define.bind(this.context.customElements);
    this._originalAttachShadow = this.context.Element.prototype.attachShadow;

    // Mutation observer for dynamic content
    this._mutationObserver = null;
    this._mutationDebounce = null;

    // Query cache
    this._queryCache = new Map(); // selector -> { results, timestamp, roots }
    this._cacheTimeout = this.config.cacheTimeoutMs;

    // State
    this.isActive = false;
    this._initializationPromise = null;

    // Statistics
    this.stats = {
      openRootsPierced: 0,
      closedRootsHandled: 0,
      customElementsRegistered: 0,
      elementsQueried: 0,
      elementsHidden: 0,
      mutationEventsProcessed: 0
    };

    // Bind methods
    this._handleMutations = this._handleMutations.bind(this);
    this._debouncedMutationHandler = debounce(this._handleMutations, this.config.debounceMutationsMs);
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the piercer
   * @returns {Promise<ShadowDOMPiercer>}
   */
  async initialize() {
    if (this.isActive) return this;
    if (this._initializationPromise) return this._initializationPromise;

    this._initializationPromise = this._doInitialize();
    return this._initializationPromise;
  }

  async _doInitialize() {
    this._log('Initializing ShadowDOMPiercer...');

    // 1. Pierce existing open shadow roots
    if (this.config.enableOpenMode) {
      this._pierceOpenShadowRoots(this.document, 0);
    }

    // 2. Set up closed mode handling
    if (this.config.enableClosedMode) {
      this._setupClosedModeHandling();
    }

    // 3. Register known custom elements
    if (this.config.enableCustomElementHandling && this.config.autoRegisterKnownElements) {
      this._registerKnownCustomElements();
    }

    // 4. Set up mutation observer for dynamic shadow roots
    this._observeMutations();

    this.isActive = true;
    this._log('ShadowDOMPiercer initialized', this.getStats());
    return this;
  }

  // ============================================================================
  // Open Mode Piercing
  // ============================================================================

  /**
   * Recursively pierce all open shadow roots from a root node
   * @param {Document|ShadowRoot} root
   * @param {number} depth
   * @returns {number} Number of roots pierced
   */
  _pierceOpenShadowRoots(root, depth = 0) {
    if (depth > this.config.maxRecursionDepth) {
      this._log('Max recursion depth reached', depth);
      return 0;
    }

    let count = 0;

    try {
      // Find all elements with open shadow roots
      const elements = root.querySelectorAll('*');

      for (const element of elements) {
        if (this._piercedOpenRoots.has(element.shadowRoot)) continue;

        if (element.shadowRoot && getShadowRootMode(element.shadowRoot) === 'open') {
          this._pierceShadowRoot(element.shadowRoot, element, depth + 1);
          count++;
        }
      }
    } catch (e) {
      this._log('Error piercing open shadow roots:', e);
    }

    return count;
  }

  /**
   * Pierce a single shadow root and its descendants
   * @param {ShadowRoot} shadowRoot
   * @param {Element} host
   * @param {number} depth
   */
  _pierceShadowRoot(shadowRoot, host, depth = 0) {
    if (this._piercedOpenRoots.has(shadowRoot)) return;
    if (depth > this.config.maxRecursionDepth) return;

    this._piercedOpenRoots.add(shadowRoot);
    this.stats.openRootsPierced++;

    // Store root info
    this._openRootInfo.set(shadowRoot, {
      root: shadowRoot,
      host,
      mode: 'open',
      depth,
      path: getElementPath(host)
    });

    this._log('Pierced open shadow root:', this._openRootInfo.get(shadowRoot).path);

    // Recursively pierce nested open shadow roots
    try {
      const elements = shadowRoot.querySelectorAll('*');
      let elementCount = 0;

      for (const element of elements) {
        if (elementCount >= this.config.maxElementsPerRoot) break;

        if (element.shadowRoot && getShadowRootMode(element.shadowRoot) === 'open') {
          this._pierceShadowRoot(element.shadowRoot, element, depth + 1);
        }
        elementCount++;
      }
    } catch (e) {
      this._log('Error recursively piercing:', e);
    }
  }

  /**
   * Pierce a specific element's shadow root if open
   * @param {Element} element
   * @returns {ShadowRoot|null}
   */
  pierceElement(element) {
    if (!element || !element.shadowRoot) return null;
    if (getShadowRootMode(element.shadowRoot) !== 'open') return null;
    if (this._piercedOpenRoots.has(element.shadowRoot)) return element.shadowRoot;

    this._pierceShadowRoot(element.shadowRoot, element, 0);
    return element.shadowRoot;
  }

  // ============================================================================
  // Closed Mode Handling
  // ============================================================================

  /**
   * Set up closed mode handling strategies
   */
  _setupClosedModeHandling() {
    this._log('Setting up closed mode handling...');

    // Strategy 1: Hook customElements.define
    this._hookCustomElementsDefine();

    // Strategy 2: Hook Element.prototype.attachShadow
    this._hookAttachShadow();

    // Strategy 3: Set up known element accessors
    this._setupKnownElementAccessors();

    this._log('Closed mode handling configured with', this._closedModeStrategies.length, 'strategies');
  }

  /**
   * Hook customElements.define to intercept custom element registration
   */
  _hookCustomElementsDefine() {
    const originalDefine = this._originalCustomElementsDefine;

    this._customElementsDefineHook = (name, constructor, options) => {
      // Check if this custom element uses closed shadow root
      const usesClosedShadow = options?.shadowRootMode === 'closed' ||
                               (constructor.prototype?.shadowRootMode === 'closed');

      if (usesClosedShadow) {
        this._log('Intercepting custom element with closed shadow root:', name);

        // Wrap constructor to capture shadow root
        const wrappedConstructor = class extends constructor {
          constructor(...args) {
            super(...args);

            // Try to access shadow root after super()
            if (this.shadowRoot) {
              // Can't access closed shadow root directly, but we can try ElementInternals
              this._shadowPiercer?._tryClosedModeStrategies(this);
            }
          }
        };

        // Attach piercer reference
        wrappedConstructor.prototype._shadowPiercer = this;
        wrappedConstructor.prototype.shadowRootMode = 'closed';

        return originalDefine(name, wrappedConstructor, options);
      }

      return originalDefine(name, constructor, options);
    };

    this.context.customElements.define = this._customElementsDefineHook;
  }

  /**
   * Hook Element.prototype.attachShadow to capture closed shadow roots
   */
  _hookAttachShadow() {
    const originalAttachShadow = this._originalAttachShadow;
    const self = this;

    this.context.Element.prototype.attachShadow = function(init) {
      const shadowRoot = originalAttachShadow.call(this, init);

      if (init?.mode === 'closed') {
        // Cache the host -> shadowRoot mapping
        // Note: We still can't directly access the closed shadow root,
        // but we know this host has one
        self._closedShadowRootCache.set(this, {
          hasClosedShadowRoot: true,
          timestamp: Date.now(),
          init
        });

        // Try strategies to access it
        self._tryClosedModeStrategies(this);

        self.stats.closedRootsHandled++;
        self._log('Captured closed shadow root on:', getElementPath(this));
      }

      return shadowRoot;
    };
  }

  /**
   * Try all closed mode strategies for a host element
   * @param {Element} host
   */
  _tryClosedModeStrategies(host) {
    if (!this.config.enableClosedMode) return;

    for (const strategy of this._closedModeStrategies) {
      if (!this.config.closedModeStrategies.includes(strategy.name)) continue;
      if (!strategy.canHandle(host)) continue;

      try {
        const result = strategy.pierce(host, this);
        if (result) {
          this._log('Closed mode strategy succeeded:', strategy.name, 'for', getElementPath(host));
          this._onClosedShadowRootAccessed(host, result, strategy.name);
          return result;
        }
      } catch (e) {
        this._log('Closed mode strategy failed:', strategy.name, e);
      }
    }
  }

  /**
   * Set up MutationObserver for closed mode host elements
   * @param {Element} host
   */
  _setupClosedModeObserver(host) {
    if (this._closedModeObservers.has(host)) return;

    const observer = new this.context.MutationObserver((mutations) => {
      this.stats.mutationEventsProcessed++;
      this._debouncedMutationHandler(mutations, host);
    });

    observer.observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    this._closedModeObservers.set(host, observer);
    this._log('Set up closed mode observer for:', getElementPath(host));
  }

  /**
   * Handle mutations on closed mode host elements
   * @param {MutationRecord[]} mutations
   * @param {Element} host
   */
  _handleMutations(mutations, host) {
    // Check if any mutations indicate shadow root content changes
    // We can't directly observe closed shadow root, but we can detect
    // when the host gets new attributes/classes that might indicate content
    let shouldRecheck = false;

    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        shouldRecheck = true;
      } else if (mutation.type === 'attributes' &&
                 ['style', 'class', 'data-ad'].includes(mutation.attributeName)) {
        shouldRecheck = true;
      }
    }

    if (shouldRecheck) {
      // Re-run strategies in case shadow root became accessible
      this._tryClosedModeStrategies(host);
    }
  }

  /**
   * Called when closed shadow root is successfully accessed
   * @param {Element} host
   * @param {ShadowRoot|DocumentFragment} shadowContent
   * @param {string} strategy
   */
  _onClosedShadowRootAccessed(host, shadowContent, strategy) {
    this._closedShadowRootCache.set(host, {
      shadowContent,
      strategy,
      timestamp: Date.now(),
      hasClosedShadowRoot: true
    });

    // If it's a ShadowRoot, recursively pierce nested open roots
    if (shadowContent instanceof ShadowRoot) {
      this._pierceShadowRoot(shadowContent, host, 0);
    }
  }

  // ============================================================================
  // Known Custom Elements Registry
  // ============================================================================

  /**
   * Register known custom elements with closed shadow roots
   * These are common ad-related custom elements
   */
  _registerKnownCustomElements() {
    const knownElements = {
      // Google Ads
      'google-ad': {
        accessor: (el) => this._tryGoogleAdAccessor(el),
        selectors: ['.adsbygoogle', 'ins[data-ad-slot]'],
        metadata: { vendor: 'google', type: 'ads' }
      },
      'adsbygoogle': {
        accessor: (el) => this._tryGoogleAdAccessor(el),
        selectors: ['ins.adsbygoogle'],
        metadata: { vendor: 'google', type: 'ads' }
      },
      // YouTube
      'ytd-ad-slot-renderer': {
        accessor: (el) => el.shadowRoot, // YouTube uses open sometimes
        selectors: ['ytd-ad-slot-renderer'],
        metadata: { vendor: 'youtube', type: 'ads' }
      },
      'ytd-promoted-sparkles-web-renderer': {
        accessor: (el) => this._tryYouTubeAccessor(el),
        selectors: ['ytd-promoted-sparkles-web-renderer'],
        metadata: { vendor: 'youtube', type: 'sponsor' }
      },
      // Common ad wrappers
      'ad-slot': {
        accessor: (el) => this._tryGenericAdAccessor(el),
        selectors: ['ad-slot', 'ad-container', 'ad-wrapper'],
        metadata: { type: 'generic-ad' }
      },
      'amp-ad': {
        accessor: (el) => this._tryAmpAdAccessor(el),
        selectors: ['amp-ad'],
        metadata: { vendor: 'amp', type: 'ads' }
      }
    };

    for (const [tagName, info] of Object.entries(knownElements)) {
      this.registerKnownCustomElement(tagName, info.accessor, info.selectors, info.metadata);
    }
  }

  /**
   * Register a known custom element for closed shadow root access
   * @param {string} tagName - Custom element tag name (lowercase)
   * @param {Function} accessor - Function(host) -> ShadowRoot|DocumentFragment|null
   * @param {string[]} selectors - CSS selectors that identify this element
   * @param {Object} metadata - Additional metadata
   */
  registerKnownCustomElement(tagName, accessor, selectors = [], metadata = {}) {
    const normalizedTag = tagName.toLowerCase();

    this._knownCustomElements.set(normalizedTag, {
      accessor,
      selectors: selectors.map(s => s.toLowerCase()),
      metadata,
      registeredAt: Date.now()
    });

    this.stats.customElementsRegistered++;
    this._log('Registered known custom element:', normalizedTag, metadata);
  }

  /**
   * Register a custom element accessor (for elements defined on the page)
   * @param {string} tagName - Custom element tag name
   * @param {Function} accessor - Function(host) -> ShadowRoot|DocumentFragment|null
   */
  registerCustomElementAccessor(tagName, accessor) {
    const normalizedTag = tagName.toLowerCase();
    this._customElementAccessors.set(normalizedTag, accessor);
    this._log('Registered custom element accessor:', normalizedTag);
  }

  // ============================================================================
  // Known Element Accessor Implementations
  // ============================================================================

  _tryGoogleAdAccessor(element) {
    // Google Ads often uses a specific pattern
    // Try to find the iframe inside
    try {
      const iframe = element.querySelector('iframe[id^="google_ads_iframe"], iframe[src*="googlesyndication"]');
      if (iframe?.contentDocument) {
        return iframe.contentDocument;
      }
    } catch (e) {}
    return null;
  }

  _tryYouTubeAccessor(element) {
    // YouTube custom elements sometimes expose internals
    try {
      if (element.internals?.shadowRoot) {
        return element.internals.shadowRoot;
      }
      if (element._shadowRoot) {
        return element._shadowRoot;
      }
    } catch (e) {}
    return null;
  }

  _tryGenericAdAccessor(element) {
    // Generic pattern: look for iframes or known ad patterns
    try {
      const iframes = element.querySelectorAll('iframe');
      for (const iframe of iframes) {
        if (iframe.src && (iframe.src.includes('ad') || iframe.src.includes('doubleclick') || iframe.src.includes('googlesyndication'))) {
          if (iframe.contentDocument) return iframe.contentDocument;
        }
      }
    } catch (e) {}
    return null;
  }

  _tryAmpAdAccessor(element) {
    // AMP ads have specific structure
    try {
      const iframe = element.querySelector('iframe[src*="ampproject"]');
      if (iframe?.contentDocument) return iframe.contentDocument;
    } catch (e) {}
    return null;
  }

  // ============================================================================
  // Custom Element Wrapper Setup
  // ============================================================================

  /**
   * Set up accessors for known custom element patterns
   */
  _setupKnownElementAccessors() {
    // This would be called after known elements are registered
    // to wrap their constructors if they exist
  }

  /**
   * Wrap a custom element constructor to intercept closed shadow root
   * @param {string} tagName
   * @param {Function} accessor
   */
  wrapCustomElementConstructor(tagName, accessor) {
    const normalizedTag = tagName.toLowerCase();
    const originalConstructor = this.context.customElements.get(normalizedTag);

    if (!originalConstructor) {
      // Not defined yet, store for when it is
      this._customElementConstructors.set(normalizedTag, { accessor });
      return;
    }

    this._wrapConstructor(normalizedTag, originalConstructor, accessor);
  }

  _wrapConstructor(tagName, OriginalConstructor, accessor) {
    const self = this;

    const WrappedConstructor = class extends OriginalConstructor {
      constructor(...args) {
        super(...args);

        // Try to access closed shadow root after construction
        queueMicrotask(() => {
          try {
            const shadowContent = accessor(this);
            if (shadowContent) {
              self._onClosedShadowRootAccessed(this, shadowContent, 'custom-wrapper');
            }
          } catch (e) {
            self._log('Wrapper accessor failed:', tagName, e);
          }
        });
      }
    };

    // Preserve prototype chain
    Object.setPrototypeOf(WrappedConstructor.prototype, OriginalConstructor.prototype);
    Object.setPrototypeOf(WrappedConstructor, OriginalConstructor);

    // Redefine
    this.context.customElements.define(tagName, WrappedConstructor, {
      extends: OriginalConstructor.prototype.constructor.name
    });
  }

  // ============================================================================
  // Mutation Observer for Dynamic Content
  // ============================================================================

  /**
   * Set up mutation observer to detect new shadow roots
   */
  _observeMutations() {
    this._mutationObserver = new this.context.MutationObserver((mutations) => {
      this._debouncedMutationHandler(mutations);
    });

    this._mutationObserver.observe(this.document.documentElement, {
      childList: true,
      subtree: true
    });

    this._log('Mutation observer started');
  }

  /**
   * Handle mutations for new elements with shadow roots
   * @param {MutationRecord[]} mutations
   */
  _handleMutations(mutations) {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;

      for (const node of mutation.addedNodes) {
        if (node.nodeType !== this.context.Node.ELEMENT_NODE) continue;

        const element = node;

        // Check the element itself
        this._checkElementForShadowRoot(element);

        // Check descendants
        if (element.querySelectorAll) {
          const descendants = element.querySelectorAll('*');
          for (const desc of descendants) {
            this._checkElementForShadowRoot(desc);
          }
        }
      }
    }
  }

  /**
   * Check an element for shadow roots (open or closed)
   * @param {Element} element
   */
  _checkElementForShadowRoot(element) {
    // Open shadow root
    if (element.shadowRoot && getShadowRootMode(element.shadowRoot) === 'open') {
      this._pierceShadowRoot(element.shadowRoot, element, 0);
      return;
    }

    // Closed shadow root - try strategies
    if (element.shadowRoot === null && isCustomElement(element)) {
      this._tryClosedModeStrategies(element);
    }

    // Check if it's a known custom element
    const tagName = element.tagName.toLowerCase();
    if (this._knownCustomElements.has(tagName)) {
      this._tryClosedModeStrategies(element);
    }
  }

  // ============================================================================
  // Public Query API
  // ============================================================================

  /**
   * Get all accessible roots (document + open shadow roots + accessible closed roots)
   * @returns {Array<Document|ShadowRoot|DocumentFragment>}
   */
  getAllRoots() {
    const roots = [this.document];

    // Add pierced open shadow roots
    for (const root of this._piercedOpenRoots) {
      roots.push(root);
    }

    // Add accessible closed shadow roots
    for (const [host, info] of this._closedShadowRootCache) {
      if (info.shadowContent) {
        roots.push(info.shadowContent);
      }
    }

    return roots;
  }

  /**
   * Execute callback on all accessible roots
   * @param {Function} callback - Function(root, rootInfo)
   */
  forEachRoot(callback) {
    // Main document
    callback(this.document, { root: this.document, host: null, mode: 'document', depth: 0, path: 'document' });

    // Open shadow roots
    for (const [root, info] of this._openRootInfo) {
      try {
        callback(root, info);
      } catch (e) {
        this._log('Callback error on open root:', e);
      }
    }

    // Closed shadow roots (accessible)
    for (const [host, info] of this._closedShadowRootCache) {
      if (info.shadowContent) {
        try {
          callback(info.shadowContent, {
            root: info.shadowContent,
            host,
            mode: 'closed',
            strategy: info.strategy,
            path: getElementPath(host)
          });
        } catch (e) {
          this._log('Callback error on closed root:', e);
        }
      }
    }
  }

  /**
   * Query selector across all accessible roots
   * @param {string} selector
   * @returns {Element[]}
   */
  querySelectorAll(selector) {
    const cacheKey = selector;
    const now = Date.now();

    // Check cache
    if (this.config.enableCaching && this._queryCache.has(cacheKey)) {
      const cached = this._queryCache.get(cacheKey);
      if (now - cached.timestamp < this._cacheTimeout) {
        this.stats.elementsQueried += cached.results.length;
        return cached.results;
      }
    }

    const results = [];
    const rootSet = new Set();

    this.forEachRoot((root) => {
      try {
        const elements = root.querySelectorAll(selector);
        for (const el of elements) {
          // Deduplicate by element reference
          if (!rootSet.has(el)) {
            rootSet.add(el);
            results.push(el);
          }
        }
      } catch (e) {
        // Ignore query errors
      }
    });

    // Cache results
    if (this.config.enableCaching) {
      this._queryCache.set(cacheKey, { results, timestamp: now, roots: this.getAllRoots().length });
    }

    this.stats.elementsQueried += results.length;
    return results;
  }

  /**
   * Query selector - first match across all roots
   * @param {string} selector
   * @returns {Element|null}
   */
  querySelector(selector) {
    // Check document first
    let result = this.document.querySelector(selector);
    if (result) return result;

    // Check open shadow roots
    for (const root of this._piercedOpenRoots) {
      try {
        result = root.querySelector(selector);
        if (result) return result;
      } catch (e) {}
    }

    // Check closed shadow roots
    for (const [, info] of this._closedShadowRootCache) {
      if (info.shadowContent) {
        try {
          result = info.shadowContent.querySelector(selector);
          if (result) return result;
        } catch (e) {}
      }
    }

    return null;
  }

  /**
   * Hide elements matching selector across all roots
   * @param {string} selector
   * @param {Object} options
   * @returns {number} Number of elements hidden
   */
  hideElements(selector, options = {}) {
    const {
      hideStyle = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-9999!important;contain:layout size style paint!important',
      attributes = { 'data-aeroguard-hidden': 'true', 'aria-hidden': 'true' }
    } = options;

    let count = 0;
    const elements = this.querySelectorAll(selector);

    for (const element of elements) {
      if (element._adBlocked) continue;

      element._adBlocked = true;
      element.style.cssText = hideStyle;

      for (const [attr, value] of Object.entries(attributes)) {
        element.setAttribute(attr, value);
      }

      count++;
    }

    this.stats.elementsHidden += count;
    this._log('Hidden', count, 'elements for selector:', selector);

    // Invalidate cache for this selector
    this._queryCache.delete(selector);

    return count;
  }

  /**
   * Hide a specific element
   * @param {Element} element
   * @param {Object} options
   * @returns {boolean}
   */
  hideElement(element, options = {}) {
    if (!element || element._adBlocked) return false;

    const {
      hideStyle = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-9999!important;contain:layout size style paint!important',
      attributes = { 'data-aeroguard-hidden': 'true', 'aria-hidden': 'true' }
    } = options;

    element._adBlocked = true;
    element.style.cssText = hideStyle;

    for (const [attr, value] of Object.entries(attributes)) {
      element.setAttribute(attr, value);
    }

    this.stats.elementsHidden++;

    // Invalidate all caches (element could match any selector)
    this._queryCache.clear();

    return true;
  }

  /**
   * Unhide element
   * @param {Element} element
   * @returns {boolean}
   */
  unhideElement(element) {
    if (!element || !element._adBlocked) return false;

    element._adBlocked = false;
    element.style.cssText = '';
    element.removeAttribute('data-aeroguard-hidden');
    element.removeAttribute('aria-hidden');

    this.stats.elementsHidden = Math.max(0, this.stats.elementsHidden - 1);
    this._queryCache.clear();

    return true;
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Clear query cache
   */
  clearCache() {
    this._queryCache.clear();
    this._log('Query cache cleared');
  }

  /**
   * Invalidate cache for specific selector
   * @param {string} selector
   */
  invalidateCache(selector) {
    this._queryCache.delete(selector);
  }

  // ============================================================================
  // Statistics & Debugging
  // ============================================================================

  /**
   * Get current statistics
   * @returns {PiercerStats}
   */
  getStats() {
    return {
      ...this.stats,
      openRootsTracked: this._piercedOpenRoots.size,
      closedRootsTracked: this._closedShadowRootCache.size,
      customElementAccessors: this._customElementAccessors.size,
      knownCustomElements: this._knownCustomElements.size,
      cachedQueries: this._queryCache.size,
      activeObservers: this._closedModeObservers.size
    };
  }

  /**
   * Get detailed root information for debugging
   * @returns {Array<ShadowRootInfo>}
   */
  getRootInfo() {
    const info = [];

    // Document
    info.push({
      root: this.document,
      host: null,
      mode: 'document',
      depth: 0,
      path: 'document'
    });

    // Open roots
    for (const [, rootInfo] of this._openRootInfo) {
      info.push({ ...rootInfo });
    }

    // Closed roots
    for (const [host, closedInfo] of this._closedShadowRootCache) {
      if (closedInfo.shadowContent) {
        info.push({
          root: closedInfo.shadowContent,
          host,
          mode: 'closed',
          strategy: closedInfo.strategy,
          path: getElementPath(host),
          depth: 'unknown'
        });
      }
    }

    return info;
  }

  /**
   * Log debug message
   * @param {...any} args
   */
  _log(...args) {
    if (this.config.debugMode) {
      console.log('[ShadowDOMPiercer]', new Date().toISOString(), ...args);
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up all resources
   */
  cleanup() {
    this._log('Cleaning up ShadowDOMPiercer...');

    // Disconnect mutation observer
    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
      this._mutationObserver = null;
    }

    // Clear mutation debounce
    if (this._mutationDebounce) {
      clearTimeout(this._mutationDebounce);
      this._mutationDebounce = null;
    }

    // Disconnect closed mode observers
    for (const observer of this._closedModeObservers.values()) {
      observer.disconnect();
    }
    this._closedModeObservers.clear();

    // Restore customElements.define
    if (this._customElementsDefineHook) {
      this.context.customElements.define = this._originalCustomElementsDefine;
      this._customElementsDefineHook = null;
    }

    // Restore Element.prototype.attachShadow
    if (this._originalAttachShadow) {
      this.context.Element.prototype.attachShadow = this._originalAttachShadow;
    }

    // Clear caches and state
    this._piercedOpenRoots = new WeakSet();
    this._openRootInfo.clear();
    this._closedShadowRootCache.clear();
    this._queryCache.clear();
    this._customElementAccessors.clear();
    this._knownCustomElements.clear();
    this._customElementConstructors.clear();

    this.isActive = false;
    this._initializationPromise = null;

    this._log('Cleanup complete');
  }
}

// ============================================================================
// ClosedShadowRootAccessor Class
// ============================================================================

/**
 * Dedicated class for accessing closed shadow roots via registered accessors
 */
class ClosedShadowRootAccessor {
  /**
   * @param {ShadowDOMPiercer} piercer - Parent piercer instance
   */
  constructor(piercer) {
    this.piercer = piercer;
    this.accessors = new Map(); // tagName -> accessor function
    this.fallbackAccessors = new Map(); // tagName -> fallback accessor
  }

  /**
   * Register an accessor for a custom element's closed shadow root
   * @param {string} tagName - Custom element tag name
   * @param {Function} accessor - Function(element) -> ShadowRoot|DocumentFragment|null
   * @param {Function} [fallback] - Fallback accessor
   */
  registerAccessor(tagName, accessor, fallback = null) {
    const normalized = tagName.toLowerCase();
    this.accessors.set(normalized, accessor);
    if (fallback) {
      this.fallbackAccessors.set(normalized, fallback);
    }
    // Also register with piercer
    this.piercer.registerCustomElementAccessor(tagName, accessor);
  }

  /**
   * Register fallback accessor
   * @param {string} tagName
   * @param {Function} fallback
   */
  registerFallback(tagName, fallback) {
    this.fallbackAccessors.set(tagName.toLowerCase(), fallback);
  }

  /**
   * Get shadow root content for a custom element
   * @param {Element} element - Custom element instance
   * @returns {ShadowRoot|DocumentFragment|null}
   */
  getShadowContent(element) {
    const tagName = element.tagName.toLowerCase();

    // Try primary accessor
    const accessor = this.accessors.get(tagName);
    if (accessor) {
      try {
        const result = accessor(element);
        if (result) return result;
      } catch (e) {
        this.piercer._log('Primary accessor failed:', tagName, e);
      }
    }

    // Try fallback
    const fallback = this.fallbackAccessors.get(tagName);
    if (fallback) {
      try {
        return fallback(element);
      } catch (e) {
        this.piercer._log('Fallback accessor failed:', tagName, e);
      }
    }

    return null;
  }

  /**
   * Query selector within closed shadow roots of registered custom elements
   * @param {string} selector
   * @returns {Element[]}
   */
  querySelectorAll(selector) {
    const results = [];

    for (const [tagName, accessor] of this.accessors) {
      try {
        const elements = this.piercer.document.querySelectorAll(tagName);
        for (const el of elements) {
          const content = accessor(el);
          if (content) {
            const matches = content.querySelectorAll(selector);
            results.push(...matches);
          }
        }
      } catch (e) {
        this.piercer._log('Query failed for', tagName, e);
      }
    }

    return results;
  }

  /**
   * Check if accessor exists for tag
   * @param {string} tagName
   * @returns {boolean}
   */
  hasAccessor(tagName) {
    return this.accessors.has(tagName.toLowerCase());
  }

  /**
   * Get all registered accessors
   * @returns {string[]}
   */
  getRegisteredTags() {
    return Array.from(this.accessors.keys());
  }
}

// ============================================================================
// Singleton Management
// ============================================================================

let _shadowDOMPiercerInstance = null;
let _closedShadowRootAccessorInstance = null;

/**
 * Get or create ShadowDOMPiercer singleton
 * @param {Window|Object} context
 * @param {Object} config
 * @returns {Promise<ShadowDOMPiercer>}
 */
export async function getShadowDOMPiercer(context = window, config = {}) {
  if (!_shadowDOMPiercerInstance) {
    _shadowDOMPiercerInstance = new ShadowDOMPiercer(context, config);
    await _shadowDOMPiercerInstance.initialize();
  }
  return _shadowDOMPiercerInstance;
}

/**
 * Get or create ClosedShadowRootAccessor singleton
 * @param {Window|Object} context
 * @param {Object} config
 * @returns {Promise<ClosedShadowRootAccessor>}
 */
export async function getClosedShadowRootAccessor(context = window, config = {}) {
  const piercer = await getShadowDOMPiercer(context, config);
  if (!_closedShadowRootAccessorInstance) {
    _closedShadowRootAccessorInstance = new ClosedShadowRootAccessor(piercer);
  }
  return _closedShadowRootAccessorInstance;
}

/**
 * Reset singleton instances
 */
export function resetShadowDOMPiercer() {
  if (_shadowDOMPiercerInstance) {
    _shadowDOMPiercerInstance.cleanup();
  }
  _shadowDOMPiercerInstance = null;
  _closedShadowRootAccessorInstance = null;
}

/**
 * Create new ShadowDOMPiercer instance (non-singleton)
 * @param {Window|Object} context
 * @param {Object} config
 * @returns {Promise<ShadowDOMPiercer>}
 */
export async function createShadowDOMPiercer(context = window, config = {}) {
  const piercer = new ShadowDOMPiercer(context, config);
  await piercer.initialize();
  return piercer;
}

// ============================================================================
// Export All
// ============================================================================

export {
  ShadowDOMPiercer,
  ClosedShadowRootAccessor,
  DEFAULT_CONFIG,
  CLOSED_MODE_STRATEGIES,
  getElementPath,
  isCustomElement,
  getShadowRootMode,
  debounce
};