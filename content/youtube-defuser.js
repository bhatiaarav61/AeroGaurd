// content/youtube-defuser.js — YouTube-specific ad defuser (MAIN world at document_start)
(() => {
  'use strict';

  // 1. Purge initial page player response data
  const sanitizeJSON = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    delete obj.adPlacements;
    delete obj.playerAds;
    delete obj.adSlots;
    delete obj.adBreakHeartbeatParams;
    return obj;
  };

  let rawPlayerResponse = window.ytInitialPlayerResponse;
  Object.defineProperty(window, 'ytInitialPlayerResponse', {
    get: () => rawPlayerResponse,
    set: (val) => { rawPlayerResponse = sanitizeJSON(val); },
    configurable: true
  });

  // 2. Intercept YouTube API fetch calls
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    if (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/next')) {
      const clone = response.clone();
      try {
        const data = await clone.json();
        const cleanData = sanitizeJSON(data);
        return new Response(JSON.stringify(cleanData), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (e) {
        return response;
      }
    }
    return response;
  };

  // 3. Intercept XMLHttpRequest for YouTube API
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
            const cleaned = sanitizeJSON(json);
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
          } catch (e) {}
        }
        if (originalOnReadyStateChange) originalOnReadyStateChange.apply(this, arguments);
      };
    }
    return originalXHRSend.apply(this, arguments);
  };

  // 4. Remove anti-adblock overlays automatically
  const observer = new MutationObserver(() => {
    const popup = document.querySelector('ytd-enforcement-message-view-model, tp-yt-paper-dialog:has(#dismiss-button)');
    if (popup) {
      popup.remove();
      const video = document.querySelector('video');
      if (video && video.paused) video.play();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Initial run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      sanitizeJSON(window.ytInitialPlayerResponse);
    });
  } else {
    sanitizeJSON(window.ytInitialPlayerResponse);
  }

  console.log('[AeroGuard] YouTube anti-adblock defuser active');
})();