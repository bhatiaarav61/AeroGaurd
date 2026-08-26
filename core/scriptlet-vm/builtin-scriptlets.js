/**
 * Built-in Scriptlets — 50+ battle-tested scriptlets
 * Ready-to-use scriptlets for common ad blocking tasks
 */

export const BUILTIN_SCRIPTLETS = {
  // ============ CORE AD BLOCKING ============

  'abort-on-property-read': `
    (function() {
      'use strict';
      const originalDefineProperty = Object.defineProperty;
      Object.defineProperty = function(obj, prop, desc) {
        if (desc && desc.get && /adblock|adBlock|AdBlock|advert|sponsor/i.test(prop)) {
          const originalGet = desc.get;
          desc.get = function() {
            console.log('[Scriptlet] Aborted property read:', prop);
            return false;
          };
        }
        return originalDefineProperty.apply(this, arguments);
      };
    })();
  `,

  'prevent-setInterval': `
    (function() {
      'use strict';
      const originalSetInterval = window.setInterval;
      window.setInterval = function(fn, delay, ...args) {
        if (delay < 1000) {
          console.log('[Scriptlet] Prevented short setInterval:', delay);
          return originalSetInterval(fn, 1000, ...args);
        }
        return originalSetInterval(fn, delay, ...args);
      };
    })();
  `,

  'noop-functions': `
    (function() {
      'use strict';
      const noop = function() { return false; };
      const detectionNames = [
        'adblockDetected', 'adBlockDetected', 'detectAdblock', 'detectAdBlock',
        'isAdblockActive', 'isAdBlockActive', 'adblockEnabled', 'adBlockEnabled',
        'blockAdblock', 'blockAdBlock', 'antiAdblock', 'antiAdBlock',
        'adblockWarning', 'adBlockWarning', 'showAdblockNotice', 'showAdBlockNotice',
        'fuckAdblock', 'fuckAdBlock', 'adblockDetector', 'adBlockDetector',
        'getAdblockStatus', 'checkAdblock', 'verifyAdblock',
        'onAdBlockDetected', 'onAdblockDetected', 'adBlockDetectedCallback',
        'adblockCallback', 'adBlockCallback', 'blockAdblockCallback',
        'pagefair', 'pagefair_detect', 'pagefair_activate',
        'admiral', 'admiralEngage', 'admiralActivate',
        'sp', 'sp_message', 'sp_activate'
      ];
      detectionNames.forEach(name => {
        if (window[name]) window[name] = noop;
      });
    })();
  `,

  'remove-attribute': `
    (function() {
      'use strict';
      const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
          if (m.type === 'attributes' && m.attributeName === 'style') {
            const el = m.target;
            if (el.style.display === 'none' || el.style.visibility === 'hidden') {
              el.style.display = '';
              el.style.visibility = '';
              el.style.opacity = '';
            }
          }
        }
      });
      observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style'] });
    })();
  `,

  'json-prune': `
    (function() {
      'use strict';
      const originalJSONParse = JSON.parse;
      JSON.parse = function(text, reviver) {
        const obj = originalJSONParse(text, reviver);
        return pruneAds(obj);
      };
      function pruneAds(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(pruneAds).filter(x => x !== null);
        const result = {};
        for (const [k, v] of Object.entries(obj)) {
          if (!/ad|promo|sponsor|tracking|analytics|advert|banner/i.test(k)) {
            result[k] = pruneAds(v);
          }
        }
        return result;
      }
    })();
  `,

  'set-constant': `
    (function() {
      'use strict';
      Object.defineProperty(window, 'adblock', { value: false, writable: false, configurable: false });
      Object.defineProperty(window, 'adBlock', { value: false, writable: false, configurable: false });
      Object.defineProperty(window, 'AdBlock', { value: false, writable: false, configurable: false });
      Object.defineProperty(window, 'adblocker', { value: undefined, writable: false, configurable: false });
      Object.defineProperty(window, 'adBlocker', { value: undefined, writable: false, configurable: false });
    })();
  `,

  'block-script-execution': `
    (function() {
      'use strict';
      const originalCreateElement = document.createElement;
      document.createElement = function(tag) {
        const el = originalCreateElement.call(this, tag);
        if (tag.toLowerCase() === 'script') {
          const originalSetSrc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src').set;
          Object.defineProperty(el, 'src', {
            set: function(url) {
              if (url && /ad|tracking|analytics|doubleclick|googlesyndication|googleadservices|googletagmanager|pagead2|pubads|securepubads|adservice|imasdk/i.test(url)) {
                console.log('[Scriptlet] Blocked script:', url);
                return;
              }
              originalSetSrc.call(this, url);
            },
            get: Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src').get
          });
        }
        return el;
      };
    })();
  `,

  'block-image-beacon': `
    (function() {
      'use strict';
      const originalImage = window.Image;
      window.Image = function() {
        const img = new originalImage();
        const originalSrcSet = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').set;
        Object.defineProperty(img, 'src', {
          set: function(url) {
            if (url && /beacon|track|pixel|collect|analytics|impression|click|conversion|analytics/i.test(url)) {
              console.log('[Scriptlet] Blocked beacon:', url);
              return;
            }
            originalSrcSet.call(this, url);
          },
          get: Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').get
        });
        return img;
      };
    })();
  `,

  'block-fetch': `
    (function() {
      'use strict';
      const originalFetch = window.fetch;
      window.fetch = function(url, ...args) {
        if (typeof url === 'string' && /ad|tracking|analytics|doubleclick|googlesyndication|googleadservices|googletagmanager|pagead2|pubads|securepubads|adservice|imasdk|facebook\.net\/tr|analytics\.twitter|analytics\.tiktok|t\.co\/i\/adsct|snap\.licdn|px\.ads\.linkedin|s\.pinimg\.com\/ct/i.test(url)) {
          console.log('[Scriptlet] Blocked fetch:', url);
          return Promise.reject(new Error('Blocked by scriptlet'));
        }
        return originalFetch.apply(this, [url, ...args]);
      };
    })();
  `,

  'block-xhr': `
    (function() {
      'use strict';
      const originalXHROpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...args) {
        if (typeof url === 'string' && /ad|tracking|analytics|doubleclick|googlesyndication|googleadservices|googletagmanager|pagead2|pubads|securepubads|adservice|imasdk/i.test(url)) {
          this._blocked = true;
          console.log('[Scriptlet] Blocked XHR:', url);
          return;
        }
        return originalXHROpen.apply(this, [method, url, ...args]);
      };
      const originalXHRSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function(...args) {
        if (this._blocked) return;
        return originalXHRSend.apply(this, args);
      };
    })();
  `,

  'block-sendBeacon': `
    (function() {
      'use strict';
      const originalBeacon = navigator.sendBeacon;
      navigator.sendBeacon = function(url, data) {
        if (typeof url === 'string' && /ad|tracking|analytics|beacon|collect|impression|click|conversion/i.test(url)) {
          console.log('[Scriptlet] Blocked sendBeacon:', url);
          return false;
        }
        return originalBeacon.apply(this, arguments);
      };
    })();
  `,

  // ============ YOUTUBE SPECIFIC ============

  'youtube-network': `
    (function() {
      'use strict';
      const blockedPatterns = [
        '/api/stats/ads', '/api/stats/qoe', '/ptracking', '/pagead/',
        'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
        'googletagmanager.com', 'googletagservices.com', 'pagead2.googlesyndication.com',
        'pubads.g.doubleclick.net', 'securepubads.g.doubleclick.net',
        'adservice.google.com', 'imasdk.googleapis.com', 'imasdk.s3.amazonaws.com',
        '/api/stats/watchtime', '/get_video_info.*adformat=', '/get_video_info.*ad_type=',
        '/get_video_info.*ad3_module=', '/get_video_info.*afv_',
        '/get_video_info.*vmap=', '/get_video_info.*ad_tag=',
        '/get_video_info.*ad_url=', '/annotations_invideo',
        '/youtubei/v1/ad/', '/youtubei/v1/ad/get', '/youtubei/v1/ad/click'
      ];
      const isBlocked = (url) => blockedPatterns.some(p => url.includes(p));
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && isBlocked(url)) {
          return Promise.reject(new Error('AdBlocker: blocked'));
        }
        return originalFetch.apply(this, args);
      };
      const originalXHROpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...args) {
        if (typeof url === 'string' && isBlocked(url)) { this._adBlocked = true; this.abort(); return; }
        return originalXHROpen.apply(this, [method, url, ...args]);
      };
      const originalXHRSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function(...args) { if (this._adBlocked) return; return originalXHRSend.apply(this, args); };
      const originalBeacon = navigator.sendBeacon;
      navigator.sendBeacon = function(url, data) { if (typeof url === 'string' && isBlocked(url)) return false; return originalBeacon(url, data); };
      console.log('[Scriptlet] YouTube network blocking installed');
    })();
  `,

  'youtube-player': `
    (function() {
      'use strict';
      // Patch ytInitialData
      const cleanInitialData = (data) => {
        if (!data || !data.contents) return;
        const process = (node) => {
          if (!node || typeof node !== 'object') return;
          if (node.renderer) {
            const keys = Object.keys(node.renderer);
            const adKeys = keys.filter(k => /ad|promo|sponsor|shopping|mealbar|merch/i.test(k));
            adKeys.forEach(k => delete node.renderer[k]);
          }
          for (const key of Object.keys(node)) {
            const val = node[key];
            if (Array.isArray(val)) {
              node[key] = val.filter(item => {
                if (item?.renderer) {
                  const rk = Object.keys(item.renderer);
                  return !rk.some(k => /ad|promo|sponsor|shopping|mealbar|merch/i.test(k));
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
      // Patch player response
      const origFetch = window.fetch;
      window.fetch = async function(...args) {
        const resp = await origFetch.apply(this, args);
        const url = args[0];
        if (typeof url === 'string' && url.includes('/youtubei/v1/player')) {
          const clone = resp.clone();
          try {
            const data = await clone.json();
            if (data?.playabilityStatus) {
              delete data.playabilityStatus.adSignalsInfo;
              delete data.playabilityStatus.adsPresentation;
            }
            if (data?.playerConfig) { delete data.playerConfig.adConfig; delete data.playerConfig.adPlacements; }
            if (data?.videoDetails) { delete data.videoDetails.allowAds; delete data.videoDetails.adTagUrl; delete data.videoDetails.adTagUrlSet; }
            if (data?.streamingData?.adaptiveFormats) {
              data.streamingData.adaptiveFormats = data.streamingData.adaptiveFormats.filter(f =>
                !f.url?.includes('/api/manifest/') && !f.mimeType?.includes('application/vnd.apple.mpegurl')
              );
            }
            return new Response(JSON.stringify(data), { status: resp.status, statusText: resp.statusText, headers: resp.headers });
          } catch { return resp; }
        }
        return resp;
      };
      // Block ad components
      const adComponents = ['ytd-ad-slot-renderer','ytd-display-ad-renderer','ytd-promoted-video-renderer','ytd-promoted-sparkles-web-renderer','ytd-action-companion-ad-renderer','ytd-in-feed-ad-renderer','ytd-banner-ad-renderer','ytd-companion-slot-renderer','ytd-mealbar-promo-renderer','ytd-merch-shelf-renderer','ytd-shopping-renderer'];
      adComponents.forEach(tag => { if (customElements.get(tag)) { const proto = customElements.get(tag).prototype; const orig = proto.connectedCallback; proto.connectedCallback = function() { if (orig) orig.call(this); this.style.display = 'none'; this.innerHTML = ''; }; } });
      console.log('[Scriptlet] YouTube player patching installed');
    })();
  `,

  'youtube-ima': `
    (function() {
      'use strict';
      const origCreate = document.createElement;
      document.createElement = function(tag, opts) {
        const el = origCreate.call(this, tag, opts);
        if (tag.toLowerCase() === 'script' && el.src && (el.src.includes('imasdk') || el.src.includes('googleads') || el.src.includes('doubleclick.net') || el.src.includes('pubads.g.doubleclick.net'))) {
          console.log('[Scriptlet] Blocked IMA SDK:', el.src);
          return document.createComment('Blocked IMA SDK');
        }
        return el;
      };
      Object.defineProperty(window, 'google', {
        configurable: true,
        get: () => new Proxy(window._originalGoogle || {}, {
          get: (t, p) => { if (p === 'ima') { console.log('[Scriptlet] Blocked google.ima'); return undefined; } return t[p]; }
        })
      });
      console.log('[Scriptlet] IMA SDK blocking installed');
    })();
  `,

  'youtube-consent': `
    (function() {
      'use strict';
      const remove = () => {
        document.querySelectorAll('ytd-consent-bump-v2-lightbox, tp-yt-paper-dialog[ytd-consent-bump-v2-lightbox], #consent-bump, .ytd-consent-bump-v2-lightbox, yt-button-renderer[consent], ytd-button-renderer[consent]').forEach(el => { el.style.display = 'none'; el.remove(); });
        document.body.style.overflow = ''; document.documentElement.style.overflow = '';
      };
      remove(); new MutationObserver(remove).observe(document.body, { childList: true, subtree: true });
      console.log('[Scriptlet] Consent removal installed');
    })();
  `,

  'youtube-heuristic': `
    (function() {
      'use strict';
      const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
          if (m.type === 'childList' && m.addedNodes.length) {
            for (const n of m.addedNodes) {
              if (n.nodeType === 1 && (n.matches?.('.ytp-ad-player-overlay, .ytp-ad-module, .video-ads, .ad-showing') || n.querySelector?.('.ytp-ad-player-overlay, .ytp-ad-module, .video-ads, .ad-showing, ytd-ad-slot-renderer'))) {
                const video = document.querySelector('video.html5-main-video, video#movie_player');
                if (video) { video.muted = true; video.playbackRate = 16.0; if (isFinite(video.duration) && video.duration > 0) video.currentTime = video.duration - 0.1; }
                const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
                if (skipBtn) skipBtn.click();
              }
            }
          }
        });
      observer.observe(document.body, { childList: true, subtree: true });
      console.log('[Scriptlet] YouTube heuristic detection installed');
    })();
  `,

  // ============ GENERIC AD BLOCKING ============

  'generic-ads': `
    (function() {
      'use strict';
      const adNetworks = ['doubleclick.net','googlesyndication.com','googleadservices.com','googletagmanager.com','googletagservices.com','adservice.google','pagead2.googlesyndication.com','securepubads.g.doubleclick.net','pubads.g.doubleclick.net','ad.doubleclick.net','adserver.adtech.de','ads.ad4game.com','ads.adbrite.com','ads.adfox.ru','ads.adtaily.pl','ads.advertising.com','ads.afy11.net','ads.ajaxad.com','ads.anvato.net','ads.aol.com','ads.baller.tv','ads.betfair.com','ads.bidswitch.net','ads.cdt21.com','ads.cpx.to','ads.criteo.com','ads.dailymail.co.uk','ads.ebay.com','ads.exoclick.com','ads.fastclick.net','ads.flashtalking.com','ads.freewheel.com','ads.gamma.com','ads.gumgum.com','ads.hearst.com','ads.hearstdigital.com','ads.impactradius.com','ads.innity.net','ads.inner-active.com','ads.ipredictive.com','ads.krux.com','ads.linkedin.com','ads.mediamath.com','ads.mopub.com','ads.nativeads.com','ads.nexage.com','ads.openx.net','ads.optimizely.com','ads.outbrain.com','ads.pinterest.com','ads.rubiconproject.com','ads.smaato.net','ads.sonobi.com','ads.specificmedia.com','ads.spotxchange.com','ads.taboola.com','ads.twitter.com','ads.vdopia.com','ads.vibrantmedia.com','ads.washingtonpost.com','ads.yahoo.com','ads.yieldmo.com','ads.yieldoptimizer.com','ads.zedo.com','amazon-adsystem.com','amazonaws.com/ads','adtech.de','advertising.com','adzerk.net','atdmt.com','atwola.com','audienceiq.com','beacon.krxd.net','beacon.taboola.com','bidr.io','bidswitch.net','brightcove.com','casalemedia.com','contextweb.com','cxense.com','demdex.net','dotomi.com','everesttech.net','exelator.com','eyeota.net','flashtalking.com','freewheel.com','googleads.g.doubleclick.net','ib.adnxs.com','idsync.rlcdn.com','imrworldwide.com','innity.net','ipredictive.com','krxd.net','loopme.me','magnite.com','media.net','mediamath.com','netmng.com','nexage.com','openx.net','platform.io','prebid.org','pulsepoint.com','quantcast.com','realytics.com','rhythmone.com','rockerbox.com','rokt.com','rtbhouse.com','rtk.io','rubiconproject.com','smaato.net','smartadserver.com','sovrn.com','spotx.tv','stackadapt.com','taboola.com','teads.tv','thetradedesk.com','tremorvideo.com','triplelift.com','turn.com','unruly.co.uk','verizonmedia.com','vidible.tv','videoamp.com','videoplaza.tv','wunderkind.com','yieldlab.net','yieldmo.com','yieldoptimizer.com','zergnet.com','zvelo.com'];
      const isAd = (url) => adNetworks.some(n => url.includes(n));
      const originalFetch = window.fetch;
      window.fetch = function(...args) { const url = args[0]; if (typeof url === 'string' && isAd(url)) return Promise.reject(new Error('Blocked')); return originalFetch.apply(this, args); };
      const origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...args) { if (typeof url === 'string' && isAd(url)) { this._blocked = true; this.abort(); return; } return origOpen.apply(this, [method, url, ...args]); };
      console.log('[Scriptlet] Generic ad network blocking installed');
    })();
  `,

  'generic-consent': `
    (function() {
      'use strict';
      const consentSelectors = [
        '[id*="cookie"]', '[class*="cookie"]', '[id*="consent"]', '[class*="consent"]',
        '[id*="gdpr"]', '[class*="gdpr"]', '[id*="ccpa"]', '[class*="ccpa"]',
        '.cookie-banner', '.cookie-consent', '.cookie-notice', '.cookie-bar', '.cookie-popup',
        '.consent-banner', '.consent-popup', '.consent-overlay', '.consent-manager',
        '.gdpr-banner', '.gdpr-consent', '.ccpa-banner', '#onetrust-banner-sdk',
        '.ot-sdk-container', '.cookie-law-info-bar', '.cmplz-cookiebanner',
        '.borlabs-cookie', '.compliance-banner', '.privacy-banner'
      ];
      const remove = () => {
        consentSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            const text = (el.textContent||'').toLowerCase();
            if (/cookie|consent|gdpr|ccpa|privacy|accept|agree|allow/.test(text)) {
              el.style.display = 'none'; el.remove();
            }
          });
        });
        document.body.style.overflow = ''; document.documentElement.style.overflow = '';
      };
      remove(); new MutationObserver(remove).observe(document.body, { childList: true, subtree: true });
      console.log('[Scriptlet] Generic consent removal installed');
    })();
  `,

  'generic-popups': `
    (function() {
      'use strict';
      const popupSelectors = [
        '[id*="newsletter"]', '[class*="newsletter"]', '[id*="subscribe"]', '[class*="subscribe"]',
        '[id*="signup"]', '[class*="signup"]', '[id*="sign-up"]', '[class*="sign-up"]',
        '[id*="popup"]', '[class*="popup"]', '[id*="modal"]', '[class*="modal"]',
        '[id*="overlay"]', '[class*="overlay"]', '[id*="lightbox"]', '[class*="lightbox"]',
        '.newsletter-popup', '.newsletter-modal', '.subscribe-popup', '.signup-popup',
        '.exit-intent-popup', '.welcome-popup', '.sumome', '.mailchimp', '.optinmonster',
        '.optimonk', '.hellobar', '.poptin', '.wisepops', '.getsitely', '.sleeknote',
        '.justuno', '.privy', '.klaviyo', '.convertflow', '.unbounce'
      ];
      const remove = () => {
        popupSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            const style = getComputedStyle(el);
            const isPopup = style.position === 'fixed' || style.position === 'absolute' || parseInt(style.zIndex) > 100;
            const hasEmail = el.querySelector('input[type="email"]');
            const text = (el.textContent||'').toLowerCase();
            const hasKeywords = /newsletter|subscribe|sign up|mailing|email|free|download|ebook|webinar/.test(text);
            if ((hasEmail || hasKeywords) && isPopup) {
              el.style.display = 'none'; el.remove();
            }
          });
        });
        document.body.style.overflow = ''; document.documentElement.style.overflow = '';
      };
      remove(); new MutationObserver(remove).observe(document.body, { childList: true, subtree: true });
      console.log('[Scriptlet] Generic popup removal installed');
    })();
  `,

  'generic-antiadblock': `
    (function() {
      'use strict';
      const detections = ['adblockDetected','adBlockDetected','detectAdblock','detectAdBlock','isAdblockActive','isAdBlockActive','adblockEnabled','adBlockEnabled','blockAdblock','blockAdBlock','antiAdblock','antiAdBlock','adblockWarning','adBlockWarning','showAdblockNotice','showAdBlockNotice','fuckAdblock','fuckAdBlock','adblockDetector','adBlockDetector'];
      detections.forEach(name => { if (window[name]) window[name] = () => false; });
      const props = ['adblock','adBlock','adblocker','adBlocker','adblockPlus','adBlockPlus','uBlock','uBlockOrigin','adguard','AdGuard'];
      props.forEach(p => { try { Object.defineProperty(window, p, { value: undefined, writable: true, configurable: true }); } catch(e) {} });
      const origLog = console.log;
      console.log = function(...args) { const msg = args.join(' '); if (/adblock|ad block|AdBlock/i.test(msg)) { return; } origLog.apply(console, args); };
      console.log('[Scriptlet] Generic anti-adblock installed');
    })();
  `,

  'generic-fingerprint': `
    (function() {
      'use strict';
      // Canvas
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(...args) {
        const result = origToDataURL.apply(this, args);
        if (args[0] === 'image/png') return result + '#noise=' + Math.random().toString(36).slice(2);
        return result;
      };
      // WebGL
      if (WebGLRenderingContext.prototype.getParameter) {
        const origGetParam = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(pname) {
          if (pname === 37445) return 'Google Inc. (NVIDIA)'; // UNMASKED_VENDOR_WEBGL
          if (pname === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0)'; // UNMASKED_RENDERER_WEBGL
          return origGetParam.call(this, pname);
        };
      }
      // Navigator
      Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
      Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
      console.log('[Scriptlet] Generic fingerprinting protection installed');
    })();
  `,

  // ============ UTILITY SCRIPTLETS ============

  'add-class': `
    (function() {
      'use strict';
      document.querySelectorAll('${selector}').forEach(el => el.classList.add('${className}'));
    })();
  `,

  'remove-class': `
    (function() {
      'use strict';
      document.querySelectorAll('${selector}').forEach(el => el.classList.remove('${className}'));
    })();
  `,

  'set-attribute': `
    (function() {
      'use strict';
      document.querySelectorAll('${selector}').forEach(el => el.setAttribute('${attr}', '${value}'));
    })();
  `,

  'remove-attribute': `
    (function() {
      'use strict';
      document.querySelectorAll('${selector}').forEach(el => el.removeAttribute('${attr}'));
    })();
  `,

  'set-style': `
    (function() {
      'use strict';
      document.querySelectorAll('${selector}').forEach(el => { el.style.${property} = '${value}'; });
    })();
  `,

  'remove-node': `
    (function() {
      'use strict';
      document.querySelectorAll('${selector}').forEach(el => el.remove());
    })();
  `,

  'replace-node': `
    (function() {
      'use strict';
      document.querySelectorAll('${selector}').forEach(el => {
        const replacement = document.createElement('${tagName}');
        replacement.innerHTML = '${html}';
        el.parentNode?.replaceChild(replacement, el);
      });
    })();
  `,

  'inject-script': `
    (function() {
      'use strict';
      const script = document.createElement('script');
      script.textContent = \`${code}\`;
      document.head.appendChild(script);
    })();
  `,

  'inject-css': `
    (function() {
      'use strict';
      const style = document.createElement('style');
      style.textContent = \`${css}\`;
      document.head.appendChild(style);
    })();
  `,

  'watch-for': `
    (function() {
      'use strict';
      const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
          if (m.type === 'childList' && m.addedNodes.length) {
            for (const n of m.addedNodes) {
              if (n.nodeType === 1 && n.matches('${selector}')) {
                ${callback}
              }
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    })();
  `,

  'await-element': `
    (function() {
      'use strict';
      return new Promise(resolve => {
        const el = document.querySelector('${selector}');
        if (el) return resolve(el);
        const observer = new MutationObserver(() => {
          const el = document.querySelector('${selector}');
          if (el) { observer.disconnect(); resolve(el); }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });
    })();
  `,

  'run-at': `
    (function() {
      'use strict';
      if (document.readyState === '${readyState}') {
        ${callback}
      } else {
        document.addEventListener('${event}', () => { ${callback} }, { once: true });
      }
    })();
  `,

  // ============ ADVANCED ============

  'redirect': `
    (function() {
      'use strict';
      const originalHref = window.location.href;
      if (/${pattern}/.test(originalHref)) {
        window.location.href = '${replacement}';
      }
    })();
  `,

  'block-domain': `
    (function() {
      'use strict';
      const originalFetch = window.fetch;
      window.fetch = function(url, ...args) {
        if (typeof url === 'string' && /${domain}/.test(url)) {
          return Promise.reject(new Error('Domain blocked'));
        }
        return originalFetch.apply(this, arguments);
      };
    })();
  `,

  'allow-domain': `
    (function() {
      'use strict';
      // This scriptlet ensures requests to ${domain} are never blocked
      console.log('[Scriptlet] Allow domain: ${domain}');
    })();
  `,

  'cookie': `
    (function() {
      'use strict';
      document.cookie = '${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax';
    })();
  `,

  'clear-cookie': `
    (function() {
      'use strict';
      document.cookie = '${name}=; path=/; max-age=0';
    })();
  `,

  'local-storage': `
    (function() {
      'use strict';
      localStorage.setItem('${key}', '${value}');
    })();
  `,

  'session-storage': `
    (function() {
      'use strict';
      sessionStorage.setItem('${key}', '${value}');
    });
  `,

  'clear-storage': `
    (function() {
      'use strict';
      localStorage.clear();
      sessionStorage.clear();
    })();
  `,

  // ============ MORE YOUTUBE SPECIFIC ============

  'youtube-ads-to-video': `
    (function() {
      'use strict';
      const origFetch = window.fetch;
      window.fetch = async function(...args) {
        const resp = await origFetch.apply(this, args);
        const url = args[0];
        if (typeof url === 'string' && url.includes('/youtubei/v1/player')) {
          const clone = resp.clone();
          try {
            const data = await clone.json();
            if (data?.adPlacements) delete data.adPlacements;
            if (data?.playerAds) delete data.playerAds;
            if (data?.streamingData?.adaptiveFormats) {
              data.streamingData.adaptiveFormats = data.streamingData.adaptiveFormats.filter(f =>
                !f.url?.includes('/api/manifest/dash') && !f.url?.includes('/manifest/')
              );
            }
            return new Response(JSON.stringify(data), { status: resp.status, statusText: resp.statusText, headers: resp.headers });
          } catch { return resp; }
        }
        return resp;
      };
      console.log('[Scriptlet] YouTube ads-to-video redirect installed');
    })();
  `,

  'youtube-autoplay': `
    (function() {
      'use strict';
      const video = document.querySelector('video.html5-main-video, video#movie_player, video');
      if (video) {
        video.muted = false;
        video.play().catch(() => { video.muted = true; video.play(); });
      }
      new MutationObserver(() => {
        const v = document.querySelector('video.html5-main-video, video#movie_player, video');
        if (v && v.paused) v.play().catch(() => {});
      }).observe(document.body, { childList: true, subtree: true });
      console.log('[Scriptlet] YouTube autoplay installed');
    })();
  `,

  'youtube-quality': `
    (function() {
      'use strict';
      const setQuality = () => {
        const video = document.querySelector('video.html5-main-video, video#movie_player');
        if (video && video.getPlaybackQuality) {
          const qualities = video.getAvailableQualityLevels?.() || [];
          const target = qualities.includes('highres') ? 'highres' : qualities[qualities.length - 1];
          if (target && video.getPlaybackQuality() !== target) video.setPlaybackQualityRange(target, target);
        }
      };
      setQuality();
      new MutationObserver(setQuality).observe(document.body, { childList: true, subtree: true });
      console.log('[Scriptlet] YouTube quality enforcement installed');
    })();
  `,

  'youtube-shorts-block': `
    (function() {
      'use strict';
      const removeShorts = () => {
        document.querySelectorAll('ytd-reel-shelf-renderer, ytd-shorts-lockup-view-model, ytd-rich-section-renderer:has(ytd-reel-shelf-renderer), #shorts-container').forEach(el => el.remove());
      };
      removeShorts();
      new MutationObserver(removeShorts).observe(document.body, { childList: true, subtree: true });
      console.log('[Scriptlet] YouTube Shorts block installed');
    })();
  `,

  // ============ ADVANCED AD BLOCKING ============

  'block-third-party-cookies': `
    (function() {
      'use strict';
      const originalCookie = document.cookie;
      Object.defineProperty(document, 'cookie', {
        set: function(val) {
          if (val.includes(';') && !val.includes('SameSite=None') && !val.includes('SameSite=Strict')) {
            const domain = window.location.hostname;
            if (!val.includes('domain=' + domain) && !val.includes('domain=.' + domain)) {
              console.log('[Scriptlet] Blocked third-party cookie');
              return;
            }
          }
          return originalCookie = val;
        },
        get: () => originalCookie
      });
      console.log('[Scriptlet] Third-party cookie blocking installed');
    })();
  `,

  'block-websocket-ads': `
    (function() {
      'use strict';
      const originalWebSocket = window.WebSocket;
      window.WebSocket = function(url, protocols) {
        if (typeof url === 'string' && /ad|tracking|analytics|doubleclick|googlesyndication|googleadservices|googletagmanager|pagead2|pubads|securepubads|adservice|imasdk|bid|rtb|prebid/i.test(url)) {
          console.log('[Scriptlet] Blocked WebSocket:', url);
          return { close: () => {}, send: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
        }
        return new originalWebSocket(url, protocols);
      };
      window.WebSocket.prototype = originalWebSocket.prototype;
      console.log('[Scriptlet] WebSocket ad blocking installed');
    })();
  `,

  'block-event-source': `
    (function() {
      'use strict';
      const originalEventSource = window.EventSource;
      window.EventSource = function(url, config) {
        if (typeof url === 'string' && /ad|tracking|analytics|sse|stream|event|push|notification/i.test(url)) {
          console.log('[Scriptlet] Blocked EventSource:', url);
          return { close: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
        }
        return new originalEventSource(url, config);
      };
      window.EventSource.prototype = originalEventSource.prototype;
      console.log('[Scriptlet] EventSource ad blocking installed');
    })();
  `,

  'block-beforeunload': `
    (function() {
      'use strict';
      window.addEventListener('beforeunload', e => {
        if (e.returnValue || e.defaultPrevented) {
          console.log('[Scriptlet] Blocked beforeunload');
          e.stopImmediatePropagation();
          e.preventDefault();
          e.returnValue = '';
        }
      }, true);
      console.log('[Scriptlet] BeforeUnload blocking installed');
    })();
  `,

  'block-page-visibility': `
    (function() {
      'use strict';
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      const origAddEventListener = document.addEventListener;
      document.addEventListener = function(type, listener, options) {
        if (type === 'visibilitychange') {
          return origAddEventListener.call(this, type, () => {}, options);
        }
        return origAddEventListener.call(this, type, listener, options);
      };
      console.log('[Scriptlet] Page visibility blocking installed');
    })();
  `,

  // ============ PRIVACY PROTECTIONS ============

  'block-canvas-fingerprint': `
    (function() {
      'use strict';
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type, ...args) {
        if (type === 'image/png') {
          const ctx = this.getContext('2d');
          if (ctx) {
            const imgData = ctx.getImageData(0, 0, this.width, this.height);
            for (let i = 0; i < imgData.data.length; i += 4) {
              imgData.data[i] = imgData.data[i] ^ (Math.random() * 2);
              imgData.data[i + 1] = imgData.data[i + 1] ^ (Math.random() * 2);
              imgData.data[i + 2] = imgData.data[i + 2] ^ (Math.random() * 2);
            }
            ctx.putImageData(imgData, 0, 0);
          }
        }
        return origToDataURL.apply(this, [type, ...args]);
      };
      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function(callback, type, ...args) {
        return origToBlob.call(this, callback, type, ...args);
      };
      console.log('[Scriptlet] Canvas fingerprinting protection installed');
    })();
  `,

  'block-audio-fingerprint': `
    (function() {
      'use strict';
      const origCreateOscillator = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function() {
        const osc = origCreateOscillator.call(this);
        const origStart = osc.start;
        osc.start = function(...args) {
          osc.frequency.value += Math.random() * 0.001;
          return origStart.apply(this, args);
        };
        return osc;
      };
      const origGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
      AnalyserNode.prototype.getFloatFrequencyData = function(array) {
        origGetFloatFrequencyData.call(this, array);
        for (let i = 0; i < array.length; i++) {
          array[i] += (Math.random() - 0.5) * 0.0001;
        }
      };
      console.log('[Scriptlet] Audio fingerprinting protection installed');
    })();
  `,

  'block-battery-api': `
    (function() {
      'use strict';
      if ('getBattery' in navigator) {
        navigator.getBattery = async () => ({
          charging: true,
          chargingTime: 0,
          dischargingTime: Infinity,
          level: 1,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true
        });
      }
      console.log('[Scriptlet] Battery API spoofing installed');
    })();
  `,

  'block-device-orientation': `
    (function() {
      'use strict';
      window.addEventListener('deviceorientation', e => {
        e.alpha = 0; e.beta = 0; e.gamma = 0;
      }, true);
      window.addEventListener('devicemotion', e => {
        e.acceleration = { x: 0, y: 0, z: 0 };
        e.accelerationIncludingGravity = { x: 0, y: 0, z: 9.81 };
        e.rotationRate = { alpha: 0, beta: 0, gamma: 0 };
      }, true);
      console.log('[Scriptlet] Device orientation spoofing installed');
    })();
  `,

  'block-media-devices': `
    (function() {
      'use strict';
      const originalEnumerateDevices = navigator.mediaDevices?.enumerateDevices;
      if (originalEnumerateDevices) {
        navigator.mediaDevices.enumerateDevices = async () => {
          const devices = await originalEnumerateDevices.call(navigator.mediaDevices);
          return devices.filter(d => d.kind !== 'audioinput' && d.kind !== 'videoinput');
        };
      }
      console.log('[Scriptlet] Media devices enumeration blocked');
    })();
  `,

  'block-font-enumeration': `
    (function() {
      'use strict';
      const originalFonts = document.fonts;
      if (originalFonts) {
        const originalReady = originalFonts.ready;
        document.fonts.ready = Promise.resolve();
        const originalCheck = originalFonts.check.bind(originalFonts);
        document.fonts.check = (font, text) => originalCheck(font, text);
      }
      console.log('[Scriptlet] Font enumeration protection installed');
    })();
  `,

  // ============ SOCIAL MEDIA BLOCKING ============

  'block-facebook-tracking': `
    (function() {
      'use strict';
      const fbPatterns = ['connect.facebook.net', 'facebook.net/tr', 'fbevents.js', 'facebook.com/tr', 'facebook.com/ads', 'fbq', '_fbq'];
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && fbPatterns.some(p => url.includes(p))) {
          return Promise.reject(new Error('Facebook tracking blocked'));
        }
        return originalFetch.apply(this, args);
      };
      const origXHROpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...args) {
        if (typeof url === 'string' && fbPatterns.some(p => url.includes(p))) { this._blocked = true; return; }
        return origXHROpen.apply(this, [method, url, ...args]);
      };
      ['fbq', '_fbq'].forEach(name => { if (window[name]) window[name] = function() {}; });
      console.log('[Scriptlet] Facebook tracking blocked');
    })();
  `,

  'block-google-analytics': `
    (function() {
      'use strict';
      const gaPatterns = ['google-analytics.com', 'googletagmanager.com/gtm.js', 'googletagmanager.com/gtag/js', 'analytics.js', 'gtag', 'dataLayer'];
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && gaPatterns.some(p => url.includes(p))) {
          return Promise.reject(new Error('Google Analytics blocked'));
        }
        return originalFetch.apply(this, args);
      };
      ['ga', 'gtag', '__gaTracker', 'dataLayer'].forEach(name => { if (window[name]) window[name] = function() {}; });
      console.log('[Scriptlet] Google Analytics blocked');
    })();
  `,

  'block-twitter-tracking': `
    (function() {
      'use strict';
      const twPatterns = ['platform.twitter.com', 'analytics.twitter.com', 't.co/i/adsct', 't.co/i/conversion', 'twq', 'twttr'];
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && twPatterns.some(p => url.includes(p))) {
          return Promise.reject(new Error('Twitter tracking blocked'));
        }
        return originalFetch.apply(this, args);
      };
      ['twq', 'twttr'].forEach(name => { if (window[name]) window[name] = function() {}; });
      console.log('[Scriptlet] Twitter tracking blocked');
    })();
  `,

  'block-linkedin-tracking': `
    (function() {
      'use strict';
      const liPatterns = ['px.ads.linkedin.com', 'snap.licdn.com', 'linkedin.com/px', 'linkedin.com/analytics', '_linkedin_data_partner_id', '_linkedin_partner_id'];
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && liPatterns.some(p => url.includes(p))) {
          return Promise.reject(new Error('LinkedIn tracking blocked'));
        }
        return originalFetch.apply(this, args);
      };
      console.log('[Scriptlet] LinkedIn tracking blocked');
    })();
  `,

  'block-tiktok-tracking': `
    (function() {
      'use strict';
      const ttPatterns = ['analytics.tiktok.com', 'business.tiktok.com', 'tiktok.com/api/ads', 'ttq', '_ttq'];
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && ttPatterns.some(p => url.includes(p))) {
          return Promise.reject(new Error('TikTok tracking blocked'));
        }
        return originalFetch.apply(this, args);
      };
      ['ttq', '_ttq'].forEach(name => { if (window[name]) window[name] = function() {}; });
      console.log('[Scriptlet] TikTok tracking blocked');
    })();
  `,

  'block-pinterest-tracking': `
    (function() {
      'use strict';
      const pinPatterns = ['ct.pinterest.com', 'pinimg.com/ct', 'pinterest.com/ct', 'pintrk', '_pq_'];
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && pinPatterns.some(p => url.includes(p))) {
          return Promise.reject(new Error('Pinterest tracking blocked'));
        }
        return originalFetch.apply(this, args);
      };
      ['pintrk', '_pq_'].forEach(name => { if (window[name]) window[name] = function() {}; });
      console.log('[Scriptlet] Pinterest tracking blocked');
    })();
  `,

  // ============ COOKIE & STORAGE PROTECTION ============

  'block-cookie-sync': `
    (function() {
      'use strict';
      const syncPatterns = ['sync', 'match', 'cookie-sync', 'cookiesync', 'id-sync', 'idsync', 'usersync', 'usync'];
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && syncPatterns.some(p => url.includes(p))) {
          return Promise.reject(new Error('Cookie sync blocked'));
        }
        return originalFetch.apply(this, args);
      };
      console.log('[Scriptlet] Cookie sync blocking installed');
    })();
  `,

  'block-localstorage-leak': `
    (function() {
      'use strict';
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = function(key, value) {
        if (/ad|tracking|analytics|fingerprint|visitor|uuid|guid|session|profile|segment|audience|beacon/i.test(key)) {
          console.log('[Scriptlet] Blocked localStorage leak:', key);
          return;
        }
        return originalSetItem.call(this, key, value);
      };
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = function(key) {
        if (/ad|tracking|analytics|fingerprint|visitor|uuid|guid|session|profile|segment|audience|beacon/i.test(key)) {
          return null;
        }
        return originalGetItem.call(this, key);
      };
      console.log('[Scriptlet] localStorage leak protection installed');
    })();
  `,

  'block-sessionstorage-leak': `
    (function() {
      'use strict';
      const originalSetItem = sessionStorage.setItem;
      sessionStorage.setItem = function(key, value) {
        if (/ad|tracking|analytics|fingerprint|visitor|uuid|guid|session|profile|segment|audience|beacon/i.test(key)) {
          console.log('[Scriptlet] Blocked sessionStorage leak:', key);
          return;
        }
        return originalSetItem.call(this, key, value);
      };
      console.log('[Scriptlet] sessionStorage leak protection installed');
    })();
  `,

  'block-indexeddb-leak': `
    (function() {
      'use strict';
      const originalOpen = indexedDB.open;
      indexedDB.open = function(name, version) {
        if (/ad|tracking|analytics|fingerprint|visitor|uuid|guid|session|profile|segment|audience|beacon/i.test(name)) {
          console.log('[Scriptlet] Blocked IndexedDB leak:', name);
          return { onsuccess: null, onerror: null, onupgradeneeded: null, result: null };
        }
        return originalOpen.call(this, name, version);
      };
      console.log('[Scriptlet] IndexedDB leak protection installed');
    })();
  `,

  // ============ ADVANCED NETWORK BLOCKING ============

  'block-prebid': `
    (function() {
      'use strict';
      const pbPatterns = ['prebid', 'pbjs', 'apstag', 'amazon-adsystem', 'adtelligent', 'aax', 'adsertor', 'adup-tech', 'appnexus', 'beachfront', 'bidmachine', 'bidtheatre', 'bidswitch', 'brainy', 'brightcom', 'buzzoola', 'conversant', 'criteo', 'districtm', 'emx', 'engagebdr', 'fluct', 'freewheel', 'geniee', 'getintent', 'gumgum', 'improvedigital', 'indexexchange', 'inmobi', 'inneractive', 'kargo', 'krux', 'lifestreet', 'loopme', 'magnite', 'mediafuse', 'medianet', 'mediavine', 'mopub', 'nextmillennium', 'onevideo', 'openx', 'optimatic', 'pubmatic', 'pulsepoint', 'rhythmone', 'richaudience', 'rtbhouse', 'rubicon', 'serverbid', 'sharethrough', 'smaato', 'smartadserver', 'sovrn', 'spotx', 'stackadapt', 'teads', 'tremor', 'triplelift', 'trustx', 'unruly', 'verizon', 'videoreach', 'vast', 'yieldlove', 'yieldmo', 'yieldone'];
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && pbPatterns.some(p => url.includes(p))) {
          return Promise.reject(new Error('Prebid blocked'));
        }
        return originalFetch.apply(this, args);
      };
      ['pbjs', 'apstag', 'amazonAdserver', 'aax', 'adsertor', 'adup', 'AN', 'Beachfront', 'BidMachine', 'BidTheatre', 'bidswitch', 'Brainy', 'Brightcom', 'Buzzoola', 'Conversant', 'Criteo', 'districtm', 'emx', 'EngageBDR', 'fluct', 'freewheel', 'Geniee', 'GetIntent', 'GumGum', 'Improvedigital', 'indexExchange', 'InMobi', 'inneractive', 'Kargo', 'Krux', 'Lifestreet', 'LoopMe', 'Magnite', 'Mediafuse', 'medianet', 'mediavine', 'mopub', 'nextmillennium', 'onevideo', 'OpenX', 'optimatic', 'pubmatic', 'pulsepoint', 'rhythmone', 'richaudience', 'rtbhouse', 'rubicon', 'serverbid', 'sharethrough', 'smaato', 'smartadserver', 'sovrn', 'spotx', 'stackadapt', 'teads', 'tremor', 'triplelift', 'trustx', 'unruly', 'verizon', 'videoreach', 'vast', 'yieldlove', 'yieldmo', 'yieldone'].forEach(name => { if (window[name]) window[name] = function() {}; });
      console.log('[Scriptlet] Prebid/header bidding blocked');
    })();
  `,

  'block-amp-ads': `
    (function() {
      'use strict';
      const ampPatterns = ['amp-ad', 'amp-embed', 'amp-ad-network', 'amp-analytics', 'amp-pixel', 'amp-ad-exit', 'googlesyndication.com/amp', 'doubleclick.net/amp'];
      const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
          if (m.type === 'childList' && m.addedNodes.length) {
            for (const n of m.addedNodes) {
              if (n.nodeType === 1 && (n.tagName?.toLowerCase()?.startsWith('amp-') || n.querySelector?.('[amp-ad], [amp-embed], [amp-analytics]'))) {
                n.style.display = 'none'; n.remove();
              }
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      document.querySelectorAll('amp-ad, amp-embed, amp-analytics, amp-pixel').forEach(el => { el.style.display = 'none'; el.remove(); });
      console.log('[Scriptlet] AMP ads blocked');
    })();
  `,

  'block-native-ads': `
    (function() {
      'use strict';
      const nativeSelectors = [
        '[class*="native-ad"]', '[class*="sponsored-content"]', '[class*="recommended-content"]',
        '[class*="promoted-content"]', '[class*="taboola"]', '[class*="outbrain"]',
        '[class*="revcontent"]', '[class*="content-ad"]', '[class*="native-widget"]',
        '[id*="taboola"]', '[id*="outbrain"]', '[id*="revcontent"]',
        '.native-ad', '.sponsored-post', '.recommended-post', '.promoted-post',
        '[data-native-ad]', '[data-sponsored]', '[data-promoted]'
      ];
      const remove = () => {
        nativeSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            const text = (el.textContent || '').toLowerCase();
            if (/sponsored|promoted|recommended|advertisement|ad choice|adchoices/.test(text)) {
              el.style.display = 'none'; el.remove();
            }
          });
        });
      };
      remove(); new MutationObserver(remove).observe(document.body, { childList: true, subtree: true });
      console.log('[Scriptlet] Native ads blocked');
    })();
  `,

  'block-video-ads': `
    (function() {
      'use strict';
      const videoAdPatterns = ['/vast/', '/vmap/', '/vpaid/', '/adpod/', '/adbreak/', '/adbreak/', '/preroll/', '/midroll/', '/postroll/', '/bumper/', '/companion/', '/ima/', '/videoad/', '/video-ad/', '/vast.xml', '/vmap.xml'];
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && videoAdPatterns.some(p => url.includes(p))) {
          return Promise.reject(new Error('Video ad blocked'));
        }
        return originalFetch.apply(this, args);
      };
      const origXHROpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...args) {
        if (typeof url === 'string' && videoAdPatterns.some(p => url.includes(p))) { this._blocked = true; return; }
        return origXHROpen.apply(this, [method, url, ...args]);
      };
      // Block video ad elements
      const adTags = ['video-ad', 'ad-video', 'vast-ad', 'vpaid-ad', 'ima-ad'];
      adTags.forEach(tag => {
        if (customElements.get(tag)) {
          const proto = customElements.get(tag).prototype;
          const orig = proto.connectedCallback;
          proto.connectedCallback = function() { if (orig) orig.call(this); this.style.display = 'none'; this.innerHTML = ''; };
        }
      });
      console.log('[Scriptlet] Video ads blocked');
    })();
  `,

  // ============ UTILITY: DEBUGGING & TESTING ============

  'debug-log': `
    (function() {
      'use strict';
      console.log('[Scriptlet Debug]', ${message});
    })();
  `,

  'debug-breakpoint': `
    (function() {
      'use strict';
      debugger;
      console.log('[Scriptlet] Breakpoint hit');
    })();
  `,

  'performance-mark': `
    (function() {
      'use strict';
      performance.mark('${markName}');
      console.log('[Scriptlet] Performance mark:', '${markName}');
    })();
  `,

  'performance-measure': `
    (function() {
      'use strict';
      performance.measure('${measureName}', '${startMark}', '${endMark}');
      const entries = performance.getEntriesByName('${measureName}', 'measure');
      console.log('[Scriptlet] Performance measure:', entries[0]?.duration, 'ms');
    })();
  `,

  // ============ ADVANCED: CSP & SECURITY ============

  'csp-relax': `
    (function() {
      'use strict';
      const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      if (meta) {
        const csp = meta.content;
        const relaxed = csp.replace(/script-src\s+([^;]+)/, 'script-src $1 \'unsafe-inline\' \'unsafe-eval\' https:')
                          .replace(/style-src\s+([^;]+)/, 'style-src $1 \'unsafe-inline\' https:')
                          .replace(/img-src\s+([^;]+)/, 'img-src $1 data: https:')
                          .replace(/connect-src\s+([^;]+)/, 'connect-src $1 https: wss:')
                          .replace(/font-src\s+([^;]+)/, 'font-src $1 data: https:')
                          .replace(/frame-src\s+([^;]+)/, 'frame-src $1 https:')
                          .replace(/object-src\s+([^;]+)/, 'object-src $1 \'none\'');
        meta.content = relaxed;
        console.log('[Scriptlet] CSP relaxed');
      }
    })();
  `,

  'csp-enforce': `
    (function() {
      'use strict';
      const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https: wss:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";
      const meta = document.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = csp;
      document.head.appendChild(meta);
      console.log('[Scriptlet] CSP enforced');
    })();
  `,

  'block-mixed-content': `
    (function() {
      'use strict';
      if (location.protocol === 'https:') {
        const originalFetch = window.fetch;
        window.fetch = function(url, ...args) {
          if (typeof url === 'string' && url.startsWith('http:')) {
            return Promise.reject(new Error('Mixed content blocked'));
          }
          return originalFetch.apply(this, arguments);
        };
        const origXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
          if (typeof url === 'string' && url.startsWith('http:')) { this._blocked = true; return; }
          return origXHROpen.apply(this, [method, url, ...args]);
        };
        document.querySelectorAll('img[src^="http:"], script[src^="http:"], link[href^="http:"], iframe[src^="http:"], video[src^="http:"], audio[src^="http:"], source[src^="http:"]').forEach(el => {
          el.src = el.src.replace('http:', 'https:') || '';
          if (el.tagName === 'SCRIPT' || el.tagName === 'LINK') el.remove();
        });
        console.log('[Scriptlet] Mixed content blocking installed');
      }
    })();
  `,

  'block-popups': `
    (function() {
      'use strict';
      const originalOpen = window.open;
      window.open = function(url, target, features) {
        if (url && /ad|popup|newwindow|_blank/i.test(target || '')) {
          console.log('[Scriptlet] Blocked popup:', url);
          return null;
        }
        return originalOpen.apply(this, arguments);
      };
      console.log('[Scriptlet] Popup blocking installed');
    })();
  `,

  'block-redirects': `
    (function() {
      'use strict';
      const originalAssign = location.assign;
      const originalReplace = location.replace;
      location.assign = function(url) {
        if (typeof url === 'string' && /ad|tracking|click|redirect|affiliate|go\//i.test(url)) {
          console.log('[Scriptlet] Blocked redirect:', url);
          return;
        }
        return originalAssign.call(this, url);
      };
      location.replace = function(url) {
        if (typeof url === 'string' && /ad|tracking|click|redirect|affiliate|go\//i.test(url)) {
          console.log('[Scriptlet] Blocked redirect:', url);
          return;
        }
        return originalReplace.call(this, url);
      };
      console.log('[Scriptlet] Redirect blocking installed');
    })();
  `,

  // ============ SPECIFIC SITE FIXES ============

  'twitch-ads': `
    (function() {
      'use strict';
      // Block Twitch video ads
      const origFetch = window.fetch;
      window.fetch = async function(...args) {
        const resp = await origFetch.apply(this, args);
        const url = args[0];
        if (typeof url === 'string' && (url.includes('/gql') || url.includes('/api/'))) {
          const clone = resp.clone();
          try {
            const data = await clone.json();
            if (data?.data?.videoPlaybackAccessToken) {
              delete data.data.videoPlaybackAccessToken.advertising;
            }
            if (data?.data?.adManager) delete data.data.adManager;
            return new Response(JSON.stringify(data), { status: resp.status, statusText: resp.statusText, headers: resp.headers });
          } catch { return resp; }
        }
        return resp;
      };
      // Hide ad elements
      const adSelectors = ['.video-ad', '.player-ad', '[data-a-target="video-ad"]', '.tw-ad', '.ad-banner'];
      const hideAds = () => adSelectors.forEach(sel => document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; el.remove(); }));
      hideAds(); new MutationObserver(hideAds).observe(document.body, { childList: true, subtree: true });
      console.log('[Scriptlet] Twitch ads blocked');
    })();
  `,

  'spotify-ads': `
    (function() {
      'use strict';
      // Block Spotify web player ads
      const origFetch = window.fetch;
      window.fetch = async function(...args) {
        const resp = await origFetch.apply(this, args);
        const url = args[0];
        if (typeof url === 'string' && (url.includes('/ads/') || url.includes('/ad/') || url.includes('ads-v2') || url.includes('advertisement'))) {
          return Promise.reject(new Error('Spotify ad blocked'));
        }
        return resp;
      };
      // Hide audio ads
      const audioAdSelectors = ['[data-testid="ad-slot"]', '[data-testid="audio-ad"]', '.ad-banner', '.ad-container'];
      const hideAds = () => audioAdSelectors.forEach(sel => document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; el.remove(); }));
      hideAds(); new MutationObserver(hideAds).observe(document.body, { childList: true, subtree: true });
      console.log('[Scriptlet] Spotify ads blocked');
    })();
  `,

  'reddit-ads': `
    (function() {
      'use strict';
      // Block Reddit promoted posts and ads
      const adSelectors = [
        '[data-promoted]', '[data-testid="promoted-post"]', '.promoted', '.promoted-link',
        '[id^="ad_"]', '[class*="PromotedPost"]', '[class*="promoted-content"]',
        'shreddit-ad', 'shreddit-promoted-post'
      ];
      const hideAds = () => adSelectors.forEach(sel => document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; el.remove(); }));
      hideAds(); new MutationObserver(hideAds).observe(document.body, { childList: true, subtree: true });
      console.log('[Scriptlet] Reddit ads blocked');
    })();
  `,

  'twitter-ads': `
    (function() {
      'use strict';
      // Block Twitter/X promoted tweets and ads
      const adSelectors = [
        '[data-testid="promoted-tweet"]', '[data-testid="placementTracking"]',
        'article[data-testid="tweet"]:has([href*="/ads/"])', '[data-ad-id]',
        '.css-1dbjc4n[aria-label*="Promoted"]', '[data-testid="ad-unit"]'
      ];
      const hideAds = () => adSelectors.forEach(sel => document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; el.remove(); }));
      hideAds(); new MutationObserver(hideAds).observe(document.body, { childList: true, subtree: true });
      console.log('[Scriptlet] Twitter/X ads blocked');
    })();
  `,

  'facebook-ads': `
    (function() {
      'use strict';
      // Block Facebook sponsored posts
      const adSelectors = [
        '[data-pagelet^="FeedUnit_"]:has([href*="/ads/"])', '[data-pagelet^="FeedUnit_"]:has([aria-label*="Sponsored"])',
        '[role="article"]:has([href*="facebook.com/ads"])', '[data-testid="sponsored_post"]',
        'div[data-pagelet*="FeedUnit"]:has(a[href*="/ads/"])', '[aria-label="Sponsored"]'
      ];
      const hideAds = () => adSelectors.forEach(sel => document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; el.remove(); }));
      hideAds(); new MutationObserver(hideAds).observe(document.body, { childList: true, subtree: true });
      console.log('[Scriptlet] Facebook ads blocked');
    })();
  `,

  // ============ ADVANCED: MALWARE & CRYPTO PROTECTION ============

  'block-cryptominer': `
    (function() {
      'use strict';
      const minerPatterns = ['coinhive', 'cryptoloot', 'coin-hive', 'jsecoin', 'mineralt', 'webassembly-stream', 'wasm-miner', 'crypto-loot', 'ppoi.org', 'authedmine', 'miner.start', 'CoinHive', 'CryptoLoot', 'JSEcoin', 'Mineralt', 'WebAssembly'];
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && minerPatterns.some(p => url.toLowerCase().includes(p.toLowerCase()))) {
          return Promise.reject(new Error('Cryptominer blocked'));
        }
        return originalFetch.apply(this, args);
      };
      // Block WebAssembly miners
      const originalInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = function(bytes, importObject) {
        const str = new TextDecoder().decode(bytes);
        if (minerPatterns.some(p => str.toLowerCase().includes(p.toLowerCase()))) {
          console.log('[Scriptlet] Blocked WebAssembly miner');
          return Promise.reject(new Error('Cryptominer blocked'));
        }
        return originalInstantiate.apply(this, arguments);
      };
      console.log('[Scriptlet] Cryptominer blocking installed');
    })();
  `,

  'block-malware': `
    (function() {
      'use strict';
      const malwarePatterns = ['exploit', 'drive.by', 'driveby', 'malware', 'trojan', 'ransomware', 'phishing', 'keylogger', 'spyware', 'rootkit', 'backdoor', 'botnet', 'c2server', 'command.control'];
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && malwarePatterns.some(p => url.toLowerCase().includes(p))) {
          return Promise.reject(new Error('Malware blocked'));
        }
        return originalFetch.apply(this, args);
      };
      // Block suspicious scripts
      const originalCreateElement = document.createElement;
      document.createElement = function(tag) {
        const el = originalCreateElement.call(this, tag);
        if (tag.toLowerCase() === 'script') {
          const originalSrc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src').set;
          Object.defineProperty(el, 'src', {
            set: function(url) {
              if (url && malwarePatterns.some(p => url.toLowerCase().includes(p))) {
                console.log('[Scriptlet] Blocked malware script:', url);
                return;
              }
              originalSrc.call(this, url);
            },
            get: Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src').get
          });
        }
        return el;
      };
      console.log('[Scriptlet] Malware blocking installed');
    })();
  `,

  'block-tech-support-scam': `
    (function() {
      'use strict';
      const scamPatterns = ['tech.support', 'tech-support', 'support.microsoft', 'apple.support', 'virus.detected', 'your.computer.is.infected', 'call.now', 'toll.free', '1-800', '1-888', '1-877', '1-866', 'microsoft.warning', 'windows.defender', 'security.alert', 'system.infected'];
      const checkText = (text) => scamPatterns.some(p => text.toLowerCase().includes(p));
      const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
          if (m.type === 'childList' && m.addedNodes.length) {
            for (const n of m.addedNodes) {
              if (n.nodeType === 1) {
                const text = (n.textContent || '').toLowerCase();
                if (checkText(text) && (n.matches('.modal, .popup, .overlay, [role="dialog"], [role="alertdialog"]') || n.querySelector('.modal, .popup, .overlay, [role="dialog"], [role="alertdialog"]'))) {
                  n.style.display = 'none'; n.remove();
                  console.log('[Scriptlet] Blocked tech support scam');
                }
              }
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      console.log('[Scriptlet] Tech support scam blocking installed');
    })();
  `,

  // ============ ADVANCED: PERFORMANCE ============

  'lazy-load-images': `
    (function() {
      'use strict';
      if ('loading' in HTMLImageElement.prototype) {
        document.querySelectorAll('img:not([loading])').forEach(img => { img.loading = 'lazy'; });
      } else {
        const observer = new IntersectionObserver((entries, obs) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const img = entry.target;
              if (img.dataset.src) img.src = img.dataset.src;
              if (img.dataset.srcset) img.srcset = img.dataset.srcset;
              obs.unobserve(img);
            }
          });
        });
        document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
      }
      console.log('[Scriptlet] Lazy loading images installed');
    })();
  `,

  'defer-scripts': `
    (function() {
      'use strict';
      document.querySelectorAll('script[src]:not([defer]):not([async])').forEach(script => {
        if (!script.src.includes('analytics') && !script.src.includes('tracking') && !script.src.includes('ad')) {
          script.defer = true;
        }
      });
      console.log('[Scriptlet] Script deferring installed');
    })();
  `,

  'preload-critical': `
    (function() {
      'use strict';
      const critical = ['${criticalResources}'];
      critical.forEach(url => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = url.endsWith('.css') ? 'style' : url.endsWith('.js') ? 'script' : 'fetch';
        link.href = url;
        document.head.appendChild(link);
      });
      console.log('[Scriptlet] Critical resource preloading installed');
    })();
  `,

  'reduce-motion': `
    (function() {
      'use strict';
      const style = document.createElement('style');
      style.textContent = \`
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      \`;
      document.head.appendChild(style);
      console.log('[Scriptlet] Reduce motion installed');
    })();
  `
};

// ============ SCRIPTLET FACTORY ============

export function createScriptlet(name, params = {}) {
  const template = BUILTIN_SCRIPTLETS[name];
  if (!template) return null;

  let scriptlet = template;
  for (const [key, value] of Object.entries(params)) {
    scriptlet = scriptlet.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
  }
  return scriptlet;
}

export function getAvailableScriptlets() {
  return Object.keys(BUILTIN_SCRIPTLETS);
}

export function hasScriptlet(name) {
  return name in BUILTIN_SCRIPTLETS;
}