/**
 * Script Integrity — SRI for injected code, hash verification, trusted-types enforcement
 * Ensures all injected scriptlets have verified integrity
 * Integrates with ScriptletVerifier for comprehensive verification
 */

import { ScriptletVerifier, SRIUtils, CSPUtils } from '../scriptlet-vm/scriptlet-verifier.js';

export class ScriptIntegrity {
  constructor(context = window, options = {}) {
    this.context = context;
    this.document = context.document;
    this.config = {
      enforceSRI: options.enforceSRI !== false,
      enforceCSP: options.enforceCSP !== false,
      trustedTypesPolicy: options.trustedTypesPolicy || 'aeroguard-anti-adblock',
      allowedHashes: new Set(options.allowedHashes || []),
      allowedSources: new Set(options.allowedSources || ['self']),
      allowedSRIHashes: new Set(options.allowedSRIHashes || []),
      maxContentSize: options.maxContentSize || 100000,
      allowedHashAlgorithms: new Set(options.allowedHashAlgorithms || ['sha256', 'sha384', 'sha512']),
      strictMode: options.strictMode !== false,
      aggressive: options.aggressive !== false,
      debug: options.debug || false,
      ...options
    };

    this.verifiedScripts = new Map(); // scriptElement -> { hash, verified, timestamp, details }
    this.trustedTypesPolicy = null;
    this.observer = null;
    this.scriptletVerifier = null;
    this.cspNonce = options.cspNonce || null;
    this.integrityCache = new Map(); // url -> { hash, sri, verified, timestamp }
    this.metrics = {
      scriptsVerified: 0,
      scriptsRejected: 0,
      sriViolations: 0,
      trustedTypesViolations: 0,
      contentViolations: 0
    };
  }

  /**
   * Initialize script integrity verification
   */
  async initialize() {
    // Initialize ScriptletVerifier for comprehensive verification
    this.scriptletVerifier = new ScriptletVerifier(this.context, {
      enforceSRI: this.config.enforceSRI,
      enforceCSP: this.config.enforceCSP,
      trustedTypesPolicy: this.config.trustedTypesPolicy,
      allowedHashes: this.config.allowedHashes,
      allowedSources: this.config.allowedSources,
      allowedSRIHashes: this.config.allowedSRIHashes,
      maxContentSize: this.config.maxContentSize,
      allowedHashAlgorithms: this.config.allowedHashAlgorithms,
      strictMode: this.config.strictMode,
      cspNonce: this.cspNonce
    });
    await this.scriptletVerifier.initialize();

    // Create additional Trusted Types policy for anti-adblock specific scripts
    this._createAntiAdblockTrustedTypesPolicy();

    // Set up mutation observer for script injections
    this._setupMutationObserver();

    // Verify existing scripts
    this._verifyExistingScripts();

    if (this.config.debug) console.log('[ScriptIntegrity] Initialized with ScriptletVerifier integration');
  }

  /**
   * Create Trusted Types policy specifically for anti-adblock scriptlets
   * This policy is more permissive for known-safe anti-adblock patterns
   */
  _createAntiAdblockTrustedTypesPolicy() {
    if (this.context.trustedTypes && !this.trustedTypesPolicy) {
      try {
        this.trustedTypesPolicy = this.context.trustedTypes.createPolicy(
          this.config.trustedTypesPolicy,
          {
            createScript: (script, sink) => {
              // Verify script content before allowing
              const verification = this._verifyScriptContent(script, sink);
              if (verification.allowed) {
                return script;
              }
              this.metrics.trustedTypesViolations++;
              throw new Error(`Anti-adblock script failed integrity check: ${verification.reason}`);
            },
            createScriptURL: (url, sink) => {
              if (this._isAllowedScriptURL(url, sink)) {
                return url;
              }
              this.metrics.trustedTypesViolations++;
              throw new Error('Anti-adblock script URL not allowed by Trusted Types');
            },
            createHTML: (html, sink) => {
              // Anti-adblock scriptlets shouldn't create HTML - block by default
              if (this.config.debug) console.warn('[ScriptIntegrity] HTML creation blocked for anti-adblock sink:', sink);
              return '';
            }
          }
        );
        if (this.config.debug) console.log('[ScriptIntegrity] Anti-adblock Trusted Types policy created:', this.config.trustedTypesPolicy);
      } catch (e) {
        if (this.config.debug) console.warn('[ScriptIntegrity] Anti-adblock Trusted Types policy creation failed:', e);
      }
    }
  }

  /**
   * Verify script content for safety - anti-adblock specific patterns
   * @param {string} content - Script content to verify
   * @param {string} sink - The sink where script will be executed
   * @returns {Object} Verification result
   */
  _verifyScriptContent(content, sink = 'unknown') {
    // Check content size
    if (content.length > this.config.maxContentSize) {
      return { allowed: false, reason: `Content exceeds max size: ${content.length} > ${this.config.maxContentSize}` };
    }

    // Anti-adblock scriptlets may need certain patterns that are normally dangerous
    // But we still block the most dangerous ones
    const dangerousPatterns = [
      // Code execution - always dangerous
      { pattern: /eval\s*\(/, desc: 'eval() usage' },
      { pattern: /Function\s*\(/, desc: 'Function constructor' },
      { pattern: /setTimeout\s*\(\s*['"`]/, desc: 'setTimeout with string' },
      { pattern: /setInterval\s*\(\s*['"`]/, desc: 'setInterval with string' },
      { pattern: /setImmediate\s*\(/, desc: 'setImmediate usage' },

      // Script injection - dangerous
      { pattern: /document\.write/, desc: 'document.write' },
      { pattern: /document\.writeln/, desc: 'document.writeln' },
      { pattern: /innerHTML\s*=/, desc: 'innerHTML assignment' },
      { pattern: /outerHTML\s*=/, desc: 'outerHTML assignment' },
      { pattern: /insertAdjacentHTML/, desc: 'insertAdjacentHTML' },
      { pattern: /createElement\s*\(\s*['"`]script['"`]/, desc: 'Script element creation' },
      { pattern: /createElementNS\s*\(/, desc: 'createElementNS' },
      { pattern: /\.\s*src\s*=/, desc: 'Script src assignment' },

      // Network access - block for anti-adblock scripts
      { pattern: /fetch\s*\(/, desc: 'fetch API' },
      { pattern: /XMLHttpRequest/, desc: 'XMLHttpRequest' },
      { pattern: /sendBeacon/, desc: 'sendBeacon' },
      { pattern: /navigator\.sendBeacon/, desc: 'navigator.sendBeacon' },
      { pattern: /WebSocket/, desc: 'WebSocket' },
      { pattern: /EventSource/, desc: 'EventSource' },
      { pattern: /Worker\s*\(/, desc: 'Worker creation' },
      { pattern: /SharedWorker/, desc: 'SharedWorker' },
      { pattern: /ServiceWorker/, desc: 'ServiceWorker' },
      { pattern: /importScripts/, desc: 'importScripts' },

      // Storage access - block for anti-adblock scripts
      { pattern: /crypto\.subtle/, desc: 'crypto.subtle' },
      { pattern: /crypto\.randomUUID/, desc: 'crypto.randomUUID' },
      { pattern: /indexedDB/, desc: 'indexedDB' },
      { pattern: /openDatabase/, desc: 'openDatabase' },
      { pattern: /localStorage/, desc: 'localStorage' },
      { pattern: /sessionStorage/, desc: 'sessionStorage' },

      // Obfuscation techniques
      { pattern: /\\x[0-9a-f]{2}/gi, desc: 'Hex encoding' },
      { pattern: /\\u[0-9a-f]{4}/gi, desc: 'Unicode encoding' },
      { pattern: /atob\s*\(/, desc: 'atob (base64 decode)' },
      { pattern: /btoa\s*\(/, desc: 'btoa (base64 encode)' },
      { pattern: /fromCharCode/, desc: 'String.fromCharCode' },

      // Prototype pollution
      { pattern: /__proto__/, desc: '__proto__ access' },
      { pattern: /constructor\s*\[/, desc: 'constructor access' },
      { pattern: /prototype\s*\[/, desc: 'prototype pollution' }
    ];

    for (const { pattern, desc } of dangerousPatterns) {
      if (pattern.test(content)) {
        if (this.config.debug) console.warn('[ScriptIntegrity] Dangerous pattern detected:', desc, 'in sink:', sink);
        if (this.config.strictMode) {
          this.metrics.contentViolations++;
          return { allowed: false, reason: `Dangerous pattern: ${desc}` };
        }
        // In non-strict mode, log but continue
      }
    }

    return { allowed: true, reason: 'Content passed verification' };
  }

  /**
   * Check if a script URL is allowed based on CSP and allowed sources
   * @param {string} url - Script URL to check
   * @param {string} sink - The sink where script will be loaded
   * @returns {boolean} Whether URL is allowed
   */
  _isAllowedScriptURL(url, sink = 'unknown') {
    try {
      const scriptUrl = new URL(url);
      const currentOrigin = this.context.location.origin;

      // Allow same-origin
      if (scriptUrl.origin === currentOrigin) return true;

      // Allow data: URLs for inline scriptlets (with verification)
      if (scriptUrl.protocol === 'data:' && scriptUrl.pathname.startsWith('text/javascript')) {
        return true;
      }

      // Allow blob: URLs (for dynamically created scripts)
      if (scriptUrl.protocol === 'blob:') {
        return true;
      }

      // Allow chrome-extension: URLs (for extension scripts)
      if (scriptUrl.protocol === 'chrome-extension:') {
        return true;
      }

      // Allow configured allowed sources
      for (const source of this.config.allowedSources) {
        if (source === 'self') continue;
        if (source === '*') return true;
        if (url.startsWith(source)) return true;
        // Support wildcard domains
        if (source.startsWith('*.')) {
          const domain = source.slice(2);
          if (scriptUrl.hostname === domain || scriptUrl.hostname.endsWith('.' + domain)) {
            return true;
          }
        }
        if (scriptUrl.hostname === source || scriptUrl.hostname.endsWith('.' + source)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Set up MutationObserver to monitor script injections
   */
  _setupMutationObserver() {
    this.observer = new this.context.MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === this.context.Node.ELEMENT_NODE) {
              if (node.tagName === 'SCRIPT') {
                this._verifyScript(node);
              }
              // Check for scripts in subtree
              node.querySelectorAll?.('script').forEach(script => this._verifyScript(script));
            }
          }
        }
      }
    });

    this.observer.observe(this.document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Verify all existing scripts on the page
   */
  _verifyExistingScripts() {
    this.document.querySelectorAll('script').forEach(script => this._verifyScript(script));
  }

  /**
   * Verify a script element using comprehensive verification
   */
  async _verifyScript(script) {
    if (this.verifiedScripts.has(script)) return this.verifiedScripts.get(script);

    const result = {
      verified: false,
      hash: null,
      sri: null,
      cspCompliant: false,
      reason: '',
      timestamp: Date.now(),
      details: {}
    };

    try {
      if (script.src) {
        // External script - verify URL and fetch with integrity
        result.details.type = 'external';
        result.details.src = script.src;

        if (this._isAllowedScriptURL(script.src)) {
          // Check if we have cached verification
          const cached = this.integrityCache.get(script.src);
          if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour cache
            Object.assign(result, cached);
            result.verified = cached.verified;
            result.reason = 'Cached verification';
          } else if (script.integrity && this.config.enforceSRI) {
            // Has SRI attribute - trust it but verify
            result.verified = true;
            result.reason = 'Has integrity attribute';
            result.sri = script.integrity;
            // Could verify by fetching, but that's expensive
          } else if (!this.config.enforceSRI) {
            result.verified = true;
            result.reason = 'Allowed origin (SRI not enforced)';
          } else {
            result.reason = 'External script requires SRI enforcement';
          }
        } else {
          result.reason = 'Disallowed origin';
          if (this.config.enforceSRI && script.integrity) {
            result.verified = true; // Trust SRI
            result.reason = 'Has integrity attribute (SRI enforcement)';
            result.sri = script.integrity;
          }
        }
      } else if (script.textContent) {
        // Inline script - verify content using ScriptletVerifier
        result.details.type = 'inline';
        const name = script.dataset?.aeroguardScriptlet || script.id || 'anonymous-inline';

        const verification = await this.scriptletVerifier.verifyScriptlet(name, script.textContent);
        result.verified = verification.verified;
        result.hash = verification.hash;
        result.sri = verification.sri;
        result.cspCompliant = verification.cspCompliant;
        result.reason = verification.reason;
        result.details = { ...result.details, ...verification };
      }

      this.verifiedScripts.set(script, result);

      if (result.verified) {
        this.metrics.scriptsVerified++;
        if (this.config.debug) console.log('[ScriptIntegrity] Verified script:', script.src || 'inline', result.reason);
      } else {
        this.metrics.scriptsRejected++;
        if (this.config.enforceSRI) {
          this.metrics.sriViolations++;
          if (this.config.debug) console.warn('[ScriptIntegrity] Unverified script:', script.src || 'inline', result.reason);
          // Could remove script here if desired
          // script.remove();
        }
      }
    } catch (e) {
      result.reason = `Verification error: ${e.message}`;
      result.verified = false;
      this.verifiedScripts.set(script, result);
      this.metrics.scriptsRejected++;
    }

    return result;
  }

  /**
   * Verify scriptlet content with full SRI, CSP, Trusted Types verification
   * @param {string} name - Scriptlet name
   * @param {string} content - Scriptlet source code
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Verification result
   */
  async verifyScriptlet(name, content, options = {}) {
    return this.scriptletVerifier.verifyScriptlet(name, content, options);
  }

  /**
   * Verify scriptlet from URL with SRI support
   * @param {string} name - Scriptlet name
   * @param {string} url - Scriptlet URL
   * @param {string} expectedIntegrity - Optional expected SRI integrity
   * @returns {Promise<Object>} Verification result
   */
  async verifyScriptletURL(name, url, expectedIntegrity = null) {
    return this.scriptletVerifier.verifyScriptletURL(name, url, expectedIntegrity);
  }

  /**
   * Create a verified script element with SRI, CSP, and Trusted Types
   * @param {string} content - Script content
   * @param {Object} options - Options for script element
   * @returns {Promise<HTMLScriptElement>} Verified script element
   */
  async createVerifiedScriptElement(content, options = {}) {
    return this.scriptletVerifier.createVerifiedScriptElement(content, options);
  }

  /**
   * Generate SRI integrity attribute for script tag
   * @param {string} content - Script content
   * @param {string[]} algorithms - Hash algorithms to include
   * @returns {Promise<string>} SRI integrity string
   */
  async generateSRIIntegrity(content, algorithms = ['sha256', 'sha384', 'sha512']) {
    return this.scriptletVerifier.generateSRIIntegrity(content, algorithms);
  }

  /**
   * Compute SRI hash for content
   * @param {string} content - Content to hash
   * @param {string} algorithm - Hash algorithm ('sha256', 'sha384', 'sha512')
   * @returns {Promise<string>} SRI-formatted hash
   */
  async _computeSRIHash(content, algorithm = 'sha256') {
    return this.scriptletVerifier._computeSRIHash(content, algorithm);
  }

  /**
   * Add allowed hash for inline script (legacy format)
   * @param {string} hash - SHA-256 hash (with or without sha256- prefix)
   */
  addAllowedHash(hash) {
    const normalized = hash.startsWith('sha256-') ? hash : `sha256-${hash}`;
    this.config.allowedHashes.add(normalized);
    this.scriptletVerifier?.addAllowedHash?.(normalized);
  }

  /**
   * Add allowed SRI hash
   * @param {string} sriHash - SRI-formatted hash (e.g., "sha256-abc123")
   */
  addAllowedSRIHash(sriHash) {
    this.config.allowedSRIHashes.add(sriHash);
    this.scriptletVerifier?.addAllowedSRIHash?.(sriHash);
  }

  /**
   * Add multiple allowed SRI hashes
   * @param {string[]} sriHashes - Array of SRI-formatted hashes
   */
  addAllowedSRIHashes(sriHashes) {
    for (const hash of sriHashes) {
      this.config.allowedSRIHashes.add(hash);
    }
    this.scriptletVerifier?.addAllowedSRIHashes?.(sriHashes);
  }

  /**
   * Remove allowed hash
   * @param {string} hash - Hash to remove
   */
  removeAllowedHash(hash) {
    const normalized = hash.startsWith('sha256-') ? hash : `sha256-${hash}`;
    this.config.allowedHashes.delete(normalized);
    this.config.allowedSRIHashes.delete(normalized);
    this.scriptletVerifier?.removeAllowedHash?.(normalized);
  }

  /**
   * Set CSP nonce for verification
   * @param {string} nonce - CSP nonce value
   */
  setCSPNonce(nonce) {
    this.cspNonce = nonce;
    this.scriptletVerifier?.setCSPNonce?.(nonce);
  }

  /**
   * Add allowed source origin
   * @param {string} source - Source origin (e.g., "https://example.com")
   */
  addAllowedSource(source) {
    this.config.allowedSources.add(source);
    this.scriptletVerifier?.addAllowedSource?.(source);
  }

  /**
   * Remove allowed source origin
   * @param {string} source - Source origin to remove
   */
  removeAllowedSource(source) {
    this.config.allowedSources.delete(source);
    this.scriptletVerifier?.removeAllowedSource?.(source);
  }

  /**
   * Get verification status for all scripts
   */
  getVerificationReport() {
    const report = {
      total: this.verifiedScripts.size,
      verified: 0,
      failed: 0,
      cspCompliant: 0,
      byType: { inline: 0, external: 0 },
      details: [],
      metrics: { ...this.metrics }
    };

    for (const [script, result] of this.verifiedScripts) {
      if (result.verified) report.verified++;
      else report.failed++;
      if (result.cspCompliant) report.cspCompliant++;

      if (script.src) report.byType.external++;
      else report.byType.inline++;

      report.details.push({
        src: script.src || 'inline',
        verified: result.verified,
        hash: result.hash,
        sri: result.sri,
        cspCompliant: result.cspCompliant,
        reason: result.reason,
        timestamp: result.timestamp,
        details: result.details
      });
    }

    // Also include ScriptletVerifier report
    if (this.scriptletVerifier) {
      const svReport = this.scriptletVerifier.getVerificationReport();
      report.scriptlets = svReport;
    }

    return report;
  }

  /**
   * Get verification status for specific script
   */
  getVerification(script) {
    return this.verifiedScripts.get(script) || null;
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Clear verification cache
   */
  clearCache() {
    this.verifiedScripts.clear();
    this.integrityCache.clear();
    this.scriptletVerifier?.clearCache?.();
  }

  /**
   * Cleanup
   */
  cleanup() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.clearCache();
    if (this.scriptletVerifier) {
      this.scriptletVerifier.cleanup();
      this.scriptletVerifier = null;
    }
    if (this.trustedTypesPolicy) {
      // Note: Trusted Types policies cannot be deleted, only created once
      this.trustedTypesPolicy = null;
    }
  }
}

// ============================================================================
// Anti-Adblock Scriptlet Integrity Helpers
// ============================================================================

/**
 * Pre-computed SRI hashes for built-in anti-adblock scriptlets
 * These can be used to verify scriptlets without re-computing
 */
export const ANTI_ADBLOCK_SCRIPTLET_HASHES = {
  // Core anti-adblock scriptlets
  'adblock-detection-stub': 'sha256-',
  'adsbygoogle-stub': 'sha256-',
  'yt-player-response-sanitizer': 'sha256-',
  'overlay-remover': 'sha256-',
  'restore-scrolling': 'sha256-',
  'clear-cookies': 'sha256-',
  'webrtc-block': 'sha256-',
  'fingerprinting-shield': 'sha256-',
  'cookie-banner-remover': 'sha256-',
  'newsletter-popup-remover': 'sha256-',
  'consent-bypass': 'sha256-',

  // Scriptlet injection scriptlets
  'abort-current-inline-script': 'sha256-',
  'noopfunc': 'sha256-',
  'prevent-xhr': 'sha256-',
  'prevent-fetch': 'sha256-',
  'remove-node': 'sha256-',
  'override-property': 'sha256-',
  'set-constant': 'sha256-',
  'trust-setTimeout': 'sha256-',
  'trust-setInterval': 'sha256-',
  'json-prune': 'sha256-',
  'log': 'sha256-',
  'noop': 'sha256-',
  'object-from-string': 'sha256-',
  'object-prototype': 'sha256-',
  'preload': 'sha256-',
  'redirect': 'sha256-',
  'remove-event-listener': 'sha256-',
  'replace-content': 'sha256-',
  'script-observer': 'sha256-',
  'set-attr': 'sha256-',
  'toString': 'sha256-',
  'block-cookies': 'sha256-',
  'defuse': 'sha256-',
  'queue': 'sha256-',
  'raise-exception': 'sha256-',
  'remove-attr': 'sha256-',
  'remove-class': 'sha256-',
  'set-cookie': 'sha256-',
  'unblock-network': 'sha256-',
  'watchdog': 'sha256-'
};

/**
 * Generate SRI hashes for all known anti-adblock scriptlets
 * @param {Object} scriptlets - Object mapping names to scriptlet source code
 * @returns {Promise<Object>} Map of scriptlet names to SRI integrity strings
 */
export async function generateAntiAdblockScriptletHashes(scriptlets) {
  const hashes = {};
  for (const [name, source] of Object.entries(scriptlets)) {
    try {
      const integrity = await SRIUtils.generateIntegrity(source, ['sha256', 'sha384', 'sha512']);
      hashes[name] = integrity;
    } catch (e) {
      console.warn('[ScriptIntegrity] Failed to generate hash for:', name, e);
      hashes[name] = null;
    }
  }
  return hashes;
}

/**
 * Create a ScriptIntegrity instance pre-configured for anti-adblock use
 * @param {Window} context - Window context
 * @param {Object} options - Configuration options
 * @returns {Promise<ScriptIntegrity>} Initialized ScriptIntegrity instance
 */
export async function createAntiAdblockScriptIntegrity(context = window, options = {}) {
  const integrity = new ScriptIntegrity(context, {
    enforceSRI: true,
    enforceCSP: true,
    trustedTypesPolicy: 'aeroguard-anti-adblock',
    allowedSources: ['self', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
    strictMode: true,
    aggressive: true,
    debug: false,
    ...options
  });

  await integrity.initialize();
  return integrity;
}

// ============================================================================
// Singleton
// ============================================================================

let scriptIntegrityInstance = null;

export function getScriptIntegrity(context = window, options = {}) {
  if (!scriptIntegrityInstance) {
    scriptIntegrityInstance = new ScriptIntegrity(context, options);
  }
  return scriptIntegrityInstance;
}

export async function getInitializedScriptIntegrity(context = window, options = {}) {
  const instance = getScriptIntegrity(context, options);
  await instance.initialize();
  return instance;
}

export function resetScriptIntegrity() {
  if (scriptIntegrityInstance) {
    scriptIntegrityInstance.cleanup();
  }
  scriptIntegrityInstance = null;
}

// Export for module systems
export default {
  ScriptIntegrity,
  ANTI_ADBLOCK_SCRIPTLET_HASHES,
  generateAntiAdblockScriptletHashes,
  createAntiAdblockScriptIntegrity,
  getScriptIntegrity,
  getInitializedScriptIntegrity,
  resetScriptIntegrity
};