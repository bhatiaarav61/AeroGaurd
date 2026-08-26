(function () {
  'use strict';

  // ============================================
  // AD_URL_PATTERNS - 100+ patterns for ad/tracking blocking
  // ============================================
  const AD_URL_PATTERNS = [
    // Core ad endpoints
    /^https?:\/\/[^/]*\.doubleclick\.net\//i,
    /^https?:\/\/[^/]*\.googlesyndication\.com\//i,
    /^https?:\/\/[^/]*\.googleadservices\.com\//i,
    /^https?:\/\/[^/]*\.googletagservices\.com\//i,
    /^https?:\/\/[^/]*\.admob\.com\//i,
    /^https?:\/\/[^/]*\.adsense\.com\//i,
    /^https?:\/\/[^/]*\.adwords\.com\//i,
    /^https?:\/\/[^/]*\.admanager\.com\//i,
    /^https?:\/\/[^/]*\.adsrvr\.org\//i,
    /^https?:\/\/[^/]*\.adnxs\.com\//i,
    /^https?:\/\/[^/]*\.rubiconproject\.com\//i,
    /^https?:\/\/[^/]*\.openx\.net\//i,
    /^https?:\/\/[^/]*\.pubmatic\.com\//i,
    /^https?:\/\/[^/]*\.criteo\.com\//i,
    /^https?:\/\/[^/]*\.appnexus\.com\//i,
    /^https?:\/\/[^/]*\.amazon-adsystem\.com\//i,
    /^https?:\/\/[^/]*\.amazon\.com\/ads\//i,
    /^https?:\/\/[^/]*\.amazon\.com\/gp\/a2s\//i,
    /^https?:\/\/[^/]*\.facebook\.com\/tr\//i,
    /^https?:\/\/[^/]*\.facebook\.com\/ajax\/ad\//i,
    /^https?:\/\/[^/]*\.facebook\.com\/ads\//i,
    /^https?:\/\/[^/]*\.fbcdn\.net\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.instagram\.com\/ads\//i,
    /^https?:\/\/[^/]*\.t\.co\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.twitter\.com\/i\/ads\//i,
    /^https?:\/\/[^/]*\.ads\.twitter\.com\//i,
    /^https?:\/\/[^/]*\.analytics\.twitter\.com\//i,
    /^https?:\/\/[^/]*\.scorecardresearch\.com\//i,
    /^https?:\/\/[^/]*\.quantserve\.com\//i,
    /^https?:\/\/[^/]*\.moatads\.com\//i,
    /^https?:\/\/[^/]*\.imrworldwide\.com\//i,
    /^https?:\/\/[^/]*\.nielsen\.com\//i,
    /^https?:\/\/[^/]*\.comscore\.com\//i,

    // Google ad domains
    /^https?:\/\/[^/]*\.googleadservices\.com\//i,
    /^https?:\/\/[^/]*\.googletagmanager\.com\//i,
    /^https?:\/\/[^/]*\.googletagservices\.com\//i,
    /^https?:\/\/[^/]*\.google-analytics\.com\//i,
    /^https?:\/\/[^/]*\.google\.com\/ads\//i,
    /^https?:\/\/[^/]*\.google\.com\/pagead\//i,
    /^https?:\/\/[^/]*\.google\.com\/adsense\//i,
    /^https?:\/\/[^/]*\.google\.com\/doubleclick\//i,
    /^https?:\/\/[^/]*\.google\.com\/ad\//i,
    /^https?:\/\/[^/]*\.googlesyndication\.com\//i,
    /^https?:\/\/[^/]*\.g\.doubleclick\.net\//i,
    /^https?:\/\/[^/]*\.googleusercontent\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.ggpht\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.googleapis\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.googleusercontent\.com\/.*\/ad\//i,

    // IMA SDK (Interactive Media Ads)
    /^https?:\/\/[^/]*\.imasdk\.googleapis\.com\//i,
    /^https?:\/\/[^/]*\.ima\.googlevideo\.com\//i,
    /^https?:\/\/[^/]*\.imasdk\.com\//i,
    /^https?:\/\/[^/]*\.google\.com\/ima\//i,
    /^https?:\/\/[^/]*\.googlevideo\.com\/.*\/ima\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/.*\/ima\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/api\/ima\//i,
    /^https?:\/\/[^/]*\.doubleclick\.net\/.*\/ima\//i,
    /^https?:\/\/[^/]*\.pubads\.g\.doubleclick\.net\//i,
    /^https?:\/\/[^/]*\.pagead2\.googlesyndication\.com\/.*\/ima\//i,

    // YouTube ad subdomains & endpoints
    /^https?:\/\/[^/]*\.youtube\.com\/api\/stats\/ads\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/api\/stats\/qoe\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/api\/stats\/playback\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/api\/stats\/watchtime\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/pagead\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/ad\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/ads\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/embed\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/get_video_info.*ad\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/ptracking\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/ptracking2\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/gen_204.*ad\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/gen_204.*ima\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/log_event.*ad\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/api\/stats\/ads\//i,
    /^https?:\/\/[^/]*\.googlevideo\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.googlevideo\.com\/.*\/ad\//i,
    /^https?:\/\/[^/]*\.googlevideo\.com\/videoplayback.*ad\//i,
    /^https?:\/\/[^/]*\.googlevideo\.com\/videoplayback.*ima\//i,
    /^https?:\/\/[^/]*\.ytimg\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.yt3\.ggpht\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.youtube-nocookie\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/.*\/ima\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/.*\/playback\//i,

    // YouTube 2024 ad patterns
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/browse\/.*ad\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/next\/.*ad\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/player\/.*ad\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/get_ad\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/ad_\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/fetch_ad\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/ads\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/ad_metadata\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/ad_playback\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/ad_signals\//i,

    // Tracking & analytics endpoints
    /^https?:\/\/[^/]*\.google-analytics\.com\/collect/i,
    /^https?:\/\/[^/]*\.google-analytics\.com\/j\/collect/i,
    /^https?:\/\/[^/]*\.google-analytics\.com\/r\/collect/i,
    /^https?:\/\/[^/]*\.google-analytics\.com\/mp\/collect/i,
    /^https?:\/\/[^/]*\.googletagmanager\.com\/gtm\.js/i,
    /^https?:\/\/[^/]*\.googletagmanager\.com\/gtag\.js/i,
    /^https?:\/\/[^/]*\.googletagmanager\.com\/gtm\.gif/i,
    /^https?:\/\/[^/]*\.doubleclick\.net\/activity/i,
    /^https?:\/\/[^/]*\.doubleclick\.net\/ad\//i,
    /^https?:\/\/[^/]*\.doubleclick\.net\/ddm\//i,
    /^https?:\/\/[^/]*\.doubleclick\.net\/fls\//i,
    /^https?:\/\/[^/]*\.doubleclick\.net\/pfadx\//i,
    /^https?:\/\/[^/]*\.doubleclick\.net\/survey\//i,
    /^https?:\/\/[^/]*\.google\.com\/ads\/measurement\//i,
    /^https?:\/\/[^/]*\.google\.com\/pagead\/conversion\//i,
    /^https?:\/\/[^/]*\.google\.com\/pagead\/landing\//i,
    /^https?:\/\/[^/]*\.google\.com\/pagead\/viewthroughconversion\//i,
    /^https?:\/\/[^/]*\.googleadservices\.com\/pagead\/conversion\//i,
    /^https?:\/\/[^/]*\.facebook\.com\/tr\//i,
    /^https?:\/\/[^/]*\.connect\.facebook\.net\/.*\/fbevents\.js/i,
    /^https?:\/\/[^/]*\.fbcdn\.net\/.*\/fbevents\.js/i,
    /^https?:\/\/[^/]*\.linkedin\.com\/px\/.*\/track/i,
    /^https?:\/\/[^/]*\.linkedin\.com\/px\/.*\/collect/i,
    /^https?:\/\/[^/]*\.twitter\.com\/i\/adsct/i,
    /^https?:\/\/[^/]*\.analytics\.tiktok\.com\//i,
    /^https?:\/\/[^/]*\.business\.tiktok\.com\//i,
    /^https?:\/\/[^/]*\.ads\.tiktok\.com\//i,
    /^https?:\/\/[^/]*\.pinterest\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.pinimg\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.snapchat\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.ads\.snapchat\.com\//i,

    // Additional 2024 patterns
    /^https?:\/\/[^/]*\.gvt1\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.gvt2\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.gvt3\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.metric\.gstatic\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.play\.google\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.play\.google\.com\/.*\/ima\//i,
    /^https?:\/\/[^/]*\.android\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.googleusercontent\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.ggpht\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.lh3\.googleusercontent\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.lh4\.googleusercontent\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.lh5\.googleusercontent\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.lh6\.googleusercontent\.com\/.*\/ads\//i,

    // Additional tracking domains
    /^https?:\/\/[^/]*\.adform\.net\//i,
    /^https?:\/\/[^/]*\.adform\.com\//i,
    /^https?:\/\/[^/]*\.adtech\.de\//i,
    /^https?:\/\/[^/]*\.adtech\.com\//i,
    /^https?:\/\/[^/]*\.advertising\.com\//i,
    /^https?:\/\/[^/]*\.atdmt\.com\//i,
    /^https?:\/\/[^/]*\.atwola\.com\//i,
    /^https?:\/\/[^/]*\.bidtheatre\.com\//i,
    /^https?:\/\/[^/]*\.bidvertiser\.com\//i,
    /^https?:\/\/[^/]*\.casalemedia\.com\//i,
    /^https?:\/\/[^/]*\.contextweb\.com\//i,
    /^https?:\/\/[^/]*\.demdex\.net\//i,
    /^https?:\/\/[^/]*\.dotomi\.com\//i,
    /^https?:\/\/[^/]*\.exelator\.com\//i,
    /^https?:\/\/[^/]*\.eyeota\.net\//i,
    /^https?:\/\/[^/]*\.lijit\.com\//i,
    /^https?:\/\/[^/]*\.mathtag\.com\//i,
    /^https?:\/\/[^/]*\.media\.net\//i,
    /^https?:\/\/[^/]*\.mediavine\.com\//i,
    /^https?:\/\/[^/]*\.moatads\.com\//i,
    /^https?:\/\/[^/]*\.navegg\.com\//i,
    /^https?:\/\/[^/]*\.nexac\.com\//i,
    /^https?:\/\/[^/]*\.openx\.net\//i,
    /^https?:\/\/[^/]*\.outbrain\.com\//i,
    /^https?:\/\/[^/]*\.owneriq\.com\//i,
    /^https?:\/\/[^/]*\.pubmatic\.com\//i,
    /^https?:\/\/[^/]*\.quantserve\.com\//i,
    /^https?:\/\/[^/]*\.rfihub\.com\//i,
    /^https?:\/\/[^/]*\.rubiconproject\.com\//i,
    /^https?:\/\/[^/]*\.scorecardresearch\.com\//i,
    /^https?:\/\/[^/]*\.semasio\.net\//i,
    /^https?:\/\/[^/]*\.sharethrough\.com\//i,
    /^https?:\/\/[^/]*\.sonobi\.com\//i,
    /^https?:\/\/[^/]*\.specificmedia\.com\//i,
    /^https?:\/\/[^/]*\.taboola\.com\//i,
    /^https?:\/\/[^/]*\.tapad\.com\//i,
    /^https?:\/\/[^/]*\.teads\.tv\//i,
    /^https?:\/\/[^/]*\.triplelift\.com\//i,
    /^https?:\/\/[^/]*\.turn\.com\//i,
    /^https?:\/\/[^/]*\.yieldmo\.com\//i,
    /^https?:\/\/[^/]*\.zemanta\.com\//i,
    /^https?:\/\/[^/]*\.zedo\.com\//i,

    // Additional Google domains
    /^https?:\/\/[^/]*\.googlesyndication\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.googlesyndication\.com\/.*\/ima\//i,
    /^https?:\/\/[^/]*\.googleadservices\.com\/.*\/ima\//i,
    /^https?:\/\/[^/]*\.doubleclick\.net\/.*\/ima\//i,
    /^https?:\/\/[^/]*\.google-analytics\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.googletagmanager\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.googletagservices\.com\/.*\/ima\//i,

    // YouTube specific 2024 patterns
    /^https?:\/\/[^/]*\.youtube\.com\/api\/stats\/ads\/playback\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/api\/stats\/ads\/qoe\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/api\/stats\/ads\/engagement\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/ad\/.*/i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/ad_break\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/ad_pod\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/ad_slot\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/ad_format\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/ad_creative\//i,
    /^https?:\/\/[^/]*\.youtube\.com\/youtubei\/v1\/ad_targeting\//i,

    // IMA SDK 2024 patterns
    /^https?:\/\/[^/]*\.imasdk\.googleapis\.com\/.*\/v4\//i,
    /^https?:\/\/[^/]*\.imasdk\.googleapis\.com\/.*\/v3\//i,
    /^https?:\/\/[^/]*\.imasdk\.googleapis\.com\/.*\/js\//i,
    /^https?:\/\/[^/]*\.imasdk\.googleapis\.com\/.*\/sdk\//i,
    /^https?:\/\/[^/]*\.imasdk\.googleapis\.com\/.*\/loader\//i,
    /^https?:\/\/[^/]*\.imasdk\.googleapis\.com\/.*\/core\//i,
    /^https?:\/\/[^/]*\.imasdk\.googleapis\.com\/.*\/html5\//i,
    /^https?:\/\/[^/]*\.imasdk\.googleapis\.com\/.*\/video_client\//i,
    /^https?:\/\/[^/]*\.imasdk\.googleapis\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.imasdk\.googleapis\.com\/.*\/ad_tag\//i,

    // Additional ad tech
    /^https?:\/\/[^/]*\.adobedtm\.com\//i,
    /^https?:\/\/[^/]*\.demdex\.net\/.*\/event\//i,
    /^https?:\/\/[^/]*\.demdex\.net\/.*\/dest5\//i,
    /^https?:\/\/[^/]*\.everesttech\.net\//i,
    /^https?:\/\/[^/]*\.everestjs\.net\//i,
    /^https?:\/\/[^/]*\.adobe\.com\/.*\/ads\//i,
    /^https?:\/\/[^/]*\.adobe\.com\/.*\/analytics\//i,
    /^https?:\/\/[^/]*\.omtrdc\.net\//i,
    /^https?:\/\/[^/]*\.2o7\.net\//i,
    /^https?:\/\/[^/]*\.hitbox\.com\//i,
    /^https?:\/\/[^/]*\.webtrends\.com\//i,
    /^https?:\/\/[^/]*\.coremetrics\.com\//i,
  ];

  // ============================================
  // isAdUrl - Check if URL matches ad patterns
  // ============================================
  function isAdUrl(url) {
    try {
      if (!url || typeof url !== 'string') {
        return false;
      }
      for (const pattern of AD_URL_PATTERNS) {
        if (pattern.test(url)) {
          return true;
        }
      }
      return false;
    } catch (e) {
      // Fail open - don't block on error
      return false;
    }
  }

  // ============================================
  // Utility: Safe logging
  // ============================================
  function safeLog(...args) {
    try {
      console.log('[AeroGuard:youtube-network]', ...args);
    } catch (e) {
      // Ignore logging errors
    }
  }

  function safeWarn(...args) {
    try {
      console.warn('[AeroGuard:youtube-network]', ...args);
    } catch (e) {
      // Ignore logging errors
    }
  }

  // ============================================
  // Override fetch
  // ============================================
  try {
    const originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        const url = typeof input === 'string' ? input : input?.url;
        if (url && isAdUrl(url)) {
          safeLog('Blocked fetch:', url);
          return Promise.reject(new Error('Blocked by AeroGuard: ad/tracking URL'));
        }
      } catch (e) {
        // Fail open - don't block on error
        safeWarn('Fetch override error:', e);
      }
      return originalFetch(input, init);
    };
    safeLog('fetch override installed');
  } catch (e) {
    safeWarn('Failed to install fetch override:', e);
  }

  // ============================================
  // Override XMLHttpRequest.open & send
  // ============================================
  try {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...args) {
      try {
        this._aeroguard_url = url;
        if (url && isAdUrl(url)) {
          this._aeroguard_blocked = true;
          safeLog('Blocked XHR open:', url);
        }
      } catch (e) {
        safeWarn('XHR open override error:', e);
      }
      return originalOpen.call(this, method, url, ...args);
    };

    XMLHttpRequest.prototype.send = function (body) {
      try {
        if (this._aeroguard_blocked) {
          safeLog('Blocked XHR send:', this._aeroguard_url);
          // Simulate network error
          setTimeout(() => {
            if (this.onerror) this.onerror(new Error('Blocked by AeroGuard'));
            if (this.onloadend) this.onloadend(new Error('Blocked by AeroGuard'));
          }, 0);
          return;
        }
      } catch (e) {
        safeWarn('XHR send override error:', e);
      }
      return originalSend.call(this, body);
    };
    safeLog('XMLHttpRequest override installed');
  } catch (e) {
    safeWarn('Failed to install XMLHttpRequest override:', e);
  }

  // ============================================
  // Override navigator.sendBeacon
  // ============================================
  try {
    if (navigator.sendBeacon) {
      const originalSendBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (url, data) {
        try {
          if (url && isAdUrl(url)) {
            safeLog('Blocked sendBeacon:', url);
            return false;
          }
        } catch (e) {
          safeWarn('sendBeacon override error:', e);
        }
        return originalSendBeacon(url, data);
      };
      safeLog('navigator.sendBeacon override installed');
    }
  } catch (e) {
    safeWarn('Failed to install sendBeacon override:', e);
  }

  // ============================================
  // Override EventSource
  // ============================================
  try {
    if (window.EventSource) {
      const OriginalEventSource = window.EventSource;
      window.EventSource = function (url, eventSourceInitDict) {
        try {
          if (url && isAdUrl(url)) {
            safeLog('Blocked EventSource:', url);
            throw new Error('Blocked by AeroGuard: ad/tracking EventSource');
          }
        } catch (e) {
          safeWarn('EventSource override error:', e);
        }
        return new OriginalEventSource(url, eventSourceInitDict);
      };
      window.EventSource.prototype = OriginalEventSource.prototype;
      window.EventSource.CONNECTING = OriginalEventSource.CONNECTING;
      window.EventSource.OPEN = OriginalEventSource.OPEN;
      window.EventSource.CLOSED = OriginalEventSource.CLOSED;
      safeLog('EventSource override installed');
    }
  } catch (e) {
    safeWarn('Failed to install EventSource override:', e);
  }

  // ============================================
  // Log activation
  // ============================================
  safeLog('AeroGuard YouTube Network Scriptlet activated');
  safeLog('Patterns loaded:', AD_URL_PATTERNS.length);
})();