/**
 * YouTube Experiment Detector — A/B test auto-adaptation, feature flag tracking, rapid response
 * Detects and adapts to YouTube's server-side experiments in real-time
 */

import { remoteConfig } from '../../background/remote-config.js';

// ============================================================================
// Experiment Signatures Database
// ============================================================================

const EXPERIMENT_SIGNATURES = {
  // ---- Player Response Experiments ----
  'player_response_ads': {
    id: 'player_response_ads',
    name: 'Player Response Ad Injection',
    category: 'player',
    severity: 'high',
    version: '1.0.0',
    detect: (data) => {
      const pr = data?.playerResponse;
      return !!(pr?.adPlacements?.length || pr?.adBreaks?.length ||
        pr?.playabilityStatus?.adSignalsInfo || pr?.playabilityStatus?.adsPresentation);
    },
    adapt: (data) => {
      const pr = data?.playerResponse;
      if (!pr) return;
      delete pr.adPlacements;
      delete pr.adBreaks;
      if (pr.playabilityStatus) {
        delete pr.playabilityStatus.adSignalsInfo;
        delete pr.playabilityStatus.adsPresentation;
        pr.playabilityStatus.status = pr.playabilityStatus.status || 'OK';
      }
    },
    rapidResponse: true,
    fallbackAdaptation: (data) => {
      // If main adaptation fails, use aggressive cleanup
      const pr = data?.playerResponse;
      if (pr) {
        const keysToDelete = Object.keys(pr).filter(k =>
          /ad|Ad|AD/i.test(k) || /commercial|sponsor/i.test(k)
        );
        keysToDelete.forEach(k => delete pr[k]);
      }
    }
  },

  'client_side_ads': {
    id: 'client_side_ads',
    name: 'Client-Side Ad Config',
    category: 'player',
    severity: 'high',
    version: '1.0.0',
    detect: (data) => !!(data?.playerConfig?.adConfig || data?.playerConfig?.adPlacements || data?.playerConfig?.adBreakConfig),
    adapt: (data) => {
      if (data?.playerConfig) {
        delete data.playerConfig.adConfig;
        delete data.playerConfig.adPlacements;
        delete data.playerConfig.adBreakConfig;
        delete data.playerConfig.adTagUrl;
      }
    },
    rapidResponse: true
  },

  'server_side_ad_insertion': {
    id: 'server_side_ad_insertion',
    name: 'Server-Side Ad Insertion (SSAI)',
    category: 'player',
    severity: 'critical',
    version: '1.0.0',
    detect: (data) => !!(data?.streamingData?.adFormats?.length || data?.streamingData?.adBreaks?.length),
    adapt: (data) => {
      if (data?.streamingData) {
        delete data.streamingData.adFormats;
        delete data.streamingData.adBreaks;
        delete data.streamingData.adBreakConfig;
        delete data.streamingData.adSlots;
        delete data.streamingData.adBreakSlots;
      }
    },
    rapidResponse: true,
    fallbackAdaptation: (data) => {
      const sd = data?.streamingData;
      if (sd?.adaptiveFormats) {
        sd.adaptiveFormats = sd.adaptiveFormats.filter(f => !f.url?.includes('/api/manifest/') && !f.url?.includes('adformat='));
      }
    }
  },

  'ima_sdk_experiment': {
    id: 'ima_sdk_experiment',
    name: 'IMA SDK Integration Experiment',
    category: 'player',
    severity: 'high',
    version: '1.0.0',
    detect: (data) => !!(data?.playerConfig?.imaSettings || data?.playerResponse?.imaSettings),
    adapt: (data) => {
      if (data?.playerConfig) delete data.playerConfig.imaSettings;
      if (data?.playerResponse) delete data.playerResponse.imaSettings;
    },
    rapidResponse: true
  },

  'vtv_ad_experiment': {
    id: 'vtv_ad_experiment',
    name: 'VTV (Video Transcoding) Ad Experiment',
    category: 'player',
    severity: 'high',
    version: '1.0.0',
    detect: (data) => !!(data?.streamingData?.hlsManifest?.includes('EXT-X-DATERANGE') &&
      (data.streamingData.hlsManifest.includes('ad') || data.streamingData.hlsManifest.includes('Ad'))),
    adapt: (data) => {
      if (data?.streamingData?.hlsManifest) {
        data.streamingData.hlsManifest = data.streamingData.hlsManifest
          .split('\n')
          .filter(line => !/EXT-X-DATERANGE.*[Aa]d/.test(line))
          .join('\n');
      }
      if (data?.streamingData?.dashManifest) {
        data.streamingData.dashManifest = data.streamingData.dashManifest
          .replace(/<Period[^>]*ad[^>]*>[\s\S]*?<\/Period>/gi, '')
          .replace(/<EventStream[^>]*ad[^>]*>[\s\S]*?<\/EventStream>/gi, '');
      }
    },
    rapidResponse: true
  },

  // ---- UI/Overlay Experiments ----
  'new_ad_ui': {
    id: 'new_ad_ui',
    name: 'New Ad UI Overlay Layout',
    category: 'ui',
    severity: 'medium',
    version: '1.0.0',
    detect: (data) => !!(data?.document?.querySelector('.ytp-ad-player-overlay-layout, .ytp-ad-player-overlay-slot, .ytp-ad-overlay-slot-new')),
    adapt: (data) => {
      const doc = data?.document || document;
      doc.querySelectorAll('.ytp-ad-player-overlay-layout, .ytp-ad-player-overlay-slot, .ytp-ad-overlay-slot-new, .ytp-ad-overlay-container-new').forEach(el => {
        el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-2147483647!important;contain:layout size style paint!important';
        el.setAttribute('data-aeroguard-hidden', 'experiment-new_ad_ui');
        el.setAttribute('aria-hidden', 'true');
      });
    },
    rapidResponse: true,
    domOnly: true
  },

  'masthead_ad_experiment': {
    id: 'masthead_ad_experiment',
    name: 'Masthead Ad Experiment',
    category: 'ui',
    severity: 'medium',
    version: '1.0.0',
    detect: (data) => !!(data?.document?.querySelector('ytd-masthead-ad-renderer, #masthead-ad, .masthead-ad, ytd-promoted-sparkles-text-search-renderer')),
    adapt: (data) => {
      const doc = data?.document || document;
      doc.querySelectorAll('ytd-masthead-ad-renderer, #masthead-ad, .masthead-ad, ytd-promoted-sparkles-text-search-renderer').forEach(el => {
        el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-2147483647!important;contain:layout size style paint!important';
        el.setAttribute('data-aeroguard-hidden', 'experiment-masthead_ad_experiment');
        el.setAttribute('aria-hidden', 'true');
      });
    },
    rapidResponse: true,
    domOnly: true
  },

  'promoted_content_experiment': {
    id: 'promoted_content_experiment',
    name: 'Promoted Content in Feed',
    category: 'feed',
    severity: 'medium',
    version: '1.0.0',
    detect: (data) => !!(data?.document?.querySelector('ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-text-search-renderer, ytd-action-companion-ad-renderer')),
    adapt: (data) => {
      const doc = data?.document || document;
      doc.querySelectorAll('ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-text-search-renderer, ytd-action-companion-ad-renderer, ytd-in-feed-ad-renderer').forEach(el => {
        el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-2147483647!important;contain:layout size style paint!important';
        el.setAttribute('data-aeroguard-hidden', 'experiment-promoted_content_experiment');
        el.setAttribute('aria-hidden', 'true');
      });
    },
    rapidResponse: true,
    domOnly: true
  },

  'shopping_ads_experiment': {
    id: 'shopping_ads_experiment',
    name: 'Shopping/Merch Shelf Ads',
    category: 'feed',
    severity: 'low',
    version: '1.0.0',
    detect: (data) => !!(data?.document?.querySelector('ytd-shopping-renderer, ytd-merch-shelf-renderer, ytd-mealbar-promo-renderer, ytd-product-renderer')),
    adapt: (data) => {
      const doc = data?.document || document;
      doc.querySelectorAll('ytd-shopping-renderer, ytd-merch-shelf-renderer, ytd-mealbar-promo-renderer, ytd-product-renderer').forEach(el => {
        el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-2147483647!important;contain:layout size style paint!important';
        el.setAttribute('data-aeroguard-hidden', 'experiment-shopping_ads_experiment');
        el.setAttribute('aria-hidden', 'true');
      });
    },
    rapidResponse: true,
    domOnly: true
  },

  'companion_ad_experiment': {
    id: 'companion_ad_experiment',
    name: 'Companion Ad Slot Experiment',
    category: 'ui',
    severity: 'medium',
    version: '1.0.0',
    detect: (data) => !!(data?.document?.querySelector('.ytp-ad-companion-slot, .ytp-ad-banner-slot, ytd-companion-slot-renderer')),
    adapt: (data) => {
      const doc = data?.document || document;
      doc.querySelectorAll('.ytp-ad-companion-slot, .ytp-ad-banner-slot, ytd-companion-slot-renderer').forEach(el => {
        el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-2147483647!important;contain:layout size style paint!important';
        el.setAttribute('data-aeroguard-hidden', 'experiment-companion_ad_experiment');
        el.setAttribute('aria-hidden', 'true');
      });
    },
    rapidResponse: true,
    domOnly: true
  },

  // ---- Live Stream Experiments ----
  'live_ad_experiment': {
    id: 'live_ad_experiment',
    name: 'Live Stream Ad Insertion',
    category: 'live',
    severity: 'critical',
    version: '1.0.0',
    detect: (data) => !!(data?.streamingData?.hlsManifest?.includes('EXT-X-DATERANGE') &&
      (data.streamingData.hlsManifest.includes('ad') || data.streamingData.hlsManifest.includes('Ad') ||
        data.streamingData.hlsManifest.includes('scte35') || data.streamingData.hlsManifest.includes('SCTE35'))),
    adapt: (data) => {
      if (data?.streamingData?.hlsManifest) {
        data.streamingData.hlsManifest = data.streamingData.hlsManifest
          .split('\n')
          .filter(line => !/EXT-X-DATERANGE.*(ad|Ad|scte35|SCTE35)/.test(line))
          .join('\n');
      }
    },
    rapidResponse: true,
    fallbackAdaptation: (data) => {
      if (data?.streamingData?.hlsManifest) {
        // Aggressive: remove all EXT-X-DATERANGE tags
        data.streamingData.hlsManifest = data.streamingData.hlsManifest
          .split('\n')
          .filter(line => !line.includes('EXT-X-DATERANGE'))
          .join('\n');
      }
    }
  },

  'live_midroll_experiment': {
    id: 'live_midroll_experiment',
    name: 'Live Midroll Ad Experiment',
    category: 'live',
    severity: 'high',
    version: '1.0.0',
    detect: (data) => !!(data?.playerResponse?.adBreaks?.some(b => b.breakType === 'midroll') ||
      data?.streamingData?.hlsManifest?.includes('#EXT-X-CUE-OUT')),
    adapt: (data) => {
      if (data?.playerResponse?.adBreaks) {
        data.playerResponse.adBreaks = data.playerResponse.adBreaks.filter(b => b.breakType !== 'midroll');
      }
      if (data?.streamingData?.hlsManifest) {
        data.streamingData.hlsManifest = data.streamingData.hlsManifest
          .split('\n')
          .filter(line => !line.includes('EXT-X-CUE-OUT') && !line.includes('EXT-X-CUE-IN'))
          .join('\n');
      }
    },
    rapidResponse: true
  },

  // ---- Tracking/Analytics Experiments ----
  'tracking_experiment': {
    id: 'tracking_experiment',
    name: 'Enhanced Tracking/Telemetry',
    category: 'tracking',
    severity: 'low',
    version: '1.0.0',
    detect: (data) => !!(data?.playerResponse?.playabilityStatus?.attestationChallenge ||
      data?.playerConfig?.attestationChallenge ||
      data?.playerResponse?.trackingParams?.length),
    adapt: (data) => {
      if (data?.playerResponse?.playabilityStatus) {
        delete data.playerResponse.playabilityStatus.attestationChallenge;
      }
      if (data?.playerConfig) {
        delete data.playerConfig.attestationChallenge;
      }
      if (data?.playerResponse?.trackingParams) {
        data.playerResponse.trackingParams = data.playerResponse.trackingParams.filter(p =>
          !/ad|Ad|AD|impression|click|conversion/i.test(p?.key || '')
        );
      }
    },
    rapidResponse: false
  },

  'shorts_ads_experiment': {
    id: 'shorts_ads_experiment',
    name: 'Shorts Feed Ads',
    category: 'feed',
    severity: 'high',
    version: '1.0.0',
    detect: (data) => !!(data?.document?.querySelector('ytd-reel-video-renderer[ytd-ad], ytd-shorts-lockup-view-model[promoted], #shorts-ads-container')),
    adapt: (data) => {
      const doc = data?.document || document;
      doc.querySelectorAll('ytd-reel-video-renderer[ytd-ad], ytd-shorts-lockup-view-model[promoted], #shorts-ads-container, ytd-rich-item-renderer[is-ad]').forEach(el => {
        el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-2147483647!important;contain:layout size style paint!important';
        el.setAttribute('data-aeroguard-hidden', 'experiment-shorts_ads_experiment');
        el.setAttribute('aria-hidden', 'true');
      });
    },
    rapidResponse: true,
    domOnly: true
  }
};

// ============================================================================
// Feature Flag Integration
// ============================================================================

const FEATURE_FLAGS = {
  'experiment_detection_enabled': { type: 'boolean', default: true, description: 'Enable experiment detection' },
  'rapid_response_enabled': { type: 'boolean', default: true, description: 'Enable rapid response adaptations' },
  'fallback_adaptation_enabled': { type: 'boolean', default: true, description: 'Enable fallback adaptations' },
  'dom_adaptation_enabled': { type: 'boolean', default: true, description: 'Enable DOM-based adaptations' },
  'player_response_adaptation_enabled': { type: 'boolean', default: true, description: 'Enable player response adaptations' },
  'experiment_reporting_enabled': { type: 'boolean', default: true, description: 'Report experiment detections' },
  'adaptive_learning_enabled': { type: 'boolean', default: true, description: 'Enable adaptive learning from detections' },
  'aggressive_mode': { type: 'boolean', default: false, description: 'Aggressive experiment blocking' }
};

// ============================================================================
// Experiment Detector Class
// ============================================================================

export class ExperimentDetector {
  constructor(context = window, options = {}) {
    this.context = context;
    this.options = {
      rapidResponse: options.rapidResponse ?? true,
      periodicInterval: options.periodicInterval ?? 15000, // 15 seconds for rapid response
      maxHistorySize: options.maxHistorySize ?? 100,
      enableFeatureFlags: options.enableFeatureFlags ?? true,
      aggressiveMode: options.aggressiveMode ?? false,
      ...options
    };

    // State
    this.isActive = false;
    this.detectedExperiments = new Map(); // experimentId -> ExperimentRecord
    this.experimentSignatures = new Map(); // Custom signatures
    this.adaptationHistory = []; // Ring buffer of adaptations
    this.detectionCallbacks = new Set();
    this.adaptationCallbacks = new Set();

    // Stats
    this.stats = {
      detected: 0,
      adapted: 0,
      errors: 0,
      rapidResponses: 0,
      fallbackAdaptations: 0,
      domAdaptations: 0,
      playerResponseAdaptations: 0,
      byCategory: {},
      bySeverity: {}
    };

    // Feature flags
    this.featureFlags = new Map();
    this._loadFeatureFlags();

    // Known experiments (merge built-in with custom)
    this.knownExperiments = new Map(Object.entries(EXPERIMENT_SIGNATURES));

    // Performance tracking
    this.performanceMetrics = {
      lastDetectionTime: 0,
      avgDetectionTime: 0,
      lastAdaptationTime: 0,
      avgAdaptationTime: 0,
      detectionCount: 0,
      adaptationCount: 0
    };

    // Debounce rapid adaptations
    this.pendingAdaptations = new Map();
    this.adaptationDebounceTimer = null;

    // Bind methods
    this._boundCheckPlayerResponse = this.checkPlayerResponse.bind(this);
    this._boundCheckYtInitialData = this.checkYtInitialData.bind(this);

    // Expose for network interceptor
    this.context.__aeroguardCheckExperiments = this._boundCheckPlayerResponse;
    this.context.__aeroguardCheckYtInitialData = this._boundCheckYtInitialData;

    console.log('[ExperimentDetector] Created with', this.knownExperiments.size, 'known experiments');
  }

  // ============================================================================
  // Feature Flags
  // ============================================================================

  _loadFeatureFlags() {
    if (!this.options.enableFeatureFlags) return;

    try {
      // Load from remote config
      for (const [name, config] of Object.entries(FEATURE_FLAGS)) {
        const value = remoteConfig.getFeature(name, config.default);
        this.featureFlags.set(name, value);
      }

      // Subscribe to changes
      remoteConfig.subscribe('featureFlags', () => {
        for (const [name, config] of Object.entries(FEATURE_FLAGS)) {
          this.featureFlags.set(name, remoteConfig.getFeature(name, config.default));
        }
      });
    } catch (e) {
      // Fallback to defaults
      for (const [name, config] of Object.entries(FEATURE_FLAGS)) {
        this.featureFlags.set(name, config.default);
      }
    }
  }

  getFeatureFlag(name) {
    return this.featureFlags.get(name) ?? FEATURE_FLAGS[name]?.default ?? false;
  }

  setFeatureFlag(name, value) {
    if (FEATURE_FLAGS[name]) {
      this.featureFlags.set(name, value);
      remoteConfig.setOverride(`featureFlags.${name}`, value, 'session');
    }
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  initialize() {
    if (this.isActive) return;

    if (!this.getFeatureFlag('experiment_detection_enabled')) {
      console.log('[ExperimentDetector] Detection disabled by feature flag');
      return;
    }

    // Initial detection pass
    this._detectFromPlayerResponse();
    this._detectFromYtInitialData();
    this._detectFromDOM();

    // Set up periodic re-detection
    this._startPeriodicDetection();

    // Listen for remote config changes
    this._setupConfigListeners();

    this.isActive = true;
    console.log('[ExperimentDetector] Initialized with rapid response:', this.options.rapidResponse);
  }

  _setupConfigListeners() {
    remoteConfig.subscribe('experiments', () => {
      this._loadFeatureFlags();
      // Re-run detection with new config
      if (this.isActive) this.detect();
    });
  }

  // ============================================================================
  // Detection Methods
  // ============================================================================

  _detectFromPlayerResponse() {
    // Check ytInitialData
    if (this.context.ytInitialData) {
      this._checkExperiments(this.context.ytInitialData, 'ytInitialData');
    }

    // Player response from fetch interception is handled via __aeroguardCheckExperiments
  }

  _detectFromYtInitialData() {
    if (this.context.ytInitialData) {
      this._checkExperiments(this.context.ytInitialData, 'ytInitialData');
    }
  }

  _detectFromDOM() {
    if (!this.getFeatureFlag('dom_adaptation_enabled')) return;

    const doc = this.context.document;
    if (!doc) return;

    for (const [expId, exp] of this.knownExperiments) {
      if (exp.domOnly && exp.detect && exp.detect({ document: doc })) {
        this._registerExperiment(expId, 'dom');
      }
    }
  }

  _checkExperiments(data, source) {
    if (!data) return;

    const startTime = performance.now();

    for (const [expId, exp] of this.knownExperiments) {
      // Skip DOM-only experiments for non-DOM sources
      if (exp.domOnly && source !== 'dom') continue;

      // Skip player response experiments for DOM source
      if (!exp.domOnly && source === 'dom') continue;

      if (exp.detect && exp.detect(data)) {
        this._registerExperiment(expId, source);
      }
    }

    // Track performance
    const detectionTime = performance.now() - startTime;
    this.performanceMetrics.lastDetectionTime = detectionTime;
    this.performanceMetrics.detectionCount++;
    this.performanceMetrics.avgDetectionTime =
      (this.performanceMetrics.avgDetectionTime * (this.performanceMetrics.detectionCount - 1) + detectionTime) /
      this.performanceMetrics.detectionCount;
  }

  _registerExperiment(expId, source) {
    const existing = this.detectedExperiments.get(expId);
    const experiment = this.knownExperiments.get(expId);

    if (!experiment) return;

    if (existing) {
      // Update existing
      existing.sources.add(source);
      existing.lastSeen = Date.now();
      existing.detectionCount = (existing.detectionCount || 1) + 1;

      // Check if we need to re-adapt (new source)
      if (!existing.adaptedSources?.has(source)) {
        this._adaptExperiment(expId, source);
      }
      return;
    }

    // New experiment detected
    const record = {
      id: expId,
      name: experiment.name,
      category: experiment.category,
      severity: experiment.severity,
      version: experiment.version,
      detectedAt: Date.now(),
      lastSeen: Date.now(),
      sources: new Set([source]),
      adaptedSources: new Set(),
      adaptations: [],
      detectionCount: 1,
      config: experiment.config || {},
      metadata: experiment.metadata || {}
    };

    this.detectedExperiments.set(expId, record);
    this.stats.detected++;

    // Update category/severity stats
    this.stats.byCategory[experiment.category] = (this.stats.byCategory[experiment.category] || 0) + 1;
    this.stats.bySeverity[experiment.severity] = (this.stats.bySeverity[experiment.severity] || 0) + 1;

    // Apply adaptation immediately (rapid response)
    this._adaptExperiment(expId, source);

    // Notify callbacks
    this._notifyDetection(expId, record, source);

    console.log('[ExperimentDetector] Detected:', expId, '(' + experiment.name + ')', 'from', source, '- severity:', experiment.severity);
  }

  // ============================================================================
  // Adaptation Methods
  // ============================================================================

  _adaptExperiment(expId, source) {
    const record = this.detectedExperiments.get(expId);
    const experiment = this.knownExperiments.get(expId);

    if (!record || !experiment || !experiment.adapt) return;

    // Check if already adapted for this source
    if (record.adaptedSources?.has(source)) return;

    const startTime = performance.now();

    try {
      // Check feature flags
      if (source === 'dom' && !this.getFeatureFlag('dom_adaptation_enabled')) return;
      if (source !== 'dom' && !this.getFeatureFlag('player_response_adaptation_enabled')) return;

      // Apply adaptation based on source
      let adaptationApplied = false;

      if (source === 'ytInitialData' && this.context.ytInitialData) {
        experiment.adapt(this.context.ytInitialData);
        adaptationApplied = true;
      } else if (source === 'playerResponse') {
        // Handled by network interceptor calling checkPlayerResponse
        adaptationApplied = true;
      } else if (source === 'dom') {
        experiment.adapt({ document: this.context.document });
        adaptationApplied = true;
      }

      if (adaptationApplied) {
        record.adaptedSources = record.adaptedSources || new Set();
        record.adaptedSources.add(source);

        record.adaptations.push({
          timestamp: Date.now(),
          source,
          rapidResponse: experiment.rapidResponse === true
        });

        this.stats.adapted++;

        if (experiment.rapidResponse) this.stats.rapidResponses++;
        if (source === 'dom') this.stats.domAdaptations++;
        else this.stats.playerResponseAdaptations++;

        // Track performance
        const adaptationTime = performance.now() - startTime;
        this.performanceMetrics.lastAdaptationTime = adaptationTime;
        this.performanceMetrics.adaptationCount++;
        this.performanceMetrics.avgAdaptationTime =
          (this.performanceMetrics.avgAdaptationTime * (this.performanceMetrics.adaptationCount - 1) + adaptationTime) /
          this.performanceMetrics.adaptationCount;

        // Add to history
        this._addToAdaptationHistory(expId, source, adaptationTime, true);

        // Notify callbacks
        this._notifyAdaptation(expId, record, source);

        console.log('[ExperimentDetector] Adapted to:', expId, 'via', source, 'in', adaptationTime.toFixed(2), 'ms');
      }
    } catch (e) {
      this.stats.errors++;
      console.error('[ExperimentDetector] Adaptation failed:', expId, e);

      // Try fallback adaptation
      if (this.getFeatureFlag('fallback_adaptation_enabled') && experiment.fallbackAdaptation) {
        try {
          experiment.fallbackAdaptation(this._getDataForSource(source));
          this.stats.fallbackAdaptations++;
          this._addToAdaptationHistory(expId, source, performance.now() - startTime, false, true);
          console.log('[ExperimentDetector] Fallback adaptation applied for:', expId);
        } catch (fallbackError) {
          console.error('[ExperimentDetector] Fallback adaptation also failed:', expId, fallbackError);
        }
      }

      this._addToAdaptationHistory(expId, source, performance.now() - startTime, false);
    }
  }

  _getDataForSource(source) {
    switch (source) {
      case 'ytInitialData':
        return this.context.ytInitialData;
      case 'playerResponse':
        // Would need player response data passed in
        return null;
      case 'dom':
        return { document: this.context.document };
      default:
        return null;
    }
  }

  _addToAdaptationHistory(expId, source, duration, success, fallback = false) {
    this.adaptationHistory.push({
      expId,
      source,
      timestamp: Date.now(),
      duration,
      success,
      fallback
    });

    // Keep ring buffer
    if (this.adaptationHistory.length > this.options.maxHistorySize) {
      this.adaptationHistory.shift();
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Check for experiments in player response data
   * Called by network interceptor
   */
  checkPlayerResponse(data) {
    if (!data) return;
    this._checkExperiments(data, 'playerResponse');
  }

  /**
   * Check for experiments in ytInitialData
   */
  checkYtInitialData(data) {
    if (!data) return;
    this._checkExperiments(data, 'ytInitialData');
  }

  /**
   * Manually trigger detection
   */
  detect() {
    this._detectFromPlayerResponse();
    this._detectFromYtInitialData();
    this._detectFromDOM();
  }

  /**
   * Add custom experiment signature
   */
  addExperimentSignature(expId, signature) {
    this.experimentSignatures.set(expId, signature);
    this.knownExperiments.set(expId, {
      ...EXPERIMENT_SIGNATURES[expId],
      ...signature,
      id: expId
    });
    console.log('[ExperimentDetector] Added custom experiment signature:', expId);
  }

  /**
   * Remove experiment signature
   */
  removeExperimentSignature(expId) {
    this.experimentSignatures.delete(expId);
    this.knownExperiments.delete(expId);
    this.detectedExperiments.delete(expId);
  }

  /**
   * Get all detected experiments
   */
  getDetectedExperiments() {
    return Array.from(this.detectedExperiments.values()).map(exp => ({
      ...exp,
      sources: Array.from(exp.sources),
      adaptedSources: Array.from(exp.adaptedSources || [])
    }));
  }

  /**
   * Get experiment by ID
   */
  getExperiment(expId) {
    const exp = this.detectedExperiments.get(expId);
    return exp ? {
      ...exp,
      sources: Array.from(exp.sources),
      adaptedSources: Array.from(exp.adaptedSources || [])
    } : null;
  }

  /**
   * Get experiments by category
   */
  getExperimentsByCategory(category) {
    return Array.from(this.detectedExperiments.values())
      .filter(exp => exp.category === category)
      .map(exp => ({
        ...exp,
        sources: Array.from(exp.sources),
        adaptedSources: Array.from(exp.adaptedSources || [])
      }));
  }

  /**
   * Get experiments by severity
   */
  getExperimentsBySeverity(severity) {
    return Array.from(this.detectedExperiments.values())
      .filter(exp => exp.severity === severity)
      .map(exp => ({
        ...exp,
        sources: Array.from(exp.sources),
        adaptedSources: Array.from(exp.adaptedSources || [])
      }));
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeExperiments: this.detectedExperiments.size,
      knownExperiments: this.knownExperiments.size,
      customSignatures: this.experimentSignatures.size,
      performance: { ...this.performanceMetrics },
      featureFlags: Object.fromEntries(this.featureFlags)
    };
  }

  /**
   * Get adaptation history
   */
  getAdaptationHistory(limit = 50) {
    return this.adaptationHistory.slice(-limit);
  }

  /**
   * Subscribe to detection events
   */
  onDetect(callback) {
    this.detectionCallbacks.add(callback);
    return () => this.detectionCallbacks.delete(callback);
  }

  /**
   * Subscribe to adaptation events
   */
  onAdapt(callback) {
    this.adaptationCallbacks.add(callback);
    return () => this.adaptationCallbacks.delete(callback);
  }

  _notifyDetection(expId, record, source) {
    for (const cb of this.detectionCallbacks) {
      try { cb(expId, record, source); } catch (e) { console.error('[ExperimentDetector] Detection callback error:', e); }
    }
  }

  _notifyAdaptation(expId, record, source) {
    for (const cb of this.adaptationCallbacks) {
      try { cb(expId, record, source); } catch (e) { console.error('[ExperimentDetector] Adaptation callback error:', e); }
    }
  }

  /**
   * Enable/disable rapid response mode
   */
  setRapidResponse(enabled) {
    this.options.rapidResponse = enabled;
    this.setFeatureFlag('rapid_response_enabled', enabled);
  }

  /**
   * Set aggressive mode
   */
  setAggressiveMode(enabled) {
    this.options.aggressiveMode = enabled;
    this.setFeatureFlag('aggressive_mode', enabled);

    if (enabled) {
      // Re-run detection with aggressive settings
      this.detect();
    }
  }

  /**
   * Force re-adaptation for all detected experiments
   */
  reAdaptAll() {
    for (const [expId, record] of this.detectedExperiments) {
      record.adaptedSources = new Set();
      for (const source of record.sources) {
        this._adaptExperiment(expId, source);
      }
    }
  }

  /**
   * Get known experiment definitions
   */
  getKnownExperiments() {
    return Array.from(this.knownExperiments.values()).map(exp => ({
      id: exp.id,
      name: exp.name,
      category: exp.category,
      severity: exp.severity,
      version: exp.version,
      rapidResponse: exp.rapidResponse,
      domOnly: exp.domOnly
    }));
  }

  // ============================================================================
  // Periodic Detection
  // ============================================================================

  _startPeriodicDetection() {
    if (this.periodicTimer) clearInterval(this.periodicTimer);

    this.periodicTimer = setInterval(() => {
      if (!this.isActive) return;
      this._detectFromDOM();
      this._detectFromPlayerResponse();
      this._detectFromYtInitialData();

      // Clean up stale experiments (not seen in 5 minutes)
      this._cleanupStaleExperiments();
    }, this.options.periodicInterval);
  }

  _cleanupStaleExperiments() {
    const now = Date.now();
    const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

    for (const [expId, record] of this.detectedExperiments) {
      if (now - record.lastSeen > STALE_THRESHOLD) {
        console.log('[ExperimentDetector] Cleaning up stale experiment:', expId);
        this.detectedExperiments.delete(expId);
      }
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  cleanup() {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }

    if (this.adaptationDebounceTimer) {
      clearTimeout(this.adaptationDebounceTimer);
      this.adaptationDebounceTimer = null;
    }

    delete this.context.__aeroguardCheckExperiments;
    delete this.context.__aeroguardCheckYtInitialData;

    this.detectedExperiments.clear();
    this.experimentSignatures.clear();
    this.adaptationHistory = [];
    this.detectionCallbacks.clear();
    this.adaptationCallbacks.clear();
    this.isActive = false;

    console.log('[ExperimentDetector] Cleaned up');
  }

  /**
   * Reset all state
   */
  reset() {
    this.cleanup();
    this.stats = {
      detected: 0,
      adapted: 0,
      errors: 0,
      rapidResponses: 0,
      fallbackAdaptations: 0,
      domAdaptations: 0,
      playerResponseAdaptations: 0,
      byCategory: {},
      bySeverity: {}
    };
    this.performanceMetrics = {
      lastDetectionTime: 0,
      avgDetectionTime: 0,
      lastAdaptationTime: 0,
      avgAdaptationTime: 0,
      detectionCount: 0,
      adaptationCount: 0
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let experimentDetectorInstance = null;

export function getExperimentDetector(context = window, options = {}) {
  if (!experimentDetectorInstance) {
    experimentDetectorInstance = new ExperimentDetector(context, options);
  }
  return experimentDetectorInstance;
}

export function resetExperimentDetector() {
  if (experimentDetectorInstance) {
    experimentDetectorInstance.cleanup();
  }
  experimentDetectorInstance = null;
}

export { EXPERIMENT_SIGNATURES, FEATURE_FLAGS };
export default ExperimentDetector;