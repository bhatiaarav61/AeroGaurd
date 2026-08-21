// yt-payload-sanitizer.js (Inject into MAIN world at document_start)
(() => {
  'use strict';

  // Recursive scrubbing of ad parameters from YouTube API JSON payloads
  const scrubAdData = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;

    // Keys that trigger YouTube ad playback
    const adKeys = [
      'adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams',
      'adBreaks', 'adSlotsV2', 'adModules', 'adModuleData',
      'adSignals', 'adTagUrl', 'adSchedulingParams',
      'adServerInteractions', 'adUiConfig', 'adTrackingParams'
    ];
    for (const key of adKeys) {
      if (key in obj) delete obj[key];
    }

    // Recurse down nested response structures
    for (const key in obj) {
      if (typeof obj[key] === 'object') {
        scrubAdData(obj[key]);
      }
    }
    return obj;
  };

  // 1. Intercept window.ytInitialPlayerResponse
  let rawPlayerResponse = window.ytInitialPlayerResponse;
  Object.defineProperty(window, 'ytInitialPlayerResponse', {
    get: () => rawPlayerResponse,
    set: (val) => {
      rawPlayerResponse = scrubAdData(val);
    },
    configurable: true
  });

  // 2. Intercept fetch API calls to /youtubei/v1/player and /youtubei/v1/next
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    if (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/next') || url.includes('/youtubei/v1/getGuide') || url.includes('/youtubei/v1/browse')) {
      const clone = response.clone();
      try {
        const data = await clone.json();
        const cleanData = scrubAdData(data);
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
    this._isYouTubeAPI = url && (
      url.includes('/youtubei/v1/player') ||
      url.includes('/youtubei/v1/next') ||
      url.includes('/youtubei/v1/getGuide') ||
      url.includes('/youtubei/v1/browse')
    );
    return originalXHROpen.apply(this, arguments);
  };

  window.XMLHttpRequest.prototype.send = function(body) {
    if (this._isYouTubeAPI) {
      const originalOnReadyStateChange = this.onreadystatechange;
      this.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200) {
          try {
            const json = JSON.parse(this.responseText);
            const cleaned = scrubAdData(json);
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

  console.log('[AeroGuard] YouTube payload sanitizer active');
})();