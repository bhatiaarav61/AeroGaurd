/**
 * Shadow DOM Anti-Ad Cleaner
 * Pierces Shadow Roots to remove ads hidden in closed/open Shadow DOM
 * Runs in MAIN world at document_start
 */
(function () {
  'use strict';

  // ============================================
  // Configuration
  // ============================================

  // Selectors for ad elements inside Shadow DOM
  const SHADOW_AD_SELECTORS = [
    // Generic ad patterns
    '[id*="-ad-"]', '[id*="ad-"]', '[id*="_ad_"]', '[id*="ad_"]',
    '[class*="-ad-"]', '[class*="ad-"]', '[class*="_ad_"]', '[class*="ad_"]',
    '[class*="sponsored"]', '[class*="promoted"]', '[class*="recommended"]',
    '[class*="native-ad"]', '[class*="display-ad"]', '[class*="banner-ad"]',
    '[class*="ad-slot"]', '[class*="ad-container"]', '[class*="ad-wrapper"]',
    '[class*="ad-banner"]', '[class*="ad-unit"]', '[class*="ad-zone"]',
    '[data-ad]', '[data-advert]', '[data-advertisement]', '[data-sponsor]',
    '[data-google-ad]', '[data-ad-slot]', '[data-ad-unit]',
    '[aria-label*="advertisement" i]', '[aria-label*="sponsored" i]',

    // AMP ads
    'amp-ad', 'amp-embed[type*="adsense"]', 'amp-embed[type*="doubleclick"]',
    'amp-embed[type*="ad"]',

    // Specific ad platforms in Shadow DOM
    '[class*="google_ads"]', '[class*="adsense"]', '[class*="doubleclick"]',
    '[class*="dfp-ad"]', '[class*="gpt-ad"]', '[class*="adslot"]',
    '[id*="google_ads"]', '[id*="adsense"]', '[id*="doubleclick"]',
    '[class*="outbrain"]', '[class*="taboola"]', '[class*="mgid"]',
    '[class*="revcontent"]', '[class*="content-ad"]', '[class*="feed-ad"]',

    // Video ads
    '[class*="video-ad"]', '[class*="ad-overlay"]', '[class*="ad-companion"]',
    '[class*="vpaid-ad"]', '[class*="vast-ad"]', '[class*="ad-tag"]',
    '[class*="ad-marker"]', '[class*="ad-break"]', '[class*="ad-slot-video"]',

    // Newsletter/popup in Shadow DOM
    '[class*="newsletter"]', '[class*="subscribe"]', '[class*="email-capture"]',
    '[class*="popup"]', '[class*="modal"]', '[class*="overlay"]',
    '[class*="consent"]', '[class*="gdpr"]', '[class*="cookie"]',

    // Social widgets in Shadow DOM
    '[class*="fb-like"]', '[class*="fb-share"]', '[class*="twitter-share"]',
    '[class*="linkedin-share"]', '[class*="pinterest-pin"]',
    '[class*="social-share"]', '[class*="share-buttons"]'
  ];

  // Whitelist: elements that should NEVER be removed
  const SHADOW_WHITELIST_SELECTORS = [
    // Video players
    'video', 'audio', '[class*="video-player"]', '[class*="media-player"]',
    '[class*="player"]', '[id*="player"]',

    // Navigation
    'nav', 'header', '[role="navigation"]', '[role="banner"]',
    '[class*="nav"]', '[class*="menu"]', '[class*="header"]',

    // Main content
    'main', 'article', '[role="main"]', '[role="article"]',
    '[class*="content"]', '[class*="post"]', '[class*="entry"]',
    '[class*="article-body"]', '[class*="post-content"]',

    // Comments
    '[class*="comment"]', '[id*="comment"]', '[class*="discussion"]',

    // Forms (login, search, etc.)
    'form', 'input', 'textarea', 'select', 'button',
    '[class*="search"]', '[class*="login"]', '[class*="signup"]',

    // Interactive elements
    '[tabindex]', '[contenteditable]', '[draggable]'
  ];

  // ============================================
  // Shadow DOM Traversal & Cleaning
  // ============================================

  let cleaningInProgress = false;
  const cleanedElements = new WeakSet();

  function matchesSelector(element, selectors) {
    if (!element.matches) return false;
    try {
      return selectors.some(selector => element.matches(selector));
    } catch (e) {
      // Invalid selector, skip
      return false;
    }
  }

  function isWhitelisted(element) {
    return matchesSelector(element, SHADOW_WHITELIST_SELECTORS);
  }

  function isAdElement(element) {
    if (isWhitelisted(element)) return false;
    return matchesSelector(element, SHADOW_AD_SELECTORS);
  }

  function cleanElement(element) {
    if (cleanedElements.has(element)) return false;
    if (!isAdElement(element)) return false;

    try {
      // For iframes, we might want to just hide instead of remove
      // to avoid breaking layout
      if (element.tagName === 'IFRAME') {
        element.style.setProperty('display', 'none', 'important');
        element.style.setProperty('visibility', 'hidden', 'important');
        element.style.setProperty('opacity', '0', 'important');
        element.style.setProperty('height', '0', 'important');
        element.style.setProperty('width', '0', 'important');
        element.style.setProperty('pointer-events', 'none', 'important');
      } else {
        element.remove();
      }
      cleanedElements.add(element);
      console.log('[AeroGuard] Removed ad from Shadow DOM:', element.tagName, element.className || element.id);
      return true;
    } catch (e) {
      console.warn('[AeroGuard] Failed to clean Shadow DOM element:', e);
      return false;
    }
  }

  function cleanShadowRoot(shadowRoot) {
    if (!shadowRoot) return 0;
    let cleaned = 0;

    try {
      // Clean direct children
      const directElements = shadowRoot.querySelectorAll('*');
      directElements.forEach(el => {
        if (cleanElement(el)) cleaned++;
      });

      // Recursively clean nested shadow roots
      directElements.forEach(el => {
        if (el.shadowRoot) {
          cleaned += cleanShadowRoot(el.shadowRoot);
        }
      });

      // Also check the shadowRoot host element itself
      if (shadowRoot.host && cleanElement(shadowRoot.host)) cleaned++;
    } catch (e) {
      // Closed shadow root - can't access
      console.debug('[AeroGuard] Closed shadow root encountered');
    }

    return cleaned;
  }

  function cleanShadowRoots(root) {
    let totalCleaned = 0;

    // Clean the root document
    const rootElements = root.querySelectorAll('*');
    rootElements.forEach(el => {
      if (cleanElement(el)) totalCleaned++;

      // Check for shadow roots on each element
      if (el.shadowRoot) {
        totalCleaned += cleanShadowRoot(el.shadowRoot);
      }
    });

    return totalCleaned;
  }

  // ============================================
  // MutationObserver for Dynamic Content
  // ============================================

  const observer = new MutationObserver((mutations) => {
    if (cleaningInProgress) return;
    cleaningInProgress = true;

    try {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check the new element itself
              if (cleanElement(node)) continue;

              // Check its shadow root
              if (node.shadowRoot) {
                cleanShadowRoot(node.shadowRoot);
              }

              // Check descendants for shadow roots
              const descendants = node.querySelectorAll('*');
              descendants.forEach(el => {
                if (el.shadowRoot) {
                  cleanShadowRoot(el.shadowRoot);
                }
                cleanElement(el);
              });
            }
          }
        }
      }
    } finally {
      cleaningInProgress = false;
    }
  });

  // ============================================
  // Periodic Deep Scan
  // ============================================

  let scanInterval = null;

  function startPeriodicScan() {
    // Initial scan
    cleanShadowRoots(document);

    // Periodic scan every 2 seconds for dynamic content
    scanInterval = setInterval(() => {
      if (!cleaningInProgress) {
        cleanShadowRoots(document);
      }
    }, 2000);
  }

  function stopPeriodicScan() {
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
  }

  // ============================================
  // Special Handling for Common Shadow DOM Patterns
  // ============================================

  function handleKnownPatterns() {
    // Web Components with known ad patterns
    const webComponentTags = [
      'amp-ad', 'amp-embed', 'amp-auto-ads',
      'google-ad', 'adsbygoogle', 'ad-slot',
      'dfp-ad', 'gpt-ad', 'ad-unit',
      'outbrain-widget', 'taboola-widget',
      'criteo-widget', 'adnxs-widget'
    ];

    webComponentTags.forEach(tag => {
      try {
        const elements = document.querySelectorAll(tag);
        elements.forEach(el => {
          if (el.shadowRoot) {
            cleanShadowRoot(el.shadowRoot);
          }
          cleanElement(el);
        });
      } catch (e) {}
    });
  }

  // ============================================
  // Initialize
  // ============================================

  function init() {
    console.log('[AeroGuard] Shadow DOM anti-ad cleaner starting...');

    // Start observer
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    // Handle known web component patterns
    handleKnownPatterns();

    // Start periodic scanning
    startPeriodicScan();

    // Also scan on DOMContentLoaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        cleanShadowRoots(document);
        handleKnownPatterns();
      });
    } else {
      cleanShadowRoots(document);
      handleKnownPatterns();
    }

    // Clean up on page unload
    window.addEventListener('beforeunload', stopPeriodicScan);

    console.log('[AeroGuard] Shadow DOM anti-ad cleaner active');
  }

  // Expose API for external control
  window.AeroGuardShadowCleaner = {
    cleanNow: () => cleanShadowRoots(document),
    cleanShadowRoot,
    isAdElement,
    getStats: () => ({
      cleanedCount: cleanedElements.size,
      observerActive: true,
      scanIntervalActive: !!scanInterval
    }),
    pause: () => { stopPeriodicScan(); observer.disconnect(); },
    resume: () => {
      observer.observe(document.documentElement, { childList: true, subtree: true });
      startPeriodicScan();
    }
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();