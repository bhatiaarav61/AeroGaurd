/**
 * AeroGuard scriptlet runner - MAIN world, document_start.
 * Mirrors the small uBO scriptlet subset Brave ships natively
 * (abort-on-property-read, set-constant, json-prune, no-fetch-if,
 *  remove-attr, remove-class, set-cookie), driven by rules/scriptlets shards.
 * Runs BEFORE page scripts because manifest order puts it first.
 */
(() => {
  'use strict';
  if (window.__aeroguardScriptletsInstalled) return;
  window.__aeroguardScriptletsInstalled = true;

  const DEBUG = false;
  const log = (...a) => { if (DEBUG) console.log('[AeroGuard:scriptlets]', ...a); };
  let installed = [];

  function resolvePath(root, path, create) {
    const parts = String(path).split('.').filter(Boolean);
    let obj = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (obj[k] === undefined || obj[k] === null) {
        if (!create) return null;
        obj[k] = {};
      }
      obj = obj[k];
      if (typeof obj !== 'object' && typeof obj !== 'function') return null;
    }
    return { obj, key: parts[parts.length - 1] };
  }

  function funcFromToken(token) {
    if (token === 'noopFunc' || token === 'noop') return () => {};
    if (token === 'trueFunc') return () => true;
    if (token === 'falseFunc') return () => false;
    if (token === 'undefined') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      return token.slice(1, -1);
    }
    return token;
  }

  function abortOnProperty(objectPath, prop, mode) {
    try {
      const holder = resolvePath(window, objectPath, false);
      if (!holder || !(prop in holder.obj)) return false;
      const desc = Object.getOwnPropertyDescriptor(holder.obj, prop);
      if (desc && desc.configurable === false) return false;
      if (mode === 'write') {
        let val = holder.obj[prop];
        Object.defineProperty(holder.obj, prop, {
          configurable: true,
          get() { return val; },
          set() { throw new ReferenceError('aeroguard:abort-on-property-write'); },
        });
      } else {
        Object.defineProperty(holder.obj, prop, {
          configurable: true,
          get() { throw new ReferenceError('aeroguard:abort-on-property-read'); },
          set(v) { /* swallow ad re-arms */ },
        });
      }
      return true;
    } catch { return false; }
  }

  function setConstant(objectPath, valueToken) {
    try {
      const holder = resolvePath(window, objectPath, false); // never create fake page objects
      if (!holder) return false;
      const value = funcFromToken(valueToken);
      try { delete holder.obj[holder.key]; } catch { /* ignore */ }
      Object.defineProperty(holder.obj, holder.key, {
        configurable: true,
        get() { return value; },
        set() { /* absorb writes - uBO semantics */ },
      });
      return true;
    } catch { return false; }
  }

  function prunePaths(obj, rawPaths) {
    let changed = false;
    for (let raw of String(rawPaths || '').split(/\s+/).filter(Boolean)) {
      const parts = raw.split('.');
      const dive = (node, idx) => {
        if (node === null || typeof node !== 'object') return;
        if (idx >= parts.length - 1) {
          const last = parts[idx];
          if (last === '[-]' || last === '[]' || last === '*') {
            for (const k of Object.keys(node)) { delete node[k]; changed = true; }
          } else if (last in node) {
            delete node[last]; changed = true;
          }
          return;
        }
        const seg = parts[idx];
        if (seg === '[-]' || seg === '[]' || seg === '*') {
          for (const k of Object.keys(node)) dive(node[k], idx + 1);
        } else if (seg in node) {
          dive(node[seg], idx + 1);
        }
      };
      dive(obj, 0);
    }
    return changed;
  }

  // Exposed for part 2 (json-prune) loaded in the same MAIN script entry.
  
  // ---- Analytics neutering (network rules block the requests; these stubs
  // ---- keep page scripts that call the libraries from throwing).
  // ---- Stubs are writable+configurable so real libraries can take over.
  try {
    const defStub = (key, value) => {
      try {
        if (window[key] === undefined) {
          Object.defineProperty(window, key, { value, writable: true, configurable: true });
        }
      } catch { /* sealed globals */ }
    };
    defStub('dataLayer', []);
    defStub('ga', function () { (window.ga.q = window.ga.q || []).push(arguments); });
    if (typeof window.ga === 'function' && !window.ga.l) window.ga.l = Date.now();
    defStub('gtag', function () { (window.dataLayer = window.dataLayer || []).push(arguments); });
    defStub('_gaq', { push: function () {} });
    defStub('hj', function () { (window.hj.q = window.hj.q || []).push(arguments); });
    defStub('clarity', function () {});
    const noopProxy = () => new Proxy({}, {
      get: (target, prop) => {
        if (prop === Symbol.toPrimitive) return () => '';
        return noopProxy();
      },
      apply: () => noopProxy()
    });
    defStub('mixpanel', noopProxy());
  } catch { /* never let stubbing break a page */ }

  window.__aeroguardScriptlets = {
    abortOnProperty, setConstant, prunePaths, installed: () => [],
  };
})();
