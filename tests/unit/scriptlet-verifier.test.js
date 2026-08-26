/**
 * Scriptlet Verifier Tests
 * Tests for SRI, CSP, Trusted Types, and hash verification
 */

import { ScriptletVerifier, BytecodeVerifier, SRIUtils, CSPUtils } from '../../core/scriptlet-vm/scriptlet-verifier.js';

// Mock window object for testing
const mockWindow = {
  location: { origin: 'https://example.com' },
  crypto: {
    subtle: {
      digest: async (algorithm, data) => {
        // Simple mock hash - in real tests would use actual crypto
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
    location: { origin: 'https://example.com' }
  },
  fetch: async (url) => ({
    ok: true,
    headers: new Map([['Content-Type', 'text/javascript']]),
    text: async () => `// Scriptlet from ${url}`
  }),
  btoa: (str) => Buffer.from(str).toString('base64'),
  performance: { now: () => Date.now() }
};

global.window = mockWindow;
global.crypto = mockWindow.crypto;
global.btoa = mockWindow.btoa;
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

describe('ScriptletVerifier', () => {
  let verifier;

  beforeEach(() => {
    verifier = new ScriptletVerifier(mockWindow, {
      enforceSRI: true,
      enforceCSP: true,
      trustedTypesPolicy: 'test-policy',
      allowedHashes: new Set(),
      allowedSources: new Set(['self', 'https://trusted.example.com']),
      allowedSRIHashes: new Set(),
      strictMode: true
    });
  });

  describe('Content Verification', () => {
    test('should allow safe scriptlet content', async () => {
      const safeContent = `
        (function() {
          const element = document.querySelector('.ad');
          if (element) element.remove();
        })();
      `;
      const result = await verifier.verifyScriptlet('test-safe', safeContent);
      expect(result.verified).toBe(true);
    });

    test('should reject eval usage', async () => {
      const dangerousContent = `eval('alert(1)')`;
      const result = await verifier.verifyScriptlet('test-eval', dangerousContent);
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Dangerous pattern');
    });

    test('should reject Function constructor', async () => {
      const dangerousContent = `new Function('return 1')()`;
      const result = await verifier.verifyScriptlet('test-function', dangerousContent);
      expect(result.verified).toBe(false);
    });

    test('should reject document.write', async () => {
      const dangerousContent = `document.write('<script>alert(1)</script>')`;
      const result = await verifier.verifyScriptlet('test-docwrite', dangerousContent);
      expect(result.verified).toBe(false);
    });

    test('should reject innerHTML assignment', async () => {
      const dangerousContent = `element.innerHTML = '<script>alert(1)</script>'`;
      const result = await verifier.verifyScriptlet('test-innerhtml', dangerousContent);
      expect(result.verified).toBe(false);
    });

    test('should reject fetch usage', async () => {
      const dangerousContent = `fetch('https://evil.com/steal')`;
      const result = await verifier.verifyScriptlet('test-fetch', dangerousContent);
      expect(result.verified).toBe(false);
    });

    test('should reject localStorage access', async () => {
      const dangerousContent = `localStorage.setItem('key', 'value')`;
      const result = await verifier.verifyScriptlet('test-localstorage', dangerousContent);
      expect(result.verified).toBe(false);
    });

    test('should reject prototype pollution attempts', async () => {
      const dangerousContent = `Object.prototype.polluted = true`;
      const result = await verifier.verifyScriptlet('test-proto', dangerousContent);
      expect(result.verified).toBe(false);
    });
  });

  describe('SRI Hash Generation', () => {
    test('should generate SHA-256 SRI hash', async () => {
      const content = 'console.log("test")';
      const hash = await verifier._computeSRIHash(content, 'sha256');
      expect(hash).toMatch(/^sha256-/);
      expect(hash.length).toBeGreaterThan(10);
    });

    test('should generate SHA-384 SRI hash', async () => {
      const content = 'console.log("test")';
      const hash = await verifier._computeSRIHash(content, 'sha384');
      expect(hash).toMatch(/^sha384-/);
    });

    test('should generate SHA-512 SRI hash', async () => {
      const content = 'console.log("test")';
      const hash = await verifier._computeSRIHash(content, 'sha512');
      expect(hash).toMatch(/^sha512-/);
    });

    test('should generate all SRI hashes', async () => {
      const content = 'console.log("test")';
      const hashes = await verifier._computeAllSRIHashes(content);
      expect(hashes.sha256).toBeDefined();
      expect(hashes.sha384).toBeDefined();
      expect(hashes.sha512).toBeDefined();
    });

    test('should parse SRI integrity string', () => {
      const integrity = 'sha256-abc123 sha384-def456 sha512-ghi789';
      const parsed = verifier._parseSRI(integrity);
      expect(parsed.get('sha256')).toBe('abc123');
      expect(parsed.get('sha384')).toBe('def456');
      expect(parsed.get('sha512')).toBe('ghi789');
    });

    test('should verify SRI integrity', async () => {
      const content = 'console.log("test")';
      const hash = await verifier._computeSRIHash(content, 'sha256');
      const valid = await verifier._verifySRI(content, hash);
      expect(valid).toBe(true);
    });
  });

  describe('URL Verification', () => {
    test('should allow same-origin URLs', () => {
      expect(verifier._isAllowedScriptURL('https://example.com/script.js')).toBe(true);
    });

    test('should allow data: URLs', () => {
      expect(verifier._isAllowedScriptURL('data:text/javascript,console.log(1)')).toBe(true);
    });

    test('should allow blob: URLs', () => {
      expect(verifier._isAllowedScriptURL('blob:https://example.com/abc123')).toBe(true);
    });

    test('should allow configured trusted sources', () => {
      expect(verifier._isAllowedScriptURL('https://trusted.example.com/script.js')).toBe(true);
    });

    test('should reject untrusted origins', () => {
      expect(verifier._isAllowedScriptURL('https://evil.com/script.js')).toBe(false);
    });

    test('should support wildcard domains', () => {
      verifier.addAllowedSource('*.trusted.com');
      expect(verifier._isAllowedScriptURL('https://api.trusted.com/script.js')).toBe(true);
      expect(verifier._isAllowedScriptURL('https://cdn.trusted.com/script.js')).toBe(true);
    });
  });

  describe('Allowed Hashes', () => {
    test('should verify against allowed hashes', async () => {
      const content = 'console.log("allowed")';
      const hash = await verifier._computeSRIHash(content, 'sha256');
      verifier.addAllowedHash(hash);

      const result = await verifier.verifyScriptlet('allowed', content);
      expect(result.verified).toBe(true);
      expect(result.reason).toContain('allowed list');
    });

    test('should verify against allowed SRI hashes', async () => {
      const content = 'console.log("allowed-sri")';
      const hash = await verifier._computeSRIHash(content, 'sha256');
      verifier.addAllowedSRIHash(hash);

      const result = await verifier.verifyScriptlet('allowed-sri', content);
      expect(result.verified).toBe(true);
    });

    test('should remove allowed hashes', async () => {
      const content = 'console.log("remove-me")';
      const hash = await verifier._computeSRIHash(content, 'sha256');
      verifier.addAllowedHash(hash);
      verifier.removeAllowedHash(hash);

      const result = await verifier.verifyScriptlet('removed', content);
      expect(result.verified).toBe(false);
    });
  });

  describe('CSP Compliance', () => {
    test('should verify CSP compliance for safe content', async () => {
      const safeContent = `
        (function() {
          const el = document.querySelector('.ad');
          if (el) el.style.display = 'none';
        })();
      `;
      const result = await verifier.verifyScriptlet('csp-safe', safeContent);
      expect(result.cspCompliant).toBe(true);
    });

    test('should detect CSP violations', async () => {
      const unsafeContent = `eval('code')`;
      const result = await verifier.verifyScriptlet('csp-unsafe', unsafeContent);
      expect(result.cspCompliant).toBe(false);
    });
  });

  describe('Verification Report', () => {
    test('should generate verification report', async () => {
      await verifier.verifyScriptlet('script1', 'console.log(1)');
      await verifier.verifyScriptlet('script2', 'console.log(2)');

      const report = verifier.getVerificationReport();
      expect(report.total).toBe(2);
      expect(report.verified).toBeGreaterThanOrEqual(0);
      expect(report.details).toHaveLength(2);
    });

    test('should get individual verification', async () => {
      await verifier.verifyScriptlet('individual', 'console.log(1)');
      const verification = verifier.getVerification('individual');
      expect(verification).toBeDefined();
      expect(verification.name).toBe('individual');
    });
  });
});

describe('BytecodeVerifier', () => {
  let bytecodeVerifier;

  beforeEach(() => {
    bytecodeVerifier = new BytecodeVerifier({
      maxBytecodeSize: 10000,
      maxStringTableSize: 1000
    });
  });

  test('should validate valid bytecode', () => {
    // Create minimal valid bytecode
    const bytecode = new Uint8Array([
      0x41, 0x45, 0x52, 0x4F, // "AERO"
      0x01, 0x00, 0x00, 0x00, // version 1
      0x00, 0x00, // string table size: 0
      0x01, 0x00, 0x00, 0x00, // bytecode size: 1
      0xFF // NOP
    ]);

    const result = bytecodeVerifier.verify(bytecode);
    expect(result.valid).toBe(true);
  });

  test('should reject invalid magic bytes', () => {
    const bytecode = new Uint8Array([
      0x42, 0x41, 0x44, 0x00, // "BAD\0"
      0x01, 0x00, 0x00, 0x00,
      0x00, 0x00,
      0x00, 0x00, 0x00, 0x00
    ]);

    const result = bytecodeVerifier.verify(bytecode);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('magic'))).toBe(true);
  });

  test('should reject oversized bytecode', () => {
    const largeBytecode = new Uint8Array(20000).fill(0xFF);
    largeBytecode[0] = 0x41; largeBytecode[1] = 0x45; largeBytecode[2] = 0x52; largeBytecode[3] = 0x4F;

    const result = bytecodeVerifier.verify(largeBytecode);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('too large'))).toBe(true);
  });

  test('should reject invalid opcodes', () => {
    const bytecode = new Uint8Array([
      0x41, 0x45, 0x52, 0x4F, // "AERO"
      0x01, 0x00, 0x00, 0x00, // version 1
      0x00, 0x00, // string table size: 0
      0x01, 0x00, 0x00, 0x00, // bytecode size: 1
      0x99 // Invalid opcode
    ]);

    const result = bytecodeVerifier.verify(bytecode);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid opcode'))).toBe(true);
  });
});

describe('SRIUtils', () => {
  test('should generate SRI integrity', async () => {
    const content = 'console.log("test")';
    const integrity = await SRIUtils.generateIntegrity(content, ['sha256', 'sha384']);
    expect(integrity).toContain('sha256-');
    expect(integrity).toContain('sha384-');
  });

  test('should parse SRI integrity', () => {
    const integrity = 'sha256-abc123 sha384-def456';
    const parsed = SRIUtils.parseIntegrity(integrity);
    expect(parsed.get('sha256')).toBe('abc123');
    expect(parsed.get('sha384')).toBe('def456');
  });

  test('should verify SRI integrity', async () => {
    const content = 'console.log("verify")';
    const integrity = await SRIUtils.generateIntegrity(content, ['sha256']);
    const valid = await SRIUtils.verifyIntegrity(content, integrity);
    expect(valid).toBe(true);
  });

  test('should reject tampered content', async () => {
    const content = 'console.log("original")';
    const integrity = await SRIUtils.generateIntegrity(content, ['sha256']);
    const tampered = 'console.log("tampered")';
    const valid = await SRIUtils.verifyIntegrity(tampered, integrity);
    expect(valid).toBe(false);
  });
});

describe('CSPUtils', () => {
  test('should parse CSP header', () => {
    const csp = "script-src 'self' https://trusted.com; object-src 'none'";
    const parsed = CSPUtils.parseCSP(csp);
    expect(parsed['script-src']).toContain("'self'");
    expect(parsed['script-src']).toContain('https://trusted.com');
    expect(parsed['object-src']).toContain("'none'");
  });

  test('should check script allowance', () => {
    const csp = CSPUtils.parseCSP("script-src 'self' https://trusted.com");
    expect(CSPUtils.isScriptAllowed('https://example.com/script.js', csp)).toBe(true);
    expect(CSPUtils.isScriptAllowed('https://trusted.com/script.js', csp)).toBe(true);
    expect(CSPUtils.isScriptAllowed('https://evil.com/script.js', csp)).toBe(false);
  });

  test('should generate scriptlet CSP', () => {
    const csp = CSPUtils.generateScriptletCSP({
      nonce: 'abc123',
      hashes: ['sha256-hash1', 'sha384-hash2'],
      allowedOrigins: ['self', 'https://api.example.com'],
      strictDynamic: true
    });
    expect(csp).toContain("script-src");
    expect(csp).toContain("'nonce-abc123'");
    expect(csp).toContain("'sha256-hash1'");
    expect(csp).toContain("'strict-dynamic'");
  });
});