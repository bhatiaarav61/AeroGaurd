/**
 * AeroGuard scriptlet runner part 2: json-prune, no-fetch-if, remove-*,
 * set-cookie, dispatcher, and SW boot. Loaded right after scriptlets.js
 * in the same MAIN document_start content script.
 */
(() => {
  'use strict';
  const AG = window.__aeroguardScriptlets;
  if (!AG || AG.__part2) return;
  AG.__part2 = true;

  const DEBUG = false;
  const log = (...a) => { if (DEBUG) console.log('[AeroGuard:scriptlets]', ...a); };

  function jsonPrune(rawPaths, rawNeedle) {
    try {
      const NativeJSON = window.JSON;
      if (!NativeJSON || NativeJSON.__agPatched) return false;
      const nativeParse = NativeJSON.parse;
      const nativeStringify = NativeJSON.stringify;
      NativeJSON.parse = function (text, reviver) {
        let obj = nativeParse.call(this, text, reviver);
        try {
          if (rawNeedle && typeof text === 'string' && !text.includes(rawNeedle)) return obj;
          if (obj && typeof obj === 'object') AG.prunePaths(obj, rawPaths);
        } catch { /* keep original */ }
        return obj;
      };
      // NOTE: JSON.stringify is deliberately NOT patched - a shallow clone
      // corrupts getter-based serialization (e.g. YouTube player configs).
            Object.defineProperty(NativeJSON, '__agPatched', { value: true, configurable: false });
      return true;
    } catch { return false; }
  }

  function noFetchIf(needle) {
    try {
      const token = String(needle || '');
      if (!token) return false;
      const match = (u) => typeof u === 'string' && u.includes(token);
      if (window.fetch && !window.fetch.__agPatched) {
        const orig = window.fetch;
        const patched = function (input, init) {
          const url = typeof input === 'string' ? input : (input && input.url) || '';
          if (match(url)) return Promise.reject(new TypeError('aeroguard:no-fetch-if'));
          return orig.apply(this, arguments);
        };
        patched.__agPatched = true;
        window.fetch = patched;
      }
      if (window.XMLHttpRequest && !window.XMLHttpRequest.prototype.open.__agPatched) {
        const origOpen = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function (m, u) {
          if (match(String(u || ''))) this.__agBlocked = true;
          return origOpen.apply(this, arguments);
        };
        const origSend = window.XMLHttpRequest.prototype.send;
        window.XMLHttpRequest.prototype.send = function () {
          if (this.__agBlocked) return;
          return origSend.apply(this, arguments);
        };
        window.XMLHttpRequest.prototype.open.__agPatched = true;
      }
      return true;
    } catch { return false; }
  }

  function removeAttr(token, selector) {
    try {
      const attrs = String(token || '').split('|').filter(Boolean);
      if (!attrs.length) return false;
      const scope = selector ? [...document.querySelectorAll(selector)] : [document.documentElement];
      for (const el of scope) {
        if (!el || !el.removeAttribute) continue;
        for (const a of attrs) el.removeAttribute(a);
      }
      return true;
    } catch { return false; }
  }

  function removeClass(token, selector) {
    try {
      const classes = String(token || '').split('|').filter(Boolean);
      if (!classes.length) return false;
      const scope = selector ? [...document.querySelectorAll(selector)] : [document.documentElement];
      for (const el of scope) {
        if (!el || !el.classList) continue;
        for (const c of classes) el.classList.remove(c);
      }
      return true;
    } catch { return false; }
  }

  function setCookie(name, value) {
    try {
      document.cookie = `${name}=${value}; path=/; max-age=31536000`;
      return true;
    } catch { return false; }
  }

  function runOne(name, args) {
    const a = Array.isArray(args) ? args : [];
    switch (name) {
      case 'abort-on-property-read': return AG.abortOnProperty(a[0], a[1], 'read');
      case 'abort-on-property-write': return AG.abortOnProperty(a[0], a[1], 'write');
      case 'set-constant': return AG.setConstant(a[0], a[1]);
      case 'json-prune': return jsonPrune(a[0], a[1]);
      case 'no-fetch-if': return noFetchIf(a[0]);
      case 'remove-attr': return removeAttr(a[0], a[1]);
      case 'remove-class': return removeClass(a[0], a[1]);
      case 'set-cookie':
      case 'set-cookie-reload': return setCookie(a[0], a[1]);
      default: return false;
    }
  }

  function applyCalls(calls) {
    let ok = 0;
    for (const [name, args] of calls || []) {
      try { if (runOne(name, args)) ok++; }
      catch (e) { log('scriptlet failed', name, e && e.message); }
    }
    AG.apply = applyCalls;
    AG.installedCalls = calls || [];
    return ok;
  }

  async function boot() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_SCRIPTLETS', url: location.href });
      const calls = (res && res.calls) || [];
      const n = applyCalls(calls);
      log('installed', n, 'of', calls.length, 'scriptlets');
      try {
        chrome.runtime.sendMessage({
          type: 'REPORT_SCRIPTLETS', url: location.href, count: n, total: calls.length,
        }).catch(() => {});
      } catch { /* ignore */ }
    } catch (e) {
      log('boot failed', e && e.message);
    }
  }

  AG.run = runOne;
  AG.apply = applyCalls;
  AG.jsonPrune = jsonPrune;
  AG.noFetchIf = noFetchIf;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  }
  boot();
})();
