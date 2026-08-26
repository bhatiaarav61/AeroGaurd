/**
 * Script Integrity Tests
 * Tests for SRI, hash verification, trusted-types enforcement for anti-adblock
 */

import { ScriptIntegrity, ANTI_ADBLOCK_SCRIPTLET_HASHES, generateAntiAdblockScriptletHashes, createAntiAdblockScriptIntegrity } from '../../core/anti-adblock/script-integrity.js';
import { ScriptletVerifier, SRIUtils, CSPUtils } from '../../core/scriptlet-vm/scriptlet-verifier.js';

// Mock window object for testing
const mockWindow = {
  location: { origin: 'https://example.com' },
  crypto: {
    subtle: {
      digest: async (algorithm, data) => {
        const hash = new Uint8Array(32);
        for (let i = 0; i < data.length; i++) {
          hash[i % 32] ^= data[i];
        }
        return hash.buffer;
      }
    }
  },
  trustedTypes: {
    createPolicy: (name, policy) => policy
  },
  document: {
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { origin: 'https://example.com' },
    documentElement: {
      querySelectorAll: () => [],
      querySelector: () => null
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      src: '',
      textContent: '',
      setAttribute: () => {},
      getAttribute: () => null,
      dataset: {},
      remove: () => {}
    })
  },
  fetch: async (url) => ({
    ok: true,
    headers: new Map([['Content-Type', 'text/javascript']]),
    text: async () => `// Scriptlet from ${url}`
  }),
  btoa: (str) => Buffer.from(str).toString('base64'),
  performance: { now: () => Date.now() },
  Node: { ELEMENT_NODE: 1 },
  MutationObserver: class {
    constructor(cb) { this.cb = cb; }
    observe() {}
    disconnect() {}
  }
};

global.window = mockWindow;
global.btoa = mockWindow.btoa;
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

describe('ScriptIntegrity', () => {
  let integrity;

  beforeEach(async () => {
    integrity = new ScriptIntegrity(mockWindow, {
      enforceSRI: true,
      enforceCSP: true,
      trustedTypesPolicy: 'test-policy',
      allowedHashes: new Set(),
      allowedSources: new Set(['self', 'https://trusted.example.com']),
      allowedSRIHashes: new Set(),
      strictMode: true,
      debug: true
    });
    await integrity.initialize();
  });

  afterEach(() => {
    integrity.cleanup();
  });

  describe('Initialization', () => {
    test('should initialize with ScriptletVerifier integration', async () => {
      expect(integrity.scriptletVerifier).toBeDefined();
      expect(integrity.trustedTypesPolicy).toBeDefined();
      expect(integrity.observer).toBeDefined();
    });

    test('should have anti-adblock trusted types policy name', () => {
      expect(integrity.config.trustedTypesPolicy).toBe('test-policy');
    });

    test('should have metrics object', () => {
      expect(integrity.metrics).toEqual({
        scriptsVerified: 0,
        scriptsRejected: 0,
        sriViolations: 0,
        trustedTypesViolations: 0,
        contentViolations: 0
      });
    });
  });

  describe('Content Verification', () => {
    test('should allow safe anti-adblock scriptlet content', async () => {
      // Simple content without dangerous patterns
      const safeContent = `(function() { const value = 1 + 2; return value * 3; })();`;
      // Add the hash to allowed list since enforceSRI is true
      const hash = await integrity._computeSRIHash(safeContent, 'sha256');
      integrity.addAllowedHash(hash);
      const result = await integrity.verifyScriptlet('test-safe', safeContent);
      expect(result.verified).toBe(true);
    });

    test('should reject eval usage in anti-adblock scriptlets', async () => {
      const dangerousContent = `eval('alert(1)')`;
      const result = await integrity.verifyScriptlet('test-eval', dangerousContent);
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Dangerous pattern: eval() usage');
    });

    test('should reject Function constructor', async () => {
      const dangerousContent = `new Function('return 1')()`;
      const result = await integrity.verifyScriptlet('test-function', dangerousContent);
      expect(result.verified).toBe(false);
    });

    test('should reject document.write', async () => {
      const dangerousContent = `document.write('<script>alert(1)</script>')`;
      const result = await integrity.verifyScriptlet('test-docwrite', dangerousContent);
      expect(result.verified).toBe(false);
    });

    test('should reject innerHTML assignment', async () => {
      const dangerousContent = `element.innerHTML = '<script>alert(1)</script>'`;
      const result = await integrity.verifyScriptlet('test-innerhtml', dangerousContent);
      expect(result.verified).toBe(false);
    });

    test('should reject fetch usage', async () => {
      const dangerousContent = `fetch('https://evil.com/steal')`;
      const result = await integrity.verifyScriptlet('test-fetch', dangerousContent);
      expect(result.verified).toBe(false);
    });

    test('should reject localStorage access', async () => {
      const dangerousContent = `localStorage.setItem('key', 'value')`;
      const result = await integrity.verifyScriptlet('test-localstorage', dangerousContent);
      expect(result.verified).toBe(false);
    });

    test('should reject prototype pollution attempts', async () => {
      const dangerousContent = `Object.prototype.polluted = true`;
      const result = await integrity.verifyScriptlet('test-proto', dangerousContent);
      expect(result.verified).toBe(false);
    });

    test('should reject obfuscation patterns', async () => {
      const dangerousContent = `atob('YWxlcnQoMSk=')`;
      const result = await integrity.verifyScriptlet('test-atob', dangerousContent);
      expect(result.verified).toBe(false);
    });

    test('should reject WebSocket creation', async () => {
      const dangerousContent = `new WebSocket('wss://evil.com')`;
      const result = await integrity.verifyScriptlet('test-websocket', dangerousContent);
      expect(result.verified).toBe(false);
    });

    test('should reject Worker creation', async () => {
      const dangerousContent = `new Worker('worker.js')`;
      const result = await integrity.verifyScriptlet('test-worker', dangerousContent);
      expect(result.verified).toBe(false);
    });
  });

  describe('URL Verification', () => {
    test('should allow same-origin URLs', () => {
      expect(integrity._isAllowedScriptURL('https://example.com/script.js')).toBe(true);
    });

    test('should allow data: URLs for inline scriptlets', () => {
      expect(integrity._isAllowedScriptURL('data:text/javascript,console.log(1)')).toBe(true);
    });

    test('should allow blob: URLs', () => {
      expect(integrity._isAllowedScriptURL('blob:https://example.com/abc123')).toBe(true);
    });

    test('should allow chrome-extension: URLs', () => {
      expect(integrity._isAllowedScriptURL('chrome-extension://abc123/script.js')).toBe(true);
    });

    test('should allow configured trusted sources', () => {
      expect(integrity._isAllowedScriptURL('https://trusted.example.com/script.js')).toBe(true);
    });

    test('should reject untrusted origins', () => {
      expect(integrity._isAllowedScriptURL('https://evil.com/script.js')).toBe(false);
    });

    test('should support wildcard domains', () => {
      integrity.addAllowedSource('*.trusted.com');
      expect(integrity._isAllowedScriptURL('https://api.trusted.com/script.js')).toBe(true);
      expect(integrity._isAllowedScriptURL('https://cdn.trusted.com/script.js')).toBe(true);
    });
  });

  describe('SRI Hash Generation', () => {
    test('should generate SHA-256 SRI hash', async () => {
      const content = 'console.log("test")';
      const hash = await integrity._computeSRIHash(content, 'sha256');
      expect(hash).toMatch(/^sha256-/);
      expect(hash.length).toBeGreaterThan(10);
    });

    test('should generate SHA-384 SRI hash', async () => {
      const content = 'console.log("test")';
      const hash = await integrity._computeSRIHash(content, 'sha384');
      expect(hash).toMatch(/^sha384-/);
    });

    test('should generate SHA-512 SRI hash', async () => {
      const content = 'console.log("test")';
      const hash = await integrity._computeSRIHash(content, 'sha512');
      expect(hash).toMatch(/^sha512-/);
    });

    test('should generate all SRI hashes', async () => {
      const content = 'console.log("test")';
      const hashes = await integrity.scriptletVerifier._computeAllSRIHashes(content);
      expect(hashes.sha256).toBeDefined();
      expect(hashes.sha384).toBeDefined();
      expect(hashes.sha512).toBeDefined();
    });

    test('should parse SRI integrity string', () => {
      const integrity_str = 'sha256-abc123 sha384-def456 sha512-ghi789';
      const parsed = integrity.scriptletVerifier._parseSRI(integrity_str);
      expect(parsed.get('sha256')).toBe('abc123');
      expect(parsed.get('sha384')).toBe('def456');
      expect(parsed.get('sha512')).toBe('ghi789');
    });

    test('should verify SRI integrity', async () => {
      const content = 'console.log("test")';
      const hash = await integrity._computeSRIHash(content, 'sha256');
      const valid = await integrity.scriptletVerifier._verifySRI(content, hash);
      expect(valid).toBe(true);
    });
  });

  describe('Allowed Hashes', () => {
    test('should verify against allowed hashes', async () => {
      const content = 'console.log("allowed")';
      const hash = await integrity._computeSRIHash(content, 'sha256');
      integrity.addAllowedHash(hash);

      const result = await integrity.verifyScriptlet('allowed', content);
      expect(result.verified).toBe(true);
      expect(result.reason).toContain('allowed list');
    });

    test('should verify against allowed SRI hashes', async () => {
      const content = 'console.log("allowed-sri")';
      const hash = await integrity._computeSRIHash(content, 'sha256');
      integrity.addAllowedSRIHash(hash);

      const result = await integrity.verifyScriptlet('allowed-sri', content);
      expect(result.verified).toBe(true);
    });

    test('should remove allowed hashes', async () => {
      const content = 'console.log("remove-me")';
      const hash = await integrity._computeSRIHash(content, 'sha256');
      integrity.addAllowedHash(hash);
      integrity.removeAllowedHash(hash);

      const result = await integrity.verifyScriptlet('removed', content);
      expect(result.verified).toBe(false);
    });
  });

  describe('Script Element Verification', () => {
    test('should verify inline script element', async () => {
      const script = {
        src: '',
        textContent: 'console.log("inline")',
        dataset: { aeroguardScriptlet: 'test-inline' },
        id: 'test-script'
      };

      const result = await integrity._verifyScript(script);
      expect(result).toBeDefined();
      expect(result.details.type).toBe('inline');
    });

    test('should verify external script element with allowed origin', async () => {
      const script = {
        src: 'https://example.com/script.js',
        textContent: '',
        integrity: '',
        dataset: {}
      };

      const result = await integrity._verifyScript(script);
      expect(result).toBeDefined();
      expect(result.details.type).toBe('external');
    });

    test('should reject external script from disallowed origin', async () => {
      const script = {
        src: 'https://evil.com/script.js',
        textContent: '',
        integrity: '',
        dataset: {}
      };

      const result = await integrity._verifyScript(script);
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Disallowed origin');
    });
  });

  describe('Verification Report', () => {
    test('should generate verification report', async () => {
      const content1 = 'console.log(1)';
      const content2 = 'console.log(2)';
      const hash1 = await integrity._computeSRIHash(content1, 'sha256');
      const hash2 = await integrity._computeSRIHash(content2, 'sha256');
      integrity.addAllowedHash(hash1);
      integrity.addAllowedHash(hash2);

      // Verify script elements (which populates verifiedScripts)
      const script1 = { src: '', textContent: content1, dataset: { aeroguardScriptlet: 'script1' } };
      const script2 = { src: '', textContent: content2, dataset: { aeroguardScriptlet: 'script2' } };
      await integrity._verifyScript(script1);
      await integrity._verifyScript(script2);

      const report = integrity.getVerificationReport();
      expect(report.total).toBe(2);
      expect(report.verified).toBeGreaterThanOrEqual(0);
      expect(report.details).toHaveLength(2);
      expect(report.metrics).toBeDefined();
    });

    test('should get individual verification', async () => {
      const content = 'console.log(1)';
      const hash = await integrity._computeSRIHash(content, 'sha256');
      integrity.addAllowedHash(hash);

      const script = { dataset: { aeroguardScriptlet: 'individual' }, textContent: content, src: '' };
      await integrity._verifyScript(script);
      const verification = integrity.getVerification(script);
      expect(verification).toBeDefined();
    });
  });

  describe('CSP Nonce', () => {
    test('should set CSP nonce', () => {
      integrity.setCSPNonce('abc123');
      expect(integrity.cspNonce).toBe('abc123');
      expect(integrity.scriptletVerifier.cspNonce).toBe('abc123');
    });
  });

  describe('Allowed Sources Management', () => {
    test('should add allowed source', () => {
      integrity.addAllowedSource('https://new-trusted.com');
      expect(integrity.config.allowedSources.has('https://new-trusted.com')).toBe(true);
    });

    test('should remove allowed source', () => {
      integrity.addAllowedSource('https://to-remove.com');
      integrity.removeAllowedSource('https://to-remove.com');
      expect(integrity.config.allowedSources.has('https://to-remove.com')).toBe(false);
    });
  });

  describe('Cleanup', () => {
    test('should cleanup resources', () => {
      integrity.cleanup();
      expect(integrity.observer).toBeNull();
      expect(integrity.verifiedScripts.size).toBe(0);
      expect(integrity.integrityCache.size).toBe(0);
    });
  });
});

describe('ANTI_ADBLOCK_SCRIPTLET_HASHES', () => {
  test('should have predefined hash placeholders for common anti-adblock scriptlets', () => {
    expect(ANTI_ADBLOCK_SCRIPTLET_HASHES['adblock-detection-stub']).toBeDefined();
    expect(ANTI_ADBLOCK_SCRIPTLET_HASHES['adsbygoogle-stub']).toBeDefined();
    expect(ANTI_ADBLOCK_SCRIPTLET_HASHES['yt-player-response-sanitizer']).toBeDefined();
    expect(ANTI_ADBLOCK_SCRIPTLET_HASHES['overlay-remover']).toBeDefined();
    expect(ANTI_ADBLOCK_SCRIPTLET_HASHES['abort-current-inline-script']).toBeDefined();
    expect(ANTI_ADBLOCK_SCRIPTLET_HASHES['noopfunc']).toBeDefined();
    expect(ANTI_ADBLOCK_SCRIPTLET_HASHES['prevent-xhr']).toBeDefined();
    expect(ANTI_ADBLOCK_SCRIPTLET_HASHES['prevent-fetch']).toBeDefined();
    expect(ANTI_ADBLOCK_SCRIPTLET_HASHES['remove-node']).toBeDefined();
    expect(ANTI_ADBLOCK_SCRIPTLET_HASHES['override-property']).toBeDefined();
    expect(ANTI_ADBLOCK_SCRIPTLET_HASHES['set-constant']).toBeDefined();
  });
});

describe('generateAntiAdblockScriptletHashes', () => {
  test('should generate SRI hashes for scriptlets', async () => {
    const scriptlets = {
      'test-scriptlet-1': 'console.log("test1")',
      'test-scriptlet-2': 'console.log("test2")'
    };

    const hashes = await generateAntiAdblockScriptletHashes(scriptlets);
    expect(hashes['test-scriptlet-1']).toContain('sha256-');
    expect(hashes['test-scriptlet-1']).toContain('sha384-');
    expect(hashes['test-scriptlet-1']).toContain('sha512-');
    expect(hashes['test-scriptlet-2']).toContain('sha256-');
  });
});

describe('createAntiAdblockScriptIntegrity', () => {
  test('should create pre-configured ScriptIntegrity instance', async () => {
    const integrity = await createAntiAdblockScriptIntegrity(mockWindow, { debug: true });
    expect(integrity).toBeInstanceOf(ScriptIntegrity);
    expect(integrity.config.enforceSRI).toBe(true);
    expect(integrity.config.enforceCSP).toBe(true);
    expect(integrity.config.trustedTypesPolicy).toBe('aeroguard-anti-adblock');
    expect(integrity.config.strictMode).toBe(true);
    expect(integrity.config.aggressive).toBe(true);
    integrity.cleanup();
  });
});

describe('Singleton Management', () => {
  let getScriptIntegrity;
  let resetScriptIntegrity;
  let getInitializedScriptIntegrity;

  beforeAll(async () => {
    const module = await import('../../core/anti-adblock/script-integrity.js');
    getScriptIntegrity = module.getScriptIntegrity;
    resetScriptIntegrity = module.resetScriptIntegrity;
    getInitializedScriptIntegrity = module.getInitializedScriptIntegrity;
  });

  test('should return same instance from getScriptIntegrity', () => {
    resetScriptIntegrity();
    const instance2 = getScriptIntegrity(mockWindow);
    const instance3 = getScriptIntegrity(mockWindow);
    expect(instance2).toBe(instance3);
    resetScriptIntegrity();
  });

  test('should reset singleton', async () => {
    resetScriptIntegrity();
    const instance = await getInitializedScriptIntegrity(mockWindow);
    expect(instance).toBeDefined();
    resetScriptIntegrity();
    // After reset, new instance should be created
    const instance2 = getScriptIntegrity(mockWindow);
    expect(instance2).not.toBe(instance);
  });
});