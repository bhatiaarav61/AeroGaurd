// youtube-engine.js — YouTube-Specific Engine
export class YouTubeEngine {
  constructor() {
    this.mode = 'aggressive';
    this.scriptlets = new Map();
    this.nextId = 80000;
  }

  async initialize(mode = 'aggressive') {
    this.mode = mode;
    this.loadScriptlets();
  }

  loadScriptlets() {
    // Scriptlet 1: Network blocking
    this.scriptlets.set('yt-network', `
      (() => {
        'use strict';
        const BLOCK = [
          '/api/stats/ads', '/api/stats/qoe', '/ptracking', '/pagead/',
          '/get_video_info\\?.*adformat=', '/get_video_info\\?.*ad_type=',
          '/get_video_info\\?.*ad3_module=', '/get_video_info\\?.*afv_',
          '/get_video_info\\?.*vmap=', '/get_video_info\\?.*ad_tag=',
          '/get_video_info\\?.*ad_url=', '/annotations_invideo',
          'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
          'googletagmanager.com', 'googletagservices.com', 'pagead2.googlesyndication.com',
          'pubads.g.doubleclick.net', 'securepubads.g.doubleclick.net',
          'adservice.google.com', 'imasdk.googleapis.com', 'imasdk.s3.amazonaws.com',
          'ads.youtube.com', 'advertising.youtube.com', 'googleads.g.doubleclick.net'
        ];

        const isBlocked = url => BLOCK.some(p => url.includes(p) || (p.includes('\\\\?') && new RegExp(p).test(url)));

        const origFetch = window.fetch;
        window.fetch = function(...a) { const u = a[0]; if (typeof u === 'string' && isBlocked(u)) return Promise.reject(new Error('Blocked')); return origFetch.apply(this, a); };

        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(m, u, ...a) { if (typeof u === 'string' && isBlocked(u)) { this._blocked = true; this.abort(); return; } return origOpen.apply(this, [m, u, ...a]); };
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(...a) { if (this._blocked) return; return origSend.apply(this, a); };

        const origBeacon = navigator.sendBeacon;
        navigator.sendBeacon = function(u, d) { if (typeof u === 'string' && isBlocked(u)) return false; return origBeacon(u, d); };

        console.log('[YT] Network scriptlet active');
      })();
    `);

    // Scriptlet 2: Player patching
    this.scriptlets.set('yt-player', `
      (() => {
        'use strict';

        // Clean ytInitialData
        const clean = data => {
          if (!data) return;
          const walk = obj => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.renderer) {
              const keys = Object.keys(obj.renderer);
              keys.filter(k => /ad|promo|sponsor|sparkles|mealbar|merch|shopping/i.test(k)).forEach(k => delete obj.renderer[k]);
            }
            for (const v of Object.values(obj)) {
              if (Array.isArray(v)) {
                const filtered = v.filter(i => !i?.renderer || !Object.keys(i.renderer).some(k => /ad|promo|sponsor|sparkles|mealbar|merch|shopping/i.test(k)));
                if (filtered.length !== v.length) Object.assign(v, filtered);
                v.forEach(walk);
              } else if (v && typeof v === 'object') walk(v);
            }
          };
          walk(data);
        };

        if (window.ytInitialData) clean(window.ytInitialData);
        Object.defineProperty(window, 'ytInitialData', {
          configurable: true, get: () => window._ytData, set: v => { window._ytData = v; if (v) clean(v); }
        });

        // Intercept player response
        const origFetch = window.fetch;
        window.fetch = async function(...a) {
          const r = await origFetch.apply(this, a);
          const u = a[0];
          if (typeof u === 'string' && u.includes('/youtubei/v1/player')) {
            const c = r.clone();
            try {
              const d = await c.json();
              if (d?.playabilityStatus) { delete d.playabilityStatus.adSignalsInfo; delete d.playabilityStatus.adsPresentation; delete d.playabilityStatus.adPlacements; }
              if (d?.playerConfig) { delete d.playerConfig.adConfig; delete d.playerConfig.adPlacements; }
              if (d?.videoDetails) { delete d.videoDetails.allowAds; delete d.videoDetails.adTagUrl; delete d.videoDetails.adTagUrlSet; }
              if (d?.streamingData?.adaptiveFormats) {
                d.streamingData.adaptiveFormats = d.streamingData.adaptiveFormats.filter(f => !f.url?.includes('/api/manifest/') && !f.mimeType?.includes('application/vnd.apple.mpegurl'));
              }
              return new Response(JSON.stringify(d), { status: r.status, headers: r.headers });
            } catch { return r; }
          }
          return r;
        };

        // Hide ad components
        ['ytd-ad-slot-renderer','ytd-display-ad-renderer','ytd-promoted-video-renderer','ytd-promoted-sparkles-web-renderer','ytd-action-companion-ad-renderer','ytd-in-feed-ad-renderer','ytd-banner-ad-renderer','ytd-companion-slot-renderer','ytd-mealbar-promo-renderer','ytd-merch-shelf-renderer','ytd-shopping-renderer','ytd-masthead-ad-renderer'].forEach(tag => {
          const c = customElements.get(tag);
          if (c) {
            const p = c.prototype, o = p.connectedCallback;
            p.connectedCallback = function() { if (o) o.call(this); this.style.display = 'none'; this.innerHTML = ''; };
          }
        });

        // Periodic DOM hiding (safe selectors only)
        const SAFE = ['.ytp-ad-player-overlay','.ytp-ad-overlay-container','.ytp-ad-overlay-slot','.ytp-ad-text-overlay','.ytp-ad-image-overlay','.ytp-ad-branding-overlay','.ytp-ad-companion-slot','.ytp-ad-banner-slot','.ytp-ad-skip-button-container','.ytp-ad-preview-container','.ytp-ad-preview-slot','.ytp-ad-progress-bar-container','.ytp-ad-progress-bar','.ytp-ad-duration-remaining','.ytp-ad-button-container','.ytp-ad-button','.ytp-ad-cta-button','.ytp-ad-visit-advertiser-button','.ytp-ad-learn-more-button','.ytp-ad-feedback-button','.ytp-ad-info-button','.ytp-ad-cancel-button'];
        const hide = () => SAFE.forEach(s => document.querySelectorAll(s).forEach(e => { if (!e._blocked) { e._blocked = true; e.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;contain:layout size style paint!important'; } }));
        hide(); setInterval(hide, 500);

        console.log('[YT] Player scriptlet active');
      })();
    `);

    // Scriptlet 3: IMA SDK blocking
    this.scriptlets.set('yt-ima', `
      (() => {
        'use strict';
        const o = document.createElement;
        document.createElement = function(t, o) {
          const e = o.call(this, t, o);
          if (t.toLowerCase() === 'script' && e.src && (e.src.includes('imasdk') || e.src.includes('googleads') || e.src.includes('doubleclick.net/imasdk') || e.src.includes('pubads.g.doubleclick.net/imasdk'))) {
            console.log('[YT] Blocked IMA:', e.src);
            return document.createComment('Blocked IMA');
          }
          return e;
        };
        if (!window._origGoogle) window._origGoogle = window.google;
        Object.defineProperty(window, 'google', {
          configurable: true,
          get: () => new Proxy(window._origGoogle || {}, {
            get: (t, p) => p === 'ima' ? (console.log('[YT] Blocked google.ima'), undefined) : t[p],
            has: (t, p) => p !== 'ima' && p in t,
            ownKeys: t => Object.keys(t).filter(k => k !== 'ima')
          }),
          set: v => { window._origGoogle = v; return true; }
        });
        console.log('[YT] IMA scriptlet active');
      })();
    `);

    // Scriptlet 4: Emergency unblock
    this.scriptlets.set('yt-unblock', `
      (() => {
        'use strict';
        const ALLOW = ['video.html5-main-video','video#movie_player','#movie_player','.html5-video-player','.html5-video-container','.ytp-chrome-bottom','.ytp-chrome-top','.ytp-play-button','.ytp-progress-bar','.ytp-volume-panel','.ytp-fullscreen-button','.ytp-settings-button'];
        const unblock = () => ALLOW.forEach(s => document.querySelectorAll(s).forEach(e => { e.style.cssText = ''; e.removeAttribute('data-adblocked'); e.style.display=''; e.style.visibility=''; e.style.opacity=''; e.style.pointerEvents=''; }));
        unblock(); setInterval(unblock, 500);
        console.log('[YT] Unblock scriptlet active');
      })();
    `);
  }

  async handleNavigation(tabId, url, frameId) {
    if (this.mode === 'off') return;

    try {
      if (this.mode === 'basic' || this.mode === 'standard' || this.mode === 'aggressive') {
        await this.injectScriptlet(tabId, 'yt-network', frameId);
        await this.injectScriptlet(tabId, 'yt-player', frameId);
        await this.injectScriptlet(tabId, 'yt-unblock', frameId);
      }
      if (this.mode === 'aggressive') {
        await this.injectScriptlet(tabId, 'yt-ima', frameId);
      }
    } catch (e) { console.debug('Scriptlet inject failed:', e.message); }
  }

  async injectScriptlet(tabId, name, frameId = 0) {
    const code = this.scriptlets.get(name);
    if (!code) return;

    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        func: (code, name) => {
          if (window.__aeroguardScriptlets?.executeScriptlet) {
            return window.__aeroguardScriptlets.executeScriptlet(code, { name });
          }
          return new Function(code)();
        },
        args: [code, name],
        world: 'MAIN'
      });
    } catch (e) {
      // Fallback
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        func: new Function(code),
        world: 'MAIN'
      });
    }
  }

  getDNRRules(startId = 80000) {
    const rules = [];
    let id = startId;
    const ytDomains = ['youtube.com', 'youtube-nocookie.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'tv.youtube.com', 'youtubeeducation.com', 'youtubekids.com'];

    // ========== ALLOW RULES (Priority 2) — CRITICAL FOR PLAYBACK ==========
    const allows = [
      // Video streams
      { url: '||googlevideo.com/videoplayback*', types: ['media'] },
      { url: '||*.googlevideo.com/*', types: ['media'] },

      // Player JavaScript
      { url: '||s.ytimg.com/yts/jsbin/player-*', types: ['script'] },
      { url: '||s.ytimg.com/yts/jsbin/www-embed-player*', types: ['script'] },
      { url: '||s.ytimg.com/yts/jsbin/player-*-en_US.js', types: ['script'] },
      { url: '||s.ytimg.com/yts/jsbin/desktop-*-en_US.js', types: ['script'] },

      // Thumbnails
      { url: '||i.ytimg.com/*', types: ['image'] },
      { url: '||yt3.ggpht.com/*', types: ['image'] },
      { url: '||yt3.googleusercontent.com/*', types: ['image'] },
      { url: '||s.ytimg.com/yts/img/*', types: ['image'] },

      // Captions
      { url: '||youtube.com/api/timedtext*', types: ['xmlhttprequest', 'fetch'] },

      // Player config & API
      { url: '||youtube.com/youtubei/v1/player*', types: ['xmlhttprequest', 'fetch'] },
      { url: '||youtube.com/youtubei/v1/browse*', types: ['xmlhttprequest', 'fetch'] },
      { url: '||youtube.com/youtubei/v1/next*', types: ['xmlhttprequest', 'fetch'] },
      { url: '||youtube.com/youtubei/v1/search*', types: ['xmlhttprequest', 'fetch'] },
      { url: '||youtube.com/youtubei/v1/guide*', types: ['xmlhttprequest', 'fetch'] },

      // Live chat & comments
      { url: '||youtube.com/youtubei/v1/live_chat*', types: ['xmlhttprequest', 'fetch'] },
      { url: '||youtube.com/youtubei/v1/comment*', types: ['xmlhttprequest', 'fetch'] },
      { url: '||youtube.com/youtubei/v1/live_chat/get_live_chat*', types: ['xmlhttprequest', 'fetch'] },

      // Embeds & TV
      { url: '||youtube.com/embed/*', types: ['sub_frame', 'xmlhttprequest', 'fetch'] },
      { url: '||youtube-nocookie.com/embed/*', types: ['sub_frame', 'xmlhttprequest', 'fetch'] },
      { url: '||tv.youtube.com/*', types: ['xmlhttprequest', 'fetch', 'subdocument'] },
      { url: '||music.youtube.com/*', types: ['xmlhttprequest', 'fetch', 'subdocument'] },

      // Shorts
      { url: '||youtube.com/shorts/*', types: ['xmlhttprequest', 'fetch', 'subdocument'] },
      { url: '||youtube.com/youtubei/v1/shorts*', types: ['xmlhttprequest', 'fetch'] },

      // Auth
      { url: '||youtube.com/youtubei/v1/account*', types: ['xmlhttprequest', 'fetch'] },
      { url: '||youtube.com/youtubei/v1/subscription*', types: ['xmlhttprequest', 'fetch'] },

      // Logging
      { url: '||youtube.com/api/stats/watchtime*', types: ['xmlhttprequest', 'fetch'] },
      { url: '||youtube.com/api/stats/heartbeat*', types: ['xmlhttprequest', 'fetch'] },
      { url: '||youtube.com/api/stats/qoe*', types: ['xmlhttprequest', 'fetch'] }
    ];

    for (const a of allows) {
      rules.push({ id: id++, priority: 2, action: { type: 'allow' }, condition: { urlFilter: a.url, resourceTypes: a.types, initiatorDomains: ytDomains } });
    }

    // ========== BLOCK RULES (Priority 1) ==========
    const blocks = [
      // Pre/mid/post-roll
      '||youtube.com/api/stats/ads*', '||youtube.com/api/stats/qoe*', '||youtube.com/ptracking*',
      '||youtube.com/pagead/*', '||youtube.com/get_video_info*&adformat=*', '||youtube.com/get_video_info*&ad_type=*',
      '||youtube.com/get_video_info*&ad3_module=*', '||youtube.com/get_video_info*&afv_*',
      '||youtube.com/get_video_info*&vmap=*', '||youtube.com/get_video_info*&ad_tag=*',
      '||youtube.com/get_video_info*&ad_url=*', '||youtube.com/get_video_info*&ad_break=*',
      '||youtube.com/get_video_info*&ad_slot=*', '||youtube.com/get_video_info*&ad_pod=*',
      '||youtube.com/annotations_invideo*', '||youtube.com/api/stats/watchtime*&ad*',

      // VMAP/VAST
      '||youtube.com/api/manifest/*&ad*', '||youtube.com/api/manifest/dash/*&ad*',
      '||youtube.com/api/manifest/hls/*&ad*', '||manifest.googlevideo.com/api/manifest/*&ad*',
      '||manifest.googlevideo.com/api/manifest/dash/*&ad*',

      // Google ad networks
      '||doubleclick.net/*', '||googlesyndication.com/*', '||googleadservices.com/*',
      '||googletagmanager.com/*', '||googletagservices.com/*', '||pagead2.googlesyndication.com/*',
      '||pubads.g.doubleclick.net/*', '||securepubads.g.doubleclick.net/*', '||adservice.google.com/*',
      '||adservice.google.de/*', '||adservice.google.fr/*', '||adservice.google.co.uk/*',
      '||adservice.google.ca/*', '||adservice.google.au/*',

      // IMA SDK
      '||imasdk.googleapis.com/*', '||imasdk.s3.amazonaws.com/*', '||www.gstatic.com/imasdk/*', '||cdn.jsdelivr.net/npm/google-ima*',

      // YouTube ad player JS
      '||s.ytimg.com/yts/jsbin/player-*ad*', '||s.ytimg.com/yts/jsbin/*ima*', '||s.ytimg.com/yts/jsbin/*ads*',
      '||s.ytimg.com/yts/jsbin/*ad3*', '||s.ytimg.com/yts/jsbin/*afv*', '||s.ytimg.com/yts/jsbin/*vmap*',
      '||s.ytimg.com/yts/jsbin/ima3*',

      // YouTube ad subdomains
      '||ads.youtube.com/*', '||advertising.youtube.com/*', '||partneradvertising.youtube.com/*',
      '||sponsorships.youtube.com/*', '||paidcontent.youtube.com/*', '||advertiser.youtube.com/*',
      '||ads-pa.googleapis.com/*',

      // Tracking/conversion
      '||googleads.g.doubleclick.net/pagead/viewthroughconversion/*', '||googleads.g.doubleclick.net/pagead/conversion/*',
      '||www.googleadservices.com/pagead/conversion/*', '||googleads.g.doubleclick.net/pagead/conversion_async/*',
      '||doubleclick.net/activity/*', '||fls.doubleclick.net/activityi/*', '||ad.doubleclick.net/activity/*',
      '||googleads4.g.doubleclick.net/pcs/view*', '||googleads4.g.doubleclick.net/pcs/activeview*',

      // Internal ad endpoints (2024-2025)
      '||youtube.com/youtubei/v1/ad*', '||youtube.com/youtubei/v1/ad/get*', '||youtube.com/youtubei/v1/ad/schedule*',
      '||youtube.com/youtubei/v1/ad/click*', '||youtube.com/youtubei/v1/ad/impression*', '||youtube.com/youtubei/v1/ad/complete*',

      // Overlay/companion/banner
      '||youtube.com/api/overlay*', '||youtube.com/api/companion*', '||youtube.com/api/banner*', '||youtube.com/api/instream*',

      // Shorts ads
      '||youtube.com/youtubei/v1/shorts/ad*', '||youtube.com/youtubei/v1/reel/ad*',

      // Live ads
      '||youtube.com/youtubei/v1/live/ad*', '||youtube.com/youtubei/v1/live_chat/ad*',

      // Feed promoted
      '||youtube.com/youtubei/v1/browse*&ad*', '||youtube.com/youtubei/v1/feed/ad*'
    ];

    for (const b of blocks) {
      rules.push({ id: id++, priority: 1, action: { type: 'block' }, condition: { urlFilter: b, resourceTypes: ['xmlhttprequest', 'fetch', 'subdocument', 'image', 'script', 'stylesheet', 'ping', 'media'], initiatorDomains: ytDomains } });
    }

    this.nextId = id;
    return rules;
  }

  setMode(mode) { this.mode = mode; }
}