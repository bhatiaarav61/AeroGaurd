/**
 * YouTube Coordinator — 5-Stage Pipeline Orchestrator
 * Network → Player → DOM → Heuristic → Learning
 */

import { errorKernel } from '../../background/error-kernel.js';
import { getExperimentDetector } from './experiment-detector.js';

// ============================================================================
// Stage 1: Network Interceptor
// ============================================================================

class NetworkInterceptor {
  constructor() {
    this.patterns = new Set();
    this.stats = { blocked: 0, allowed: 0 };
  }

  initialize(patterns) {
    this.patterns = new Set(patterns);
  }

  check(url) {
    if (!url || typeof url !== 'string') return false;
    const urlLower = url.toLowerCase();

    for (const pattern of this.patterns) {
      if (urlLower.includes(pattern.toLowerCase())) {
        this.stats.blocked++;
        return true;
      }
    }
    return false;
  }

  getStats() {
    return { ...this.stats };
  }
}

// ============================================================================
// Stage 2: Player Patcher
// ============================================================================

class PlayerPatcher {
  constructor() {
    this.transforms = [];
    this.stats = { patched: 0, errors: 0 };
  }

  addTransform(fn) {
    this.transforms.push(fn);
  }

  async patchPlayerResponse(data) {
    if (!data || typeof data !== 'object') return data;

    try {
      let patched = JSON.parse(JSON.stringify(data)); // Deep clone

      for (const transform of this.transforms) {
        transform(patched);
      }

      this.stats.patched++;
      return patched;
    } catch (error) {
      this.stats.errors++;
      console.error('[PlayerPatcher] Transform error:', error);
      return data;
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

// Default player response transforms
const DEFAULT_PLAYER_TRANSFORMS = [
  // Remove ad signals
  (data) => { if (data?.playabilityStatus) { delete data.playabilityStatus.adSignalsInfo; delete data.playabilityStatus.adsPresentation; delete data.playabilityStatus.adPlacements; delete data.playabilityStatus.adBreaks; data.playabilityStatus.status = data.playabilityStatus.status || 'OK'; } },
  // Remove player config ads
  (data) => { if (data?.playerConfig) { delete data.playerConfig.adConfig; delete data.playerConfig.adPlacements; delete data.playerConfig.adBreakConfig; } },
  // Remove video details ads
  (data) => { if (data?.videoDetails) { delete data.videoDetails.allowAds; delete data.videoDetails.adTagUrl; delete data.videoDetails.adTagUrlSet; delete data.videoDetails.playerAdConfig; delete data.videoDetails.adBreakSlots; delete data.videoDetails.adSlots; } },
  // Filter adaptive formats - keep only real media
  (data) => { if (data?.streamingData?.adaptiveFormats) { data.streamingData.adaptiveFormats = data.streamingData.adaptiveFormats.filter(f => isRealMediaFormat(f)).map(f => stripAdMetadata(f)); } },
  // Remove ad formats
  (data) => { if (data?.streamingData) { delete data.streamingData.adFormats; } },
  // Strip ad periods from DASH manifest
  (data) => { if (data?.streamingData?.dashManifest) { data.streamingData.dashManifest = stripAdPeriods(data.streamingData.dashManifest); } },
  // Strip ad segments from HLS manifest
  (data) => { if (data?.streamingData?.hlsManifest) { data.streamingData.hlsManifest = stripAdSegments(data.streamingData.hlsManifest); } }
];

function isRealMediaFormat(format) {
  const url = format.url || '';
  const mime = format.mimeType || '';
  const codecs = format.codecs || '';

  if (url.includes('/api/manifest/') || url.includes('/manifest/')) return false;
  if (url.includes('adformat=') || url.includes('ad_type=')) return false;
  if (mime.includes('application/vnd.apple.mpegurl') && url.includes('ad')) return false;
  if (mime.includes('application/dash+xml') && url.includes('ad')) return false;
  if (codecs.includes('ad')) return false;
  return true;
}

function stripAdMetadata(format) {
  const clean = { ...format };
  delete clean.adMetadata;
  delete clean.adBreakId;
  delete clean.adTagUrl;
  return clean;
}

function stripAdPeriods(dashManifest) {
  // Remove Period elements with ad content
  return dashManifest.replace(/<Period[^>]*ad[^>]*>[\s\S]*?<\/Period>/gi, '');
}

function stripAdSegments(hlsManifest) {
  // Remove EXT-X-DATERANGE with ad markers and associated segments
  return hlsManifest
    .split('\n')
    .filter(line => !line.includes('EXT-X-DATERANGE') || !line.toLowerCase().includes('ad'))
    .join('\n');
}

// ============================================================================
// Stage 3: DOM Neutralizer
// ============================================================================

class DOMNeutralizer {
  constructor() {
    this.safeSelectors = [];
    this.playerAllowList = [];
    this.stats = { hidden: 0, protected: 0 };
  }

  initialize(selectors, allowList) {
    this.safeSelectors = selectors;
    this.playerAllowList = allowList;
  }

  isPlayerElement(el) {
    if (!el) return false;

    // Direct match
    for (const allowed of this.playerAllowList) {
      if (el.matches(allowed)) return true;
      if (el.closest(allowed)) return true;
    }

    // Video element with actual video content
    if (el.tagName === 'VIDEO') {
      return el.src && el.src.includes('googlevideo.com/videoplayback');
    }

    // Player container with video child
    if (el.querySelector('video.html5-main-video, video#movie_player')) {
      return true;
    }

    return false;
  }

  hideAdElements(root = document) {
    let count = 0;
    const selectorString = this.safeSelectors.join(',');

    try {
      root.querySelectorAll(selectorString).forEach(el => {
        if (!el._adBlocked && !this.isPlayerElement(el)) {
          this.hideElement(el);
          count++;
        }
      });
    } catch (e) {
      console.warn('[DOMNeutralizer] Selector error:', e.message);
    }

    this.stats.hidden += count;
    return count;
  }

  hideElement(el) {
    if (el._adBlocked) return;
    el._adBlocked = true;
    el._origStyles = {
      display: el.style.display, visibility: el.style.visibility,
      opacity: el.style.opacity, pointerEvents: el.style.pointerEvents,
      height: el.style.height, width: el.style.width,
      overflow: el.style.overflow, position: el.style.position,
      zIndex: el.style.zIndex, transform: el.style.transform
    };
    el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-2147483647!important;transform:scale(0)!important;contain:layout size style paint!important';
    el.setAttribute('data-aeroguard-hidden', 'true');
    el.setAttribute('aria-hidden', 'true');
  }

  getStats() {
    return { ...this.stats };
  }
}

// ============================================================================
// Stage 4: Heuristic Detector
// ============================================================================

class HeuristicDetector {
  constructor() {
    this.models = {
      timing: new TimingAnalyzer(),
      payload: new PayloadAnalyzer(),
      dom: new DOMMutationAnalyzer(),
      fingerprint: new FingerprintAnalyzer()
    };
    this.confidenceThreshold = 0.85;
    this.stats = { detected: 0, falsePositives: 0 };
  }

  analyzeRequest(request) {
    const features = {
      // Timing features
      timeSinceNavigation: performance.now() - (this.navigationStart || performance.now()),
      requestInterval: this.lastRequestTime ? performance.now() - this.lastRequestTime : 0,
      isPeriodic: this.isPeriodicRequest(request.url),

      // URL features
      urlEntropy: this.calculateEntropy(request.url),
      paramCount: new URL(request.url).searchParams.size,
      hasAdParams: this.hasAdParameters(request.url),

      // Payload features
      payloadSize: request.body ? new TextEncoder().encode(request.body).length : 0,
      payloadEntropy: request.body ? this.calculateEntropy(request.body) : 0,

      // Header features
      headerCount: request.headers ? Object.keys(request.headers).length : 0,
      hasCookieHeader: !!request.headers?.cookie,
      hasReferer: !!request.headers?.referer,

      // Initiator features
      initiatorType: request.initiatorType,
      isThirdParty: this.isThirdParty(request.url),

      // Behavioral features
      isXHR: request.initiatorType === 'xmlhttprequest',
      isFetch: request.initiatorType === 'fetch',
      isBeacon: request.initiatorType === 'beacon',
      isPreload: request.destination === 'preload'
    };

    // Ensemble scoring
    const scores = {
      timing: this.models.timing.score(features),
      payload: this.models.payload.score(features),
      dom: this.models.dom.score(features),
      fingerprint: this.models.fingerprint.score(features)
    };

    const ensembleScore = (
      scores.timing * 0.3 +
      scores.payload * 0.3 +
      scores.dom * 0.2 +
      scores.fingerprint * 0.2
    );

    if (ensembleScore > this.confidenceThreshold) {
      this.stats.detected++;
      return { isAd: true, confidence: ensembleScore, features, scores };
    }

    return { isAd: false, confidence: ensembleScore, features, scores };
  }

  reportFalsePositive(url, context) {
    this.stats.falsePositives++;
    // In production: add to exception list, retrain models
  }

  calculateEntropy(str) {
    if (!str) return 0;
    const freq = {};
    for (const char of str) freq[char] = (freq[char] || 0) + 1;
    let entropy = 0;
    for (const count of Object.values(freq)) {
      const p = count / str.length;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  hasAdParameters(url) {
    const adParams = ['adformat', 'ad_type', 'ad3_module', 'afv', 'vmap', 'ad_tag', 'ad_url', 'adunit', 'adslot'];
    const params = new URL(url).searchParams;
    for (const param of adParams) if (params.has(param)) return true;
    return false;
  }

  isThirdParty(url) {
    try {
      return new URL(url).origin !== location.origin;
    } catch { return true; }
  }

  isPeriodicRequest(url) {
    // Simple heuristic: check if similar requests happen at regular intervals
    return false; // Would need request history
  }

  getStats() {
    return { ...this.stats };
  }
}

// Simple model implementations
class TimingAnalyzer {
  score(features) {
    let score = 0;
    if (features.isPeriodic) score += 0.4;
    if (features.requestInterval > 0 && features.requestInterval < 5000) score += 0.3;
    if (features.initiatorType === 'beacon') score += 0.3;
    return Math.min(1, score);
  }
}

class PayloadAnalyzer {
  score(features) {
    let score = 0;
    if (features.payloadSize > 0 && features.payloadSize < 500) score += 0.3; // Small tracking payloads
    if (features.payloadEntropy > 3.5) score += 0.4; // High entropy = encoded data
    if (features.hasAdParams) score += 0.5;
    return Math.min(1, score);
  }
}

class DOMMutationAnalyzer {
  score(features) {
    let score = 0;
    if (features.isXHR || features.isFetch) score += 0.2;
    if (features.isThirdParty) score += 0.3;
    return Math.min(1, score);
  }
}

class FingerprintAnalyzer {
  score(features) {
    let score = 0;
    if (features.headerCount > 10) score += 0.2;
    if (features.hasCookieHeader) score += 0.2;
    return Math.min(1, score);
  }
}

// ============================================================================
// Stage 5: Learning Loop
// ============================================================================

class LearningLoop {
  constructor() {
    this.feedbackBuffer = [];
    this.falsePositiveBuffer = [];
    this.newPatternBuffer = [];
    this.modelVersion = 1;
    this.stats = { feedbackReceived: 0, patternsExtracted: 0 };
  }

  reportMissedAd(url, context) {
    this.newPatternBuffer.push({
      url, context, timestamp: Date.now(),
      features: this.extractFeatures(url, context)
    });
    this.maybeTriggerModelUpdate();
  }

  reportFalsePositive(url, context) {
    this.falsePositiveBuffer.push({
      url, context, timestamp: Date.now(),
      features: this.extractFeatures(url, context)
    });
    this.addExceptionRule(url);
    this.maybeTriggerModelUpdate();
  }

  extractFeatures(url, context) {
    return {
      urlEntropy: this.calculateEntropy(url),
      hasAdParams: this.hasAdParameters(url),
      domain: new URL(url).hostname,
      initiatorType: context.initiatorType
    };
  }

  calculateEntropy(str) {
    if (!str) return 0;
    const freq = {};
    for (const char of str) freq[char] = (freq[char] || 0) + 1;
    let entropy = 0;
    for (const count of Object.values(freq)) {
      const p = count / str.length;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  hasAdParameters(url) {
    const adParams = ['adformat', 'ad_type', 'ad3_module', 'afv', 'vmap', 'ad_tag', 'ad_url'];
    const params = new URL(url).searchParams;
    for (const param of adParams) if (params.has(param)) return true;
    return false;
  }

  addExceptionRule(url) {
    // Add to exception list for DNR
    try {
      chrome.runtime.sendMessage({
        type: 'ADD_EXCEPTION_RULE',
        pattern: url
      });
    } catch (e) { /* ignore */ }
  }

  maybeTriggerModelUpdate() {
    if (this.newPatternBuffer.length >= 10) {
      this.extractNewPatterns();
    }
  }

  async extractNewPatterns() {
    // Cluster patterns and add high-confidence ones
    const patterns = this.clusterPatterns(this.newPatternBuffer);
    for (const pattern of patterns) {
      if (pattern.confidence > 0.9 && pattern.support > 5) {
        await this.addHeuristicRule(pattern);
        this.stats.patternsExtracted++;
      }
    }
    this.newPatternBuffer = [];
  }

  clusterPatterns(buffer) {
    // Simple clustering by domain
    const clusters = new Map();
    for (const item of buffer) {
      const domain = item.features.domain;
      if (!clusters.has(domain)) clusters.set(domain, []);
      clusters.get(domain).push(item);
    }

    return Array.from(clusters.entries()).map(([domain, items]) => ({
      domain,
      pattern: `||${domain}/*`,
      confidence: items.length / buffer.length,
      support: items.length
    }));
  }

  async addHeuristicRule(pattern) {
    // Would add to heuristic ruleset
    console.log('[LearningLoop] Adding heuristic rule:', pattern);
  }

  getStats() {
    return { ...this.stats, buffers: { feedback: this.feedbackBuffer.length, falsePositives: this.falsePositiveBuffer.length, newPatterns: this.newPatternBuffer.length } };
  }
}

// ============================================================================
// YouTube Coordinator — Main Orchestrator
// ============================================================================

export class YouTubeCoordinator {
  constructor() {
    this.networkInterceptor = new NetworkInterceptor();
    this.playerPatcher = new PlayerPatcher();
    this.domNeutralizer = new DOMNeutralizer();
    this.heuristicDetector = new HeuristicDetector();
    this.learningLoop = new LearningLoop();
    this.experimentDetector = null; // Initialized in initialize()
    this.isInitialized = false;
    this.mode = 'aggressive';
  }

  async initialize(mode = 'aggressive') {
    this.mode = mode;
    this.isInitialized = true;

    // Initialize network patterns
    this.networkInterceptor.initialize(this.getNetworkPatterns());

    // Initialize player transforms
    for (const transform of DEFAULT_PLAYER_TRANSFORMS) {
      this.playerPatcher.addTransform(transform);
    }

    // Initialize DOM selectors
    this.domNeutralizer.initialize(this.getSafeSelectors(), this.getPlayerAllowList());

    // Initialize experiment detector (Stage 6: Experiment Adaptation)
    this.experimentDetector = getExperimentDetector(window, {
      rapidResponse: true,
      periodicInterval: 15000,
      aggressiveMode: mode === 'aggressive'
    });
    this.experimentDetector.initialize();

    // Wire experiment detector to network interceptor and player patcher for rapid response
    this.networkInterceptor.setExperimentDetector(this.experimentDetector);
    this.playerPatcher.setExperimentDetector(this.experimentDetector);

    // Wire experiment detector adaptations
    this.experimentDetector.onAdapt((expId, record, source) => {
      if (source === 'playerResponse' || source === 'ytInitialData') {
        // Trigger re-patching of player response
        if (this.context?.ytInitialData) {
          this.experimentDetector.checkYtInitialData(this.context.ytInitialData);
        }
      }
    });

    console.log('[YouTubeCoordinator] 6-stage pipeline initialized:', mode, '(+Experiment Adaptation)');
  }

  getNetworkPatterns() {
    return [
      // Core ad endpoints
      '/api/stats/ads', '/api/stats/qoe', '/ptracking', '/pagead/',
      '/annotations_invideo', '/api/stats/watchtime', '/api/stats/heartbeat',
      '/get_video_info?adformat=', '/get_video_info?ad_type=',
      '/get_video_info?ad3_module=', '/get_video_info?afv_',
      '/get_video_info?vmap=', '/get_video_info?ad_tag=',
      '/get_video_info?ad_url=', '/youtubei/v1/ad/',

      // Google ad domains
      'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
      'googletagmanager.com', 'googletagservices.com', 'pagead2.googlesyndication.com',
      'pubads.g.doubleclick.net', 'securepubads.g.doubleclick.net',
      'adservice.google.com', 'imasdk.googleapis.com', 'imasdk.s3.amazonaws.com',
      'gstatic.com/imasdk', 'cdn.jsdelivr.net/npm/google-ima',
      'ads.youtube.com', 'advertising.youtube.com', 'partneradvertising.youtube.com',
      'sponsorships.youtube.com', 'paidcontent.youtube.com',
      'googleads.g.doubleclick.net', 'fls.doubleclick.net', 'ad.doubleclick.net',
      'googleadservices.com', 'advertiser.youtube.com', 'ads-pa.googleapis.com'
    ];
  }

  getSafeSelectors() {
    return [
      // Video overlay ads — SPECIFIC to ad UI only
      '.ytp-ad-player-overlay', '.ytp-ad-overlay-container', '.ytp-ad-overlay-slot',
      '.ytp-ad-text-overlay', '.ytp-ad-image-overlay', '.ytp-ad-branding-overlay',
      '.ytp-ad-companion-slot', '.ytp-ad-banner-slot', '.ytp-ad-skip-button-container',
      '.ytp-ad-preview-container', '.ytp-ad-preview-slot', '.ytp-ad-progress-bar-container',
      '.ytp-ad-progress-bar', '.ytp-ad-duration-remaining', '.ytp-ad-button-container',
      '.ytp-ad-button', '.ytp-ad-cta-button', '.ytp-ad-visit-advertiser-button',
      '.ytp-ad-learn-more-button', '.ytp-ad-feedback-button', '.ytp-ad-info-button',
      '.ytp-ad-cancel-button', '.ytp-ce-covering-overlay', '.ytp-ce-element.ytp-ce-ad',
      '.ytp-ce-video.ytp-ce-ad',

      // Feed/component ads — YouTube-specific renderers only
      'ytd-ad-slot-renderer', 'ytd-display-ad-renderer', 'ytd-promoted-video-renderer',
      'ytd-promoted-sparkles-web-renderer', 'ytd-action-companion-ad-renderer',
      'ytd-in-feed-ad-renderer', 'ytd-banner-ad-renderer', 'ytd-companion-slot-renderer',
      'ytd-mealbar-promo-renderer', 'ytd-merch-shelf-renderer', 'ytd-shopping-renderer',
      'ytd-masthead-ad-renderer', '#masthead-ad', '.masthead-ad',

      // Iframe ads — ONLY known ad iframes
      'iframe[src*="googleads.g.doubleclick.net/pagead/ads"]',
      'iframe[src*="pubads.g.doubleclick.net/gampad/ads"]',
      'iframe[src*="pagead2.googlesyndication.com/pagead/ads"]',
      'iframe[src*="/ads?"]', 'iframe[src*="adformat="]', 'iframe[src*="ad_type="]'
    ];
  }

  getPlayerAllowList() {
    return [
      'video.html5-main-video', 'video#movie_player', '#movie_player',
      'video.html5-video-player', 'video.ytp-video',
      'video[src*="googlevideo.com/videoplayback"]',
      '#movie_player', '.html5-video-player', '.html5-video-container',
      '.ytp-chrome-bottom', '.ytp-chrome-top', '.ytp-chrome-controls',
      '.ytp-play-button', '.ytp-progress-bar', '.ytp-volume-panel',
      '.ytp-fullscreen-button', '.ytp-settings-button',
      '[data-layer="8"]', '[data-layer="4"]', '[data-layer="2"]'
    ];
  }

  // ========== Pipeline Methods ==========

  /**
   * Stage 1: Network interception
   */
  checkNetworkRequest(url) {
    return this.networkInterceptor.check(url);
  }

  /**
   * Stage 2: Player response patching
   */
  async patchPlayerResponse(data) {
    return await this.playerPatcher.patchPlayerResponse(data);
  }

  /**
   * Stage 3: DOM neutralization
   */
  cleanDOM(root = document) {
    return this.domNeutralizer.hideAdElements(root);
  }

  /**
   * Stage 4: Heuristic detection
   */
  analyzeRequest(request) {
    return this.heuristicDetector.analyzeRequest(request);
  }

  /**
   * Stage 5: Learning from feedback
   */
  reportMissedAd(url, context) {
    this.learningLoop.reportMissedAd(url, context);
  }

  reportFalsePositive(url, context) {
    this.learningLoop.reportFalsePositive(url, context);
  }

  // ========== Stage 6: Experiment Adaptation ==========

  /**
   * Get experiment detector instance
   */
  getExperimentDetector() {
    return this.experimentDetector;
  }

  /**
   * Manually trigger experiment detection
   */
  detectExperiments() {
    if (this.experimentDetector) {
      this.experimentDetector.detect();
    }
  }

  /**
   * Check player response for experiments (called by network interceptor)
   */
  checkPlayerResponseForExperiments(data) {
    if (this.experimentDetector) {
      this.experimentDetector.checkPlayerResponse(data);
    }
  }

  /**
   * Check ytInitialData for experiments
   */
  checkYtInitialDataForExperiments(data) {
    if (this.experimentDetector) {
      this.experimentDetector.checkYtInitialData(data);
    }
  }

  // ========== Stats ==========

  getStats() {
    const baseStats = {
      network: this.networkInterceptor.getStats(),
      player: this.playerPatcher.getStats(),
      dom: this.domNeutralizer.getStats(),
      heuristic: this.heuristicDetector.getStats(),
      learning: this.learningLoop.getStats()
    };

    if (this.experimentDetector) {
      baseStats.experiments = this.experimentDetector.getStats();
    }

    return baseStats;
  }

  setMode(mode) {
    this.mode = mode;
    if (this.experimentDetector) {
      this.experimentDetector.setAggressiveMode(mode === 'aggressive');
    }
  }
}

export default YouTubeCoordinator;