(function () {
  'use strict';

  const AD_RENDERER_KEYS = [
    'adRenderer',
    'promoRenderer',
    'sponsorRenderer',
    'shoppingRenderer',
    'mealbarRenderer',
    'merchRenderer',
    'sparklesRenderer',
    'actionCompanionRenderer',
    'inFeedRenderer',
    'bannerRenderer',
    'companionSlotRenderer',
  ];

  function cleanYTInitialData(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(cleanYTInitialData).filter(item => item !== null && item !== undefined);
    }

    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isAdRenderer = AD_RENDERER_KEYS.some(adKey => lowerKey.includes(adKey.toLowerCase()));
      if (isAdRenderer) continue;

      if (value && typeof value === 'object') {
        const cleanedValue = cleanYTInitialData(value);
        if (cleanedValue !== null && cleanedValue !== undefined &&
            (!Array.isArray(cleanedValue) || cleanedValue.length > 0) &&
            (typeof cleanedValue !== 'object' || Object.keys(cleanedValue).length > 0)) {
          cleaned[key] = cleanedValue;
        }
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'ytInitialData');
  Object.defineProperty(window, 'ytInitialData', {
    configurable: true,
    enumerable: true,
    get() {
      return originalDescriptor?.get?.call(this);
    },
    set(value) {
      const cleaned = cleanYTInitialData(value);
      if (originalDescriptor?.set) {
        originalDescriptor.set.call(this, cleaned);
      } else {
        Object.defineProperty(window, 'ytInitialData', {
          value: cleaned,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
    },
  });

  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url ?? '';
    if (url.includes('/youtubei/v1/player')) {
      const response = await originalFetch.apply(this, arguments);
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const cloned = response.clone();
        try {
          const data = await cloned.json();
          const cleaned = cleanPlayerResponse(data);
          return new Response(JSON.stringify(cleaned), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        } catch {
          return response;
        }
      }
      return response;
    }
    return originalFetch.apply(this, arguments);
  };

  function cleanPlayerResponse(data) {
    if (!data || typeof data !== 'object') return data;

    const cleaned = JSON.parse(JSON.stringify(data));

    function removeAdFields(obj) {
      if (!obj || typeof obj !== 'object') return obj;

      const adFields = [
        'adSignalsInfo',
        'adsPresentation',
        'adPlacements',
        'adConfig',
        'adBreakConfig',
        'allowAds',
        'adTagUrl',
        'playerAdConfig',
      ];

      for (const field of adFields) {
        if (field in obj) delete obj[field];
      }

      if (obj.adaptiveFormats && Array.isArray(obj.adaptiveFormats)) {
        obj.adaptiveFormats = obj.adaptiveFormats.filter(format => {
          const mimeType = (format.mimeType || '').toLowerCase();
          return !mimeType.includes('ad') && !mimeType.includes('application/dash+xml');
        });
      }

      for (const value of Object.values(obj)) {
        if (value && typeof value === 'object') {
          removeAdFields(value);
        }
      }
      return obj;
    }

    return removeAdFields(cleaned);
  }

  const AD_COMPONENT_TAGS = [
    'ytd-ad-slot-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-action-companion-ad-renderer',
    'ytd-companion-slot-renderer',
    'ytd-display-ad-renderer',
    'ytd-in-feed-ad-renderer',
    'ytd-mealbar-promo-renderer',
    'ytd-merch-shelf-renderer',
    'ytd-promoted-video-renderer',
    'ytd-shopping-renderer',
    'ytd-sponsor-renderer',
    'ytd-ad-banner-renderer',
    'ytd-player-legacy-desktop-watch-ads-renderer',
  ];

  const originalDefine = customElements.define;
  customElements.define = function (name, constructor, options) {
    if (AD_COMPONENT_TAGS.includes(name.toLowerCase())) {
      class NoOpElement extends HTMLElement {
        constructor() {
          super();
          this.style.display = 'none';
          this.style.visibility = 'hidden';
          this.style.opacity = '0';
          this.style.height = '0';
          this.style.width = '0';
          this.style.overflow = 'hidden';
          this.style.position = 'absolute';
          this.style.pointerEvents = 'none';
        }
        connectedCallback() {
          this.remove();
        }
      }
      return originalDefine.call(this, name, NoOpElement, options);
    }
    return originalDefine.call(this, name, constructor, options);
  };

  const HIDE_SELECTORS = [
    'ytd-ad-slot-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-action-companion-ad-renderer',
    'ytd-companion-slot-renderer',
    'ytd-display-ad-renderer',
    'ytd-in-feed-ad-renderer',
    'ytd-mealbar-promo-renderer',
    'ytd-merch-shelf-renderer',
    'ytd-promoted-video-renderer',
    'ytd-shopping-renderer',
    'ytd-sponsor-renderer',
    'ytd-ad-banner-renderer',
    'ytd-player-legacy-desktop-watch-ads-renderer',
    '.ytd-ad-slot-renderer',
    '.ytd-promoted-sparkles-web-renderer',
    '.ytd-action-companion-ad-renderer',
    '.ytd-companion-slot-renderer',
    '.ytd-display-ad-renderer',
    '.ytd-in-feed-ad-renderer',
    '.ytd-mealbar-promo-renderer',
    '.ytd-merch-shelf-renderer',
    '.ytd-promoted-video-renderer',
    '.ytd-shopping-renderer',
    '.ytd-sponsor-renderer',
    '.ytd-ad-banner-renderer',
    '#player-ads',
    '#masthead-ad',
    '.video-ads',
    '.ytp-ad-module',
    '.ytp-ad-player-overlay',
    '.ytp-ad-overlay-container',
    '.ytp-ad-skip-button',
    '.ytp-ad-preview-container',
    '.ytp-ad-preview-slot',
    '.ytp-ad-text',
    '.ytp-ad-button',
    '.ytp-ad-progress',
    '.ytp-ad-progress-list',
    '.ytp-ad-duration-remaining',
    '[data-ad-slot]',
    '[data-ad-client]',
    '[data-ad-format]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googleads"]',
    'iframe[src*="googlesyndication"]',
    'iframe[src*="ad.doubleclick"]',
    'ins.adsbygoogle',
    '.ad-showing',
    '.ad-container',
    '.ad-wrapper',
    'ytd-promoted-video-renderer',
    'ytd-rich-grid-ad-renderer',
    'ytd-video-ad-renderer',
    'ytd-bumper-ad-renderer',
    'ytd-preroll-ad-renderer',
    'ytd-midroll-ad-renderer',
    'ytd-postroll-ad-renderer',
    '.ytp-ad-interstitial-slot',
    '.ytp-ad-overlay-slot',
    '.ytp-ad-companion-slot',
    '[advertising-id]',
    '[data-advertising-id]',
    '.ytp-ad-player-overlay-layout',
    '.ytp-ad-overlay-slot',
    '.ytp-ad-companion-slot',
    '.ytp-ad-skip-button-container',
    '.ytp-ad-info-dialog',
    '.ytp-ad-preview-slot',
    '.ytp-ad-cards-teaser',
    '.ytp-ad-cards-teaser-container',
    '.ytp-ad-cards-teaser-text',
    '.ytp-ad-cards-teaser-icon',
    '.ytp-ad-cards-teaser-button',
    '.ytp-ad-cards-teaser-close',
    '.ytp-ad-cards-teaser-title',
    '.ytp-ad-cards-teaser-description',
    '.ytp-ad-cards-teaser-brand',
    '.ytp-ad-cards-teaser-url',
    '.ytp-ad-cards-teaser-visit',
    '.ytp-ad-cards-teaser-action',
  ];

  function hideAdElements() {
    for (const selector of HIDE_SELECTORS) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (el.style.display !== 'none') {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('opacity', '0', 'important');
            el.style.setProperty('height', '0', 'important');
            el.style.setProperty('width', '0', 'important');
            el.style.setProperty('overflow', 'hidden', 'important');
            el.style.setProperty('position', 'absolute', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
            el.setAttribute('data-aerogaurd-hidden', 'true');
          }
        }
      } catch {
        // Ignore invalid selectors
      }
    }
  }

  let hideInterval;
  function startPeriodicHiding() {
    hideAdElements();
    hideInterval = setInterval(hideAdElements, 500);
  }

  function stopPeriodicHiding() {
    if (hideInterval) {
      clearInterval(hideInterval);
      hideInterval = null;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPeriodicHiding, { once: true });
  } else {
    startPeriodicHiding();
  }

  window.addEventListener('beforeunload', stopPeriodicHiding, { once: true });

  const observer = new MutationObserver(hideAdElements);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'data-ad-slot'],
  });

  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
})();