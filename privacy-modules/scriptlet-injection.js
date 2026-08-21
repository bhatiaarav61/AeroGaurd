/**
 * Scriptlet Injection System
 * Injects scriptlets via DNR redirect to handle inline scripts, anti-adblock,
 * and other advanced filtering that can't be done with network rules alone
 *
 * Based on uBlock Origin's scriptlet injection and Brave's implementation
 */

// Scriptlet definitions
const SCRIPTLETS = {
  // Abort current inline script execution
  'abort-current-inline-script': `
    (function() {
      var currentScript = document.currentScript;
      if (currentScript) {
        currentScript.remove();
      }
    })();
  `,

  // Abort on property read
  'abort-on-property-read': `
    (function(args) {
      var obj = args[0];
      var prop = args[1];
      var original = Object.getOwnPropertyDescriptor(obj, prop);
      if (original && original.get) {
        Object.defineProperty(obj, prop, {
          get: function() {
            throw new Error('Property access blocked by adblocker');
          },
          configurable: true
        });
      }
    })(arguments);
  `,

  // Abort on property write
  'abort-on-property-write': `
    (function(args) {
      var obj = args[0];
      var prop = args[1];
      var original = Object.getOwnPropertyDescriptor(obj, prop);
      if (original && original.set) {
        Object.defineProperty(obj, prop, {
          set: function() {
            throw new Error('Property write blocked by adblocker');
          },
          configurable: true
        });
      }
    })(arguments);
  `,

  // Add event listener
  'add-event-listener': `
    (function(args) {
      var target = args[0] || window;
      var type = args[1];
      var listener = args[2];
      var options = args[3];
      if (target && target.addEventListener) {
        target.addEventListener(type, listener, options);
      }
    })(arguments);
  `,

  // JSON prune
  'json-prune': `
    (function(args) {
      var obj = args[0];
      var paths = args[1] || [];
      function prune(o, path) {
        if (!o || typeof o !== 'object') return o;
        if (Array.isArray(o)) {
          return o.map(function(item) { return prune(item, path); });
        }
        var result = {};
        for (var key in o) {
          if (o.hasOwnProperty(key)) {
            var newPath = path ? path + '.' + key : key;
            if (paths.indexOf(newPath) === -1 && paths.indexOf(key) === -1) {
              result[key] = prune(o[key], newPath);
            }
          }
        }
        return result;
      }
      return prune(obj, '');
    })(arguments);
  `,

  // Log
  'log': `
    (function(args) {
      console.log('[Scriptlet]', ...args);
    })(arguments);
  `,

  // Noop
  'noop': `
    (function() {});
  `,

  // Noop function
  'noopfunc': `
    (function() { return function() {}; })(arguments);
  `,

  // Object from string
  'object-from-string': `
    (function(args) {
      try {
        return JSON.parse(args[0]);
      } catch (e) {
        return {};
      }
    })(arguments);
  `,

  // Object prototype
  'object-prototype': `
    (function(args) {
      var obj = args[0];
      var proto = args[1];
      if (obj && proto) {
        Object.setPrototypeOf(obj, proto);
      }
    })(arguments);
  `,

  // Preload
  'preload': `
    (function(args) {
      var url = args[0];
      var link = document.createElement('link');
      link.rel = 'preload';
      link.href = url;
      link.as = args[1] || 'script';
      document.head.appendChild(link);
    })(arguments);
  `,

  // Redirect
  'redirect': `
    (function(args) {
      var url = args[0];
      if (url) {
        window.location.href = url;
      }
    })(arguments);
  `,

  // Remove event listener
  'remove-event-listener': `
    (function(args) {
      var target = args[0] || window;
      var type = args[1];
      var listener = args[2];
      var options = args[3];
      if (target && target.removeEventListener) {
        target.removeEventListener(type, listener, options);
      }
    })(arguments);
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

  // Replace content
  'replace-content': `
    (function(args) {
      var selector = args[0];
      var replacement = args[1];
      var root = args[2] || document;
      var elements = root.querySelectorAll(selector);
      elements.forEach(function(el) { el.textContent = replacement; });
    })(arguments);
  `,

  // Script observer
  'script-observer': `
    (function(args) {
      var selector = args[0];
      var callback = args[1];
      var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === 1 && node.matches && node.matches(selector)) {
              callback(node);
            }
            if (node.nodeType === 1) {
              var matches = node.querySelectorAll(selector);
              matches.forEach(function(el) { callback(el); });
            }
          });
        });
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      return observer;
    })(arguments);
  `,

  // Set attribute
  'set-attr': `
    (function(args) {
      var selector = args[0];
      var attr = args[1];
      var value = args[2];
      var root = args[3] || document;
      var elements = root.querySelectorAll(selector);
      elements.forEach(function(el) { el.setAttribute(attr, value); });
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

  // toString override
  'toString': `
    (function(args) {
      var obj = args[0];
      var value = args[1];
      if (obj && obj.toString) {
        var original = obj.toString;
        obj.toString = function() { return value; };
      }
    })(arguments);
  `,

  // Trust setTimeout
  'trust-setTimeout': `
    (function(args) {
      var original = window.setTimeout;
      window.setTimeout = function(fn, delay) {
        if (typeof fn === 'function') {
          return original(fn, delay);
        }
        return original(fn, delay);
      };
    })(arguments);
  `,

  // Trust setInterval
  'trust-setInterval': `
    (function(args) {
      var original = window.setInterval;
      window.setInterval = function(fn, delay) {
        if (typeof fn === 'function') {
          return original(fn, delay);
        }
        return original(fn, delay);
      };
    })(arguments);
  `,

  // uBO element picker helper
  'ubo-epicker': `
    (function(args) {
      var selector = args[0];
      var element = document.querySelector(selector);
      if (element) {
        element.__epicker = true;
        element.style.outline = '2px solid #ff0000';
      }
      return element;
    })(arguments);
  `,

  // Prevent XHR/fetch
  'prevent-xhr': `
    (function(args) {
      var originalXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        var xhr = new originalXHR();
        var originalOpen = xhr.open;
        xhr.open = function(method, url) {
          if (url && url.includes('analytics') || url.includes('tracking')) {
            throw new Error('XHR blocked by adblocker');
          }
          return originalOpen.apply(this, arguments);
        };
        return xhr;
      };
    })(arguments);
  `,

  // Prevent fetch
  'prevent-fetch': `
    (function(args) {
      var originalFetch = window.fetch;
      window.fetch = function(url, options) {
        if (url && (url.includes('analytics') || url.includes('tracking') || url.includes('telemetry'))) {
          return Promise.reject(new Error('Fetch blocked by adblocker'));
        }
        return originalFetch.apply(this, arguments);
      };
    })(arguments);
  `,

  // Block cookies
  'block-cookies': `
    (function(args) {
      Object.defineProperty(document, 'cookie', {
        get: function() { return ''; },
        set: function() {},
        configurable: true
      });
    })(arguments);
  `,

  // Defuse namespace
  'defuse': `
    (function(args) {
      var namespace = args[0];
      var props = args[1] || [];
      if (window[namespace]) {
        props.forEach(function(prop) {
          try {
            delete window[namespace][prop];
          } catch (e) {}
        });
      }
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

  // Queue for later execution
  'queue': `
    (function(args) {
      var fn = args[0];
      if (typeof fn === 'function') {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', fn);
        } else {
          fn();
        }
      }
    })(arguments);
  `,

  // Raise exception
  'raise-exception': `
    (function(args) {
      throw new Error(args[0] || 'Scriptlet exception');
    })(arguments);
  `,

  // Remove attribute
  'remove-attr': `
    (function(args) {
      var selector = args[0];
      var attr = args[1];
      var root = args[2] || document;
      var elements = root.querySelectorAll(selector);
      elements.forEach(function(el) { el.removeAttribute(attr); });
    })(arguments);
  `,

  // Remove class
  'remove-class': `
    (function(args) {
      var selector = args[0];
      var className = args[1];
      var root = args[2] || document;
      var elements = root.querySelectorAll(selector);
      elements.forEach(function(el) { el.classList.remove(className); });
    })(arguments);
  `,

  // Set cookie
  'set-cookie': `
    (function(args) {
      var name = args[0];
      var value = args[1];
      var options = args[2] || {};
      var cookie = name + '=' + encodeURIComponent(value);
      if (options.domain) cookie += '; domain=' + options.domain;
      if (options.path) cookie += '; path=' + options.path;
      if (options.maxAge) cookie += '; max-age=' + options.maxAge;
      if (options.expires) cookie += '; expires=' + options.expires.toUTCString();
      if (options.secure) cookie += '; secure';
      if (options.sameSite) cookie += '; samesite=' + options.sameSite;
      document.cookie = cookie;
    })(arguments);
  `,

  // Unblock network request
  'unblock-network': `
    (function(args) {
      // This scriptlet signals that the network request should be allowed
      // The actual unblocking is done by DNR allow rules
      window.__unblocked = window.__unblocked || [];
      window.__unblocked.push(args[0]);
    })(arguments);
  `,

  // Watchdog for anti-adblock
  'watchdog': `
    (function(args) {
      var interval = args[0] || 100;
      var checks = args[1] || [];
      var timer = setInterval(function() {
        checks.forEach(function(check) {
          try {
            var result = eval(check);
            if (result) {
              clearInterval(timer);
            }
          } catch (e) {}
        });
      }, interval);
      return timer;
    })(arguments);
  `
};

/**
 * Scriptlet Manager
 * Manages scriptlet registration, compilation, and injection
 */
class ScriptletManager {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.extensionId = options.extensionId || '';
    this.scriptlets = { ...SCRIPTLETS };
    this.compiledScriptlets = new Map();
    this.injectionCache = new Map();
  }

  /**
   * Get scriptlet source code
   */
  getScriptlet(name) {
    return this.scriptlets[name] || null;
  }

  /**
   * Get all available scriptlet names
   */
  getScriptletNames() {
    return Object.keys(this.scriptlets);
  }

  /**
   * Compile a scriptlet into an injectable function
   */
  compileScriptlet(name, args = []) {
    const source = this.getScriptlet(name);
    if (!source) return null;

    // Create a cache key
    const cacheKey = name + ':' + JSON.stringify(args);
    if (this.compiledScriptlets.has(cacheKey)) {
      return this.compiledScriptlets.get(cacheKey);
    }

    // Compile the scriptlet
    const compiled = new Function('args', `
      try {
        ${source}
      } catch (e) {
        console.error('[Scriptlet] Error in ${name}:', e);
      }
    `);

    this.compiledScriptlets.set(cacheKey, compiled);
    return compiled;
  }

  /**
   * Generate a data: URL for scriptlet injection
   */
  generateScriptletURL(name, args = []) {
    const source = this.getScriptlet(name);
    if (!source) return null;

    // Wrap in IIFE with arguments
    const code = `
      (function() {
        var args = ${JSON.stringify(args)};
        try {
          ${source}
        } catch (e) {
          console.error('[Scriptlet] Error in ${name}:', e);
        }
      })();
    `;

    // Encode as data URL
    const encoded = encodeURIComponent(code);
    return `data:text/javascript,${encoded}`;
  }

  /**
   * Generate a chrome-extension:// URL for scriptlet injection
   * This is more reliable than data: URLs
   */
  generateExtensionURL(name, args = []) {
    if (!this.extensionId) return null;

    const source = this.getScriptlet(name);
    if (!source) return null;

    // Store scriptlet in extension storage for retrieval
    const scriptletData = {
      name,
      source,
      args,
      timestamp: Date.now()
    };

    // In a real implementation, this would be stored and served by the extension
    // For now, we use a data URL
    return this.generateScriptletURL(name, args);
  }

  /**
   * Create a DNR redirect rule for scriptlet injection
   */
  createScriptletRule(name, args, urlFilter, options = {}) {
    const scriptletURL = this.generateScriptletURL(name, args);
    if (!scriptletURL) return null;

    return {
      id: options.id || Date.now(),
      priority: options.priority || 1,
      action: {
        type: 'redirect',
        redirect: {
          url: scriptletURL
        }
      },
      condition: {
        urlFilter: urlFilter,
        resourceTypes: options.resourceTypes || ['script'],
        domains: options.domains,
        excludedDomains: options.excludedDomains,
        thirdParty: options.thirdParty
      }
    };
  }

  /**
   * Register a custom scriptlet
   */
  registerScriptlet(name, source) {
    this.scriptlets[name] = source;
    this.compiledScriptlets.clear(); // Clear cache
  }

  /**
   * Remove a scriptlet
   */
  removeScriptlet(name) {
    delete this.scriptlets[name];
    this.compiledScriptlets.clear();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      scriptletCount: Object.keys(this.scriptlets).length,
      compiledCount: this.compiledScriptlets.size,
      injectionCacheSize: this.injectionCache.size
    };
  }

  /**
   * Set enabled state
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Set extension ID
   */
  setExtensionId(id) {
    this.extensionId = id;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.compiledScriptlets.clear();
    this.injectionCache.clear();
  }
}

export { ScriptletManager, SCRIPTLETS };

// Export for use in service worker (CommonJS fallback)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ScriptletManager, SCRIPTLETS };
}

// Export for browser use
if (typeof window !== 'undefined') {
  window.ScriptletManager = ScriptletManager;
  window.SCRIPTLETS = SCRIPTLETS;
}