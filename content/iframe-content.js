/**
 * Iframe Content Script — Cross-origin iframe handling
 * Runs in iframes, communicates with parent via postMessage
 */

(() => {
  'use strict';

  const CONFIG = {
    debug: false,
    maxMessageSize: 1024 * 1024, // 1MB
    allowedOrigins: ['*'] // In production, restrict to extension origin
  };

  let initialized = false;
  let isIframe = false;
  let parentPort = null;

  function log(...args) { if (CONFIG.debug) console.log('[AeroGuard Iframe]', ...args); }

  function isElement(node) { return node && node.nodeType === Node.ELEMENT_NODE; }

  // ============================================================================
  // IFRAME DETECTION
  // ============================================================================

  function detectIframe() {
    try {
      isIframe = window.self !== window.top;
      if (isIframe) {
        log('Running in iframe:', location.href);
        setupParentCommunication();
      }
    } catch (e) {
      // Cross-origin iframe, can't access top
      isIframe = true;
      log('Cross-origin iframe detected');
    }
  }

  // ============================================================================
  // PARENT COMMUNICATION (postMessage)
  // ============================================================================

  function setupParentCommunication() {
    window.addEventListener('message', (event) => {
      // Validate origin (in production, check against extension origin)
      if (!isAllowedOrigin(event.origin)) return;

      const msg = event.data;
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case 'AEROGUARD_CONFIG':
          handleConfig(msg.config);
          break;
        case 'AEROGUARD_SCAN':
          scanAndReport();
          break;
        case 'AEROGUARD_GET_STATS':
          reportStats();
          break;
      }
    });

    // Notify parent we're ready
    notifyParent({ type: 'AEROGUARD_READY', url: location.href });
  }

  function isAllowedOrigin(origin) {
    return CONFIG.allowedOrigins.includes('*') || CONFIG.allowedOrigins.includes(origin);
  }

  function notifyParent(msg) {
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(msg, '*');
      } catch (e) {
        log('Failed to post to parent:', e);
      }
    }
  }

  function handleConfig(config) {
    Object.assign(CONFIG, config);
    log('Received config from parent');
    scanAndReport();
  }

  function scanAndReport() {
    const stats = scanIframe();
    notifyParent({ type: 'AEROGUARD_STATS', stats, url: location.href });
  }

  function reportStats() {
    const stats = scanIframe();
    notifyParent({ type: 'AEROGUARD_STATS_RESPONSE', stats });
  }

  // ============================================================================
  // AD DETECTION IN IFRAME
  // ============================================================================

  const IFRAME_AD_SELECTORS = [
    // Google ads in iframe
    'iframe[src*="googleads.g.doubleclick.net"]',
    'iframe[src*="pubads.g.doubleclick.net"]',
    'iframe[src*="pagead2.googlesyndication.com"]',
    'ins.adsbygoogle',
    '.adsbygoogle',

    // Other ad iframes
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="googletagmanager.com"]',
    'iframe[src*="googletagservices.com"]',
    'iframe[src*="taboola.com"]',
    'iframe[src*="outbrain.com"]',

    // Ad elements
    '[class*="ad-"]', '[id*="ad-"]', '[data-ad]',
    '.ad', '.ads', '.advert', '.advertisement',
    '.banner-ad', '.sidebar-ad', '.interstitial-ad'
  ];

  function scanIframe() {
    let hiddenCount = 0;
    let foundSelectors = [];

    // Check if this iframe itself is an ad
    const isAdIframe = IFRAME_AD_SELECTORS.some(sel => {
      try {
        return document.querySelector(sel) !== null;
      } catch { return false; }
    });

    // Hide ad elements within this iframe
    IFRAME_AD_SELECTORS.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (!el._adBlocked) {
            hideElement(el);
            hiddenCount++;
            foundSelectors.push(sel);
          }
        });
      } catch (e) {}
    });

    return {
      isAdIframe,
      hiddenCount,
      foundSelectors,
      url: location.href,
      referrer: document.referrer
    };
  }

  function hideElement(el) {
    if (el._adBlocked) return;
    el._adBlocked = true;
    el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-9999!important';
    el.setAttribute('data-aeroguard-hidden', 'true');
    el.setAttribute('aria-hidden', 'true');
  }

  // ============================================================================
  #region ANTI-ADBLOCK IN IFRAME
  // ============================================================================

  function blockAntiAdblock() {
    const detections = ['adblockDetected','adBlockDetected','detectAdblock','detectAdBlock','isAdblockActive','isAdBlockActive','adblockEnabled','adBlockEnabled'];
    detections.forEach(name => { if (window[name]) window[name] = () => false; });

    const props = ['adblock','adBlock','adblocker','adBlocker'];
    props.forEach(p => { try { Object.defineProperty(window, p, { value: undefined, writable: true, configurable: true }); } catch(e) {} });

    log('Anti-adblock in iframe');
  }

  // ============================================================================
  #region MUTATION OBSERVER
  // ============================================================================

  function setupMutationObserver() {
    const observer = new MutationObserver(mutations => {
      let shouldCheck = false;
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length) {
          for (const n of m.addedNodes) {
            if (isElement(n) && (n.matches?.(IFRAME_AD_SELECTORS.join(',')) || n.querySelector?.(IFRAME_AD_SELECTORS.join(',')))) {
              shouldCheck = true;
              break;
            }
          }
        }
      }
      if (shouldCheck) {
        clearTimeout(observer._debounce);
        observer._debounce = setTimeout(scanAndReport, 200);
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // ============================================================================
  #region INITIALIZATION
  // ============================================================================

  function init() {
    if (initialized) return; initialized = true;
    detectIframe();

    if (isIframe) {
      blockAntiAdblock();
      setupMutationObserver();

      // Initial scan
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scanAndReport);
      } else {
        scanAndReport();
      }
    }

    window.addEventListener('beforeunload', () => {
      notifyParent({ type: 'AEROGUARD_UNLOAD', url: location.href });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.__aeroguardIframe = { scanIframe, CONFIG };
})();