/**
 * Shadow Content Script — Shadow DOM piercing specialist
 * Runs in all frames, handles closed shadow roots via custom elements, recursive traversal
 */

(() => {
  'use strict';

  const CONFIG = {
    debug: false,
    piercingInterval: 1000,
    maxDepth: 10,
    debounceMs: 100
  };

  let initialized = false;
  let observer = null;
  let piercingInterval = null;
  const knownShadowRoots = new WeakSet();
  const shadowHosts = new WeakSet();

  function log(...args) { if (CONFIG.debug) console.log('[AeroGuard Shadow]', ...args); }

  function isElement(node) { return node && node.nodeType === Node.ELEMENT_NODE; }

  // ============================================================================
  // SHADOW DOM PIERCING - RECURSIVE TRAVERSAL
  // ============================================================================

  function pierceShadowRoot(root, callback, depth = 0) {
    if (depth > CONFIG.maxDepth) return;
    if (knownShadowRoots.has(root)) return;
    knownShadowRoots.add(root);

    try {
      // Process this shadow root
      callback(root);

      // Recurse into nested shadow roots
      const elements = root.querySelectorAll('*');
      for (const el of elements) {
        if (el.shadowRoot) {
          pierceShadowRoot(el.shadowRoot, callback, depth + 1);
        }
      }
    } catch (e) { /* ignore */ }
  }

  function pierceAllShadowRoots(callback) {
    // Main document
    callback(document);

    // All shadow roots in document
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      if (el.shadowRoot) {
        pierceShadowRoot(el.shadowRoot, callback);
      }
    }
  }

  // ============================================================================
  // AD SELECTORS FOR SHADOW DOM
  // ============================================================================

  const SHADOW_AD_SELECTORS = [
    // Generic ad patterns
    '[class*="ad-"]', '[id*="ad-"]', '[class*="-ad-"]', '[id*="-ad-"]',
    '[class*="advertisement"]', '[id*="advertisement"]',
    '[class*="advert"]', '[id*="advert"]', '[class*="sponsor"]', '[id*="sponsor"]',
    '[class*="promo"]', '[id*="promo"]', '[data-ad]', '[data-ad-slot]', '[data-ad-client]',

    // Google AdSense
    '.adsbygoogle', '.adsbygoogle-noablate', '#google_ads_iframe_', 'ins.adsbygoogle',

    // Common ad classes
    '.ad', '.ads', '.advert', '.advertisement', '.banner-ad', '.sidebar-ad',
    '.header-ad', '.footer-ad', '.leaderboard-ad', '.skyscraper-ad', '.rectangle-ad',
    '.popup-ad', '.interstitial-ad', '.native-ad', '.instream-ad', '.outstream-ad',
    '.video-ad', '.audio-ad', '.display-ad', '.text-ad', '.image-ad', '.richmedia-ad',

    // Ad networks
    '[class*="dfp-"]', '[id*="dfp-"]', '[class*="gpt-"]', '[id*="gpt-"]',
    '[class*="doubleclick"]', '[id*="doubleclick"]', '[class*="googlesyndication"]', '[id*="googlesyndication"]',
    '[class*="googleadservices"]', '[id*="googleadservices"]', '[class*="googletagmanager"]', '[id*="googletagmanager"]',
    '[class*="pubads"]', '[id*="pubads"]', '[class*="pagead"]', '[id*="pagead"]',

    // Iframe ads
    'iframe[src*="doubleclick.net"]', 'iframe[src*="googlesyndication.com"]',
    'iframe[src*="googleadservices.com"]', 'iframe[src*="googletagmanager.com"]',
    'iframe[src*="pubads.g.doubleclick.net"]', 'iframe[src*="pagead2.googlesyndication.com"]',

    // Cookie/Consent in shadow DOM
    '[id*="cookie"]', '[class*="cookie"]', '[id*="consent"]', '[class*="consent"]',
    '[id*="gdpr"]', '[class*="gdpr"]', '.cookie-banner', '.cookie-consent', '.consent-banner',

    // Newsletter in shadow DOM
    '[id*="newsletter"]', '[class*="newsletter"]', '[id*="subscribe"]', '[class*="subscribe"]',
    '.newsletter-popup', '.newsletter-modal', '.signup-popup', '.email-capture-popup'
  ];

  const SHADOW_AD_SELECTOR_STRING = SHADOW_AD_SELECTORS.join(',');

  // ============================================================================
  // HIDING FUNCTIONS
  // ============================================================================

  function hideElement(el) {
    if (el._adBlocked) return;
    el._adBlocked = true;
    el._origStyles = {
      display: el.style.display,
      visibility: el.style.visibility,
      opacity: el.style.opacity,
      pointerEvents: el.style.pointerEvents,
      height: el.style.height,
      width: el.style.width,
      overflow: el.style.overflow,
      position: el.style.position,
      zIndex: el.style.zIndex
    };
    el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-9999!important;contain:layout size style paint!important';
    el.setAttribute('data-aeroguard-hidden', 'true');
    el.setAttribute('aria-hidden', 'true');
  }

  function hideAdElementsInRoot(root) {
    let count = 0;
    try {
      const matches = root.querySelectorAll(SHADOW_AD_SELECTOR_STRING);
      for (const el of matches) {
        if (!el._adBlocked) { hideElement(el); count++; }
      }
    } catch (e) { /* ignore */ }
    return count;
  }

  function scanAndHide() {
    let total = 0;
    pierceAllShadowRoots(root => {
      total += hideAdElementsInRoot(root);
    });
    if (total > 0) log(`Hidden ${total} ad elements in shadow DOM`);
    return total;
  }

  // ============================================================================
  // CUSTOM ELEMENTS FOR CLOSED SHADOW DOM
  // ============================================================================

  function setupClosedShadowDomHandling() {
    // Hook into custom element definitions to intercept closed shadow roots
    const originalDefine = customElements.define.bind(customElements);
    customElements.define = function(name, constructor, options) {
      if (options && options.shadowRootMode === 'closed') {
        // Wrap constructor to intercept shadow root creation
        const originalConstructor = constructor;
        const wrappedConstructor = class extends originalConstructor {
          constructor(...args) {
            super(...args);
            // Try to access shadow root via internals or attachShadow
            if (this.shadowRoot) {
              knownShadowRoots.add(this.shadowRoot);
              hideAdElementsInRoot(this.shadowRoot);
            }
          }
        };
        return originalDefine(name, wrappedConstructor, options);
      }
      return originalDefine(name, constructor, options);
    };

    // Also hook attachShadow to catch programmatic closed shadow roots
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(init) {
      const shadowRoot = originalAttachShadow.call(this, init);
      if (init && init.mode === 'closed') {
        // For closed shadow roots, we can't directly access them
        // But we track the host element for periodic checks
        shadowHosts.add(this);
        // Try to use ElementInternals if available
        if (this.internals && this.internals.shadowRoot) {
          knownShadowRoots.add(this.internals.shadowRoot);
          hideAdElementsInRoot(this.internals.shadowRoot);
        }
      } else if (shadowRoot) {
        knownShadowRoots.add(shadowRoot);
        hideAdElementsInRoot(shadowRoot);
      }
      return shadowRoot;
    };
  }

  // ============================================================================
  // MUTATION OBSERVER FOR DYNAMIC SHADOW DOM
  // ============================================================================

  function setupMutationObserver() {
    observer = new MutationObserver(mutations => {
      let shouldScan = false;
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length) {
          for (const n of m.addedNodes) {
            if (isElement(n)) {
              // Check if new element has shadow root
              if (n.shadowRoot) {
                knownShadowRoots.add(n.shadowRoot);
                hideAdElementsInRoot(n.shadowRoot);
                shouldScan = true;
              }
              // Check for ad elements
              if (n.matches(SHADOW_AD_SELECTOR_STRING) || n.querySelector(SHADOW_AD_SELECTOR_STRING)) {
                shouldScan = true;
              }
              // Check for custom elements that might have closed shadow roots
              if (n.tagName.includes('-') && !shadowHosts.has(n)) {
                shadowHosts.add(n);
                shouldScan = true;
              }
            }
          }
        }
      }
      if (shouldScan) {
        clearTimeout(observer._debounce);
        observer._debounce = setTimeout(scanAndHide, CONFIG.debounceMs);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // ============================================================================
  // PERIODIC SCAN FOR CLOSED SHADOW ROOTS
  // ============================================================================

  function startPeriodicScan() {
    piercingInterval = setInterval(() => {
      // Discover new shadow roots from open shadow DOM
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        if (el.shadowRoot && !knownShadowRoots.has(el.shadowRoot)) {
          knownShadowRoots.add(el.shadowRoot);
          hideAdElementsInRoot(el.shadowRoot);
        }
      }

      // Check tracked shadow hosts for closed shadow roots
      // We can't directly access closed shadow roots, but we can scan
      // their light DOM children for ad elements
      for (const host of shadowHosts) {
        if (host.isConnected) {
          try {
            // Scan light DOM children of shadow hosts
            hideAdElementsInRoot(host);
          } catch (e) { /* ignore */ }
        }
      }

      scanAndHide();
    }, CONFIG.piercingInterval);
  }

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================

  function handleMessage(msg, sender, sendResponse) {
    switch (msg.type) {
      case 'FORCE_SCAN':
        const count = scanAndHide();
        sendResponse({ success: true, hiddenCount: count });
        break;
      case 'GET_STATS':
        sendResponse({
          shadowRootsTracked: knownShadowRoots.size,
          shadowHostsTracked: shadowHosts.size,
          hiddenElements: document.querySelectorAll('[data-aeroguard-hidden="true"]').length
        });
        break;
      case 'CONFIG_UPDATE':
        if (msg.config) {
          Object.assign(CONFIG, msg.config);
          if (piercingInterval) {
            clearInterval(piercingInterval);
            startPeriodicScan();
          }
        }
        sendResponse({ success: true });
        break;
    }
    return true; // Keep message channel open for async response
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function init() {
    if (initialized) return; initialized = true;
    log('Shadow DOM content script initializing...');

    setupClosedShadowDomHandling();
    setupMutationObserver();
    startPeriodicScan();

    // Initial scan
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scanAndHide);
    } else {
      scanAndHide();
    }

    chrome.runtime.onMessage.addListener(handleMessage);
    chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', url: location.href, script: 'shadow' }).catch(()=>{});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.addEventListener('beforeunload', () => {
    if (observer) observer.disconnect();
    if (piercingInterval) clearInterval(piercingInterval);
  });

  window.__aeroguardShadow = { pierceAllShadowRoots, scanAndHide, CONFIG, knownShadowRoots, shadowHosts };
})();