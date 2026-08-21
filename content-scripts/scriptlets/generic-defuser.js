/**
 * Generic Anti-Adblock Defuser
 * Universal defuser for common anti-adblock patterns across all websites
 * Runs in MAIN world at document_start
 */
(function () {
  'use strict';

  // 1. Stub universal ad-related globals
  const universalStubs = {
    // Google AdSense / Ad Manager
    adsbygoogle: { push: (fn) => { try { fn(); } catch (e) {} }, loaded: true, requestNonPersonalizedAds: () => {} },
    google_ad_client: 'ca-pub-0000000000000000',
    google_ad_slot: '0000000000',
    google_ad_width: 0,
    google_ad_height: 0,
    google_ad_format: '',
    google_ad_region: 'test',
    google_ad_type: 'text_image',
    google_color_border: '',
    google_color_bg: '',
    google_color_link: '',
    google_color_text: '',
    google_color_url: '',
    google_ui_features: '',
    google_ad_channel: '',
    google_max_num_ads: 0,
    google_override_format: true,

    // Google Publisher Tags
    googletag: {
      cmd: { push: (fn) => { try { fn(); } catch (e) {} } },
      pubads: () => ({
        setTargeting: () => {},
        enableSingleRequest: () => {},
        collapseEmptyDivs: () => {},
        refresh: () => {},
        addEventListener: () => {},
        setPrivacySettings: () => {},
        setCentering: () => {},
        setForceSafeFrame: () => {}
      }),
      defineSlot: () => ({
        addService: () => {},
        setTargeting: () => {},
        setCollapseEmptyDiv: () => {},
        defineSizeMapping: () => ({ build: () => ({ get: () => [] }) })
      }),
      enableServices: () => {},
      sizeMapping: () => ({ addSize: () => {}, build: () => ({ get: () => [] }) }),
      pubadsReady: false,
      version: '20240101'
    },

    // Amazon A9 / Amazon Associates
    amazon_ads: { push: () => {} },
    aax_getad_mpb: () => {},

    // Prebid.js
    pbjs: {
      addAdUnits: () => {},
      requestBids: () => {},
      setTargetingForGPTAsync: () => {},
      enableAnalytics: () => {},
      bidderSettings: {},
      adUnits: [],
      getBidResponses: () => ({}),
      getHighestCpmBids: () => [],
      getAllWinningBids: () => []
    },

    // Common ad networks
    _adblockDetected: false,
    _adBlockerDetected: false,
    _adblockStatus: 'not-detected',
    adBlockDetected: false,
    adblock: { detected: false },
    adBlocker: { detected: false },
    isAdBlockEnabled: false,
    hasAdBlock: false,

    // Anti-adblock libraries
    BlockAdBlock: function () {
      this.check = () => {};
      this.onDetected = () => this;
      this.onNotDetected = (cb) => { try { cb(); } catch (e) {}; return this; };
      this.setOption = () => this;
    },
    FuckAdBlock: function () {
      this.check = () => {};
      this.onDetected = () => this;
      this.onNotDetected = (cb) => { try { cb(); } catch (e) {}; return this; };
      this.setOption = () => this;
    },

    // Admiral
    Admiral: {
      detected: false,
      check: () => {},
      init: () => {}
    },

    // Piano / Tinypass
    piano: {
      isAdBlocked: false,
      check: () => {},
      init: () => {}
    },
    tpv: {
      isAdBlocked: false
    },

    // Generic detection objects
    adblockDetector: {
      detect: () => false,
      isDetected: () => false,
      check: () => false
    },
    antiAdblock: {
      detected: false,
      check: () => {}
    }
  };

  for (const [prop, value] of Object.entries(universalStubs)) {
    if (!(prop in window) || window[prop] === undefined) {
      Object.defineProperty(window, prop, {
        value,
        writable: false,
        configurable: true
      });
    }
  }

  // 2. Neutralize common anti-adblock timing checks
  const origSetTimeout = window.setTimeout;
  const origSetInterval = window.setInterval;
  const origRequestAnimationFrame = window.requestAnimationFrame;

  const antiAdblockKeywords = [
    'adblock', 'ad-block', 'antiadblock', 'anti-adblock',
    'paywall', 'admiral', 'blockadblock', 'fuckadblock',
    'detectblock', 'adblockdetector', 'adblock-check',
    'isadblocked', 'adblockdetected', 'showOverlay',
    'showAdblockMessage', 'displayAdblockWarning',
    'disableContent', 'blockContent', 'lockContent'
  ];

  const isAntiAdblockFunction = (fn) => {
    if (typeof fn !== 'function') return false;
    try {
      const str = fn.toString().toLowerCase();
      return antiAdblockKeywords.some(keyword => str.includes(keyword));
    } catch (e) {
      return false;
    }
  };

  window.setTimeout = function (fn, delay, ...args) {
    if (isAntiAdblockFunction(fn)) {
      console.log('[AeroGuard] Defused anti-adblock setTimeout');
      return -1;
    }
    return origSetTimeout(fn, delay, ...args);
  };

  window.setInterval = function (fn, delay, ...args) {
    if (isAntiAdblockFunction(fn)) {
      console.log('[AeroGuard] Defused anti-adblock setInterval');
      return -1;
    }
    return origSetInterval(fn, delay, ...args);
  };

  window.requestAnimationFrame = function (fn) {
    if (isAntiAdblockFunction(fn)) {
      console.log('[AeroGuard] Defused anti-adblock requestAnimationFrame');
      return -1;
    }
    return origRequestAnimationFrame(fn);
  };

  // 3. Restore scrolling and remove overlays
  const restoreScrolling = () => {
    const html = document.documentElement;
    const body = document.body;

    if (html) {
      html.style.setProperty('overflow', 'auto', 'important');
      html.style.setProperty('overflow-x', 'auto', 'important');
      html.style.setProperty('overflow-y', 'auto', 'important');
      html.style.setProperty('height', 'auto', 'important');
      html.style.setProperty('position', 'static', 'important');
    }
    if (body) {
      body.style.setProperty('overflow', 'auto', 'important');
      body.style.setProperty('overflow-x', 'auto', 'important');
      body.style.setProperty('overflow-y', 'auto', 'important');
      body.style.setProperty('height', 'auto', 'important');
      body.style.setProperty('position', 'static', 'important');
    }
  };

  const removeOverlayElements = () => {
    const overlaySelectors = [
      // Generic overlay patterns
      'div[style*="position: fixed"][style*="top: 0"][style*="left: 0"][style*="width: 100%"][style*="height: 100%"][style*="z-index"]',
      'div[style*="position:fixed"][style*="top:0"][style*="left:0"][style*="width:100%"][style*="height:100%"][style*="z-index"]',
      '[class*="overlay"][style*="fixed"]',
      '[class*="modal"][style*="fixed"]',
      '[class*="backdrop"][style*="fixed"]',
      '[class*="curtain"][style*="fixed"]',

      // Anti-adblock specific
      '[class*="adblock"]', '[id*="adblock"]',
      '[class*="anti-adblock"]', '[id*="anti-adblock"]',
      '[class*="ad-block"]', '[id*="ad-block"]',
      '[class*="disable-adblock"]', '[id*="disable-adblock"]',
      '[class*="adblock-detected"]', '[id*="adblock-detected"]',
      '[class*="adblock-warning"]', '[id*="adblock-warning"]',
      '[class*="please-disable"]', '[id*="please-disable"]',
      '[class*="adblock-message"]', '[id*="adblock-message"]',

      // Paywall
      '[class*="paywall"]', '[id*="paywall"]',
      '[class*="metered"]', '[id*="metered"]',
      '[class*="subscription-overlay"]', '[id*="subscription-overlay"]',
      '[class*="premium-overlay"]', '[id*="premium-overlay"]',
      '[class*="content-lock"]', '[id*="content-lock"]',
      '[class*="article-lock"]', '[id*="article-lock"]',

      // Known platforms
      '.tp-backdrop', '.tp-modal', '.tp-dialog', '#tp-modal', '#tp-backdrop',
      '.piano-paywall', '#piano-paywall',
      '.admiral-overlay', '#admiral-container',
      '#blockadblock', '.blockadblock',
      '#fuckadblock', '.fuckadblock',
      '#fc-dialog-container', '.fc-dialog-container',
      '#fc-ab-root', '.fc-ab-root',

      // Common interstitial classes
      '.interstitial', '.welcome-ad', '.interstitial-ad',
      '#interstitial', '#welcome-ad',

      // Consent walls
      '[class*="consent-wall"]', '[id*="consent-wall"]',
      '[class*="cookie-wall"]', '[id*="cookie-wall"]'
    ];

    for (const selector of overlaySelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const style = window.getComputedStyle(el);
          const isOverlay = style.position === 'fixed' ||
                           style.position === 'absolute' ||
                           (style.zIndex && parseInt(style.zIndex) > 100) ||
                           el.offsetWidth > window.innerWidth * 0.7 ||
                           el.offsetHeight > window.innerHeight * 0.7;
          if (isOverlay) {
            el.remove();
            console.log('[AeroGuard] Removed overlay element:', selector);
          }
        });
      } catch (e) {
        // Ignore selector errors
      }
    }
  };

  const removeAntiAdblockScripts = () => {
    const scripts = document.querySelectorAll('script:not([src]):not([data-aeroguard-safe])');
    scripts.forEach(script => {
      const content = script.textContent.toLowerCase();
      if (antiAdblockKeywords.some(keyword => content.includes(keyword))) {
        console.log('[AeroGuard] Removed inline anti-adblock script');
        script.remove();
      }
    });
  };

  const fullCleanup = () => {
    restoreScrolling();
    removeOverlayElements();
    removeAntiAdblockScripts();
  };

  // 4. MutationObserver for dynamic content
  const observer = new MutationObserver((mutations) => {
    let shouldClean = false;

    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();
            const className = node.className || '';
            const id = node.id || '';
            const classId = (className + ' ' + id).toLowerCase();

            // Check for overlay/anti-adblock patterns
            if (/overlay|modal|paywall|anti.?adblock|adblock|admiral|piano|tp.?backdrop|tp.?modal|interstitial|welcome.?ad|consent.?wall|cookie.?wall|content.?lock|article.?lock/i.test(classId)) {
              shouldClean = true;
              break;
            }

            // Check inline scripts
            if (tagName === 'script' && !node.src && !node.hasAttribute('data-aeroguard-safe')) {
              removeAntiAdblockScripts();
            }

            // Check descendants
            const overlays = node.querySelectorAll('[class*="overlay"], [class*="modal"], [class*="paywall"], [class*="anti-adblock"], [id*="overlay"], [id*="modal"], [id*="paywall"]');
            if (overlays.length > 0) {
              shouldClean = true;
              break;
            }
          }
        }
      }

      if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
        const target = mutation.target;
        const style = window.getComputedStyle(target);
        if ((target === document.body || target === document.documentElement) &&
            (style.overflow === 'hidden' || style.overflowY === 'hidden')) {
          shouldClean = true;
        }
      }
    }

    if (shouldClean) {
      fullCleanup();
    }
  });

  // 5. Restore user interactions (right-click, copy, select)
  const restoreUserInteractions = () => {
    const events = ['contextmenu', 'selectstart', 'copy', 'cut', 'paste', 'dragstart'];
    events.forEach(eventType => {
      // Remove any listeners that prevent default
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (events.includes(type) && typeof listener === 'function') {
          const listenerStr = listener.toString();
          if (listenerStr.includes('preventDefault') || listenerStr.includes('return false')) {
            console.log('[AeroGuard] Blocked restrictive event listener:', type);
            return; // Don't add the listener
          }
        }
        return originalAddEventListener.call(this, type, listener, options);
      };
    });

    document.body.style.userSelect = 'auto';
    document.body.style.webkitUserSelect = 'auto';
    document.body.style.msUserSelect = 'auto';
    document.body.style.mozUserSelect = 'auto';
  };

  // 6. Initialize
  const init = () => {
    fullCleanup();
    restoreUserInteractions();

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    console.log('[AeroGuard] Generic anti-adblock defuser active');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();