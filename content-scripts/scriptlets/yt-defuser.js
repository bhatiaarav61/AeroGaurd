/**
 * YouTube Anti-Adblock Defuser
 * Neutralizes YouTube's anti-adblock enforcement (enforcement modals, playability errors, ad payloads)
 * Runs in MAIN world at document_start for direct window access
 */
(function () {
  'use strict';

  // Helper to sanitize player response objects
  const sanitizePlayerResponse = (data) => {
    if (!data || typeof data !== 'object') return data;

    // Remove ad placements and pre-roll definitions
    delete data.adPlacements;
    delete data.playerAds;
    delete data.adSlots;

    // Neutralize anti-adblock playability enforcement
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

    // Remove tracking params from video stream URLs
    if (data.streamingData) {
      ['formats', 'adaptiveFormats'].forEach(key => {
        if (data.streamingData[key]) {
          data.streamingData[key].forEach(format => {
            if (format.url && format.url.includes('signature=')) {
              // Remove sp= parameter if it's a tracking signature
              format.url = format.url.replace(/[&?]sp=[^&]+/, '');
            }
          });
        }
      });
    }

    return data;
  };

  // 1. Intercept ytInitialPlayerResponse assignments
  let rawPlayerResponse = window.ytInitialPlayerResponse;
  Object.defineProperty(window, 'ytInitialPlayerResponse', {
    get: () => rawPlayerResponse,
    set: (val) => {
      rawPlayerResponse = sanitizePlayerResponse(val);
    },
    configurable: true,
    enumerable: true
  });

  // 2. Monkey-patch Native Fetch for YouTube API endpoints
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    if (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/next')) {
      const response = await originalFetch.apply(this, args);
      const clone = response.clone();
      try {
        const json = await clone.json();
        const cleaned = sanitizePlayerResponse(json);
        return new Response(JSON.stringify(cleaned), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (e) {
        return response;
      }
    }
    return originalFetch.apply(this, args);
  };

  // 3. Monkey-patch XMLHttpRequest for YouTube API endpoints
  const originalXHROpen = window.XMLHttpRequest.prototype.open;
  const originalXHRSend = window.XMLHttpRequest.prototype.send;

  window.XMLHttpRequest.prototype.open = function (method, url) {
    this._isYouTubeAPI = url && (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/next'));
    return originalXHROpen.apply(this, arguments);
  };

  window.XMLHttpRequest.prototype.send = function (body) {
    if (this._isYouTubeAPI) {
      const originalOnReadyStateChange = this.onreadystatechange;
      this.onreadystatechange = function () {
        if (this.readyState === 4 && this.status === 200) {
          try {
            const json = JSON.parse(this.responseText);
            const cleaned = sanitizePlayerResponse(json);
            Object.defineProperty(this, 'responseText', {
              value: JSON.stringify(cleaned),
              writable: true,
              configurable: true
            });
            Object.defineProperty(this, 'response', {
              value: JSON.stringify(cleaned),
              writable: true,
              configurable: true
            });
          } catch (e) {
            // Ignore parse errors
          }
        }
        if (originalOnReadyStateChange) {
          originalOnReadyStateChange.apply(this, arguments);
        }
      };
    }
    return originalXHRSend.apply(this, arguments);
  };

  // 4. Remove anti-adblock overlay nodes automatically
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
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          el.remove();
          console.log('[AeroGuard] Removed YouTube enforcement overlay:', selector);
        });
      } catch (e) {
        // Ignore selector errors
      }
    }
  };

  const observer = new MutationObserver(() => {
    removeEnforcementOverlay();
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (video && video.paused && video.readyState >= 2) {
      // Only auto-play if it was paused by an ad
      const adShowing = document.querySelector('.ad-showing') || document.querySelector('.ytp-ad-module');
      if (adShowing) {
        video.play().catch(() => {});
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      removeEnforcementOverlay();
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  } else {
    removeEnforcementOverlay();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // 5. Stub adsbygoogle and other ad globals
  const adStubs = {
    adsbygoogle: { push: () => {}, loaded: true },
    google_ad_client: 'ca-pub-0000000000000000',
    google_ad_slot: '0000000000',
    googletag: {
      cmd: { push: (fn) => fn() },
      pubads: () => ({
        setTargeting: () => {},
        enableSingleRequest: () => {},
        collapseEmptyDivs: () => {}
      }),
      defineSlot: () => ({ addService: () => {}, setTargeting: () => {} }),
      enableServices: () => {}
    }
  };

  for (const [prop, value] of Object.entries(adStubs)) {
    if (!(prop in window)) {
      Object.defineProperty(window, prop, {
        value,
        writable: false,
        configurable: true
      });
    }
  }

  console.log('[AeroGuard] YouTube anti-adblock defuser active');
})();