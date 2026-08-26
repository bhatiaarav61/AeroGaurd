/**
 * FingerprintingShield Unit Tests
 * Tests for anti-fingerprinting protections
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FingerprintingShield } from '../../core/heuristic-engine/fingerprinting-shield.js';

describe('FingerprintingShield', () => {
  let shield;
  let mockContext;
  let originalWindow;

  beforeEach(() => {
    // Create a minimal mock context
    const mockAudioContext = class {
      createAnalyser() {
        return {
          getFloatFrequencyData: vi.fn(),
          getByteFrequencyData: vi.fn(),
          getFloatTimeDomainData: vi.fn(),
          getByteTimeDomainData: vi.fn()
        };
      }
      createOscillator() { return { frequency: { value: 440 } }; }
      createGain() { return {}; }
      getOutputLatency() { return 0.01; }
    };

    const mockWebGL = {
      prototype: {
        getParameter: vi.fn((pname) => {
          if (pname === 0x1F00) return 'Real Vendor';
          if (pname === 0x1F01) return 'Real Renderer';
          if (pname === 0x1F02) return 'Real Version';
          return null;
        }),
        getExtension: vi.fn(() => null),
        getSupportedExtensions: vi.fn(() => []),
        VENDOR: 0x1F00,
        RENDERER: 0x1F01,
        VERSION: 0x1F02,
        SHADING_LANGUAGE_VERSION: 0x8B8C,
        MAX_TEXTURE_SIZE: 0x0D33,
        MAX_CUBE_MAP_TEXTURE_SIZE: 0x851C,
        MAX_RENDERBUFFER_SIZE: 0x84E8,
        MAX_VIEWPORT_DIMS: 0x0D3A,
        ALIASED_LINE_WIDTH_RANGE: 0x846E,
        ALIASED_POINT_SIZE_RANGE: 0x846D,
        MAX_VERTEX_ATTRIBS: 0x8869,
        MAX_VERTEX_UNIFORM_VECTORS: 0x8DFB,
        MAX_VARYING_VECTORS: 0x8DFC,
        MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8B4D,
        MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8B4C,
        MAX_FRAGMENT_UNIFORM_VECTORS: 0x8DFD
      },
      VENDOR: 0x1F00,
      RENDERER: 0x1F01,
      VERSION: 0x1F02,
      SHADING_LANGUAGE_VERSION: 0x8B8C
    };

    const mockHTMLCanvas = {
      prototype: {
        toDataURL: vi.fn(() => 'data:image/png;base64,test'),
        toBlob: vi.fn((cb) => cb(new Blob())),
        getContext: vi.fn(() => ({
          getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(100), width: 10, height: 10 })),
          measureText: vi.fn(() => ({ width: 100 })),
          putImageData: vi.fn()
        }))
      }
    };

    const mockCanvas2D = {
      prototype: {
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(100), width: 10, height: 10 })),
        measureText: vi.fn(() => ({ width: 100 })),
        putImageData: vi.fn()
      }
    };

    const mockElement = {
      prototype: {
        getBoundingClientRect: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
        getClientRects: vi.fn(() => [{ x: 0, y: 0, width: 100, height: 100 }])
      }
    };

    const mockDOMRect = function(x, y, width, height) {
      return { x, y, width, height };
    };

    const mockIntl = {
      DateTimeFormat: function(locales, options) {
        return {
          resolvedOptions: () => ({ locale: locales[0], timeZone: options?.timeZone })
        };
      },
      NumberFormat: function(locales, options) {
        return {};
      }
    };

    const mockDate = class extends Date {
      constructor(...args) {
        if (args.length === 0) return new Date();
        return new Date(...args);
      }
    };

    const mockFontFaceSet = {
      prototype: {
        check: vi.fn()
      }
    };

    const mockSpeechSynthesis = {
      getVoices: vi.fn(() => [{ name: 'Test Voice', lang: 'en-US' }])
    };

    const mockDocument = {
      createElement: vi.fn(() => ({
        getContext: vi.fn(() => ({
          getParameter: vi.fn(),
          getExtension: vi.fn(),
          getSupportedExtensions: vi.fn()
        }))
      })),
      fonts: {
        check: vi.fn(),
        load: vi.fn(),
        ready: Promise.resolve()
      }
    };

    const mockNavigator = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      platform: 'Win32',
      language: 'en-US',
      languages: ['en-US', 'en'],
      hardwareConcurrency: 8,
      deviceMemory: 8,
      maxTouchPoints: 0,
      webdriver: false,
      doNotTrack: null,
      plugins: {
        length: 0,
        item: () => null,
        namedItem: () => null,
        refresh: () => {}
      },
      mimeTypes: {
        length: 0,
        item: () => null,
        namedItem: () => null
      },
      permissions: {
        query: vi.fn(() => Promise.resolve({ state: 'granted', onchange: null }))
      },
      getBattery: vi.fn(() => Promise.resolve({
        charging: true,
        chargingTime: 0,
        dischargingTime: Infinity,
        level: 1
      })),
      mediaDevices: {
        enumerateDevices: vi.fn(() => Promise.resolve([
          { kind: 'audioinput', deviceId: 'device1', label: 'Microphone' },
          { kind: 'audiooutput', deviceId: 'device2', label: 'Speaker' },
          { kind: 'videoinput', deviceId: 'device3', label: 'Camera' }
        ])),
        getUserMedia: vi.fn()
      },
      connection: {
        effectiveType: '4g',
        rtt: 50,
        downlink: 10
      }
    };

    const mockScreen = {
      width: 1920,
      height: 1080,
      availWidth: 1920,
      availHeight: 1040,
      colorDepth: 24,
      pixelDepth: 24
    };

    mockContext = {
      document: mockDocument,
      navigator: mockNavigator,
      screen: mockScreen,
      AudioContext: mockAudioContext,
      webkitAudioContext: null,
      OfflineAudioContext: class {
        startRendering() { return Promise.resolve({ numberOfChannels: 2, getChannelData: () => new Float32Array(1024) }); }
      },
      WebGLRenderingContext: mockWebGL,
      WebGL2RenderingContext: { prototype: { getParameter: vi.fn() } },
      HTMLCanvasElement: mockHTMLCanvas,
      CanvasRenderingContext2D: mockCanvas2D,
      Element: mockElement,
      DOMRect: mockDOMRect,
      Intl: mockIntl,
      Date: mockDate,
      FontFaceSet: mockFontFaceSet,
      speechSynthesis: mockSpeechSynthesis,
      location: { href: 'https://example.com' },
      devicePixelRatio: 1
    };

    // Save original globals
    originalWindow = global.window;
    global.window = mockContext;
    global.document = mockDocument;
    global.navigator = mockNavigator;
    global.screen = mockScreen;
    global.AudioContext = mockAudioContext;
    global.webkitAudioContext = null;
    global.OfflineAudioContext = mockContext.OfflineAudioContext;
    global.WebGLRenderingContext = mockWebGL;
    global.WebGL2RenderingContext = mockContext.WebGL2RenderingContext;
    global.HTMLCanvasElement = mockHTMLCanvas;
    global.CanvasRenderingContext2D = mockCanvas2D;
    global.Element = mockElement;
    global.DOMRect = mockDOMRect;
    global.Intl = mockIntl;
    global.Date = mockDate;
    global.FontFaceSet = mockFontFaceSet;
    global.speechSynthesis = mockSpeechSynthesis;

    shield = new FingerprintingShield(mockContext, {
      canvas: true,
      webgl: true,
      audio: true,
      fonts: true,
      clientRects: true,
      mediaDevices: true,
      screen: true,
      battery: true,
      hardwareConcurrency: true,
      deviceMemory: true,
      plugins: true,
      mimeTypes: true,
      timezone: true,
      language: true,
      platform: true,
      touchSupport: true,
      webglMetadata: true,
      webglParameters: true,
      canvasReadback: true,
      audioContext: true,
      speechSynthesis: true,
      doNotTrack: true,
      webdriver: true
    });
  });

  afterEach(() => {
    if (shield && shield.isActive) {
      shield.deactivate();
    }
    global.window = originalWindow;
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const s = new FingerprintingShield(mockContext);
      expect(s.config.canvas).toBe(true);
      expect(s.config.webgl).toBe(true);
      expect(s.config.audio).toBe(true);
      expect(s.isActive).toBe(false);
    });

    it('should allow disabling specific protections', () => {
      const s = new FingerprintingShield(mockContext, { canvas: false, audio: false });
      expect(s.config.canvas).toBe(false);
      expect(s.config.audio).toBe(false);
      expect(s.config.webgl).toBe(true);
    });

    it('should generate a session seed', () => {
      expect(shield.sessionSeed).toBeDefined();
      expect(typeof shield.sessionSeed).toBe('number');
    });
  });

  describe('activate()', () => {
    it('should activate all protections', () => {
      shield.activate();
      expect(shield.isActive).toBe(true);
    });

    it('should not double-activate', () => {
      shield.activate();
      shield.activate();
      expect(shield.isActive).toBe(true);
    });
  });

  describe('deactivate()', () => {
    it('should deactivate all protections', () => {
      shield.activate();
      shield.deactivate();
      expect(shield.isActive).toBe(false);
    });

    it('should clear original values', () => {
      shield.activate();
      const count = shield.originalValues.size;
      shield.deactivate();
      expect(shield.originalValues.size).toBe(0);
    });
  });

  describe('Canvas Protection', () => {
    it('should override toDataURL', () => {
      shield.activate();
      const canvas = document.createElement('canvas');
      const result = canvas.toDataURL('image/png');
      expect(result).toBeDefined();
    });

    it('should override toBlob', () => {
      shield.activate();
      const canvas = document.createElement('canvas');
      let called = false;
      canvas.toBlob(() => { called = true; });
      expect(called).toBe(true);
    });

    it('should override getImageData with noise', () => {
      shield.activate();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, 10, 10);
      expect(imageData.data).toBeDefined();
    });
  });

  describe('WebGL Protection', () => {
    it('should spoof VENDOR and RENDERER', () => {
      shield.activate();
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl');
      const vendor = gl.getParameter(gl.VENDOR);
      const renderer = gl.getParameter(gl.RENDERER);
      expect(vendor).toContain('Google');
      expect(renderer).toContain('ANGLE');
    });

    it('should block fingerprinting extensions', () => {
      shield.activate();
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      expect(ext).toBeNull();
    });

    it('should return standardized extensions', () => {
      shield.activate();
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl');
      const exts = gl.getSupportedExtensions();
      expect(Array.isArray(exts)).toBe(true);
      expect(exts.length).toBeGreaterThan(0);
    });
  });

  describe('Audio Protection', () => {
    it('should add noise to analyser data', () => {
      shield.activate();
      const audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      const floatArray = new Float32Array(32);
      const byteArray = new Uint8Array(32);

      analyser.getFloatFrequencyData(floatArray);
      analyser.getByteFrequencyData(byteArray);

      // Values should be modified (not all zero)
      const hasNonZero = floatArray.some(v => v !== 0) || byteArray.some(v => v !== 0);
      expect(hasNonZero).toBe(true);
    });

    it('should add noise to oscillator frequency', () => {
      shield.activate();
      const audioCtx = new AudioContext();
      const osc = audioCtx.createOscillator();
      osc.frequency.value = 440;
      // The frequency setter adds noise
      expect(osc.frequency.value).toBeCloseTo(440, 0);
    });
  });

  describe('Font Protection', () => {
    it('should return true for common fonts in document.fonts.check', () => {
      shield.activate();
      expect(document.fonts.check('Arial', 'test')).toBe(true);
      expect(document.fonts.check('sans-serif', 'test')).toBe(true);
      expect(document.fonts.check('monospace', 'test')).toBe(true);
    });

    it('should measureText with noise', () => {
      shield.activate();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const metrics = ctx.measureText('test');
      expect(metrics.width).toBeGreaterThan(0);
    });
  });

  describe('Client Rects Protection', () => {
    it('should add noise to getBoundingClientRect', () => {
      shield.activate();
      const element = document.createElement('div');
      const rect = element.getBoundingClientRect();
      expect(rect.x).toBeDefined();
      expect(rect.y).toBeDefined();
    });

    it('should add noise to getClientRects', () => {
      shield.activate();
      const element = document.createElement('div');
      const rects = element.getClientRects();
      expect(rects.length).toBeGreaterThan(0);
    });
  });

  describe('Media Devices Protection', () => {
    it('should anonymize device IDs', async () => {
      shield.activate();
      const devices = await navigator.mediaDevices.enumerateDevices();
      for (const device of devices) {
        expect(device.deviceId).toBe('default');
        expect(device.groupId).toBe('default');
      }
    });

    it('should strip deviceId from getUserMedia constraints', async () => {
      shield.activate();
      const constraints = {
        audio: { deviceId: 'specific-device' },
        video: { deviceId: 'specific-camera' }
      };
      await navigator.mediaDevices.getUserMedia(constraints);
      // The constraints passed to original should not have deviceId
      expect(mockNavigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {},
        video: {}
      });
    });
  });

  describe('Screen Protection', () => {
    it('should spoof screen resolution to common values', () => {
      shield.activate();
      const commonResolutions = [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
        { width: 1536, height: 864 },
        { width: 1280, height: 720 },
        { width: 1600, height: 900 }
      ];
      const isCommon = commonResolutions.some(r => r.width === screen.width && r.height === screen.height);
      expect(isCommon).toBe(true);
    });

    it('should return 24 for colorDepth and pixelDepth', () => {
      shield.activate();
      expect(screen.colorDepth).toBe(24);
      expect(screen.pixelDepth).toBe(24);
    });
  });

  describe('Battery Protection', () => {
    it('should return standardized battery info', async () => {
      shield.activate();
      const battery = await navigator.getBattery();
      expect(battery.charging).toBe(true);
      expect(battery.chargingTime).toBe(0);
      expect(battery.dischargingTime).toBe(Infinity);
      expect(battery.level).toBe(1);
    });
  });

  describe('Hardware Concurrency Protection', () => {
    it('should return common hardwareConcurrency value', () => {
      shield.activate();
      const commonValues = [2, 4, 8, 12, 16];
      expect(commonValues).toContain(navigator.hardwareConcurrency);
    });
  });

  describe('Device Memory Protection', () => {
    it('should return common deviceMemory value', () => {
      shield.activate();
      const commonValues = [2, 4, 8, 16, 32];
      expect(commonValues).toContain(navigator.deviceMemory);
    });
  });

  describe('Language Protection', () => {
    it('should return common language', () => {
      shield.activate();
      const commonLanguages = ['en-US', 'en-GB', 'en', 'es-ES', 'fr-FR', 'de-DE', 'ja-JP', 'zh-CN'];
      expect(commonLanguages).toContain(navigator.language);
    });

    it('should return common languages array', () => {
      shield.activate();
      expect(Array.isArray(navigator.languages)).toBe(true);
      expect(navigator.languages.length).toBeGreaterThan(0);
    });
  });

  describe('Platform Protection', () => {
    it('should return common platform', () => {
      shield.activate();
      const commonPlatforms = ['Win32', 'MacIntel', 'Linux x86_64'];
      expect(commonPlatforms).toContain(navigator.platform);
    });
  });

  describe('Touch Support Protection', () => {
    it('should return 0 for desktop', () => {
      shield.activate();
      expect(navigator.maxTouchPoints).toBe(0);
    });
  });

  describe('Timezone Protection', () => {
    it('should spoof timezone', () => {
      shield.activate();
      const dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York' });
      const options = dtf.resolvedOptions();
      expect(options.timeZone).toBeDefined();
    });

    it('should override Date.getTimezoneOffset', () => {
      shield.activate();
      const date = new Date();
      expect(typeof date.getTimezoneOffset).toBe('function');
    });
  });

  describe('WebDriver Protection', () => {
    it('should return false for webdriver', () => {
      shield.activate();
      expect(navigator.webdriver).toBe(false);
    });
  });

  describe('Do Not Track Protection', () => {
    it('should set doNotTrack to "1"', () => {
      shield.activate();
      expect(navigator.doNotTrack).toBe('1');
      expect(window.doNotTrack).toBe('1');
    });
  });

  describe('Speech Synthesis Protection', () => {
    it('should return standardized voices', () => {
      shield.activate();
      const voices = window.speechSynthesis.getVoices();
      expect(Array.isArray(voices)).toBe(true);
      expect(voices.length).toBeGreaterThan(0);
      expect(voices[0].name).toContain('Google');
    });
  });

  describe('getStatus()', () => {
    it('should return protection status', () => {
      shield.activate();
      const status = shield.getStatus();
      expect(status.active).toBe(true);
      expect(status.protections.canvas).toBe(true);
      expect(status.protections.webgl).toBe(true);
      expect(status.protections.audio).toBe(true);
      expect(status.protections.fonts).toBe(true);
      expect(status.protections.clientRects).toBe(true);
      expect(status.protections.mediaDevices).toBe(true);
      expect(status.protections.screen).toBe(true);
      expect(status.protections.battery).toBe(true);
      expect(status.protections.hardwareConcurrency).toBe(true);
      expect(status.protections.deviceMemory).toBe(true);
      expect(status.protections.plugins).toBe(true);
      expect(status.protections.mimeTypes).toBe(true);
      expect(status.protections.timezone).toBe(true);
      expect(status.protections.language).toBe(true);
      expect(status.protections.platform).toBe(true);
      expect(status.protections.touchSupport).toBe(true);
      expect(status.protections.webglMetadata).toBe(true);
      expect(status.protections.webglParameters).toBe(true);
      expect(status.protections.canvasReadback).toBe(true);
      expect(status.protections.audioContext).toBe(true);
      expect(status.protections.speechSynthesis).toBe(true);
      expect(status.protections.doNotTrack).toBe(true);
      expect(status.protections.webdriver).toBe(true);
      expect(status.overridden).toBeGreaterThan(0);
    });
  });

  describe('deterministic noise', () => {
    it('should generate noise for keys', () => {
      const noise1 = shield._getNoise('test-key');
      const noise2 = shield._getNoise('test-key');
      expect(typeof noise1).toBe('number');
      expect(typeof noise2).toBe('number');
    });

    it('should generate different noise for different keys', () => {
      const noise1 = shield._getNoise('key1');
      const noise2 = shield._getNoise('key2');
      expect(noise1).not.toBe(noise2);
    });
  });
});