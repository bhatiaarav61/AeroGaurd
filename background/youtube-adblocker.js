// YouTube Ad Blocker - Three-Tier Architecture
// Implements: Network blocking (DNR), Scriptlet injection (MAIN world), DOM cosmetic filtering

class YouTubeAdBlocker {
  constructor() {
    this.mode = 'aggressive'; // 'basic' | 'standard' | 'aggressive'
    this.scriptlets = new Map();
    this.isInitialized = false;
  }

  async initialize(mode = 'aggressive') {
    this.mode = mode;
    await this.loadScriptlets();
    this.isInitialized = true;
  }

  loadScriptlets() {
    // ========== SCRIPTLET 1: NETWORK REQUEST BLOCKING ==========
    this.scriptlets.set('youtube-network', `
      (function() {
        'use strict';
        const blockedPatterns = [
          '/api/stats/ads', '/api/stats/qoe', '/ptracking', '/pagead/',
          'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
          'googletagmanager.com', 'googletagservices.com', 'pagead2.googlesyndication.com',
          'pubads.g.doubleclick.net', 'securepubads.g.doubleclick.net',
          'adservice.google.com', 'imasdk.googleapis.com', 'imasdk.s3.amazonaws.com',
          '/api/stats/watchtime', '/get_video_info\\?.*adformat=', '/get_video_info\\?.*ad_type=',
          '/get_video_info\\?.*adformat=', '/get_video_info\\?.*ad_type=',
          '/get_video_info\\?.*ad3_module=', '/get_video_info\\?.*afv_',
          '/get_video_info\\?.*vmap=', '/get_video_info\\?.*ad_tag=',
          '/get_video_info\\?.*ad_url=', '/get_video_info\\?.*ad_url=',
          '/annotations_invideo'
        ];

        const isBlocked = (url) => blockedPatterns.some(p => url.includes(p));

        // Fetch interception
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
          const url = args[0];
          if (typeof url === 'string' && isBlocked(url)) {
            return Promise.reject(new Error('AdBlocker Pro: blocked'));
          }
          return originalFetch.apply(this, args);
        };

        // XHR interception
        const originalXHROpen = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function(method, url, ...args) {
          if (typeof url === 'string' && isBlocked(url)) { this._adBlocked = true; this.abort(); return; }
          return originalXHROpen.apply(this, [method, url, ...args]);
        };
        const originalXHRSend = window.XMLHttpRequest.prototype.send;
        window.XMLHttpRequest.prototype.send = function(...args) { if (this._adBlocked) return; return originalXHRSend.apply(this, args); };

        // sendBeacon
        const originalBeacon = navigator.sendBeacon;
        navigator.sendBeacon = function (url, data) {
          if (typeof url === 'string' && isBlocked(url)) return false;
          return originalBeacon(url, data);
        };

        console.log('[AdBlocker Pro] YouTube network blocking installed');
      })();
    `);

    // ========== SCRIPTLET 2: PLAYER PATCHING (Standard/Aggressive) ==========
    this.scriptlets.set('youtube-player', `
      (function() {
        'use strict';

        // Patch ytInitialData to remove ad renderers
        const cleanInitialData = (data) => {
          if (!data || !data.contents) return;
          const process = (node) => {
            if (!node || typeof node !== 'object') return;
            if (node.renderer) {
              const keys = Object.keys(node.renderer);
              const adKeys = keys.filter(k => /^(ad(?![a-z])|ads|ad[A-Z_]|promo|sponsor|shopping|mealbar|merch)/i.test(k));
              adKeys.forEach(k => delete node.renderer[k]);
            }
            for (const key of Object.keys(node)) {
              const val = node[key];
              if (Array.isArray(val)) {
                node[key] = val.filter(item => {
                  if (item?.renderer) {
                    const rk = Object.keys(item.renderer);
                    return !rk.some(k => /^(ad(?![a-z])|ads|ad[A-Z_]|promo|sponsor|shopping|mealbar|merch)/i.test(k));
                  }
                  return true;
                });
                val.forEach(process);
              } else if (val && typeof val === 'object') process(val);
            };
            process(data);
          };

          if (window.ytInitialData) cleanInitialData(window.ytInitialData);
          Object.defineProperty(window, 'ytInitialData', {
            configurable: true,
            get: () => window._ytInitialData,
            set: (v) => { window._ytInitialData = v; if (v) cleanInitialData(v); }
          });

          // Patch player response (fetch interception)
          const origFetch = window.fetch;
          window.fetch = async function(...args) {
            const resp = await origFetch.apply(this, args);
            const url = args[0];
            if (typeof url === 'string' && url.includes('/youtubei/v1/player')) {
              try {
                const text = await resp.clone().text();
                const data = JSON.parse(text);
                if (data?.playabilityStatus) {
                  delete data.playabilityStatus.adSignalsInfo;
                  delete data.playabilityStatus.adsPresentation;
                }
                if (data?.playerConfig) { delete data.playerConfig.adConfig; delete data.playerConfig.adPlacements; }
                if (data?.videoDetails) { delete data.videoDetails.allowAds; delete data.videoDetails.adTagUrl; delete data.videoDetails.adTagUrlSet; }
                // Never touch streamingData/adaptiveFormats: stripping formats
                // or rebuilding the body when nothing changed breaks playback.
                const out = JSON.stringify(data);
                return out === text ? resp : new Response(out, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
              } catch { return resp; }
          }
          return resp;
        };

        // Block ad components via customElements
        const adComponents = [
          'ytd-ad-slot-renderer', 'ytd-display-ad-renderer', 'ytd-promoted-video-renderer',
          'ytd-promoted-sparkles-web-renderer', 'ytd-action-companion-ad-renderer',
          'ytd-in-feed-ad-renderer', 'ytd-banner-ad-renderer', 'ytd-companion-slot-renderer',
          'ytd-mealbar-promo-renderer', 'ytd-merch-shelf-renderer', 'ytd-shopping-renderer'
        ];
        adComponents.forEach(tag => {
          if (customElements.get(tag)) {
            const proto = customElements.get(tag).prototype;
            const orig = proto.connectedCallback;
            proto.connectedCallback = function() { if (orig) orig.call(this); this.style.display = 'none'; this.innerHTML = ''; };
          }
        });

        // DOM ad element hiding — SURGICAL: Only target actual ad UI, NOT the player container
        // YouTube applies .video-ads, .ytp-ad-module, .ytp-ad-player-overlay to the player container
        // when an ad plays — we MUST NOT hide these or the video becomes invisible
        const hideAds = () => {
          document.querySelectorAll([
            // ONLY specific ad overlay child elements — NOT the player container
            '.ytp-ad-overlay-container', '.ytp-ad-overlay-slot',
            '.ytp-ad-text-overlay', '.ytp-ad-image-overlay', '.ytp-ad-branding-overlay',
            '.ytp-ad-companion-slot', '.ytp-ad-banner-slot', '.ytp-ad-skip-button-container',
            '.ytp-ad-preview-container', '.ytp-ad-preview-slot', '.ytp-ad-progress-bar-container',
            '.ytp-ad-progress-bar', '.ytp-ad-duration-remaining', '.ytp-ad-button-container',
            '.ytp-ad-button', '.ytp-ad-cta-button', '.ytp-ad-visit-advertiser-button',
            '.ytp-ad-learn-more-button', '.ytp-ad-feedback-button', '.ytp-ad-info-button',
            '.ytp-ad-cancel-button', '.ytp-ce-covering-overlay', '.ytp-ce-element.ytp-ce-ad',
            '.ytp-ce-video.ytp-ce-ad',
            // Feed/component ads — specific renderers
            'ytd-ad-slot-renderer', 'ytd-display-ad-renderer', 'ytd-promoted-video-renderer',
            'ytd-promoted-sparkles-web-renderer', 'ytd-action-companion-ad-renderer',
            'ytd-in-feed-ad-renderer', 'ytd-banner-ad-renderer', 'ytd-companion-slot-renderer',
            'ytd-mealbar-promo-renderer', 'ytd-merch-shelf-renderer', 'ytd-shopping-renderer',
            '#masthead-ad', '.masthead-ad', 'ytd-masthead-ad-renderer',
            'ytd-promoted-sparkles-text-search-renderer', 'ytd-promoted-video-renderer[is-promoted]',
            // REMOVED: '.ad-container', '.ad-banner', '.ad-slot', '.ad-wrapper' — too broad
            // Iframe ads — specific known ad iframe patterns only
            'iframe[src*="googleads.g.doubleclick.net/pagead/ads"]',
            'iframe[src*="pubads.g.doubleclick.net/gampad/ads"]',
            'iframe[src*="pagead2.googlesyndication.com/pagead/ads"]',
            'iframe[src*="/ads?"]', 'iframe[src*="adformat="]', 'iframe[src*="ad_type="]'
          ].join(',')).forEach(el => {
            if (!el._adBlocked) { el._adBlocked = true; el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-9999!important'; }
          });
        };

        setInterval(hideAds, 1200); hideAds();

        // Video element ad skipping
        const patchVideo = () => {
          const v = document.querySelector('video.html5-main-video, video#movie_player, video');
          if (v && !v._adPatched) {
            v._adPatched = true;
            const origPlay = v.play;
            v.play = function() { if (this._isAd) return Promise.resolve(); return origPlay.apply(this, arguments); };
            const origSrcSet = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src').set;
            Object.defineProperty(v, 'src', {
              set: function(val) { if (val && (val.includes('/api/manifest/') || val.includes('adformat=') || val.includes('ad_type='))) { this._isAd = true; return; } this._isAd = false; return origSrcSet.call(this, val); },
              get: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src').get, configurable: true
            });
            v.addEventListener('loadstart', () => { this._isAd = false; });
            v.addEventListener('timeupdate', () => { if (this._adSegment && this.currentTime >= this._adSegment.start && this.currentTime <= this._adSegment.end) { this.currentTime = this._adSegment.end + 0.1; this._adSegment = null; } });
          }
        };
        const vo = new MutationObserver(patchVideo);
        vo.observe(document.body || document.documentElement, { childList: true, subtree: true }); patchVideo();

        // MutationObserver for dynamic ad injection
        const adObserver = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === 'childList' && m.addedNodes.length) {
              for (const n of m.addedNodes) {
                if (n.nodeType === 1 && (n.matches?.('.video-ads, .ytp-ad-module, .ytp-ad-player-overlay, .ad-interrupting, .html5-ad-space, .ytp-ad-player-overlay, .ytp-ad-module, ytd-ad-slot-renderer') || n.querySelector?.('ytd-ad-slot-renderer, .ytp-ad-module, .video-ads, .ad-showing'))) {
                  if (document.querySelector('.ad-interrupting, .html5-ad-space, .ytp-ad-player-overlay, .ytp-ad-module')) {
                    const video = document.querySelector('video.html5-main-video, video#movie_player, video');
                    if (video) { video.muted = true; video.playbackRate = 16.0; if (isFinite(video.duration) && video.duration > 0) video.currentTime = video.duration - 0.1; }
                    const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
                    if (skipBtn) skipBtn.click();
                  }
                }
              }
            }
          });
        adObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });

        console.log('[AdBlocker Pro] YouTube player patching installed');
      })();
    `);

    // ========== SCRIPTLET 3: IMA SDK BLOCKING (Aggressive only) ==========
    this.scriptlets.set('youtube-ima', `
      (function() {
        'use strict';
        const origCreate = document.createElement;
        document.createElement = function(tag, opts) {
          const el = origCreate.call(this, tag, opts);
          if (tag.toLowerCase() === 'script' && el.src && (el.src.includes('imasdk') || el.src.includes('googleads') || el.src.includes('doubleclick.net') || el.src.includes('pubads.g.doubleclick.net'))) {
            console.log('[AdBlocker Pro] Blocked IMA SDK:', el.src);
            return document.createComment('Blocked IMA SDK');
          }
          return el;
        };

        Object.defineProperty(window, 'google', {
          configurable: true,
          get: () => new Proxy(window._originalGoogle || {}, {
            get: (t, p) => { if (p === 'ima') { console.log('[AdBlocker Pro] Blocked google.ima'); return undefined; } return t[p]; }
          })
        });
        console.log('[AdBlocker Pro] IMA SDK blocking installed');
      })();
    `);

    // ========== SCRIPTLET 4: CONSENT/COOKIE BANNER REMOVAL ==========
    this.scriptlets.set('youtube-consent', `
      (function() {
        'use strict';
        const remove = () => {
          document.querySelectorAll('ytd-consent-bump-v2-lightbox, tp-yt-paper-dialog[ytd-consent-bump-v2-lightbox], #consent-bump, .ytd-consent-bump-v2-lightbox, yt-button-renderer[consent], ytd-button-renderer[consent]').forEach(el => { el.style.display = 'none'; el.remove(); });
          document.body.style.overflow = ''; document.documentElement.style.overflow = '';
        };
        remove(); new MutationObserver(remove).observe(document.body || document.documentElement, { childList: true, subtree: true });
        console.log('[AdBlocker Pro] Consent removal installed');
      })();
    `);

    // ========== SCRIPTLET 5: GENERIC AD NETWORK BLOCKING ==========
    this.scriptlets.set('generic-ads', `
      (function() {
        'use strict';
        const adNetworks = ['doubleclick.net','googlesyndication.com','googleadservices.com','googletagmanager.com','googletagservices.com','adservice.google','pagead2.googlesyndication.com','securepubads.g.doubleclick.net','pubads.g.doubleclick.net','ad.doubleclick.net','adserver.adtech.de','ads.ad4game.com','ads.adbrite.com','ads.adfox.ru','ads.adtaily.pl','ads.advertising.com','ads.afy11.net','ads.adtaily.pl','ads.advertising.com','ads.afy11.net','ads.ajaxad.com','ads.anvato.net','ads.aol.com','ads.baller.tv','ads.betfair.com','ads.bidswitch.net','ads.cdt21.com','ads.cpx.to','ads.criteo.com','ads.dailymail.co.uk','ads.ebay.com','ads.exoclick.com','ads.fastclick.net','ads.flashtalking.com','ads.freewheel.com','ads.gamma.com','ads.gumgum.com','ads.hearst.com','ads.hearstdigital.com','ads.impactradius.com','ads.innity.net','ads.inner-active.com','ads.innity.net','ads.ipredictive.com','ads.krux.com','ads.linkedin.com','ads.mediamath.com','ads.mopub.com','ads.nativeads.com','ads.nexage.com','ads.openx.net','ads.optimizely.com','ads.outbrain.com','ads.pinterest.com','ads.rubiconproject.com','ads.smaato.net','ads.sonobi.com','ads.specificmedia.com','ads.spotxchange.com','ads.taboola.com','ads.twitter.com','ads.vdopia.com','ads.vibrantmedia.com','ads.washingtonpost.com','ads.yahoo.com','ads.yieldmo.com','ads.yieldoptimizer.com','ads.zedo.com','amazon-adsystem.com','amazonaws.com/ads','adtech.de','advertising.com','adzerk.net','atdmt.com','atwola.com','audienceiq.com','beacon.krxd.net','beacon.taboola.com','bidr.io','bidswitch.net','brightcove.com','casalemedia.com','contextweb.com','cxense.com','demdex.net','dotomi.com','everesttech.net','exelator.com','eyeota.net','flashtalking.com','freewheel.com','googleads.g.doubleclick.net','ib.adnxs.com','idsync.rlcdn.com','imrworldwide.com','innity.net','ipredictive.com','krxd.net','loopme.me','magnite.com','media.net','mediamath.com','netmng.com','nexage.com','openx.net','platform.io','prebid.org','pulsepoint.com','quantcast.com','realytics.com','rhythmone.com','rockerbox.com','rokt.com','rtbhouse.com','rtk.io','rubiconproject.com','smaato.net','smartadserver.com','sovrn.com','spotx.tv','stackadapt.com','taboola.com','teads.tv','thetradedesk.com','tremorvideo.com','triplelift.com','turn.com','unruly.co.uk','verizonmedia.com','vidible.tv','videoamp.com','videoplaza.tv','wunderkind.com','yieldlab.net','yieldmo.com','yieldoptimizer.com','zergnet.com','zvelo.com'];

        const isAd = (url) => adNetworks.some(n => url.includes(n));

        const originalFetch = window.fetch;
        window.fetch = function(...args) { const url = args[0]; if (typeof url === 'string' && isAd(url)) return Promise.reject(new Error('Blocked')); return originalFetch.apply(this, args); };

        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...args) { if (typeof url === 'string' && isAd(url)) { this._blocked = true; this.abort(); return; } return origOpen.apply(this, [method, url, ...args]); };

        console.log('[AdBlocker Pro] Generic ad network blocking installed');
      })();
    `);
  }

  async handleNavigation(tabId, url, frameId) {
    if (!this.isInitialized) return;

    try {
      if (this.mode === 'basic') {
        await this.injectScriptlet(tabId, 'youtube-network', frameId);
      } else if (this.mode === 'standard') {
        await this.injectScriptlet(tabId, 'youtube-network', frameId);
        await this.injectScriptlet(tabId, 'youtube-player', frameId);
        await this.injectScriptlet(tabId, 'youtube-consent', frameId);
      } else if (this.mode === 'aggressive') {
        await this.injectScriptlet(tabId, 'youtube-network', frameId);
        await this.injectScriptlet(tabId, 'youtube-player', frameId);
        await this.injectScriptlet(tabId, 'youtube-ima', frameId);
        await this.injectScriptlet(tabId, 'youtube-consent', frameId);
        await this.injectScriptlet(tabId, 'generic-ads', frameId);
      }
    } catch (e) { console.debug('Scriptlet injection failed:', e.message); }
  }

  async injectScriptlet(tabId, name, frameId = 0) {
    const scriptlet = this.scriptlets.get(name);
    if (!scriptlet) return;

    // Use the new scriptlet runner for secure execution
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        func: (scriptletCode, scriptletName) => {
          if (window.__aeroguardScriptlets && window.__aeroguardScriptlets.executeScriptlet) {
            return window.__aeroguardScriptlets.executeScriptlet(scriptletCode, { name: scriptletName });
          }
          // Fallback for older content scripts
          const fn = new Function(scriptletCode);
          return fn();
        },
        args: [scriptlet, name],
        world: 'MAIN'
      });
    } catch (e) {
      console.debug('Scriptlet injection via runner failed, using fallback:', e.message);
      // Fallback to direct injection
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        func: new Function(scriptlet),
        world: 'MAIN'
      });
    }
  }

  // DNR rules for YouTube (static, high-priority)
  getDNRRules() {
    const rules = [];
    let id = 80000;
    const ytDomains = [
      'youtube.com', 'youtube-nocookie.com', 'www.youtube.com',
      'm.youtube.com', 'music.youtube.com', 'tv.youtube.com',
      'youtubeeducation.com', 'youtubekids.com'
    ];

    // ============================================================
    // PRIORITY 2 — ALLOW RULES (MUST EXIST OR VIDEO WON'T PLAY)
    // ============================================================
    const allows = [
      // VIDEO STREAMS — CRITICAL
      { url: '||googlevideo.com/videoplayback*', types: ['media', 'xmlhttprequest'] },
      // NOTE: "||*.googlevideo.com/*" is invalid in DNR ("*" cannot follow "||").
      // "||googlevideo.com" already matches the host and all its subdomains.
      { url: '||googlevideo.com', types: ['media', 'xmlhttprequest'] },

      // PLAYER JAVASCRIPT — CRITICAL
      { url: '||s.ytimg.com/yts/jsbin/player-*', types: ['script'] },
      { url: '||s.ytimg.com/yts/jsbin/www-embed-player*', types: ['script'] },
      { url: '||s.ytimg.com/yts/jsbin/player-*-en_US.js', types: ['script'] },
      { url: '||s.ytimg.com/yts/jsbin/desktop-*-en_US.js', types: ['script'] },

      // THUMBNAILS & IMAGES
      { url: '||i.ytimg.com/*', types: ['image'] },
      { url: '||yt3.ggpht.com/*', types: ['image'] },
      { url: '||yt3.googleusercontent.com/*', types: ['image'] },
      { url: '||s.ytimg.com/yts/img/*', types: ['image'] },

      // CAPTIONS / SUBTITLES
      { url: '||youtube.com/api/timedtext*', types: ['xmlhttprequest'] },

      // PLAYER CONFIG & API — CRITICAL FOR INITIALIZATION
      { url: '||youtube.com/youtubei/v1/player*', types: ['xmlhttprequest'] },
      { url: '||youtube.com/youtubei/v1/browse*', types: ['xmlhttprequest'] },
      { url: '||youtube.com/youtubei/v1/next*', types: ['xmlhttprequest'] },
      { url: '||youtube.com/youtubei/v1/search*', types: ['xmlhttprequest'] },
      { url: '||youtube.com/youtubei/v1/guide*', types: ['xmlhttprequest'] },

      // LIVE CHAT & COMMENTS
      { url: '||youtube.com/youtubei/v1/live_chat*', types: ['xmlhttprequest'] },
      { url: '||youtube.com/youtubei/v1/comment*', types: ['xmlhttprequest'] },
      { url: '||youtube.com/youtubei/v1/live_chat/get_live_chat*', types: ['xmlhttprequest'] },

      // EMBED & TV
      { url: '||youtube.com/embed/*', types: ['sub_frame', 'xmlhttprequest'] },
      { url: '||youtube-nocookie.com/embed/*', types: ['sub_frame', 'xmlhttprequest'] },
      { url: '||tv.youtube.com/*', types: ['xmlhttprequest', 'sub_frame'] },
      { url: '||music.youtube.com/*', types: ['xmlhttprequest', 'sub_frame'] },

      // SHORTS
      { url: '||youtube.com/shorts/*', types: ['xmlhttprequest', 'sub_frame'] },
      { url: '||youtube.com/youtubei/v1/shorts*', types: ['xmlhttprequest'] },

      // AUTH & ACCOUNT
      { url: '||youtube.com/youtubei/v1/account*', types: ['xmlhttprequest'] },
      { url: '||youtube.com/youtubei/v1/subscription*', types: ['xmlhttprequest'] },

      // LOGGING (needed for player heartbeat)
      { url: '||youtube.com/api/stats/watchtime*', types: ['xmlhttprequest'] },
      { url: '||youtube.com/api/stats/heartbeat*', types: ['xmlhttprequest'] },
      { url: '||youtube.com/api/stats/qoe*', types: ['xmlhttprequest'] },
    ];

    for (const a of allows) {
      rules.push({
        id: id++,
        priority: 2,
        action: { type: 'allow' },
        condition: { urlFilter: a.url, resourceTypes: a.types, initiatorDomains: ytDomains }
      });
    }

    // ============================================================
    // PRIORITY 1 — BLOCK RULES (ALL YOUTUBE AD TYPES)
    // ============================================================
    const blocks = [
      // ─── PRE-ROLL / MID-ROLL / POST-ROLL VIDEO ADS ───
      '||youtube.com/api/stats/ads*',
      '||youtube.com/api/stats/qoe*',
      '||youtube.com/ptracking*',
      '||youtube.com/pagead/*',
      '||youtube.com/get_video_info*&adformat=*',
      '||youtube.com/get_video_info*&ad_type=*',
      '||youtube.com/get_video_info*&ad3_module=*',
      '||youtube.com/get_video_info*&afv_*',
      '||youtube.com/get_video_info*&vmap=*',
      '||youtube.com/get_video_info*&ad_tag=*',
      '||youtube.com/get_video_info*&ad_url=*',
      '||youtube.com/get_video_info*&ad_break=*',
      '||youtube.com/get_video_info*&ad_slot=*',
      '||youtube.com/get_video_info*&ad_pod=*',
      '||youtube.com/annotations_invideo*',
      '||youtube.com/api/stats/watchtime*&ad*',

      // ─── VMAP / VAST / AD MANIFESTS ───
      '||youtube.com/api/manifest/*&ad*',
      '||youtube.com/api/manifest/dash/*&ad*',
      '||youtube.com/api/manifest/hls/*&ad*',
      '||manifest.googlevideo.com/api/manifest/*&ad*',
      '||manifest.googlevideo.com/api/manifest/dash/*&ad*',

      // ─── GOOGLE AD NETWORKS (All YouTube ad serving) ───
      '||doubleclick.net/*',
      '||googlesyndication.com/*',
      '||googleadservices.com/*',
      '||googletagmanager.com/*',
      '||googletagservices.com/*',
      '||pagead2.googlesyndication.com/*',
      '||pubads.g.doubleclick.net/*',
      '||securepubads.g.doubleclick.net/*',
      '||adservice.google.com/*',
      '||adservice.google.de/*',
      '||adservice.google.fr/*',
      '||adservice.google.co.uk/*',
      '||adservice.google.ca/*',
      '||adservice.google.au/*',

      // ─── IMA SDK (Interactive Media Ads) ───
      '||imasdk.googleapis.com/*',
      '||imasdk.s3.amazonaws.com/*',
      '||www.gstatic.com/imasdk/*',
      '||cdn.jsdelivr.net/npm/google-ima*',

      // ─── YOUTUBE AD PLAYER JAVASCRIPT ───
      '||s.ytimg.com/yts/jsbin/player-*ad*',
      '||s.ytimg.com/yts/jsbin/*ima*',
      '||s.ytimg.com/yts/jsbin/*ads*',
      '||s.ytimg.com/yts/jsbin/*ad3*',
      '||s.ytimg.com/yts/jsbin/*afv*',
      '||s.ytimg.com/yts/jsbin/*vmap*',
      '||s.ytimg.com/yts/jsbin/ima3*',

      // ─── YOUTUBE AD SUBDOMAINS ───
      '||ads.youtube.com/*',
      '||advertising.youtube.com/*',
      '||partneradvertising.youtube.com/*',
      '||sponsorships.youtube.com/*',
      '||paidcontent.youtube.com/*',
      '||advertiser.youtube.com/*',
      '||ads-pa.googleapis.com/*',

      // ─── TRACKING / CONVERSION PIXELS ───
      '||googleads.g.doubleclick.net/pagead/viewthroughconversion/*',
      '||googleads.g.doubleclick.net/pagead/conversion/*',
      '||www.googleadservices.com/pagead/conversion/*',
      '||googleads.g.doubleclick.net/pagead/conversion_async/*',
      '||doubleclick.net/activity/*',
      '||fls.doubleclick.net/activityi/*',
      '||ad.doubleclick.net/activity/*',
      '||googleads4.g.doubleclick.net/pcs/view*',
      '||googleads4.g.doubleclick.net/pcs/activeview*',

      // ─── YOUTUBE INTERNAL AD ENDPOINTS (New 2024-2025) ───
      '||youtube.com/youtubei/v1/ad*',
      '||youtube.com/youtubei/v1/ad/get*',
      '||youtube.com/youtubei/v1/ad/schedule*',
      '||youtube.com/youtubei/v1/ad/click*',
      '||youtube.com/youtubei/v1/ad/impression*',
      '||youtube.com/youtubei/v1/ad/complete*',

      // ─── OVERLAY / COMPANION / BANNER ADS ───
      '||youtube.com/api/overlay*',
      '||youtube.com/api/companion*',
      '||youtube.com/api/banner*',
      '||youtube.com/api/instream*',

      // ─── SHORTS ADS ───
      '||youtube.com/youtubei/v1/shorts/ad*',
      '||youtube.com/youtubei/v1/reel/ad*',

      // ─── LIVE STREAM ADS ───
      '||youtube.com/youtubei/v1/live/ad*',
      '||youtube.com/youtubei/v1/live_chat/ad*',

      // ─── FEED / HOMEPAGE PROMOTED CONTENT ───
      '||youtube.com/youtubei/v1/browse*&ad*',
      '||youtube.com/youtubei/v1/feed/ad*',
    ];

    for (const b of blocks) {
      rules.push({
        id: id++,
        priority: b.includes('manifest.googlevideo.com') ? 3 : 1,
        action: { type: 'block' },
        condition: {
          urlFilter: b,
          resourceTypes: ['xmlhttprequest', 'sub_frame', 'image', 'script', 'stylesheet', 'ping', 'media', 'other'],
          initiatorDomains: ytDomains
        }
      });
    }

    return rules;
  }

  setMode(mode) { this.mode = mode; }

  // Get scriptlet versions for hot-reload
  getScriptletVersions() {
    const versions = {};
    for (const [name, code] of this.scriptlets.entries()) {
      let hash = 0;
      for (let i = 0; i < code.length; i++) {
        const char = code.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      versions[name] = {
        version: 1,
        hash: hash.toString(36),
        code: code
      };
    }
    return versions;
  }
}
export { YouTubeAdBlocker };
export default YouTubeAdBlocker;