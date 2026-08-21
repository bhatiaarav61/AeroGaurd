/**
 * Enhanced Scriptlet Injection System for AeroGuard
 * Includes specialized scriptlets for YouTube, news sites, and generic anti-adblock
 * Supports MAIN world injection via DNR redirect rules
 */

// ============================================
// SPECIALIZED SCRIPTLETS
// ============================================

const ENHANCED_SCRIPTLETS = {
  // YouTube Anti-Adblock Defuser (from content-scripts/scriptlets/yt-defuser.js)
  'youtube-defuser': `
    (function() {
      'use strict';

      const sanitizePlayerResponse = (data) => {
        if (!data || typeof data !== 'object') return data;
        delete data.adPlacements;
        delete data.playerAds;
        delete data.adSlots;
        if (data.playabilityStatus) {
          if (data.playabilityStatus.status === 'UNPLAYABLE' || data.playabilityStatus.status === 'ERROR') {
            const reason = data.playabilityStatus.reason || '';
            if (/ad block/i.test(reason) || data.playabilityStatus.errorScreen?.playerErrorMessageRenderer) {
              data.playabilityStatus.status = 'OK';
              delete data.playabilityStatus.reason;
              delete data.playabilityStatus.errorScreen;
            }
          }
        }
        if (data.streamingData) {
          ['formats', 'adaptiveFormats'].forEach(key => {
            if (data.streamingData[key]) {
              data.streamingData[key].forEach(format => {
                if (format.url && format.url.includes('signature=')) {
                  format.url = format.url.replace(/[&?]sp=[^&]+/, '');
                }
              });
            }
          });
        }
        return data;
      };

      let rawPlayerResponse = window.ytInitialPlayerResponse;
      Object.defineProperty(window, 'ytInitialPlayerResponse', {
        get: () => rawPlayerResponse,
        set: (val) => { rawPlayerResponse = sanitizePlayerResponse(val); },
        configurable: true, enumerable: true
      });

      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/next')) {
          const response = await originalFetch.apply(this, args);
          const clone = response.clone();
          try {
            const json = await clone.json();
            const cleaned = sanitizePlayerResponse(json);
            return new Response(JSON.stringify(cleaned), {
              status: response.status, statusText: response.statusText, headers: response.headers
            });
          } catch (e) { return response; }
        }
        return originalFetch.apply(this, args);
      };

      const originalXHROpen = window.XMLHttpRequest.prototype.open;
      const originalXHRSend = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.open = function(method, url) {
        this._isYouTubeAPI = url && (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/next'));
        return originalXHROpen.apply(this, arguments);
      };
      window.XMLHttpRequest.prototype.send = function(body) {
        if (this._isYouTubeAPI) {
          const originalOnReadyStateChange = this.onreadystatechange;
          this.onreadystatechange = function() {
            if (this.readyState === 4 && this.status === 200) {
              try {
                const json = JSON.parse(this.responseText);
                const cleaned = sanitizePlayerResponse(json);
                Object.defineProperty(this, 'responseText', { value: JSON.stringify(cleaned), writable: true, configurable: true });
                Object.defineProperty(this, 'response', { value: JSON.stringify(cleaned), writable: true, configurable: true });
              } catch (e) {}
            }
            if (originalOnReadyStateChange) originalOnReadyStateChange.apply(this, arguments);
          };
        }
        return originalXHRSend.apply(this, arguments);
      };

      const removeEnforcementOverlay = () => {
        const selectors = [
          'ytd-enforcement-message-view-model',
          'tp-yt-paper-dialog:has(#dismiss-button)',
          'ytd-popup-container ytd-enforcement-message-view-model',
          'yt-interstitial-ad-renderer',
          'ytd-player-legacy-desktop-watch-ads-renderer'
        ];
        for (const selector of selectors) {
          try {
            document.querySelectorAll(selector).forEach(el => { el.remove(); console.log('[AeroGuard] Removed YouTube enforcement overlay:', selector); });
          } catch (e) {}
        }
      };

      const observer = new MutationObserver(() => {
        removeEnforcementOverlay();
        const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
        if (video && video.paused && video.readyState >= 2) {
          const adShowing = document.querySelector('.ad-showing') || document.querySelector('.ytp-ad-module');
          if (adShowing) video.play().catch(() => {});
        }
      });

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { removeEnforcementOverlay(); observer.observe(document.documentElement, { childList: true, subtree: true }); });
      } else {
        removeEnforcementOverlay();
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }

      const adStubs = {
        adsbygoogle: { push: () => {}, loaded: true },
        google_ad_client: 'ca-pub-0000000000000000',
        google_ad_slot: '0000000000',
        googletag: { cmd: { push: (fn) => fn() }, pubads: () => ({ setTargeting: () => {}, enableSingleRequest: () => {}, collapseEmptyDivs: () => {} }), defineSlot: () => ({ addService: () => {}, setTargeting: () => {} }), enableServices: () => {} }
      };
      for (const [prop, value] of Object.entries(adStubs)) {
        if (!(prop in window)) Object.defineProperty(window, prop, { value, writable: false, configurable: true });
      }

      console.log('[AeroGuard] YouTube anti-adblock defuser active');
    })();
  `,

  // News Site Anti-Adblock & Paywall Defuser
  'news-defuser': `
    (function() {
      'use strict';

      const stubs = {
        canRunAds: true, isAdBlocked: false,
        google_ad_client: 'ca-pub-0000000000000000', google_ad_slot: '0000000000',
        googletag: { cmd: { push: (fn) => { try { fn(); } catch (e) {} } }, pubads: () => ({ setTargeting: () => {}, enableSingleRequest: () => {}, collapseEmptyDivs: () => {}, refresh: () => {}, addEventListener: () => {} }), defineSlot: () => ({ addService: () => {}, setTargeting: () => {}, setCollapseEmptyDiv: () => {} }), enableServices: () => {} },
        BlockAdBlock: function() { this.check = () => {}; this.onDetected = () => this; this.onNotDetected = (cb) => { try { cb(); } catch (e) {}; return this; }; this.setOption = () => this; },
        FuckAdBlock: function() { this.check = () => {}; this.onDetected = () => this; this.onNotDetected = (cb) => { try { cb(); } catch (e) {}; return this; }; this.setOption = () => this; },
        adblockDetector: { detect: () => false, isDetected: () => false },
        Admiral: { detected: false, check: () => {} },
        piano: { isAdBlocked: false, check: () => {} },
        tpv: { isAdBlocked: false }
      };

      for (const [prop, value] of Object.entries(stubs)) {
        if (!(prop in window) || window[prop] === undefined) {
          Object.defineProperty(window, prop, { value, writable: false, configurable: true });
        }
      }

      const origSetTimeout = window.setTimeout;
      const origSetInterval = window.setInterval;
      window.setTimeout = function(fn, delay, ...args) {
        if (typeof fn === 'function') {
          const fnStr = fn.toString().toLowerCase();
          if (fnStr.includes('adblock') || fnStr.includes('ad-block') || fnStr.includes('antiadblock') || fnStr.includes('paywall') || fnStr.includes('admiral') || fnStr.includes('blockadblock') || fnStr.includes('fuckadblock') || fnStr.includes('detectblock')) {
            console.log('[AeroGuard] Defused anti-adblock timeout'); return -1;
          }
        }
        return origSetTimeout(fn, delay, ...args);
      };
      window.setInterval = function(fn, delay, ...args) {
        if (typeof fn === 'function') {
          const fnStr = fn.toString().toLowerCase();
          if (fnStr.includes('adblock') || fnStr.includes('paywall')) {
            console.log('[AeroGuard] Defused anti-adblock interval'); return -1;
          }
        }
        return origSetInterval(fn, delay, ...args);
      };

      const forceScrollAndClean = () => {
        const html = document.documentElement;
        const body = document.body;
        if (html) { html.style.setProperty('overflow', 'auto', 'important'); html.style.setProperty('height', 'auto', 'important'); }
        if (body) { body.style.setProperty('overflow', 'auto', 'important'); body.style.setProperty('position', 'static', 'important'); body.style.setProperty('height', 'auto', 'important'); }
        const selectors = [
          '[class*="anti-adblock"]', '[id*="anti-adblock"]', '[class*="adblock-detected"]', '[id*="adblock-detected"]',
          '[class*="adblock-warning"]', '[id*="adblock-warning"]', '[class*="disable-adblock"]', '[id*="disable-adblock"]',
          '[class*="please-disable"]', '[id*="please-disable"]', '[class*="paywall"]', '[id*="paywall"]',
          '[class*="metered-content"]', '[id*="metered-content"]', '[class*="subscription-overlay"]', '[id*="subscription-overlay"]',
          '[class*="premium-overlay"]', '[id*="premium-overlay"]', '[class*="admiral"]', '[id*="admiral"]',
          '.admiral-overlay', '#admiral-container', '.tp-backdrop', '.tp-modal', '.tp-dialog', '#tp-modal', '#tp-backdrop',
          '.piano-paywall', '#piano-paywall', '#blockadblock', '.blockadblock', '#fuckadblock', '.fuckadblock',
          '.overlay[style*="fixed"]', '.modal[style*="fixed"]', '[class*="overlay"][style*="z-index: 9999"]',
          '[class*="modal"][style*="z-index: 9999"]', 'div[style*="position: fixed"][style*="z-index"][style*="top: 0"][style*="left: 0"][style*="width: 100%"][style*="height: 100%"]',
          '.welcome-ad', '.interstitial-ad', '#welcome-ad', '#interstitial-ad',
          '#fc-dialog-container', '.fc-dialog-container', '#fc-ab-root', '.fc-ab-root',
          '[class*="consent-banner"]', '[id*="consent-banner"]', '[class*="cookie-wall"]', '[id*="cookie-wall"]'
        ];
        for (const selector of selectors) {
          try { document.querySelectorAll(selector).forEach(el => { const style = window.getComputedStyle(el); const isOverlay = style.position === 'fixed' || style.position === 'absolute' || (style.zIndex && parseInt(style.zIndex) > 100) || el.offsetWidth > window.innerWidth * 0.8 || el.offsetHeight > window.innerHeight * 0.8; if (isOverlay) { el.remove(); console.log('[AeroGuard] Removed overlay:', selector); } }); } catch (e) {}
        }
      };

      const removeAntiAdblockScripts = () => {
        const scripts = document.querySelectorAll('script:not([src])');
        scripts.forEach(script => { const content = script.textContent.toLowerCase(); if (content.includes('adblock') || content.includes('paywall') || content.includes('admiral') || content.includes('blockadblock') || content.includes('fuckadblock') || content.includes('detectblock')) { if (!script.hasAttribute('data-aeroguard-safe')) { console.log('[AeroGuard] Removed inline anti-adblock script'); script.remove(); } } });
      };

      const observer = new MutationObserver((mutations) => {
        let shouldClean = false;
        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();
                const className = node.className || '';
                const id = node.id || '';
                if (/overlay|modal|paywall|anti.?adblock|adblock|admiral|piano|tp.?backdrop|tp.?modal/i.test(className + ' ' + id)) { shouldClean = true; break; }
                if (tagName === 'script' && !node.src) removeAntiAdblockScripts();
                const overlays = node.querySelectorAll('[class*="overlay"], [class*="modal"], [class*="paywall"], [class*="anti-adblock"], [id*="overlay"], [id*="modal"], [id*="paywall"]');
                if (overlays.length > 0) { shouldClean = true; break; }
              }
            }
          }
          if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
            const target = mutation.target;
            if (target.style.overflow === 'hidden' && (target === document.body || target === document.documentElement)) shouldClean = true;
          }
        }
        if (shouldClean) { forceScrollAndClean(); removeAntiAdblockScripts(); }
      });

      const initialCleanup = () => { forceScrollAndClean(); removeAntiAdblockScripts(); };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { initialCleanup(); observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] }); });
      } else { initialCleanup(); observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] }); }

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
  `,

  // Generic Anti-Adblock Defuser
  'generic-defuser': `
    (function() {
      'use strict';

      const universalStubs = {
        adsbygoogle: { push: (fn) => { try { fn(); } catch (e) {} }, loaded: true, requestNonPersonalizedAds: () => {} },
        google_ad_client: 'ca-pub-0000000000000000', google_ad_slot: '0000000000', google_ad_width: 0, google_ad_height: 0,
        google_ad_format: '', google_ad_region: 'test', google_ad_type: 'text_image',
        google_color_border: '', google_color_bg: '', google_color_link: '', google_color_text: '', google_color_url: '',
        google_ui_features: '', google_ad_channel: '', google_max_num_ads: 0, google_override_format: true,
        googletag: { cmd: { push: (fn) => { try { fn(); } catch (e) {} } }, pubads: () => ({ setTargeting: () => {}, enableSingleRequest: () => {}, collapseEmptyDivs: () => {}, refresh: () => {}, addEventListener: () => {}, setPrivacySettings: () => {}, setCentering: () => {}, setForceSafeFrame: () => {} }), defineSlot: () => ({ addService: () => {}, setTargeting: () => {}, setCollapseEmptyDiv: () => {}, defineSizeMapping: () => ({ build: () => ({ get: () => [] }) }) }), enableServices: () => {}, sizeMapping: () => ({ addSize: () => {}, build: () => ({ get: () => [] }) }), pubadsReady: false, version: '20240101' },
        amazon_ads: { push: () => {} }, aax_getad_mpb: () => {},
        pbjs: { addAdUnits: () => {}, requestBids: () => {}, setTargetingForGPTAsync: () => {}, enableAnalytics: () => {}, bidderSettings: {}, adUnits: [], getBidResponses: () => ({}), getHighestCpmBids: () => [], getAllWinningBids: () => [] },
        _adblockDetected: false, _adBlockerDetected: false, _adblockStatus: 'not-detected', adBlockDetected: false,
        adblock: { detected: false }, adBlocker: { detected: false }, isAdBlockEnabled: false, hasAdBlock: false,
        BlockAdBlock: function() { this.check = () => {}; this.onDetected = () => this; this.onNotDetected = (cb) => { try { cb(); } catch (e) {}; return this; }; this.setOption = () => this; },
        FuckAdBlock: function() { this.check = () => {}; this.onDetected = () => this; this.onNotDetected = (cb) => { try { cb(); } catch (e) {}; return this; }; this.setOption = () => this; },
        Admiral: { detected: false, check: () => {}, init: () => {} },
        piano: { isAdBlocked: false, check: () => {}, init: () => {} },
        tpv: { isAdBlocked: false },
        adblockDetector: { detect: () => false, isDetected: () => false, check: () => false },
        antiAdblock: { detected: false, check: () => {} }
      };

      for (const [prop, value] of Object.entries(universalStubs)) {
        if (!(prop in window) || window[prop] === undefined) {
          Object.defineProperty(window, prop, { value, writable: false, configurable: true });
        }
      }

      const origSetTimeout = window.setTimeout;
      const origSetInterval = window.setInterval;
      const origRequestAnimationFrame = window.requestAnimationFrame;
      const antiAdblockKeywords = ['adblock', 'ad-block', 'antiadblock', 'anti-adblock', 'paywall', 'admiral', 'blockadblock', 'fuckadblock', 'detectblock', 'adblockdetector', 'adblock-check', 'isadblocked', 'adblockdetected', 'showOverlay', 'showAdblockMessage', 'displayAdblockWarning', 'disableContent', 'blockContent', 'lockContent'];
      const isAntiAdblockFunction = (fn) => { if (typeof fn !== 'function') return false; try { const str = fn.toString().toLowerCase(); return antiAdblockKeywords.some(keyword => str.includes(keyword)); } catch (e) { return false; } };
      window.setTimeout = function(fn, delay, ...args) { if (isAntiAdblockFunction(fn)) { console.log('[AeroGuard] Defused anti-adblock setTimeout'); return -1; } return origSetTimeout(fn, delay, ...args); };
      window.setInterval = function(fn, delay, ...args) { if (isAntiAdblockFunction(fn)) { console.log('[AeroGuard] Defused anti-adblock setInterval'); return -1; } return origSetInterval(fn, delay, ...args); };
      window.requestAnimationFrame = function(fn) { if (isAntiAdblockFunction(fn)) { console.log('[AeroGuard] Defused anti-adblock requestAnimationFrame'); return -1; } return origRequestAnimationFrame(fn); };

      const restoreScrolling = () => { const html = document.documentElement; const body = document.body; if (html) { html.style.setProperty('overflow', 'auto', 'important'); html.style.setProperty('overflow-x', 'auto', 'important'); html.style.setProperty('overflow-y', 'auto', 'important'); html.style.setProperty('height', 'auto', 'important'); html.style.setProperty('position', 'static', 'important'); } if (body) { body.style.setProperty('overflow', 'auto', 'important'); body.style.setProperty('overflow-x', 'auto', 'important'); body.style.setProperty('overflow-y', 'auto', 'important'); body.style.setProperty('height', 'auto', 'important'); body.style.setProperty('position', 'static', 'important'); } };
      const removeOverlayElements = () => { const overlaySelectors = [ 'div[style*="position: fixed"][style*="top: 0"][style*="left: 0"][style*="width: 100%"][style*="height: 100%"][style*="z-index"]', 'div[style*="position:fixed"][style*="top:0"][style*="left:0"][style*="width:100%"][style*="height:100%"][style*="z-index"]', '[class*="overlay"][style*="fixed"]', '[class*="modal"][style*="fixed"]', '[class*="backdrop"][style*="fixed"]', '[class*="curtain"][style*="fixed"]', '[class*="adblock"]', '[id*="adblock"]', '[class*="anti-adblock"]', '[id*="anti-adblock"]', '[class*="ad-block"]', '[id*="ad-block"]', '[class*="disable-adblock"]', '[id*="disable-adblock"]', '[class*="adblock-detected"]', '[id*="adblock-detected"]', '[class*="adblock-warning"]', '[id*="adblock-warning"]', '[class*="please-disable"]', '[id*="please-disable"]', '[class*="adblock-message"]', '[id*="adblock-message"]', '[class*="paywall"]', '[id*="paywall"]', '[class*="metered"]', '[id*="metered"]', '[class*="subscription-overlay"]', '[id*="subscription-overlay"]', '[class*="premium-overlay"]', '[id*="premium-overlay"]', '[class*="content-lock"]', '[id*="content-lock"]', '[class*="article-lock"]', '[id*="article-lock"]', '.tp-backdrop', '.tp-modal', '.tp-dialog', '#tp-modal', '#tp-backdrop', '.piano-paywall', '#piano-paywall', '.admiral-overlay', '#admiral-container', '#blockadblock', '.blockadblock', '#fuckadblock', '.fuckadblock', '#fc-dialog-container', '.fc-dialog-container', '#fc-ab-root', '.fc-ab-root', '.interstitial', '.welcome-ad', '.interstitial-ad', '#interstitial', '#welcome-ad', '[class*="consent-wall"]', '[id*="consent-wall"]', '[class*="cookie-wall"]', '[id*="cookie-wall"]' ]; for (const selector of overlaySelectors) { try { const elements = document.querySelectorAll(selector); elements.forEach(el => { const style = window.getComputedStyle(el); const isOverlay = style.position === 'fixed' || style.position === 'absolute' || (style.zIndex && parseInt(style.zIndex) > 100) || el.offsetWidth > window.innerWidth * 0.7 || el.offsetHeight > window.innerHeight * 0.7; if (isOverlay) { el.remove(); console.log('[AeroGuard] Removed overlay element:', selector); } }); } catch (e) {} } };
      const removeAntiAdblockScripts = () => { const scripts = document.querySelectorAll('script:not([src]):not([data-aeroguard-safe])'); scripts.forEach(script => { const content = script.textContent.toLowerCase(); if (antiAdblockKeywords.some(keyword => content.includes(keyword))) { console.log('[AeroGuard] Removed inline anti-adblock script'); script.remove(); } }); };
      const fullCleanup = () => { restoreScrolling(); removeOverlayElements(); removeAntiAdblockScripts(); };
      const observer = new MutationObserver((mutations) => { let shouldClean = false; for (const mutation of mutations) { if (mutation.type === 'childList' && mutation.addedNodes.length > 0) { for (const node of mutation.addedNodes) { if (node.nodeType === Node.ELEMENT_NODE) { const tagName = node.tagName.toLowerCase(); const className = node.className || ''; const id = node.id || ''; const classId = (className + ' ' + id).toLowerCase(); if (/overlay|modal|paywall|anti.?adblock|adblock|admiral|piano|tp.?backdrop|tp.?modal|interstitial|welcome.?ad|consent.?wall|cookie.?wall|content.?lock|article.?lock/i.test(classId)) { shouldClean = true; break; } if (tagName === 'script' && !node.src && !node.hasAttribute('data-aeroguard-safe')) { removeAntiAdblockScripts(); } const overlays = node.querySelectorAll('[class*="overlay"], [class*="modal"], [class*="paywall"], [class*="anti-adblock"], [id*="overlay"], [id*="modal"], [id*="paywall"]'); if (overlays.length > 0) { shouldClean = true; break; } } } } if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) { const target = mutation.target; const style = window.getComputedStyle(target); if ((target === document.body || target === document.documentElement) && (style.overflow === 'hidden' || style.overflowY === 'hidden')) { shouldClean = true; } } } if (shouldClean) { fullCleanup(); } });
      const restoreUserInteractions = () => { const events = ['contextmenu', 'selectstart', 'copy', 'cut', 'paste', 'dragstart']; events.forEach(eventType => { const originalAddEventListener = EventTarget.prototype.addEventListener; EventTarget.prototype.addEventListener = function(type, listener, options) { if (events.includes(type) && typeof listener === 'function') { const listenerStr = listener.toString(); if (listenerStr.includes('preventDefault') || listenerStr.includes('return false')) { console.log('[AeroGuard] Blocked restrictive event listener:', type); return; } } return originalAddEventListener.call(this, type, listener, options); }; }); document.body.style.userSelect = 'auto'; document.body.style.webkitUserSelect = 'auto'; document.body.style.msUserSelect = 'auto'; document.body.style.mozUserSelect = 'auto'; };
      const init = () => { fullCleanup(); restoreUserInteractions(); observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] }); console.log('[AeroGuard] Generic anti-adblock defuser active'); };
      if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
    })();
  `,

  // uBlock Origin style scriptlets (enhanced)
  'abort-current-inline-script': `
    (function() {
      var currentScript = document.currentScript;
      if (currentScript) currentScript.remove();
    })();
  `,

  'abort-on-property-read': `
    (function(args) { var obj = args[0]; var prop = args[1]; var original = Object.getOwnPropertyDescriptor(obj, prop); if (original && original.get) { Object.defineProperty(obj, prop, { get: function() { throw new Error('Property access blocked by adblocker'); }, configurable: true }); } })(arguments);
  `,

  'abort-on-property-write': `
    (function(args) { var obj = args[0]; var prop = args[1]; var original = Object.getOwnPropertyDescriptor(obj, prop); if (original && original.set) { Object.defineProperty(obj, prop, { set: function() { throw new Error('Property write blocked by adblocker'); }, configurable: true }); } })(arguments);
  `,

  'json-prune': `
    (function(args) { var obj = args[0]; var paths = args[1] || []; function prune(o, path) { if (!o || typeof o !== 'object') return o; if (Array.isArray(o)) return o.map(function(item) { return prune(item, path); }); var result = {}; for (var key in o) { if (o.hasOwnProperty(key)) { var newPath = path ? path + '.' + key : key; if (paths.indexOf(newPath) === -1 && paths.indexOf(key) === -1) result[key] = prune(o[key], newPath); } } return result; } return prune(obj, ''); })(arguments);
  `,

  'noeval': `
    (function() { eval = function() { throw new Error('eval() blocked by adblocker'); }; })();
  `,

  'no-fetch': `
    (function(args) { var originalFetch = window.fetch; window.fetch = function(url, options) { if (url && (url.includes('analytics') || url.includes('tracking') || url.includes('telemetry') || url.includes('ads') || url.includes('doubleclick') || url.includes('googlesyndication'))) { return Promise.reject(new Error('Fetch blocked by adblocker')); } return originalFetch.apply(this, arguments); }; })(arguments);
  `,

  'no-xhr': `
    (function(args) { var originalXHR = window.XMLHttpRequest; window.XMLHttpRequest = function() { var xhr = new originalXHR(); var originalOpen = xhr.open; xhr.open = function(method, url) { if (url && (url.includes('analytics') || url.includes('tracking') || url.includes('telemetry') || url.includes('ads') || url.includes('doubleclick') || url.includes('googlesyndication'))) { throw new Error('XHR blocked by adblocker'); } return originalOpen.apply(this, arguments); }; return xhr; }; })(arguments);
  `,

  'no-op': `
    (function() { return function() {}; })(arguments);
  `,

  'override-property': `
    (function(args) { var obj = args[0]; var prop = args[1]; var value = args[2]; if (obj) { Object.defineProperty(obj, prop, { value: value, writable: false, configurable: true }); } })(arguments);
  `,

  'remove-node': `
    (function(args) { var selector = args[0]; var root = args[1] || document; var elements = root.querySelectorAll(selector); elements.forEach(function(el) { el.remove(); }); })(arguments);
  `,

  'remove-node-attr': `
    (function(args) { var selector = args[0]; var attr = args[1]; var root = args[2] || document; var elements = root.querySelectorAll(selector); elements.forEach(function(el) { el.removeAttribute(attr); }); })(arguments);
  `,

  'set-constant': `
    (function(args) { var obj = args[0]; var prop = args[1]; var value = args[2]; Object.defineProperty(obj, prop, { value: value, writable: false, configurable: true }); })(arguments);
  `,

  'trust-setTimeout': `
    (function(args) { var original = window.setTimeout; window.setTimeout = function(fn, delay) { if (typeof fn === 'function') { return original(fn, delay); } return original(fn, delay); }; })(arguments);
  `,

  'trust-setInterval': `
    (function(args) { var original = window.setInterval; window.setInterval = function(fn, delay) { if (typeof fn === 'function') { return original(fn, delay); } return original(fn, delay); }; })(arguments);
  `,

  // Anti-adblock specific scriptlets
  'adblock-detection-stub': `
    (function() {
      // Stub common adblock detection properties
      var props = [
        'adblock', 'adBlock', 'adblocker', 'adBlocker', 'adBlockDetected', 'adblockDetected',
        'canRunAds', 'isAdBlocked', 'hasAdBlock', 'blockedAds', 'blockedTrackers'
      ];
      props.forEach(function(prop) {
        Object.defineProperty(window, prop, {
          value: false, writable: false, configurable: true
        });
      });
      // Stub functions
      ['detectAdblock', 'checkAdblock', 'adblockDetected', 'onAdblockDetected'].forEach(function(fn) {
        window[fn] = function() { return false; };
      });
    })();
  `,

  // Google AdSense specific
  'adsbygoogle-stub': `
    (function() {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push = function(ads) {
        if (ads && ads.length) {
          ads.forEach(function(ad) {
            if (ad && ad.style) ad.style.display = 'none';
          });
        }
      };
      window.adsbygoogle.loaded = true;
      window.google_ad_client = 'ca-pub-0000000000000000';
      window.google_ad_slot = '0000000000';
    })();
  `,

  // YouTube specific player response sanitizer
  'yt-player-response-sanitizer': `
    (function() {
      var original = window.ytInitialPlayerResponse;
      Object.defineProperty(window, 'ytInitialPlayerResponse', {
        get: function() { return original; },
        set: function(val) {
          if (val && val.playabilityStatus && (val.playabilityStatus.status === 'UNPLAYABLE' || val.playabilityStatus.status === 'ERROR')) {
            var reason = val.playabilityStatus.reason || '';
            if (/ad block/i.test(reason) || val.playabilityStatus.errorScreen?.playerErrorMessageRenderer) {
              val.playabilityStatus.status = 'OK';
              delete val.playabilityStatus.reason;
              delete val.playabilityStatus.errorScreen;
            }
          }
          if (val) { delete val.adPlacements; delete val.playerAds; delete val.adSlots; }
          original = val;
        },
        configurable: true, enumerable: true
      });
    })();
  `,

  // Overlay remover
  'overlay-remover': `
    (function(args) {
      var selector = args[0] || '[class*="overlay"], [class*="modal"], [class*="paywall"], [class*="anti-adblock"]';
      var elements = document.querySelectorAll(selector);
      elements.forEach(function(el) {
        var style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'absolute' || (style.zIndex && parseInt(style.zIndex) > 100)) {
          el.remove();
        }
      });
    })(arguments);
  `,

  // Restore scrolling
  'restore-scrolling': `
    (function() {
      document.documentElement.style.setProperty('overflow', 'auto', 'important');
      document.body.style.setProperty('overflow', 'auto', 'important');
      document.body.style.setProperty('position', 'static', 'important');
    })();
  `,

  // CSP injection for stricter control
  'csp-inject': `
    (function(args) {
      var policy = args[0] || "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; object-src 'none'; frame-src 'self';";
      var meta = document.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = policy;
      document.head.appendChild(meta);
    })(arguments);
  `,

  // Clear all cookies for domain
  'clear-cookies': `
    (function(args) {
      var domain = args[0] || document.domain;
      var cookies = document.cookie.split(';');
      cookies.forEach(function(cookie) {
        var eqPos = cookie.indexOf('=');
        var name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;domain=' + domain + ';path=/';
        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;domain=.' + domain + ';path=/';
      });
    })(arguments);
  `,

  // WebRTC leak protection
  'webrtc-block': `
    (function() {
      var blocked = function() { throw new DOMException('WebRTC blocked by privacy protection', 'SecurityError'); };
      ['RTCPeerConnection', 'RTCDataChannel', 'RTCSessionDescription', 'RTCIceCandidate', 'webkitRTCPeerConnection', 'mozRTCPeerConnection', 'msRTCPeerConnection'].forEach(function(api) {
        if (api in window) {
          Object.defineProperty(window, api, {
            value: new Proxy(function() {}, { construct: blocked, apply: blocked }),
            configurable: true, writable: true
          });
        }
      });
      if ('mediaDevices' in navigator) {
        navigator.mediaDevices.getUserMedia = function() { return Promise.reject(new DOMException('WebRTC device access blocked', 'SecurityError')); };
      }
    })();
  `
};

/**
 * Enhanced Scriptlet Manager with DNR redirect integration
 */
export class EnhancedScriptletManager {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.extensionId = options.extensionId || '';
    this.scriptlets = { ...ENHANCED_SCRIPTLETS };
    this.compiledScriptlets = new Map();
    this.injectionCache = new Map();

    // Pre-compile all scriptlets
    this.precompileAll();
  }

  precompileAll() {
    for (const name of Object.keys(this.scriptlets)) {
      try {
        this.compileScriptlet(name);
      } catch (e) {
        console.warn('[EnhancedScriptletManager] Failed to precompile', name, e);
      }
    }
  }

  getScriptlet(name) {
    return this.scriptlets[name] || null;
  }

  getScriptletNames() {
    return Object.keys(this.scriptlets);
  }

  compileScriptlet(name, args = []) {
    const source = this.getScriptlet(name);
    if (!source) return null;

    const cacheKey = name + ':' + JSON.stringify(args);
    if (this.compiledScriptlets.has(cacheKey)) {
      return this.compiledScriptlets.get(cacheKey);
    }

    const compiled = new Function('args', `
      try {
        ${source}
      } catch (e) {
        console.error('[Scriptlet] Error in ${name}:', e);
      }
    `);

    this.compiledScriptlets.set(cacheKey, compiled);
    return compiled;
  }

  generateScriptletURL(name, args = []) {
    const source = this.getScriptlet(name);
    if (!source) return null;

    const code = `
      (function() {
        var args = ${JSON.stringify(args)};
        try {
          ${source}
        } catch (e) {
          console.error('[Scriptlet] Error in ${name}:', e);
        }
      })();
    `;

    const encoded = encodeURIComponent(code);
    return `data:text/javascript,${encoded}`;
  }

  /**
   * Create DNR redirect rule for scriptlet injection
   * This is the key to running scriptlets in MAIN world
   */
  createScriptletRule(name, args, urlFilter, options = {}) {
    const scriptletURL = this.generateScriptletURL(name, args);
    if (!scriptletURL) return null;

    return {
      id: options.id || Date.now(),
      priority: options.priority || 1,
      action: {
        type: 'redirect',
        redirect: { url: scriptletURL }
      },
      condition: {
        urlFilter: urlFilter,
        resourceTypes: options.resourceTypes || ['script'],
        domains: options.domains,
        excludedDomains: options.excludedDomains,
        domainType: options.thirdParty ? 'thirdParty' : undefined
      }
    };
  }

  /**
   * Create multiple scriptlet rules for a domain
   */
  createScriptletRulesForDomain(domain, scriptletNames = ['generic-defuser']) {
    const rules = [];
    const urlFilter = `||${domain}^`;

    scriptletNames.forEach((name, index) => {
      const rule = this.createScriptletRule(name, [], urlFilter, {
        id: 3000000 + index,
        priority: 1,
        resourceTypes: ['script', 'xmlhttprequest']
      });
      if (rule) rules.push(rule);
    });

    return rules;
  }

  /**
   * Get scriptlet rules for YouTube
   */
  getYouTubeScriptletRules() {
    return this.createScriptletRulesForDomain('youtube.com', ['youtube-defuser']);
  }

  /**
   * Get scriptlet rules for news sites
   */
  getNewsScriptletRules() {
    const newsDomains = [
      'nytimes.com', 'washingtonpost.com', 'wsj.com', 'ft.com', 'economist.com',
      'bloomberg.com', 'forbes.com', 'businessinsider.com', 'theguardian.com',
      'telegraph.co.uk', 'independent.co.uk', 'dailymail.co.uk', 'mirror.co.uk',
      'express.co.uk', 'thesun.co.uk', 'metro.co.uk', 'standard.co.uk',
      'medium.com', 'substack.com', 'ghost.io', 'theverge.com', 'techcrunch.com',
      'arstechnica.com', 'engadget.com', 'gizmodo.com', 'wired.com', 'cnet.com',
      'zdnet.com', 'pcmag.com', 'tomshardware.com', 'anandtech.com', 'extremetech.com'
    ];

    const rules = [];
    newsDomains.forEach((domain, index) => {
      const domainRules = this.createScriptletRulesForDomain(domain, ['news-defuser']);
      rules.push(...domainRules.map((r, i) => ({ ...r, id: 5000000 + index * 10 + i })));
    });

    return rules;
  }

  /**
   * Get all anti-adblock scriptlet rules
   */
  getAllAntiAdblockRules() {
    const rules = [];

    // YouTube
    rules.push(...this.getYouTubeScriptletRules().map((r, i) => ({ ...r, id: 6000000 + i })));

    // News sites
    rules.push(...this.getNewsScriptletRules());

    // Generic for all domains (lower priority)
    const genericRule = this.createScriptletRule('generic-defuser', [], '*', {
      id: 7000000,
      priority: 100,
      resourceTypes: ['script']
    });
    if (genericRule) rules.push(genericRule);

    return rules;
  }

  registerScriptlet(name, source) {
    this.scriptlets[name] = source;
    this.compiledScriptlets.clear();
    this.precompileAll();
  }

  removeScriptlet(name) {
    delete this.scriptlets[name];
    this.compiledScriptlets.clear();
  }

  getStats() {
    return {
      enabled: this.enabled,
      scriptletCount: Object.keys(this.scriptlets).length,
      compiledCount: this.compiledScriptlets.size,
      injectionCacheSize: this.injectionCache.size
    };
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  setExtensionId(id) {
    this.extensionId = id;
  }

  clearCache() {
    this.compiledScriptlets.clear();
    this.injectionCache.clear();
  }
}

export { ENHANCED_SCRIPTLETS };
export default EnhancedScriptletManager;