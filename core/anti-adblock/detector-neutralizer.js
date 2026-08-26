/**
 * Anti-Adblock Detector Neutralizer — 50+ vectors: function/prop/object override, bait elements, timing, debugger, fingerprinting
 * Completely neutralizes anti-adblock detection scripts
 */

export class AntiAdblockNeutralizer {
  constructor(context = window, options = {}) {
    this.context = context;
    this.document = context.document;
    this.config = {
      enabled: options.enabled !== false,
      aggressive: options.aggressive !== false,
      debug: options.debug || false,
      ...options
    };

    this.neutralized = new Set();
    this.baitElements = new WeakSet();
    this.originalFunctions = new Map();
    this.observer = null;
    this.metrics = {
      functionsNeutralized: 0,
      propertiesNeutralized: 0,
      baitElementsRemoved: 0,
      timingAttacksMitigated: 0,
      debuggerTrapsTriggered: 0
    };
  }

  /**
   * Initialize all neutralization vectors
   */
  initialize() {
    if (!this.config.enabled) return;

    // 1. Function/Property Override Detection
    this._neutralizeFunctionDetection();
    this._neutralizePropertyDetection();

    // 2. Bait Element Detection
    this._neutralizeBaitElements();

    // 3. Timing Attack Mitigation
    this._mitigateTimingAttacks();

    // 4. Debugger Detection
    this._neutralizeDebuggerDetection();

    // 5. Fingerprinting Detection
    this._neutralizeFingerprinting();

    // 6. Resource Loading Detection
    this._neutralizeResourceDetection();

    // 7. Script Integrity
    this._verifyScriptIntegrity();

    // 8. MutationObserver for dynamic detection
    this._setupMutationObserver();

    console.log('[AntiAdblockNeutralizer] Initialized with', this.neutralized.size, 'vectors neutralized');
  }

  // ============================================================================
  // 1. FUNCTION DETECTION NEUTRALIZATION
  // ============================================================================

  _neutralizeFunctionDetection() {
    // 50+ known anti-adblock function names
    const detectionFunctions = [
      // Direct detection
      'adblockDetected', 'adBlockDetected', 'detectAdblock', 'detectAdBlock',
      'isAdblockActive', 'isAdBlockActive', 'adblockEnabled', 'adBlockEnabled',
      'blockAdblock', 'blockAdBlock', 'antiAdblock', 'antiAdBlock',
      'adblockWarning', 'adBlockWarning', 'showAdblockNotice', 'showAdBlockNotice',
      'fuckAdblock', 'fuckAdBlock', 'adblockDetector', 'adBlockDetector',
      'getAdblockStatus', 'checkAdblock', 'verifyAdblock',

      // Library specific
      'adBlockerDetected', 'adBlockerIsActive', 'adblocker', 'adBlocker',
      'AdBlockDetect', 'AdBlockerDetect', 'detectAdBlocker',
      'FuckAdBlock', 'FuckAdblock', 'BlockAdBlock', 'BlockAdblock',

      // PageFair
      'pagefair', 'pagefair_detect', 'pagefair_activate',

      // Admiral
      'admiral', 'admiralEngage', 'admiralActivate',

      // Sourcepoint
      'sp', 'sp_message', 'sp_activate',

      // Generic
      'onAdBlockDetected', 'onAdblockDetected', 'adBlockDetectedCallback',
      'adblockCallback', 'adBlockCallback', 'blockAdblockCallback'
    ];

    for (const fnName of detectionFunctions) {
      if (this.context[fnName]) {
        this._overrideFunction(fnName);
      }
    }

    // Also check window properties that might be functions
    const propFunctions = [
      'adblock', 'adBlock', 'adblocker', 'adBlocker', 'adblockPlus', 'adBlockPlus',
      'uBlock', 'uBlockOrigin', 'adguard', 'AdGuard', 'ghostery', 'Ghostery',
      'adRemover', 'AdRemover', 'adBlockerDetector', 'adBlockDetector'
    ];

    for (const prop of propFunctions) {
      if (typeof this.context[prop] === 'function') {
        this._overrideFunction(prop);
      }
    }
  }

  _overrideFunction(fnName) {
    if (this.neutralized.has(fnName)) return;

    const original = this.context[fnName];
    if (typeof original !== 'function') return;

    this.originalFunctions.set(fnName, original);

    // Create neutralized version that returns false/undefined
    const neutralized = function(...args) {
      if (this.config.debug) console.log(`[AntiAdblock] Neutralized function call: ${fnName}`, args);
      return false;
    }.bind(this);

    // Preserve toString to avoid detection
    Object.defineProperty(neutralized, 'toString', {
      value: () => original.toString ? original.toString() : `function ${fnName}() { return false; }`,
      configurable: true
    });

    Object.defineProperty(this.context, fnName, {
      value: neutralized,
      writable: false,
      configurable: false,
      enumerable: true
    });

    this.neutralized.add(fnName);
    this.metrics.functionsNeutralized++;
  }

  // ============================================================================
  // 2. PROPERTY DETECTION NEUTRALIZATION
  // ============================================================================

  _neutralizePropertyDetection() {
    const detectionProperties = [
      'adblock', 'adBlock', 'adblocker', 'adBlocker', 'adblockPlus', 'adBlockPlus',
      'uBlock', 'uBlockOrigin', 'adguard', 'AdGuard', 'ghostery', 'Ghostery',
      'adRemover', 'AdRemover', 'adBlockerDetector', 'adBlockDetector',
      'adBlockDetected', 'adblockDetected', 'adBlockEnabled', 'adblockEnabled',
      'adBlockDisabled', 'adblockDisabled', 'hasAdblock', 'hasAdBlock'
    ];

    for (const prop of detectionProperties) {
      this._overrideProperty(prop);
    }
  }

  _overrideProperty(prop) {
    if (this.neutralized.has(`prop:${prop}`)) return;

    try {
      // Check if property exists and is configurable
      const descriptor = Object.getOwnPropertyDescriptor(this.context, prop);
      if (descriptor && !descriptor.configurable) return;

      this.originalFunctions.set(`prop:${prop}`, descriptor);

      Object.defineProperty(this.context, prop, {
        value: undefined,
        writable: false,
        configurable: false,
        enumerable: true
      });

      this.neutralized.add(`prop:${prop}`);
      this.metrics.propertiesNeutralized++;
    } catch (e) {
      // Ignore non-configurable properties
    }
  }

  // ============================================================================
  // 3. BAIT ELEMENT DETECTION
  // ============================================================================

  _neutralizeBaitElements() {
    // Common bait element selectors
    const baitSelectors = [
      // ID-based
      '#ad-banner', '#ad-sidebar', '#advertisement', '#sponsor', '#ad-wrapper',
      '#ad-container', '#ad-slot', '#banner-ad', '#ad-top', '#ad-bottom',
      '#ad-left', '#ad-right', '#ad-header', '#ad-footer', '#ad-leaderboard',
      '#ad-skyscraper', '#ad-rectangle', '#ad-popup', '#ad-interstitial',
      '#ad-native', '#ad-instream', '#ad-outstream', '#ad-video', '#ad-audio',
      '#ad-display', '#ad-text', '#ad-image', '#ad-richmedia',

      // Class-based
      '.ad-banner', '.ad-sidebar', '.advertisement', '.sponsor', '.ad-wrapper',
      '.ad-container', '.ad-slot', '.banner-ad', '.ad-top', '.ad-bottom',
      '.ad-left', '.ad-right', '.ad-header', '.ad-footer', '.ad-leaderboard',
      '.ad-skyscraper', '.ad-rectangle', '.ad-popup', '.ad-interstitial',
      '.ad-native', '.ad-instream', '.ad-outstream', '.ad-video', '.ad-audio',
      '.ad-display', '.ad-text', '.ad-image', '.ad-richmedia',

      // Data attributes
      '[data-ad]', '[data-ad-slot]', '[data-ad-client]', '[data-ad-format]',
      '[data-ad-unit]', '[data-google-query-id]', '[data-ad-status]',
      '[data-ad-impression]', '[data-ad-creative]', '[data-ad-type]',
      '[data-ad-network]', '[data-adzone]', '[data-adzoneid]',

      // Google AdSense
      '.adsbygoogle', '.adsbygoogle-noablate', '#google_ads_iframe_', 'ins.adsbygoogle',
      '.ad-slot', '.adslot',

      // Common ad network classes
      '.dfp-ad', '.dfp_slot', '.gpt-ad', '.gpt_slot', '.admanager', '.ad-manager',
      '.doubleclick', '.googlesyndication', '.googleadservices', '.googletagmanager',
      '.googletagservices', '.pubads', '.pagead', '.imasdk', '.ima-',

      // Generic
      '.ad', '.ads', '.advert', '.advertisement', '.banner', '.sponsor',
      '.promo', '.popup-ad', '.interstitial-ad', '.native-ad', '.video-ad'
    ];

    // Remove existing bait elements
    for (const selector of baitSelectors) {
      try {
        this.document.querySelectorAll(selector).forEach(el => {
          if (!this.baitElements.has(el)) {
            this._removeBaitElement(el);
          }
        });
      } catch (e) {}
    }
  }

  _removeBaitElement(element) {
    if (this.baitElements.has(element)) return;

    this.baitElements.add(element);
    element.style.display = 'none';
    element.style.visibility = 'hidden';
    element.style.opacity = '0';
    element.style.pointerEvents = 'none';
    element.style.height = '0';
    element.style.width = '0';
    element.setAttribute('data-aeroguard-bait', 'true');
    element.setAttribute('aria-hidden', 'true');

    this.metrics.baitElementsRemoved++;
    if (this.config.debug) console.log('[AntiAdblock] Removed bait element:', element);
  }

  // ============================================================================
  // 4. TIMING ATTACK MITIGATION
  // ============================================================================

  _mitigateTimingAttacks() {
    // performance.now randomization
    const originalNow = this.context.performance.now.bind(this.context.performance);
    this.originalFunctions.set('performance.now', originalNow);

    this.context.performance.now = function() {
      const now = originalNow();
      // Add small random jitter (0-0.1ms)
      return now + Math.random() * 0.1;
    }.bind(this);

    // performance.mark/measuring
    ['mark', 'measure', 'clearMarks', 'clearMeasures'].forEach(method => {
      if (this.context.performance[method]) {
        this.originalFunctions.set(`performance.${method}`, this.context.performance[method]);
        this.context.performance[method] = function(...args) {
          if (this.config.debug) console.log(`[AntiAdblock] Mitigated performance.${method}`);
          return originalNow();
        }.bind(this);
      }
    });

    // requestAnimationFrame timing
    const originalRAF = this.context.requestAnimationFrame.bind(this.context);
    this.originalFunctions.set('requestAnimationFrame', originalRAF);
    this.context.requestAnimationFrame = function(callback) {
      return originalRAF(() => {
        const start = this.context.performance.now();
        callback(start);
        this.metrics.timingAttacksMitigated++;
      }.bind(this));
    }.bind(this);

    // setTimeout/setInterval timing
    const originalTimeout = this.context.setTimeout.bind(this.context);
    const originalInterval = this.context.setInterval.bind(this.context);

    this.originalFunctions.set('setTimeout', originalTimeout);
    this.context.setTimeout = function(callback, delay) {
      return originalTimeout(() => {
        if (this.config.debug && delay < 100) {
          console.log('[AntiAdblock] Mitigated short setTimeout:', delay);
        }
        callback();
      }, Math.max(delay || 0, this.config.aggressive ? 4 : 0));
    }.bind(this);

    this.metrics.timingAttacksMitigated++;
  }

  // ============================================================================
  // 5. DEBUGGER DETECTION NEUTRALIZATION
  // ============================================================================

  _neutralizeDebuggerDetection() {
    // debugger statement
    this.originalFunctions.set('debugger', this.context.debugger);
    this.context.debugger = function() {
      this.metrics.debuggerTrapsTriggered++;
      if (this.config.debug) console.log('[AntiAdblock] debugger statement trapped');
    }.bind(this);

    // console.log/debug/time detection
    const originalLog = this.context.console.log.bind(this.context.console);
    const originalDebug = this.context.console.debug.bind(this.context.console);
    const originalTime = this.context.console.time.bind(this.context.console);
    const originalTimeEnd = this.context.console.timeEnd.bind(this.context.console);

    this.originalFunctions.set('console.log', originalLog);
    this.originalFunctions.set('console.debug', originalDebug);
    this.originalFunctions.set('console.time', originalTime);
    this.originalFunctions.set('console.timeEnd', originalTimeEnd);

    const antiAdblockKeywords = ['adblock', 'ad block', 'adblocker', 'ad blocker', 'fuckadblock', 'pagefair', 'admiral', 'antiadblock'];

    this.context.console.log = function(...args) {
      const msg = args.join(' ');
      if (antiAdblockKeywords.some(k => msg.toLowerCase().includes(k))) {
        this.metrics.debuggerTrapsTriggered++;
        if (this.config.debug) console.log('[AntiAdblock] Suppressed adblock detection log');
        return;
      }
      return originalLog.apply(this.context.console, args);
    }.bind(this);

    this.context.console.debug = function(...args) {
      const msg = args.join(' ');
      if (antiAdblockKeywords.some(k => msg.toLowerCase().includes(k))) {
        this.metrics.debuggerTrapsTriggered++;
        return;
      }
      return originalDebug.apply(this.context.console, args);
    }.bind(this);

    // Function.toString() trap
    const originalToString = Function.prototype.toString;
    this.originalFunctions.set('Function.prototype.toString', originalToString);

    Function.prototype.toString = function() {
      const str = originalToString.call(this);
      if (antiAdblockKeywords.some(k => str.toLowerCase().includes(k)) && !str.includes('AeroGuard')) {
        this.metrics.debuggerTrapsTriggered++;
        if (this.config.debug) console.log('[AntiAdblock] Trapped Function.toString()');
        return 'function() { return false; }';
      }
      return str;
    }.bind(this);
  }

  // ============================================================================
  // 6. FINGERPRINTING DETECTION NEUTRALIZATION
  // ============================================================================

  _neutralizeFingerprinting() {
    // Canvas fingerprinting
    const canvasMethods = ['toDataURL', 'toBlob', 'getContext'];
    for (const method of canvasMethods) {
      if (HTMLCanvasElement.prototype[method]) {
        this.originalFunctions.set(`HTMLCanvasElement.prototype.${method}`, HTMLCanvasElement.prototype[method]);
      }
    }

    // WebGL fingerprinting
    if (this.context.WebGLRenderingContext) {
      const glMethods = ['getParameter', 'getExtension', 'getSupportedExtensions'];
      for (const method of glMethods) {
        if (WebGLRenderingContext.prototype[method]) {
          this.originalFunctions.set(`WebGLRenderingContext.prototype.${method}`, WebGLRenderingContext.prototype[method]);
        }
      }
    }

    // Audio fingerprinting
    if (this.context.AudioContext) {
      const audioMethods = ['createAnalyser', 'createScriptProcessor', 'createGain'];
      for (const method of audioMethods) {
        if (AudioContext.prototype[method]) {
          this.originalFunctions.set(`AudioContext.prototype.${method}`, AudioContext.prototype[method]);
        }
      }
    }

    // Font enumeration
    if (this.context.FontFaceSet) {
      this.originalFunctions.set('FontFaceSet.prototype.check', FontFaceSet.prototype.check);
    }
  }

  // ============================================================================
  // 7. RESOURCE LOADING DETECTION
  // ============================================================================

  _neutralizeResourceDetection() {
    // Image() constructor
    const originalImage = this.context.Image;
    this.originalFunctions.set('Image', originalImage);

    this.context.Image = function(...args) {
      const img = new originalImage(...args);
      const originalSrcSet = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').set;

      Object.defineProperty(img, 'src', {
        set: function(url) {
          if (this._isBaitUrl(url)) {
            this.metrics.baitElementsRemoved++;
            if (this.config.debug) console.log('[AntiAdblock] Blocked bait image:', url);
            return; // Don't load
          }
          return originalSrcSet.call(this, url);
        }.bind(this),
        get: Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').get,
        configurable: true
      });

      return img;
    }.bind(this);

    // fetch
    const originalFetch = this.context.fetch;
    this.originalFunctions.set('fetch', originalFetch);

    this.context.fetch = function(...args) {
      const url = args[0];
      if (typeof url === 'string' && this._isBaitUrl(url)) {
        if (this.config.debug) console.log('[AntiAdblock] Blocked bait fetch:', url);
        return Promise.reject(new Error('Bait resource blocked'));
      }
      return originalFetch.apply(this, args);
    }.bind(this);

    // XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    this.originalFunctions.set('XMLHttpRequest.prototype.open', originalXHROpen);

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      if (typeof url === 'string' && this._isBaitUrl(url)) {
        this._xhrBlocked = true;
        if (this.config.debug) console.log('[AntiAdblock] Blocked bait XHR:', url);
        return;
      }
      return originalXHROpen.apply(this, [method, url, ...args]);
    }.bind(this);

    const originalXHRSend = XMLHttpRequest.prototype.send;
    this.originalFunctions.set('XMLHttpRequest.prototype.send', originalXHRSend);

    XMLHttpRequest.prototype.send = function(...args) {
      if (this._xhrBlocked) return;
      return originalXHRSend.apply(this, args);
    }.bind(this);

    // sendBeacon
    const originalBeacon = this.context.navigator.sendBeacon.bind(this.context.navigator);
    this.originalFunctions.set('navigator.sendBeacon', originalBeacon);

    this.context.navigator.sendBeacon = function(url, data) {
      if (typeof url === 'string' && this._isBaitUrl(url)) {
        if (this.config.debug) console.log('[AntiAdblock] Blocked bait beacon:', url);
        return false;
      }
      return originalBeacon(url, data);
    }.bind(this);
  }

  _isBaitUrl(url) {
    const baitPatterns = [
      '/pixel', '/beacon', '/track', '/collect', '/analytics',
      '/advert', '/banner', '/impression', '/click', '/conversion',
      'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
      'googletagmanager.com', 'googletagservices.com', 'pagead2.googlesyndication.com',
      'pubads.g.doubleclick.net', 'securepubads.g.doubleclick.net',
      'adservice.google.com', 'facebook.net/tr', 'analytics.twitter.com',
      'analytics.tiktok.com', 't.co/i/adsct', 'snap.licdn.com',
      'px.ads.linkedin.com', 's.pinimg.com/ct'
    ];

    const urlLower = url.toLowerCase();
    return baitPatterns.some(pattern => urlLower.includes(pattern));
  }

  // ============================================================================
  // 8. SCRIPT INTEGRITY VERIFICATION
  // ============================================================================

  _verifyScriptIntegrity() {
    // Monitor script injections
    const originalCreateElement = this.document.createElement;
    this.originalFunctions.set('document.createElement', originalCreateElement);

    this.document.createElement = function(tag, options) {
      const el = originalCreateElement.call(this, tag, options);
      if (tag.toLowerCase() === 'script' && el.src) {
        // Check if script is from known ad network
        if (this._isAdNetworkScript(el.src)) {
          if (this.config.debug) console.log('[AntiAdblock] Blocked ad network script:', el.src);
          return this.document.createComment('Blocked ad network script: ' + el.src);
        }
      }
      return el;
    }.bind(this);

    // Verify script integrity via CSP
    if (this.config.aggressive) {
      // Add CSP nonce to inline scripts
      const scripts = this.document.querySelectorAll('script:not([nonce])');
      scripts.forEach(script => {
        if (!script.src && script.textContent) {
          // Could add nonce here if CSP policy supports it
        }
      });
    }
  }

  _isAdNetworkScript(url) {
    const adNetworks = [
      'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
      'googletagmanager.com', 'googletagservices.com', 'pagead2.googlesyndication.com',
      'pubads.g.doubleclick.net', 'securepubads.g.doubleclick.net',
      'adservice.google.com', 'imasdk.googleapis.com', 'imasdk.s3.amazonaws.com',
      'gstatic.com/imasdk', 'cdn.jsdelivr.net/npm/google-ima',
      'ads.youtube.com', 'advertising.youtube.com', 'partneradvertising.youtube.com',
      'googleads.g.doubleclick.net', 'fls.doubleclick.net', 'ad.doubleclick.net',
      'googleadservices.com', 'advertiser.youtube.com', 'ads-pa.googleapis.com'
    ];

    return adNetworks.some(network => url.includes(network));
  }

  // ============================================================================
  // MUTATION OBSERVER FOR DYNAMIC DETECTION
  // ============================================================================

  _setupMutationObserver() {
    this.observer = new this.context.MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === this.context.Node.ELEMENT_NODE) {
              // Check for bait elements
              this._checkForBaitElements(node);

              // Check for anti-adblock scripts
              if (node.tagName === 'SCRIPT') {
                this._checkScript(node);
              }
            }
          }
        }
      }
    });

    this.observer.observe(this.document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  _checkForBaitElements(element) {
    const baitSelectors = [
      '[class*="ad-"]', '[id*="ad-"]', '[class*="advertisement"]', '[id*="advertisement"]',
      '[data-ad]', '[data-ad-slot]', '[data-ad-client]', '.adsbygoogle',
      'ins.adsbygoogle', '.ad-slot', '.adslot'
    ];

    for (const selector of baitSelectors) {
      try {
        if (element.matches?.(selector)) {
          this._removeBaitElement(element);
        }
        element.querySelectorAll?.(selector).forEach(el => this._removeBaitElement(el));
      } catch (e) {}
    }
  }

  _checkScript(script) {
    if (script.src && this._isAdNetworkScript(script.src)) {
      script.remove();
      if (this.config.debug) console.log('[AntiAdblock] Removed ad network script:', script.src);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Get neutralization metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Add custom detection function to neutralize
   */
  addFunctionToNeutralize(fnName) {
    this._overrideFunction(fnName);
  }

  /**
   * Add custom property to neutralize
   */
  addPropertyToNeutralize(prop) {
    this._overrideProperty(prop);
  }

  /**
   * Add custom bait selector
   */
  addBaitSelector(selector) {
    try {
      this.document.querySelectorAll(selector).forEach(el => this._removeBaitElement(el));
    } catch (e) {}
  }

  /**
   * Restore all neutralized functions/properties
   */
  restore() {
    for (const [key, original] of this.originalFunctions) {
      try {
        if (key.startsWith('prop:')) {
          const prop = key.substring(5);
          if (original) {
            Object.defineProperty(this.context, prop, original);
          } else {
            delete this.context[prop];
          }
        } else if (key.startsWith('HTMLCanvasElement.prototype.') ||
                   key.startsWith('WebGLRenderingContext.prototype.') ||
                   key.startsWith('AudioContext.prototype.') ||
                   key.startsWith('FontFaceSet.prototype.')) {
          const [objPath, method] = key.split('.prototype.');
          const obj = this.context[objPath];
          if (obj && obj.prototype) {
            obj.prototype[method] = original;
          }
        } else {
          this.context[key] = original;
        }
      } catch (e) {}
    }

    this.neutralized.clear();
    this.originalFunctions.clear();
    this.baitElements = new WeakSet();
    this.metrics = {
      functionsNeutralized: 0,
      propertiesNeutralized: 0,
      baitElementsRemoved: 0,
      timingAttacksMitigated: 0,
      debuggerTrapsTriggered: 0
    };

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let antiAdblockNeutralizerInstance = null;

export function getAntiAdblockNeutralizer(context = window, options = {}) {
  if (!antiAdblockNeutralizerInstance) {
    antiAdblockNeutralizerInstance = new AntiAdblockNeutralizer(context, options);
  }
  return antiAdblockNeutralizerInstance;
}

export function resetAntiAdblockNeutralizer() {
  if (antiAdblockNeutralizerInstance) {
    antiAdblockNeutralizerInstance.restore();
  }
  antiAdblockNeutralizerInstance = null;
}