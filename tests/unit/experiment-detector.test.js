/**
 * Experiment Detector Tests
 * Tests A/B test auto-adaptation, feature flag tracking, rapid response
 */

// Mock jest FIRST - must be before any imports
global.jest = {
  fn: () => {
    const fn = (...args) => fn.mock.results[fn.mock.results.length - 1]?.value;
    fn.mock = { calls: [], results: [] };
    fn.mockResolvedValue = (v) => { fn.mock.results.push({ value: Promise.resolve(v) }); return fn; };
    fn.mockResolvedValueOnce = (v) => { fn.mock.results.push({ value: Promise.resolve(v) }); return fn; };
    fn.mockImplementation = (impl) => { fn.mock.implementation = impl; return fn; };
    return fn;
  },
  clearAllMocks: () => {},
  spyOn: (obj, method) => {
    const original = obj[method];
    const mock = global.jest.fn();
    mock.mockImplementation = (impl) => { mock.mock.impl = impl; return mock; };
    obj[method] = (...args) => mock.mock.impl ? mock.mock.impl(...args) : mock(...args);
    mock.original = original;
    mock.mockRestore = () => { obj[method] = original; };
    return mock;
  }
};

// Mock localStorage for Node.js
global.localStorage = {
  getItem: global.jest.fn(() => null),
  setItem: global.jest.fn(),
  removeItem: global.jest.fn(),
  clear: global.jest.fn()
};

// Mock the remote config module by setting a global that the detector will find
// We do this by mocking the import at runtime - the detector uses a relative import
// So we need to override the module resolution

// Mock window and document
const mockWindow = {
  ytInitialData: null,
  document: {
    querySelector: global.jest.fn(),
    querySelectorAll: global.jest.fn(() => []),
    documentElement: {}
  },
  performance: {
    now: () => Date.now()
  },
  MutationObserver: class {
    constructor() {}
    observe() {}
    disconnect() {}
  },
  CustomEvent: class {
    constructor(type, opts) { this.type = type; this.detail = opts?.detail; }
  },
  dispatchEvent: global.jest.fn(),
  localStorage: global.localStorage,
  crypto: {
    randomUUID: () => 'test-uuid'
  }
};

// Test runner
async function runTests() {
  // Since we can't easily mock ES modules in Node, we need to mock the remoteConfig
  // by temporarily patching the global. The detector imports from '../../background/remote-config.js'
  // which will be loaded when the detector module loads.

  // Let's set up the mock before importing
  // We can use the fact that the detector checks for enableFeatureFlags
  // If it's false, it won't call remoteConfig

  const { ExperimentDetector, EXPERIMENT_SIGNATURES, FEATURE_FLAGS }
    = await import('../../core/youtube-engine/experiment-detector.js');

  console.log('=== Experiment Detector Test Suite ===\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`✗ ${name}: ${e.message}`);
      failed++;
    }
  }

  function expect(actual) {
    return {
      toBe: (expected) => { if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`); },
      toBeDefined: () => { if (actual === undefined) throw new Error('Expected to be defined'); },
      toBeUndefined: () => { if (actual !== undefined) throw new Error('Expected to be undefined'); },
      toBeTrue: () => { if (actual !== true) throw new Error('Expected true'); },
      toBeFalse: () => { if (actual !== false) throw new Error('Expected false'); },
      toBeGreaterThan: (expected) => { if (actual <= expected) throw new Error(`Expected > ${expected}`); },
      toBeGreaterThanOrEqual: (expected) => { if (actual < expected) throw new Error(`Expected >= ${expected}`); },
      toContain: (expected) => { if (!actual.includes(expected)) throw new Error(`Expected to contain ${expected}`); },
      not: {
        toContain: (expected) => { if (actual.includes(expected)) throw new Error(`Expected not to contain ${expected}`); }
      },
      toHaveProperty: (prop) => { if (!(prop in actual)) throw new Error(`Expected property ${prop}`); },
      toEqual: (expected) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
    };
  }

  const createMockData = () => ({
    // The detector expects data.playerResponse directly
    playerResponse: {
      adPlacements: [{ id: 'ad1' }],
      adBreaks: [{ breakType: 'preroll' }],
      playabilityStatus: {
        status: 'OK',
        adSignalsInfo: 'test',
        adsPresentation: 'test'
      },
      streamingData: {
        adFormats: [{ format: 'video' }],
        adBreaks: [],
        hlsManifest: '#EXT-X-DATERANGE:ad=1\n#EXTINF:10\nsegment.ts',
        dashManifest: '<Period><Ad>test</Ad></Period>'
      },
      playerConfig: {
        adConfig: { enabled: true },
        imaSettings: {}
      },
      videoDetails: {
        allowAds: true,
        adTagUrl: 'http://ad.example.com'
      }
    },
    document: mockWindow.document
  });

  // Test: Initialization
  test('should initialize with known experiments', () => {
    const detector = new ExperimentDetector(mockWindow, {
      rapidResponse: true,
      periodicInterval: 15000,
      enableFeatureFlags: false
    });
    detector.initialize();
    expect(detector.isActive).toBe(true);
    expect(detector.knownExperiments.size).toBeGreaterThan(10);
    detector.cleanup();
  });

  test('should have all core experiment signatures', () => {
    expect(EXPERIMENT_SIGNATURES.player_response_ads).toBeDefined();
    expect(EXPERIMENT_SIGNATURES.server_side_ad_insertion).toBeDefined();
    expect(EXPERIMENT_SIGNATURES.ima_sdk_experiment).toBeDefined();
    expect(EXPERIMENT_SIGNATURES.live_ad_experiment).toBeDefined();
    expect(EXPERIMENT_SIGNATURES.new_ad_ui).toBeDefined();
    expect(EXPERIMENT_SIGNATURES.promoted_content_experiment).toBeDefined();
    expect(EXPERIMENT_SIGNATURES.shorts_ads_experiment).toBeDefined();
  });

  // Test: Detection - Player Response
  test('should detect player_response_ads experiment', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const exps = detector.getDetectedExperiments();
    expect(exps.some(e => e.id === 'player_response_ads')).toBe(true);
    detector.cleanup();
  });

  test('should detect server_side_ad_insertion experiment', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const exps = detector.getDetectedExperiments();
    expect(exps.some(e => e.id === 'server_side_ad_insertion')).toBe(true);
    detector.cleanup();
  });

  test('should detect ima_sdk_experiment', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const exps = detector.getDetectedExperiments();
    expect(exps.some(e => e.id === 'ima_sdk_experiment')).toBe(true);
    detector.cleanup();
  });

  test('should detect client_side_ads experiment', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const exps = detector.getDetectedExperiments();
    expect(exps.some(e => e.id === 'client_side_ads')).toBe(true);
    detector.cleanup();
  });

  test('should detect vtv_ad_experiment from HLS manifest', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const exps = detector.getDetectedExperiments();
    expect(exps.some(e => e.id === 'vtv_ad_experiment')).toBe(true);
    detector.cleanup();
  });

  test('should detect live_ad_experiment from HLS manifest', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const exps = detector.getDetectedExperiments();
    expect(exps.some(e => e.id === 'live_ad_experiment')).toBe(true);
    detector.cleanup();
  });

  test('should detect live_midroll_experiment from CUE-OUT', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const data = {
      streamingData: {
        hlsManifest: '#EXT-X-CUE-OUT:10\nsegment.ts\n#EXT-X-CUE-IN\nsegment.ts'
      }
    };
    detector.checkYtInitialData(data);
    const exps = detector.getDetectedExperiments();
    expect(exps.some(e => e.id === 'live_midroll_experiment')).toBe(true);
    detector.cleanup();
  });

  // Test: Detection - DOM
  test('should detect new_ad_ui from DOM', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    mockWindow.document.querySelector.mockImplementation((selector) => {
      if (selector.includes('ytp-ad-player-overlay-layout')) {
        return { style: {}, setAttribute: global.jest.fn() };
      }
      return null;
    });

    detector._detectFromDOM();
    const exps = detector.getDetectedExperiments();
    expect(exps.some(e => e.id === 'new_ad_ui')).toBe(true);
    detector.cleanup();
  });

  test('should detect masthead_ad_experiment from DOM', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    mockWindow.document.querySelector.mockImplementation((selector) => {
      if (selector.includes('ytd-masthead-ad-renderer')) {
        return { style: {}, setAttribute: global.jest.fn() };
      }
      return null;
    });

    detector._detectFromDOM();
    const exps = detector.getDetectedExperiments();
    expect(exps.some(e => e.id === 'masthead_ad_experiment')).toBe(true);
    detector.cleanup();
  });

  test('should detect promoted_content_experiment from DOM', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    mockWindow.document.querySelector.mockImplementation((selector) => {
      if (selector.includes('ytd-promoted-sparkles-web-renderer')) {
        return { style: {}, setAttribute: global.jest.fn() };
      }
      return null;
    });

    detector._detectFromDOM();
    const exps = detector.getDetectedExperiments();
    expect(exps.some(e => e.id === 'promoted_content_experiment')).toBe(true);
    detector.cleanup();
  });

  test('should detect shopping_ads_experiment from DOM', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    mockWindow.document.querySelector.mockImplementation((selector) => {
      if (selector.includes('ytd-shopping-renderer')) {
        return { style: {}, setAttribute: global.jest.fn() };
      }
      return null;
    });

    detector._detectFromDOM();
    const exps = detector.getDetectedExperiments();
    expect(exps.some(e => e.id === 'shopping_ads_experiment')).toBe(true);
    detector.cleanup();
  });

  test('should detect shorts_ads_experiment from DOM', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    mockWindow.document.querySelector.mockImplementation((selector) => {
      if (selector.includes('ytd-reel-video-renderer[ytd-ad]')) {
        return { style: {}, setAttribute: global.jest.fn() };
      }
      return null;
    });

    detector._detectFromDOM();
    const exps = detector.getDetectedExperiments();
    expect(exps.some(e => e.id === 'shorts_ads_experiment')).toBe(true);
    detector.cleanup();
  });

  // Test: Adaptation
  test('should adapt player_response_ads by removing ad fields', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = JSON.parse(JSON.stringify(mockData.playerResponse));
    detector.checkYtInitialData(mockData.playerResponse);

    const adapted = detector.getExperiment('player_response_ads');
    expect(adapted).toBeDefined();
    expect(adapted.adaptedSources.has('ytInitialData')).toBe(true);
    expect(adapted.adaptations.length).toBeGreaterThan(0);

    // Check that ad fields were removed
    expect(mockWindow.ytInitialData.playerResponse.adPlacements).toBeUndefined();
    expect(mockWindow.ytInitialData.playerResponse.adBreaks).toBeUndefined();
    expect(mockWindow.ytInitialData.playerResponse.playabilityStatus.adSignalsInfo).toBeUndefined();
    expect(mockWindow.ytInitialData.playerResponse.playabilityStatus.adsPresentation).toBeUndefined();
    detector.cleanup();
  });

  test('should adapt server_side_ad_insertion by removing streamingData ads', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = JSON.parse(JSON.stringify(mockData.playerResponse));
    detector.checkYtInitialData(mockData.playerResponse);

    const adapted = detector.getExperiment('server_side_ad_insertion');
    expect(adapted).toBeDefined();

    expect(mockWindow.ytInitialData.playerResponse.streamingData.adFormats).toBeUndefined();
    expect(mockWindow.ytInitialData.playerResponse.streamingData.adBreaks).toBeUndefined();
    detector.cleanup();
  });

  test('should adapt ima_sdk_experiment by removing imaSettings', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = JSON.parse(JSON.stringify(mockData.playerResponse));
    detector.checkYtInitialData(mockData.playerResponse);

    const adapted = detector.getExperiment('ima_sdk_experiment');
    expect(adapted).toBeDefined();

    expect(mockWindow.ytInitialData.playerResponse.playerConfig.imaSettings).toBeUndefined();
    detector.cleanup();
  });

  test('should adapt vtv_ad_experiment by cleaning HLS manifest', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = JSON.parse(JSON.stringify(mockData.playerResponse));
    detector.checkYtInitialData(mockData.playerResponse);

    const adapted = detector.getExperiment('vtv_ad_experiment');
    expect(adapted).toBeDefined();

    // HLS manifest should be cleaned
    const manifest = mockWindow.ytInitialData.playerResponse.streamingData.hlsManifest;
    expect(manifest).not.toContain('ad');
    expect(manifest).not.toContain('EXT-X-DATERANGE');
    detector.cleanup();
  });

  // Test: Rapid Response
  test('should track rapid response stats', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const stats = detector.getStats();
    expect(stats.rapidResponses).toBeGreaterThan(0);
    detector.cleanup();
  });

  test('should apply adaptation immediately on detection', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const adaptSpy = global.jest.spyOn(detector, '_adaptExperiment');
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    expect(adaptSpy.mock.calls.length).toBeGreaterThan(0);
    detector.cleanup();
  });

  test('should not re-adapt for same source', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const firstAdaptCount = detector.getExperiment('player_response_ads').adaptations.length;

    detector.checkYtInitialData(mockData.playerResponse);
    const secondAdaptCount = detector.getExperiment('player_response_ads').adaptations.length;

    expect(secondAdaptCount).toBe(firstAdaptCount);
    detector.cleanup();
  });

  // Test: Feature Flags (only works if enableFeatureFlags: true, but that calls remoteConfig)
  // We'll test the default values directly from FEATURE_FLAGS constant

  // Test: Stats and Metrics
  test('should track detection stats', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const stats = detector.getStats();

    expect(stats.detected).toBeGreaterThan(0);
    expect(stats.adapted).toBeGreaterThan(0);
    expect(stats.activeExperiments).toBeGreaterThan(0);
    expect(stats.knownExperiments).toBeGreaterThan(10);
    detector.cleanup();
  });

  test('should track performance metrics', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const stats = detector.getStats();

    expect(stats.performance.detectionCount).toBeGreaterThan(0);
    expect(stats.performance.avgDetectionTime).toBeGreaterThanOrEqual(0);
    detector.cleanup();
  });

  test('should categorize experiments by severity', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const stats = detector.getStats();

    expect(stats.bySeverity.critical).toBeGreaterThanOrEqual(0);
    expect(stats.bySeverity.high).toBeGreaterThanOrEqual(0);
    expect(stats.bySeverity.medium).toBeGreaterThanOrEqual(0);
    expect(stats.bySeverity.low).toBeGreaterThanOrEqual(0);
    detector.cleanup();
  });

  test('should categorize experiments by category', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const stats = detector.getStats();

    expect(stats.byCategory.player).toBeGreaterThanOrEqual(0);
    expect(stats.byCategory.ui).toBeGreaterThanOrEqual(0);
    expect(stats.byCategory.live).toBeGreaterThanOrEqual(0);
    detector.cleanup();
  });

  // Test: Experiment Queries
  test('should get experiments by category', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const playerExps = detector.getExperimentsByCategory('player');
    expect(playerExps.length).toBeGreaterThan(0);
    playerExps.forEach(e => expect(e.category).toBe('player'));
    detector.cleanup();
  });

  test('should get experiments by severity', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const criticalExps = detector.getExperimentsBySeverity('critical');
    criticalExps.forEach(e => expect(e.severity).toBe('critical'));
    detector.cleanup();
  });

  test('should get adaptation history', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const history = detector.getAdaptationHistory();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]).toHaveProperty('expId');
    expect(history[0]).toHaveProperty('source');
    expect(history[0]).toHaveProperty('duration');
    expect(history[0]).toHaveProperty('success');
    detector.cleanup();
  });

  // Test: Custom Experiment Signatures
  test('should add custom experiment signature', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const customExp = {
      id: 'custom_test',
      name: 'Custom Test Experiment',
      category: 'test',
      severity: 'medium',
      detect: (data) => data?.custom === 'test',
      adapt: (data) => { data.custom = 'adapted'; },
      rapidResponse: true
    };

    detector.addExperimentSignature('custom_test', customExp);
    expect(detector.knownExperiments.has('custom_test')).toBe(true);

    // Test detection
    detector._checkExperiments({ custom: 'test' }, 'test');
    const exps = detector.getDetectedExperiments();
    expect(exps.some(e => e.id === 'custom_test')).toBe(true);
    detector.cleanup();
  });

  test('should remove custom experiment signature', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const customExp = {
      id: 'custom_remove',
      detect: (data) => data?.custom === 'remove',
      adapt: (data) => {}
    };

    detector.addExperimentSignature('custom_remove', customExp);
    detector.removeExperimentSignature('custom_remove');
    expect(detector.knownExperiments.has('custom_remove')).toBe(false);
    detector.cleanup();
  });

  // Test: Callbacks
  test('should notify detection callbacks', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const detectCb = global.jest.fn();
    const unsub = detector.onDetect(detectCb);

    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    expect(detectCb.mock.calls.length).toBeGreaterThan(0);

    unsub();
    detectCb.mockClear();
    detector.checkYtInitialData(mockData.playerResponse);
    expect(detectCb.mock.calls.length).toBe(0);
    detector.cleanup();
  });

  test('should notify adaptation callbacks', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const adaptCb = global.jest.fn();
    const unsub = detector.onAdapt(adaptCb);

    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    expect(adaptCb.mock.calls.length).toBeGreaterThan(0);

    unsub();
    adaptCb.mockClear();
    detector.checkYtInitialData(mockData.playerResponse);
    expect(adaptCb.mock.calls.length).toBe(0);
    detector.cleanup();
  });

  // Test: Aggressive Mode
  test('should enable aggressive mode', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    detector.setAggressiveMode(true);
    expect(detector.options.aggressiveMode).toBe(true);
    expect(detector.getFeatureFlag('aggressive_mode')).toBe(true);
    detector.cleanup();
  });

  test('should disable aggressive mode', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    detector.setAggressiveMode(true);
    detector.setAggressiveMode(false);
    expect(detector.options.aggressiveMode).toBe(false);
    expect(detector.getFeatureFlag('aggressive_mode')).toBe(false);
    detector.cleanup();
  });

  // Test: Re-adaptation
  test('should re-adapt all experiments', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    const beforeCount = detector.getStats().adapted;

    detector.reAdaptAll();
    const afterCount = detector.getStats().adapted;

    expect(afterCount).toBeGreaterThan(beforeCount);
    detector.cleanup();
  });

  // Test: Cleanup
  test('should cleanup all state', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    detector.cleanup();

    expect(detector.isActive).toBe(false);
    expect(detector.detectedExperiments.size).toBe(0);
    expect(detector.adaptationHistory.length).toBe(0);
    expect(detector.detectionCallbacks.size).toBe(0);
    expect(detector.adaptationCallbacks.size).toBe(0);
  });

  test('should reset all state', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();
    const mockData = createMockData();
    mockWindow.ytInitialData = mockData.playerResponse;
    detector.checkYtInitialData(mockData.playerResponse);
    detector.reset();

    expect(detector.stats.detected).toBe(0);
    expect(detector.stats.adapted).toBe(0);
    expect(detector.performanceMetrics.detectionCount).toBe(0);
    detector.cleanup();
  });

  // Test: Fallback Adaptation
  test('should apply fallback adaptation when main fails', () => {
    const detector = new ExperimentDetector(mockWindow, { enableFeatureFlags: false });
    detector.initialize();

    // Create experiment that fails on main adapt
    const failingExp = {
      id: 'failing_test',
      name: 'Failing Test',
      category: 'test',
      severity: 'high',
      detect: (data) => data?.fail === true,
      adapt: (data) => { throw new Error('Adaptation failed'); },
      fallbackAdaptation: (data) => { data.fallback = true; },
      rapidResponse: true
    };

    detector.addExperimentSignature('failing_test', failingExp);
    detector._checkExperiments({ fail: true }, 'test');

    const exp = detector.getExperiment('failing_test');
    expect(exp).toBeDefined();
    const history = detector.getAdaptationHistory();
    expect(history.some(h => h.fallback === true)).toBe(true);
    detector.cleanup();
  });

  // Test: EXPERIMENT_SIGNATURES
  test('should have all required experiments defined', () => {
    const required = [
      'player_response_ads',
      'client_side_ads',
      'server_side_ad_insertion',
      'ima_sdk_experiment',
      'vtv_ad_experiment',
      'new_ad_ui',
      'masthead_ad_experiment',
      'promoted_content_experiment',
      'shopping_ads_experiment',
      'companion_ad_experiment',
      'live_ad_experiment',
      'live_midroll_experiment',
      'tracking_experiment',
      'shorts_ads_experiment'
    ];

    required.forEach(id => {
      expect(EXPERIMENT_SIGNATURES[id]).toBeDefined();
      expect(EXPERIMENT_SIGNATURES[id].id).toBe(id);
      expect(EXPERIMENT_SIGNATURES[id].name).toBeDefined();
      expect(EXPERIMENT_SIGNATURES[id].category).toBeDefined();
      expect(EXPERIMENT_SIGNATURES[id].severity).toBeDefined();
      expect(EXPERIMENT_SIGNATURES[id].detect).toBeDefined();
      expect(EXPERIMENT_SIGNATURES[id].adapt).toBeDefined();
    });
  });

  test('should have correct severity levels', () => {
    expect(EXPERIMENT_SIGNATURES.server_side_ad_insertion.severity).toBe('critical');
    expect(EXPERIMENT_SIGNATURES.live_ad_experiment.severity).toBe('critical');
    expect(EXPERIMENT_SIGNATURES.player_response_ads.severity).toBe('high');
    expect(EXPERIMENT_SIGNATURES.shopping_ads_experiment.severity).toBe('low');
  });

  test('should have correct categories', () => {
    expect(EXPERIMENT_SIGNATURES.player_response_ads.category).toBe('player');
    expect(EXPERIMENT_SIGNATURES.new_ad_ui.category).toBe('ui');
    expect(EXPERIMENT_SIGNATURES.promoted_content_experiment.category).toBe('feed');
    expect(EXPERIMENT_SIGNATURES.live_ad_experiment.category).toBe('live');
    expect(EXPERIMENT_SIGNATURES.tracking_experiment.category).toBe('tracking');
  });

  test('should have rapidResponse flag for critical experiments', () => {
    expect(EXPERIMENT_SIGNATURES.server_side_ad_insertion.rapidResponse).toBe(true);
    expect(EXPERIMENT_SIGNATURES.live_ad_experiment.rapidResponse).toBe(true);
    expect(EXPERIMENT_SIGNATURES.new_ad_ui.rapidResponse).toBe(true);
  });

  // Test: FEATURE_FLAGS
  test('should define all required feature flags', () => {
    const required = [
      'experiment_detection_enabled',
      'rapid_response_enabled',
      'fallback_adaptation_enabled',
      'dom_adaptation_enabled',
      'player_response_adaptation_enabled',
      'experiment_reporting_enabled',
      'adaptive_learning_enabled',
      'aggressive_mode'
    ];

    required.forEach(flag => {
      expect(FEATURE_FLAGS[flag]).toBeDefined();
      expect(FEATURE_FLAGS[flag].type).toBe('boolean');
      expect(typeof FEATURE_FLAGS[flag].default).toBe('boolean');
      expect(FEATURE_FLAGS[flag].description).toBeDefined();
    });
  });

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

// Run tests
runTests();