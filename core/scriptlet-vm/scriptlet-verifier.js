/**
 * Scriptlet Verifier — Integrity, CSP, Trusted Types, SRI for injected code, hash verification
 * Verifies scriptlet integrity before execution
 * Supports: SRI (Subresource Integrity), CSP compliance, Trusted Types, hash verification
 */

export class ScriptletVerifier {
  constructor(context = window, options = {}) {
    this.context = context;
    this.config = {
      enforceSRI: options.enforceSRI !== false,
      enforceCSP: options.enforceCSP !== false,
      trustedTypesPolicy: options.trustedTypesPolicy || 'aeroguard-scriptlets',
      allowedHashes: new Set(options.allowedHashes || []),
      allowedSources: new Set(options.allowedSources || ['self']),
      allowedSRIHashes: new Set(options.allowedSRIHashes || []),
      maxContentSize: options.maxContentSize || 100000, // 100KB
      allowedHashAlgorithms: new Set(options.allowedHashAlgorithms || ['sha256', 'sha384', 'sha512']),
      strictMode: options.strictMode !== false,
      ...options
    };

    this.verifiedScriptlets = new Map(); // scriptletName -> { hash, verified, timestamp, sri, csp }
    this.trustedTypesPolicy = null;
    this.cspNonce = options.cspNonce || null;
    this.integrityCache = new Map(); // url -> { hash, sri, verified, timestamp }
  }

  /**
   * Initialize scriptlet verifier
   */
  async initialize() {
    // Create Trusted Types policy for scriptlets
    await this._createTrustedTypesPolicy();

    // Initialize CSP monitoring
    this._setupCSPMonitoring();

    console.log('[ScriptletVerifier] Initialized with SRI, CSP, Trusted Types support');
  }

  /**
   * Create Trusted Types policy for scriptlets
   * This prevents DOM-based XSS by requiring trusted types for script injection
   */
  async _createTrustedTypesPolicy() {
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
              throw new Error(`Scriptlet failed integrity check: ${verification.reason}`);
            },
            createScriptURL: (url, sink) => {
              if (this._isAllowedScriptURL(url, sink)) {
                return url;
              }
              throw new Error('Scriptlet URL not allowed by CSP/Trusted Types');
            },
            createHTML: (html, sink) => {
              // Scriptlets shouldn't create HTML - block by default
              console.warn('[ScriptletVerifier] HTML creation blocked for scriptlet sink:', sink);
              return '';
            }
          }
        );
        console.log('[ScriptletVerifier] Trusted Types policy created:', this.config.trustedTypesPolicy);
      } catch (e) {
        console.warn('[ScriptletVerifier] Trusted Types policy creation failed:', e);
      }
    }
  }

  /**
   * Set up CSP monitoring to detect violations
   */
  _setupCSPMonitoring() {
    if (!this.config.enforceCSP || !this.context.document) return;

    // Listen for CSP violations
    this.context.document.addEventListener('securitypolicyviolation', (event) => {
      if (event.blockedURI && event.blockedURI.includes('scriptlet') || event.blockedURI.includes('aeroguard')) {
        console.warn('[ScriptletVerifier] CSP violation detected:', {
          blockedURI: event.blockedURI,
          violatedDirective: event.violatedDirective,
          originalPolicy: event.originalPolicy,
          sourceFile: event.sourceFile,
          lineNumber: event.lineNumber
        });
      }
    });
  }

  /**
   * Verify scriptlet content for safety
   * @param {string} content - Script content to verify
   * @param {string} sink - The sink where script will be executed
   * @returns {Object} Verification result
   */
  _verifyScriptContent(content, sink = 'unknown') {
    // Check content size
    if (content.length > this.config.maxContentSize) {
      return { allowed: false, reason: `Content exceeds max size: ${content.length} > ${this.config.maxContentSize}` };
    }

    // Check for dangerous patterns that shouldn't be in scriptlets
    const dangerousPatterns = [
      // Code execution
      { pattern: /eval\s*\(/, desc: 'eval() usage' },
      { pattern: /Function\s*\(/, desc: 'Function constructor' },
      { pattern: /setTimeout\s*\(\s*['"`]/, desc: 'setTimeout with string' },
      { pattern: /setInterval\s*\(\s*['"`]/, desc: 'setInterval with string' },
      { pattern: /setImmediate\s*\(/, desc: 'setImmediate usage' },

      // DOM manipulation - script injection
      { pattern: /document\.write/, desc: 'document.write' },
      { pattern: /document\.writeln/, desc: 'document.writeln' },
      { pattern: /innerHTML\s*=/, desc: 'innerHTML assignment' },
      { pattern: /outerHTML\s*=/, desc: 'outerHTML assignment' },
      { pattern: /insertAdjacentHTML/, desc: 'insertAdjacentHTML' },
      { pattern: /insertAdjacentElement/, desc: 'insertAdjacentElement' },
      { pattern: /insertAdjacentText/, desc: 'insertAdjacentText' },

      // Script injection
      { pattern: /createElement\s*\(\s*['"`]script['"`]/, desc: 'Script element creation' },
      { pattern: /createElementNS\s*\(/, desc: 'createElementNS' },
      { pattern: /\.\s*src\s*=/, desc: 'Script src assignment' },
      { pattern: /appendChild\s*\(/, desc: 'appendChild' },
      { pattern: /insertBefore\s*\(/, desc: 'insertBefore' },

      // Network access
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

      // Storage access
      { pattern: /crypto\.subtle/, desc: 'crypto.subtle' },
      { pattern: /crypto\.randomUUID/, desc: 'crypto.randomUUID' },
      { pattern: /indexedDB/, desc: 'indexedDB' },
      { pattern: /openDatabase/, desc: 'openDatabase' },
      { pattern: /localStorage/, desc: 'localStorage' },
      { pattern: /sessionStorage/, desc: 'sessionStorage' },

      // Dangerous globals (when not in safe context)
      { pattern: /window\./, desc: 'window access' },
      { pattern: /document\./, desc: 'document access' },
      { pattern: /navigator\./, desc: 'navigator access' },
      { pattern: /location\./, desc: 'location access' },
      { pattern: /history\./, desc: 'history access' },

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
        console.warn('[ScriptletVerifier] Dangerous pattern detected:', desc, 'in sink:', sink);
        if (this.config.strictMode) {
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
   * Compute SRI hash for content (sha256, sha384, or sha512)
   * @param {string} content - Content to hash
   * @param {string} algorithm - Hash algorithm ('sha256', 'sha384', 'sha512')
   * @returns {Promise<string>} SRI-formatted hash
   */
  async _computeSRIHash(content, algorithm = 'sha256') {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    let hashBuffer;

    switch (algorithm) {
      case 'sha256':
        hashBuffer = await this.context.crypto.subtle.digest('SHA-256', data);
        break;
      case 'sha384':
        hashBuffer = await this.context.crypto.subtle.digest('SHA-384', data);
        break;
      case 'sha512':
        hashBuffer = await this.context.crypto.subtle.digest('SHA-512', data);
        break;
      default:
        throw new Error(`Unsupported hash algorithm: ${algorithm}`);
    }

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const base64Hash = btoa(String.fromCharCode(...hashArray));
    return `${algorithm}-${base64Hash}`;
  }

  /**
   * Compute multiple SRI hashes for content
   * @param {string} content - Content to hash
   * @returns {Promise<Object>} Object with hashes for each algorithm
   */
  async _computeAllSRIHashes(content) {
    const algorithms = Array.from(this.config.allowedHashAlgorithms);
    const hashes = {};

    for (const algorithm of algorithms) {
      hashes[algorithm] = await this._computeSRIHash(content, algorithm);
    }

    return hashes;
  }

  /**
   * Parse SRI integrity string (e.g., "sha256-abc123 sha384-def456")
   * @param {string} integrity - SRI integrity attribute value
   * @returns {Map} Map of algorithm -> hash
   */
  _parseSRI(integrity) {
    const sriMap = new Map();
    const parts = integrity.split(/\s+/).filter(Boolean);

    for (const part of parts) {
      const match = part.match(/^(sha256|sha384|sha512)-(.+)$/);
      if (match) {
        sriMap.set(match[1], match[2]);
      }
    }

    return sriMap;
  }

  /**
   * Verify SRI hash matches content
   * @param {string} content - Content to verify
   * @param {string} integrity - SRI integrity string
   * @returns {Promise<boolean>} Whether any hash matches
   */
  async _verifySRI(content, integrity) {
    const expectedHashes = this._parseSRI(integrity);

    for (const [algorithm, expectedHash] of expectedHashes) {
      if (!this.config.allowedHashAlgorithms.has(algorithm)) {
        continue; // Skip unsupported algorithms
      }

      const computedHash = await this._computeSRIHash(content, algorithm);
      const computedBase64 = computedHash.split('-')[1];

      if (computedBase64 === expectedHash) {
        return true;
      }
    }

    return false;
  }

  /**
   * Verify a scriptlet by name and content
   * @param {string} name - Scriptlet name
   * @param {string} content - Scriptlet source code
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Verification result
   */
  async verifyScriptlet(name, content, options = {}) {
    const startTime = performance.now();
    const result = {
      name,
      verified: false,
      hash: null,
      sri: null,
      cspCompliant: false,
      reason: '',
      timestamp: Date.now(),
      duration: 0
    };

    // Verify content safety
    const contentCheck = this._verifyScriptContent(content, `verifyScriptlet:${name}`);
    if (!contentCheck.allowed) {
      result.reason = contentCheck.reason;
      result.duration = performance.now() - startTime;
      this.verifiedScriptlets.set(name, result);
      return result;
    }

    // Compute SRI hashes
    result.sri = await this._computeAllSRIHashes(content);
    result.hash = result.sri.sha256; // Primary hash for backward compatibility

    // Check against allowed hashes (legacy format)
    if (this.config.allowedHashes.has(result.hash)) {
      result.verified = true;
      result.reason = 'Hash matches allowed list (legacy)';
      result.cspCompliant = true;
    }
    // Check against allowed SRI hashes
    else if (this._matchesAllowedSRI(result.sri)) {
      result.verified = true;
      result.reason = 'SRI hash matches allowed list';
      result.cspCompliant = true;
    }
    // Check if SRI is enforced
    else if (this.config.enforceSRI) {
      result.reason = 'Hash not in allowed list (SRI enforcement)';
      result.cspCompliant = false;
    }
    // If not enforcing SRI, verify content only
    else {
      result.verified = true;
      result.reason = 'Content passed verification (SRI not enforced)';
      result.cspCompliant = true;
    }

    // Verify CSP compliance
    if (this.config.enforceCSP) {
      result.cspCompliant = await this._verifyCSPCompliance(content, name);
      if (!result.cspCompliant) {
        result.verified = false;
        result.reason = 'CSP compliance check failed';
      }
    }

    result.duration = performance.now() - startTime;
    this.verifiedScriptlets.set(name, result);
    return result;
  }

  /**
   * Check if computed SRI hashes match any allowed SRI hashes
   * @param {Object} computedSRI - Computed SRI hashes
   * @returns {boolean}
   */
  _matchesAllowedSRI(computedSRI) {
    for (const [algorithm, hash] of Object.entries(computedSRI)) {
      if (this.config.allowedSRIHashes.has(hash)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Verify CSP compliance for scriptlet content
   * @param {string} content - Scriptlet content
   * @param {string} name - Scriptlet name
   * @returns {Promise<boolean>}
   */
  async _verifyCSPCompliance(content, name) {
    // Check for CSP nonce if required
    if (this.cspNonce) {
      // In a real implementation, we'd verify the script has the correct nonce
      // For now, we'll check if the content could be nonce-compatible
    }

    // Check for unsafe-inline, unsafe-eval patterns that would violate strict CSP
    const cspViolations = [
      { pattern: /eval\s*\(/, desc: 'eval() violates CSP script-src' },
      { pattern: /Function\s*\(/, desc: 'Function constructor violates CSP' },
      { pattern: /setTimeout\s*\(\s*['"`]/, desc: 'String setTimeout violates CSP' },
      { pattern: /setInterval\s*\(\s*['"`]/, desc: 'String setInterval violates CSP' },
      { pattern: /document\.write/, desc: 'document.write violates CSP' },
      { pattern: /innerHTML\s*=/, desc: 'innerHTML assignment violates CSP' }
    ];

    for (const { pattern, desc } of cspViolations) {
      if (pattern.test(content)) {
        console.warn('[ScriptletVerifier] CSP violation in scriptlet:', name, '-', desc);
        if (this.config.strictMode) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Verify scriptlet from URL with SRI support
   * @param {string} name - Scriptlet name
   * @param {string} url - Scriptlet URL
   * @param {string} expectedIntegrity - Optional expected SRI integrity
   * @returns {Promise<Object>} Verification result
   */
  async verifyScriptletURL(name, url, expectedIntegrity = null) {
    const startTime = performance.now();
    const result = {
      name,
      verified: false,
      hash: null,
      sri: null,
      cspCompliant: false,
      reason: '',
      timestamp: Date.now(),
      duration: 0,
      url
    };

    // Check cache first
    const cached = this.integrityCache.get(url);
    if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour cache
      console.log('[ScriptletVerifier] Using cached verification for:', url);
      return { ...cached, name, timestamp: Date.now() };
    }

    // Check if URL is allowed
    if (!this._isAllowedScriptURL(url, `verifyScriptletURL:${name}`)) {
      result.reason = 'URL origin not allowed by CSP';
      result.duration = performance.now() - startTime;
      this.verifiedScriptlets.set(name, result);
      return result;
    }

    try {
      // Fetch with integrity check if provided
      const fetchOptions = {
        method: 'GET',
        credentials: 'same-origin',
        integrity: expectedIntegrity || undefined
      };

      const response = await this.context.fetch(url, fetchOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check Content-Type
      const contentType = response.headers.get('Content-Type');
      if (contentType && !contentType.includes('javascript') && !contentType.includes('text')) {
        console.warn('[ScriptletVerifier] Unexpected Content-Type:', contentType);
      }

      const content = await response.text();

      // Verify content safety
      const contentCheck = this._verifyScriptContent(content, `verifyScriptletURL:${name}`);
      if (!contentCheck.allowed) {
        result.reason = contentCheck.reason;
        this.verifiedScriptlets.set(name, result);
        return result;
      }

      // Compute SRI hashes
      result.sri = await this._computeAllSRIHashes(content);
      result.hash = result.sri.sha256;

      // Verify against expected integrity if provided
      if (expectedIntegrity) {
        const sriValid = await this._verifySRI(content, expectedIntegrity);
        if (!sriValid) {
          result.reason = 'SRI integrity check failed';
          result.cspCompliant = false;
          this.verifiedScriptlets.set(name, result);
          return result;
        }
        result.cspCompliant = true;
      }

      // Check against allowed hashes
      if (this.config.allowedHashes.has(result.hash)) {
        result.verified = true;
        result.reason = 'Hash matches allowed list';
      } else if (this._matchesAllowedSRI(result.sri)) {
        result.verified = true;
        result.reason = 'SRI hash matches allowed list';
      } else if (this.config.enforceSRI) {
        result.reason = 'Hash not in allowed list (SRI enforcement)';
        result.cspCompliant = false;
      } else {
        result.verified = true;
        result.reason = 'Content passed verification (SRI not enforced)';
        result.cspCompliant = true;
      }

      // Cache the result
      this.integrityCache.set(url, { ...result });
    } catch (e) {
      result.reason = `Fetch/verification failed: ${e.message}`;
      result.cspCompliant = false;
    }

    result.duration = performance.now() - startTime;
    this.verifiedScriptlets.set(name, result);
    return result;
  }

  /**
   * Add allowed hash for scriptlet (legacy format)
   * @param {string} hash - SHA-256 hash (with or without sha256- prefix)
   */
  addAllowedHash(hash) {
    const normalized = hash.startsWith('sha256-') ? hash : `sha256-${hash}`;
    this.config.allowedHashes.add(normalized);
  }

  /**
   * Add allowed SRI hash
   * @param {string} sriHash - SRI-formatted hash (e.g., "sha256-abc123")
   */
  addAllowedSRIHash(sriHash) {
    this.config.allowedSRIHashes.add(sriHash);
  }

  /**
   * Add multiple allowed SRI hashes
   * @param {string[]} sriHashes - Array of SRI-formatted hashes
   */
  addAllowedSRIHashes(sriHashes) {
    for (const hash of sriHashes) {
      this.config.allowedSRIHashes.add(hash);
    }
  }

  /**
   * Remove allowed hash
   * @param {string} hash - Hash to remove
   */
  removeAllowedHash(hash) {
    const normalized = hash.startsWith('sha256-') ? hash : `sha256-${hash}`;
    this.config.allowedHashes.delete(normalized);
    this.config.allowedSRIHashes.delete(normalized);
  }

  /**
   * Set CSP nonce for verification
   * @param {string} nonce - CSP nonce value
   */
  setCSPNonce(nonce) {
    this.cspNonce = nonce;
  }

  /**
   * Add allowed source origin
   * @param {string} source - Source origin (e.g., "https://example.com")
   */
  addAllowedSource(source) {
    this.config.allowedSources.add(source);
  }

  /**
   * Remove allowed source origin
   * @param {string} source - Source origin to remove
   */
  removeAllowedSource(source) {
    this.config.allowedSources.delete(source);
  }

  /**
   * Generate SRI integrity attribute for script tag
   * @param {string} content - Script content
   * @param {string[]} algorithms - Hash algorithms to include
   * @returns {Promise<string>} SRI integrity string
   */
  async generateSRIIntegrity(content, algorithms = ['sha256', 'sha384', 'sha512']) {
    const hashes = await this._computeAllSRIHashes(content);
    return algorithms
      .filter(alg => hashes[alg])
      .map(alg => hashes[alg])
      .join(' ');
  }

  /**
   * Create a verified script element with SRI and CSP attributes
   * @param {string} content - Script content
   * @param {Object} options - Options for script element
   * @returns {Promise<HTMLScriptElement>} Verified script element
   */
  async createVerifiedScriptElement(content, options = {}) {
    const { name = 'scriptlet', nonce = this.cspNonce, async = false, defer = false } = options;

    // Verify the scriptlet
    const verification = await this.verifyScriptlet(name, content);
    if (!verification.verified) {
      throw new Error(`Scriptlet verification failed: ${verification.reason}`);
    }

    // Create script element with Trusted Types
    let script;
    if (this.trustedTypesPolicy) {
      script = this.trustedTypesPolicy.createScript(content, 'script-element');
      script = this.context.document.createElement('script');
      script.textContent = script;
    } else {
      script = this.context.document.createElement('script');
      script.textContent = content;
    }

    // Add SRI integrity
    if (verification.sri) {
      const integrity = await this.generateSRIIntegrity(content);
      script.setAttribute('integrity', integrity);
      script.setAttribute('crossorigin', 'anonymous');
    }

    // Add CSP nonce
    if (nonce) {
      script.setAttribute('nonce', nonce);
    }

    // Set async/defer
    script.async = async;
    script.defer = defer;

    // Mark as AeroGuard scriptlet
    script.dataset.aeroguardScriptlet = name;
    script.dataset.aeroguardVerified = 'true';
    script.dataset.aeroguardHash = verification.hash;

    return script;
  }

  /**
   * Get verification status for all scriptlets
   */
  getVerificationReport() {
    const report = {
      total: this.verifiedScriptlets.size,
      verified: 0,
      failed: 0,
      cspCompliant: 0,
      details: []
    };

    for (const [name, result] of this.verifiedScriptlets) {
      if (result.verified) report.verified++;
      else report.failed++;
      if (result.cspCompliant) report.cspCompliant++;

      report.details.push({
        name,
        verified: result.verified,
        hash: result.hash,
        sri: result.sri,
        cspCompliant: result.cspCompliant,
        reason: result.reason,
        timestamp: result.timestamp,
        duration: result.duration
      });
    }

    return report;
  }

  /**
   * Get verification status for specific scriptlet
   */
  getVerification(name) {
    return this.verifiedScriptlets.get(name) || null;
  }

  /**
   * Clear verification cache
   */
  clearCache() {
    this.verifiedScriptlets.clear();
    this.integrityCache.clear();
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.clearCache();
    if (this.trustedTypesPolicy) {
      // Note: Trusted Types policies cannot be deleted, only created once
      this.trustedTypesPolicy = null;
    }
  }
}

// ============================================================================
// Bytecode Verifier — Verifies compiled bytecode for safety
// ============================================================================

export class BytecodeVerifier {
  constructor(options = {}) {
    // Allowed opcodes from the VM instruction set
    this.allowedOpcodes = new Set([
      0x01, 0x02, 0x03, 0x04, // Stack
      0x10, 0x11, 0x12, 0x13, // Variable
      0x20, 0x21, 0x22, 0x23, // Property
      0x30, 0x31, 0x32, 0x33, // Call
      0x40, 0x41, 0x42,       // Jump
      0x50, 0x51, 0x52, 0x53, 0x54, 0x55, // Compare
      0x60, 0x61, 0x62,       // Logical
      0x70, 0x71, 0x72, 0x73, 0x74, 0x75, // Arithmetic
      0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, // Built-in
      0x90, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, // DOM
      0xF0, 0xF1, 0xF2, 0xFF  // Special
    ]);

    this.maxBytecodeSize = options.maxBytecodeSize || 50000; // 50KB
    this.maxStringTableSize = options.maxStringTableSize || 10000; // 10KB
    this.maxCallDepth = options.maxCallDepth || 50;
    this.allowedStringPatterns = options.allowedStringPatterns || [];
    this.blockedStringPatterns = options.blockedStringPatterns || [
      /eval/,
      /Function/,
      /setTimeout/,
      /setInterval/,
      /document\.write/,
      /innerHTML/,
      /outerHTML/,
      /createElement/,
      /fetch/,
      /XMLHttpRequest/,
      /WebSocket/,
      /localStorage/,
      /sessionStorage/,
      /crypto\.subtle/,
      /indexedDB/,
      /__proto__/,
      /constructor/,
      /prototype/
    ];
  }

  /**
   * Verify bytecode for safety
   * @param {Uint8Array} bytecode - Bytecode to verify
   * @returns {Object} Verification result
   */
  verify(bytecode) {
    const errors = [];
    const warnings = [];

    // Check size
    if (bytecode.length > this.maxBytecodeSize) {
      errors.push(`Bytecode too large: ${bytecode.length} bytes (max ${this.maxBytecodeSize})`);
    }

    // Parse header
    if (bytecode.length < 12) {
      errors.push('Invalid bytecode: missing header');
      return { valid: false, errors, warnings };
    }

    // Check magic bytes "AERO"
    const magic = String.fromCharCode(...bytecode.slice(0, 4));
    if (magic !== 'AERO') {
      errors.push(`Invalid magic bytes: ${magic}`);
    }

    // Check version
    const version = bytecode[4] | (bytecode[5] << 8) | (bytecode[6] << 16) | (bytecode[7] << 24);
    if (version !== 1) {
      warnings.push(`Unknown bytecode version: ${version}`);
    }

    // Parse string table
    const stringTableSize = bytecode[8] | (bytecode[9] << 8);
    const bytecodeSize = bytecode[10] | (bytecode[11] << 8) | (bytecode[12] << 16) | (bytecode[13] << 24);

    // Verify string table
    let offset = 14;
    const strings = [];
    for (let i = 0; i < stringTableSize; i++) {
      if (offset + 2 > bytecode.length) {
        errors.push('Invalid bytecode: string table truncated');
        break;
      }
      const strLen = bytecode[offset] | (bytecode[offset + 1] << 8);
      offset += 2;

      if (strLen > this.maxStringTableSize) {
        errors.push(`String too long: ${strLen} bytes`);
        break;
      }

      if (offset + strLen > bytecode.length) {
        errors.push('Invalid bytecode: string data truncated');
        break;
      }

      const strBytes = bytecode.slice(offset, offset + strLen);
      const str = new TextDecoder().decode(strBytes);
      strings.push(str);
      offset += strLen;
    }

    // Verify strings for dangerous patterns
    for (const str of strings) {
      for (const pattern of this.blockedStringPatterns) {
        if (pattern.test(str)) {
          if (this.allowedStringPatterns.some(p => p.test(str))) {
            continue; // Allowed by allowlist
          }
          warnings.push(`Potentially dangerous string in bytecode: ${str.substring(0, 50)}`);
        }
      }
    }

    // Verify bytecode instructions
    const instructions = bytecode.slice(offset);
    for (let i = 0; i < instructions.length; i++) {
      const opcode = instructions[i];
      if (!this.allowedOpcodes.has(opcode)) {
        errors.push(`Invalid opcode at offset ${offset + i}: 0x${opcode.toString(16)}`);
      }
    }

    // Check for dangerous opcode patterns
    const dangerousPatterns = [
      { pattern: [0x30, 0x32], desc: 'CALL + NEW - dynamic code execution' },
      { pattern: [0x92, 0x93], desc: 'CREATE_ELEMENT + SET_ATTRIBUTE - DOM injection' },
      { pattern: [0x30, 0x80], desc: 'CALL + TYPEOF - potential code inspection' }
    ];

    for (const { pattern, desc } of dangerousPatterns) {
      for (let i = 0; i < instructions.length - pattern.length + 1; i++) {
        let match = true;
        for (let j = 0; j < pattern.length; j++) {
          if (instructions[i + j] !== pattern[j]) { match = false; break; }
        }
        if (match) {
          warnings.push(`${desc} at offset ${offset + i}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        version,
        stringCount: strings.length,
        instructionCount: instructions.length,
        strings: strings.slice(0, 20) // First 20 strings for inspection
      }
    };
  }

  /**
   * Verify scriptlet source by compiling and checking bytecode
   * @param {string} source - Scriptlet source code
   * @param {ScriptletCompiler} compiler - Compiler instance
   * @returns {Promise<Object>} Verification result
   */
  async verifySource(source, compiler) {
    try {
      const bytecode = compiler.compile(source);
      return this.verify(bytecode);
    } catch (e) {
      return { valid: false, errors: [e.message], warnings: [] };
    }
  }
}

// ============================================================================
// SRI Utility Functions
// ============================================================================

export class SRIUtils {
  /**
   * Generate SRI integrity for a script file
   * @param {string|Uint8Array} content - Script content
   * @param {string[]} algorithms - Hash algorithms
   * @returns {Promise<string>} SRI integrity string
   */
  static async generateIntegrity(content, algorithms = ['sha256', 'sha384', 'sha512']) {
    const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const hashes = [];

    for (const algorithm of algorithms) {
      let hashBuffer;
      switch (algorithm) {
        case 'sha256':
          hashBuffer = await crypto.subtle.digest('SHA-256', data);
          break;
        case 'sha384':
          hashBuffer = await crypto.subtle.digest('SHA-384', data);
          break;
        case 'sha512':
          hashBuffer = await crypto.subtle.digest('SHA-512', data);
          break;
        default:
          continue;
      }
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const base64Hash = btoa(String.fromCharCode(...hashArray));
      hashes.push(`${algorithm}-${base64Hash}`);
    }

    return hashes.join(' ');
  }

  /**
   * Parse SRI integrity string
   * @param {string} integrity - SRI integrity attribute value
   * @returns {Map<string, string>} Algorithm -> base64 hash
   */
  static parseIntegrity(integrity) {
    const result = new Map();
    const parts = integrity.split(/\s+/).filter(Boolean);

    for (const part of parts) {
      const match = part.match(/^(sha256|sha384|sha512)-(.+)$/);
      if (match) {
        result.set(match[1], match[2]);
      }
    }

    return result;
  }

  /**
   * Verify content against SRI integrity
   * @param {string|Uint8Array} content - Content to verify
   * @param {string} integrity - SRI integrity string
   * @returns {Promise<boolean>} Whether verification passes
   */
  static async verifyIntegrity(content, integrity) {
    const expectedHashes = this.parseIntegrity(integrity);
    const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;

    for (const [algorithm, expectedHash] of expectedHashes) {
      let hashBuffer;
      switch (algorithm) {
        case 'sha256':
          hashBuffer = await crypto.subtle.digest('SHA-256', data);
          break;
        case 'sha384':
          hashBuffer = await crypto.subtle.digest('SHA-384', data);
          break;
        case 'sha512':
          hashBuffer = await crypto.subtle.digest('SHA-512', data);
          break;
        default:
          continue;
      }
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const base64Hash = btoa(String.fromCharCode(...hashArray));
      if (base64Hash === expectedHash) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create script tag with SRI and CSP attributes
   * @param {string} src - Script source URL
   * @param {string} integrity - SRI integrity
   * @param {string} nonce - CSP nonce
   * @returns {HTMLScriptElement} Script element
   */
  static createScriptTag(src, integrity, nonce = null) {
    const script = document.createElement('script');
    script.src = src;
    script.integrity = integrity;
    script.crossOrigin = 'anonymous';
    if (nonce) script.nonce = nonce;
    return script;
  }
}

// ============================================================================
// CSP Utilities
// ============================================================================

export class CSPUtils {
  /**
   * Parse CSP header into directives
   * @param {string} cspHeader - CSP header value
   * @returns {Object} Parsed CSP directives
   */
  static parseCSP(cspHeader) {
    const directives = {};
    const parts = cspHeader.split(';').map(p => p.trim()).filter(Boolean);

    for (const part of parts) {
      const [directive, ...values] = part.split(/\s+/);
      if (directive) {
        directives[directive] = values;
      }
    }

    return directives;
  }

  /**
   * Check if a script source is allowed by CSP
   * @param {string} url - Script URL
   * @param {Object} cspDirectives - Parsed CSP directives
   * @returns {boolean} Whether allowed
   */
  static isScriptAllowed(url, cspDirectives) {
    const scriptSrc = cspDirectives['script-src'] || cspDirectives['default-src'] || [];
    const scriptSrcElem = cspDirectives['script-src-elem'] || [];

    // Combine sources
    const sources = [...new Set([...scriptSrc, ...scriptSrcElem])];

    // Check for 'unsafe-inline', 'unsafe-eval', 'strict-dynamic'
    const hasUnsafeInline = sources.includes("'unsafe-inline'");
    const hasUnsafeEval = sources.includes("'unsafe-eval'");
    const hasStrictDynamic = sources.includes("'strict-dynamic'");
    const hasNonce = sources.some(s => s.startsWith("'nonce-"));
    const hasHash = sources.some(s => s.match(/^'(sha256|sha384|sha512)-/));

    // Data URLs
    if (url.startsWith('data:')) {
      return hasUnsafeInline || sources.includes('data:');
    }

    // Blob URLs
    if (url.startsWith('blob:')) {
      return hasUnsafeInline || sources.includes('blob:');
    }

    // Check explicit sources
    const scriptUrl = new URL(url);
    for (const source of sources) {
      if (source === 'self' && scriptUrl.origin === window.location.origin) return true;
      if (source === '*') return true;
      // Exact hostname match
      if (scriptUrl.hostname === source) return true;
      // Wildcard domain match (e.g., *.example.com matches sub.example.com)
      if (source.startsWith('*.') && scriptUrl.hostname.endsWith(source.slice(1))) return true;
      // Full origin match (e.g., https://example.com)
      if (source.startsWith('https://') && scriptUrl.origin === source) return true;
      if (source.startsWith('http://') && scriptUrl.origin === source) return true;
      // Protocol match (e.g., https: matches all HTTPS)
      // Note: This is intentionally NOT a general wildcard - it requires '*' or specific domains
    }

    return false;
  }

  /**
   * Generate CSP header for scriptlet injection
   * @param {Object} options - CSP options
   * @returns {string} CSP header value
   */
  static generateScriptletCSP(options = {}) {
    const {
      nonce,
      hashes = [],
      allowedOrigins = ['self'],
      allowInline = false,
      allowEval = false,
      strictDynamic = true
    } = options;

    const scriptSrc = [...allowedOrigins];

    if (allowInline) scriptSrc.push("'unsafe-inline'");
    if (allowEval) scriptSrc.push("'unsafe-eval'");
    if (strictDynamic) scriptSrc.push("'strict-dynamic'");
    if (nonce) scriptSrc.push(`'nonce-${nonce}'`);
    for (const hash of hashes) {
      scriptSrc.push(`'${hash}'`);
    }

    return `script-src ${scriptSrc.join(' ')}; object-src 'none'; base-uri 'self';`;
  }
}

// ============================================================================
// Singleton Instance Management
// ============================================================================

let scriptletVerifierInstance = null;

export function getScriptletVerifier(context = window, options = {}) {
  if (!scriptletVerifierInstance) {
    scriptletVerifierInstance = new ScriptletVerifier(context, options);
  }
  return scriptletVerifierInstance;
}

export function resetScriptletVerifier() {
  if (scriptletVerifierInstance) {
    scriptletVerifierInstance.cleanup();
  }
  scriptletVerifierInstance = null;
}

// Export for module systems
export default {
  ScriptletVerifier,
  BytecodeVerifier,
  SRIUtils,
  CSPUtils,
  getScriptletVerifier,
  resetScriptletVerifier
};