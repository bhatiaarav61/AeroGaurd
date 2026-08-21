/**
 * News Site Anti-Adblock & Paywall Defuser
 * Neutralizes common anti-adblock techniques: Admiral, Piano/Tinypass, BlockAdBlock, FuckAdBlock
 * Restores scrolling, removes overlays, stubs detection globals
 * Runs in MAIN world at document_start
 */
(function () {
  'use strict';

  // 1. Stub common Anti-Adblock global detection flags
  const stubs = {
    canRunAds: true,
    isAdBlocked: false,
    google_ad_client: 'ca-pub-0000000000000000',
    google_ad_slot: '0000000000',
    googletag: {
      cmd: { push: (fn) => { try { fn(); } catch (e) {} } },
      pubads: () => ({
        setTargeting: () => {},
        enableSingleRequest: () => {},
        collapseEmptyDivs: () => {},
        refresh: () => {},
        addEventListener: () => {}
      }),
      defineSlot: () => ({
        addService: () => {},
        setTargeting: () => {},
        setCollapseEmptyDiv: () => {}
      }),
      enableServices: () => {}
    },
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
    adblockDetector: {
      detect: () => false,
      isDetected: () => false
    },
    Admiral: {
      detected: false,
      check: () => {}
    },
    piano: {
      isAdBlocked: false,
      check: () => {}
    },
    tpv: {
      isAdBlocked: false
    }
  };

  for (const [prop, value] of Object.entries(stubs)) {
    if (!(prop in window) || window[prop] === undefined) {
      Object.defineProperty(window, prop, {
        value,
        writable: false,
        configurable: true
      });
    }
  }

  // 2. Prevent anti-adblock timing traps
  const origSetTimeout = window.setTimeout;
  const origSetInterval = window.setInterval;

  window.setTimeout = function (fn, delay, ...args) {
    if (typeof fn === 'function') {
      const fnStr = fn.toString().toLowerCase();
      if (fnStr.includes('adblock') || fnStr.includes('ad-block') || fnStr.includes('antiadblock') ||
          fnStr.includes('paywall') || fnStr.includes('admiral') || fnStr.includes('blockadblock') ||
          fnStr.includes('fuckadblock') || fnStr.includes('detectblock')) {
        console.log('[AeroGuard] Defused anti-adblock timeout');
        return -1; // Defuse timeout check
      }
    }
    return origSetTimeout(fn, delay, ...args);
  };

  window.setInterval = function (fn, delay, ...args) {
    if (typeof fn === 'function') {
      const fnStr = fn.toString().toLowerCase();
      if (fnStr.includes('adblock') || fnStr.includes('ad-block') || fnStr.includes('antiadblock') ||
          fnStr.includes('paywall')) {
        console.log('[AeroGuard] Defused anti-adblock interval');
        return -1;
      }
    }
    return origSetInterval(fn, delay, ...args);
  };

  // 3. Restore scrolling and dismantle overlay elements dynamically
  const forceScrollAndClean = () => {
    const html = document.documentElement;
    const body = document.body;

    if (html) {
      html.style.setProperty('overflow', 'auto', 'important');
      html.style.setProperty('height', 'auto', 'important');
    }
    if (body) {
      body.style.setProperty('overflow', 'auto', 'important');
      body.style.setProperty('position', 'static', 'important');
      body.style.setProperty('height', 'auto', 'important');
    }

    // Target overlays, paywall backdrops, and anti-adblock elements
    const selectors = [
      // Generic anti-adblock
      '[class*="anti-adblock"]', '[id*="anti-adblock"]',
      '[class*="adblock-detected"]', '[id*="adblock-detected"]',
      '[class*="adblock-warning"]', '[id*="adblock-warning"]',
      '[class*="disable-adblock"]', '[id*="disable-adblock"]',
      '[class*="please-disable"]', '[id*="please-disable"]',

      // Paywall overlays
      '[class*="paywall"]', '[id*="paywall"]',
      '[class*="metered-content"]', '[id*="metered-content"]',
      '[class*="subscription-overlay"]', '[id*="subscription-overlay"]',
      '[class*="premium-overlay"]', '[id*="premium-overlay"]',

      // Admiral
      '[class*="admiral"]', '[id*="admiral"]',
      '.admiral-overlay', '#admiral-container',

      // Piano / Tinypass
      '.tp-backdrop', '.tp-modal', '.tp-dialog',
      '#tp-modal', '#tp-backdrop',
      '.piano-paywall', '#piano-paywall',

      // BlockAdBlock / FuckAdBlock
      '#blockadblock', '.blockadblock',
      '#fuckadblock', '.fuckadblock',

      // Generic overlay/modal classes
      '.overlay[style*="fixed"]', '.modal[style*="fixed"]',
      '[class*="overlay"][style*="z-index: 9999"]',
      '[class*="modal"][style*="z-index: 9999"]',
      'div[style*="position: fixed"][style*="z-index"][style*="top: 0"][style*="left: 0"][style*="width: 100%"][style*="height: 100%"]',

      // Forbes, Business Insider, etc.
      '.welcome-ad', '.interstitial-ad',
      '#welcome-ad', '#interstitial-ad',

      // FC (First Click) dialogs
      '#fc-dialog-container', '.fc-dialog-container',
      '#fc-ab-root', '.fc-ab-root',

      // Generic consent/paywall banners
      '[class*="consent-banner"]', '[id*="consent-banner"]',
      '[class*="cookie-wall"]', '[id*="cookie-wall"]'
    ];

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          // Check if element is actually an overlay (not content)
          const style = window.getComputedStyle(el);
          const isOverlay = style.position === 'fixed' ||
                           style.position === 'absolute' ||
                           (style.zIndex && parseInt(style.zIndex) > 100);
          if (isOverlay || el.offsetWidth > window.innerWidth * 0.8 || el.offsetHeight > window.innerHeight * 0.8) {
            el.remove();
            console.log('[AeroGuard] Removed overlay:', selector);
          }
        });
      } catch (e) {
        // Ignore selector errors
      }
    }
  };

  // 4. Remove inline scripts that re-enable anti-adblock
  const removeAntiAdblockScripts = () => {
    const scripts = document.querySelectorAll('script:not([src])');
    scripts.forEach(script => {
      const content = script.textContent.toLowerCase();
      if (content.includes('adblock') || content.includes('paywall') ||
          content.includes('admiral') || content.includes('blockadblock') ||
          content.includes('fuckadblock') || content.includes('detectblock')) {
        // Don't remove if it's our own script or a known safe script
        if (!script.hasAttribute('data-aeroguard-safe')) {
          console.log('[AeroGuard] Removed inline anti-adblock script');
          script.remove();
        }
      }
    });
  };

  // 5. Handle dynamic content insertion
  const observer = new MutationObserver((mutations) => {
    let shouldClean = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if added node is an overlay or anti-adblock element
            const tagName = node.tagName.toLowerCase();
            const className = node.className || '';
            const id = node.id || '';

            if (/overlay|modal|paywall|anti.adblock|adblock|admiral|piano|tp.backdrop|tp.modal/i.test(className + ' ' + id)) {
              shouldClean = true;
              break;
            }

            // Check for inline scripts
            if (tagName === 'script' && !node.src) {
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
        if (target.style.overflow === 'hidden' && (target === document.body || target === document.documentElement)) {
          shouldClean = true;
        }
      }
    }
    if (shouldClean) {
      forceScrollAndClean();
      removeAntiAdblockScripts();
    }
  });

  // Initial cleanup
  const initialCleanup = () => {
    forceScrollAndClean();
    removeAntiAdblockScripts();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initialCleanup();
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    });
  } else {
    initialCleanup();
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }

  // 6. Restore right-click and text selection if disabled
  const restoreUserInteractions = () => {
    const preventDefault = (e) => e.preventDefault();
    document.removeEventListener('contextmenu', preventDefault);
    document.removeEventListener('selectstart', preventDefault);
    document.removeEventListener('copy', preventDefault);
    document.body.style.userSelect = 'auto';
    document.body.style.webkitUserSelect = 'auto';
    document.body.style.msUserSelect = 'auto';
  };

  document.addEventListener('DOMContentLoaded', restoreUserInteractions);
  document.addEventListener('mousedown', restoreUserInteractions, { passive: true });

  console.log('[AeroGuard] News site anti-adblock & paywall defuser active');
})();