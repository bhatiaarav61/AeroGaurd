// content/scriptlet-defuser.js — Main-world scriptlet injection engine
(() => {
  'use strict';

  // Scriptlet definitions
  const SCRIPTLETS = {
    // Abort current inline script
    'abort-current-inline-script': `
      (function() {
        var currentScript = document.currentScript;
        if (currentScript) currentScript.remove();
      })();
    `,

    // Noop function
    'noopfunc': `
      (function() { return function() {}; })(arguments);
    `,

    // Prevent XHR
    'prevent-xhr': `
      (function() {
        var origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url) {
          if (url && (url.includes('analytics') || url.includes('tracking') || url.includes('telemetry'))) {
            throw new Error('XHR blocked by adblocker');
          }
          return origOpen.apply(this, arguments);
        };
      })();
    `,

    // Prevent fetch
    'prevent-fetch': `
      (function() {
        var origFetch = window.fetch;
        window.fetch = function(url, options) {
          if (url && (url.includes('analytics') || url.includes('tracking') || url.includes('telemetry'))) {
            return Promise.reject(new Error('Fetch blocked by adblocker'));
          }
          return origFetch.apply(this, arguments);
        };
      })();
    `,

    // Remove node
    'remove-node': `
      (function(args) {
        var selector = args[0];
        var root = args[1] || document;
        var elements = root.querySelectorAll(selector);
        elements.forEach(function(el) { el.remove(); });
      })(arguments);
    `,

    // Override property
    'override-property': `
      (function(args) {
        var obj = args[0];
        var prop = args[1];
        var value = args[2];
        if (obj) {
          Object.defineProperty(obj, prop, {
            value: value,
            writable: false,
            configurable: true
          });
        }
      })(arguments);
    `,

    // Set constant
    'set-constant': `
      (function(args) {
        var obj = args[0];
        var prop = args[1];
        var value = args[2];
        Object.defineProperty(obj, prop, {
          value: value,
          writable: false,
          configurable: true
        });
      })(arguments);
    `,

    // Trust setTimeout
    'trust-setTimeout': `
      (function() {
        var orig = window.setTimeout;
        window.setTimeout = function(fn, delay) {
          if (typeof fn === 'function') return orig(fn, delay);
          return orig(fn, delay);
        };
      })();
    `,

    // Trust setInterval
    'trust-setInterval': `
      (function() {
        var orig = window.setInterval;
        window.setInterval = function(fn, delay) {
          if (typeof fn === 'function') return orig(fn, delay);
          return orig(fn, delay);
        };
      })();
    `,

    // Defuse adblock detection
    'adblock-detection-stub': `
      (function() {
        var props = [
          'adblock', 'adBlock', 'adblocker', 'adBlocker', 'adBlockDetected',
          'adblockDetected', 'canRunAds', 'isAdBlocked', 'hasAdBlock',
          'blockedAds', 'blockedTrackers'
        ];
        props.forEach(function(prop) {
          Object.defineProperty(window, prop, {
            value: false, writable: false, configurable: true
          });
        });
        ['detectAdblock', 'checkAdblock', 'adblockDetected', 'onAdblockDetected'].forEach(function(fn) {
          window[fn] = function() { return false; };
        });
      })();
    `,

    // Google AdSense stub
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

  // Scriptlet Manager
  window.ScriptletManager = {
    scriptlets: SCRIPTLETS,

    getScriptlet: function(name) {
      return this.scriptlets[name] || null;
    },

    getScriptletNames: function() {
      return Object.keys(this.scriptlets);
    },

    compileScriptlet: function(name, args = []) {
      const source = this.getScriptlet(name);
      if (!source) return null;

      const cacheKey = name + ':' + JSON.stringify(args);
      if (this.compiledScriptlets?.has?.(cacheKey)) {
        return this.compiledScriptlets.get(cacheKey);
      }

      const compiled = new Function('args', `
        try {
          ${source}
        } catch (e) {
          console.error('[Scriptlet] Error in ${name}:', e);
        }
      `);

      if (!this.compiledScriptlets) this.compiledScriptlets = new Map();
      this.compiledScriptlets.set(cacheKey, compiled);
      return compiled;
    },

    generateScriptletURL: function(name, args = []) {
      const source = this.getScriptlet(name);
      if (!source) return null;

      const code = `
        (function() {
          var args = ${JSON.stringify(args)};
          try {
            ${this.scriptlets[name]}
          } catch (e) {
            console.error('[Scriptlet] Error in ${name}:', e);
          }
        })();
      `;

      const encoded = encodeURIComponent(code);
      return `data:text/javascript,${encoded}`;
    },

    createScriptletRule: function(name, args, urlFilter, options = {}) {
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
    },

    registerScriptlet: function(name, source) {
      this.scriptlets[name] = source;
      this.compiledScriptlets?.clear?.();
    },

    removeScriptlet: function(name) {
      delete this.scriptlets[name];
      this.compiledScriptlets?.clear?.();
    },

    getStats: function() {
      return {
        enabled: true,
        scriptletCount: Object.keys(this.scriptlets).length,
        compiledCount: this.compiledScriptlets?.size || 0
      };
    },

    setEnabled: function(enabled) {
      this.enabled = enabled;
    },

    setExtensionId: function(id) {
      this.extensionId = id;
    },

    clearCache: function() {
      this.compiledScriptlets?.clear?.();
      this.injectionCache?.clear?.();
    }
  };

  // Export for MAIN world
  window.ScriptletManager = ScriptletManager;
  window.SCRIPTLETS = SCRIPTLETS;

  console.log('[Scriptlet Manager] Loaded with', Object.keys(SCRIPTLETS).length, 'scriptlets');
})();