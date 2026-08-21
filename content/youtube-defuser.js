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
    get: () => sanitizeJSON(rawPlayerResponse),
    set: (val) => { rawPlayerResponse = sanitizeJSON(val); },
    configurable: true
  };

  // 2. Intercept YouTube API fetch calls
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    const response = await originalFetch.apply(this, args);

    if (url && (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/next'))) {
      try {
        const clone = response.clone();
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

  // 3. High-Speed Video Ad Auto-Skipper & Speed-up Engine
  setInterval(() => {
    const video = document.querySelector('video');
    const isAdShowing = document.querySelector('.ad-interrupting, .html5-ad-space, .ytp-ad-player-overlay, .ytp-ad-text');

    if (isAdShowing && video) {
      video.muted = true;
      video.playbackRate = 16.0;
      if (isFinite(video.duration) && video.duration > 0) {
        video.currentTime = video.duration;
      }

      const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
      if (skipBtn) {
        skipBtn.click();
      }
    }

    // Hide residual YouTube banner ads and side overlays
    const adElements = document.querySelectorAll('ytd-ad-slot-renderer, #masthead-ad, ytd-promoted-sparkles-web-renderer');
    adElements.forEach(el => el.remove());
  }, 100);
})();