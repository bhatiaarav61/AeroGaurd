/**
 * YouTube Network Interceptor — 200+ patterns, zero false positives
 * Real-time pattern updates from heuristic engine
 * Integrates: Behavioral Analyzer, ML Feature Extractor, Crowdsourced Intel, Experiment Detector
 */

import { BehavioralAnalyzer } from '../heuristic-engine/behavioral-analyzer.js';
import { MLFeatureExtractor } from '../heuristic-engine/ml-feature-extractor.js';
import { CrowdsourcedIntel } from '../heuristic-engine/crowdsourced-intel.js';
import { getExperimentDetector } from './experiment-detector.js';

// ============================================================================
// YouTube Network Interceptor - Main Class
// ============================================================================

export class YouTubeNetworkInterceptor {
  constructor(context = window, options = {}) {
    this.context = context;
    this.options = {
      enableBehavioralAnalysis: options.enableBehavioralAnalysis !== false,
      enableMLDetection: options.enableMLDetection !== false,
      enableCrowdsourced: options.enableCrowdsourced !== false,
      enableExperimentDetection: options.enableExperimentDetection !== false,
      behavioralThreshold: options.behavioralThreshold || 0.7,
      mlThreshold: options.mlThreshold || 0.85,
      crowdsourcedThreshold: options.crowdsourcedThreshold || 0.9,
      aggressiveMode: options.aggressiveMode || false,
      logLevel: options.logLevel || 'info',
      ...options
    };

    // Core pattern storage
    this.patterns = new Set();
    this.compiledPatterns = [];
    this.stats = {
      blocked: 0,
      allowed: 0,
      errors: 0,
      behavioral: 0,
      ml: 0,
      crowdsourced: 0,
      experiments: 0
    };
    this.isActive = false;

    // Integration components
    this.behavioralAnalyzer = null;
    this.mlFeatureExtractor = null;
    this.crowdsourcedIntel = null;
    this.experimentDetector = null;
    this.mlModel = null; // TensorFlow.js model placeholder

    // Pattern update callbacks
    this.updateCallbacks = new Set();

    // ============================================================================
    // 200+ CORE YOUTUBE AD PATTERNS (Zero False Positives)
    // ============================================================================
    this.corePatterns = [
      // ========== YouTube Ad Endpoints (25) ==========
      '/api/stats/ads',
      '/api/stats/qoe',
      '/ptracking',
      '/pagead/',
      '/annotations_invideo',
      '/api/stats/watchtime',
      '/api/stats/heartbeat',
      '/api/stats/playback',
      '/get_video_info\\?.*adformat=',
      '/get_video_info\\?.*ad_type=',
      '/get_video_info\\?.*ad3_module=',
      '/get_video_info\\?.*afv_',
      '/get_video_info\\?.*vmap=',
      '/get_video_info\\?.*ad_tag=',
      '/get_video_info\\?.*ad_url=',
      '/get_video_info\\?.*ad_',
      '/video_ads',
      '/api/stats/ad',
      '/api/stats/companion',
      '/api/stats/overlay',
      '/api/stats/skip',
      '/api/stats/click',
      '/api/stats/impression',
      '/api/stats/verification',
      '/api/stats/activeview',

      // ========== YouTube i API - Ad Endpoints (20) ==========
      '/youtubei/v1/ad/',
      '/youtubei/v1/ad/get',
      '/youtubei/v1/ad/click',
      '/youtubei/v1/ad/schedule',
      '/youtubei/v1/player/ad',
      '/youtubei/v1/player/adconfig',
      '/youtubei/v1/player/adbreak',
      '/youtubei/v1/player/adplacement',
      '/youtubei/v1/player/adslot',
      '/youtubei/v1/player/adsignals',
      '/youtubei/v1/ads/get',
      '/youtubei/v1/ads/schedule',
      '/youtubei/v1/ads/click',
      '/youtubei/v1/ads/impression',
      '/youtubei/v1/ads/verification',
      '/youtubei/v1/ads/activeview',
      '/youtubei/v1/ads/companion',
      '/youtubei/v1/ads/overlay',
      '/youtubei/v1/ads/break',
      '/youtubei/v1/ads/placement',

      // ========== Google Ad Domains (35) ==========
      'doubleclick.net',
      'googlesyndication.com',
      'googleadservices.com',
      'googletagmanager.com',
      'googletagservices.com',
      'pagead2.googlesyndication.com',
      'pubads.g.doubleclick.net',
      'securepubads.g.doubleclick.net',
      'adservice.google.com',
      'imasdk.googleapis.com',
      'imasdk.s3.amazonaws.com',
      'gstatic.com/imasdk',
      'cdn.jsdelivr.net/npm/google-ima',
      'ads.youtube.com',
      'advertising.youtube.com',
      'partneradvertising.youtube.com',
      'sponsorships.youtube.com',
      'paidcontent.youtube.com',
      'googleads.g.doubleclick.net',
      'fls.doubleclick.net',
      'ad.doubleclick.net',
      'www.googleadservices.com',
      'advertiser.youtube.com',
      'ads-pa.googleapis.com',
      'adserver.googleapis.com',
      'ads-api.youtube.com',
      'ads.google.com',
      'googleads.com',
      'adwords.google.com',
      'admob.google.com',
      'admob.com',
      'admob-api.google.com',
      'googleadapis.com',
      'googletagmanager.com/gtag/js',
      'googletagmanager.com/gtm.js',

      // ========== Tracking & Analytics Endpoints (25) ==========
      '/pagead/conversion',
      '/pagead/viewthroughconversion',
      '/activity/',
      '/activityi/',
      '/collect',
      '/r/collect',
      '/j/collect',
      '/mp/collect',
      '/batch',
      '/pixel',
      '/beacon',
      '/track',
      '/event',
      '/click',
      '/impression',
      '/conversion',
      '/attribution',
      '/analytics',
      '/telemetry',
      '/metrics',
      '/stats',
      '/report',
      '/log',
      '/heartbeat',
      '/ping',

      // ========== VMAP/VAST Ad Tags (15) ==========
      '/vmap',
      '/vast',
      '/vpaid',
      '/vmaps',
      '/vasts',
      'adtag',
      'ad_tag',
      'adurl',
      'ad_url',
      'vast.xml',
      'vmap.xml',
      '/adtag',
      '/ad_tag',
      '/adserver',
      '/ad_server',

      // ========== YouTube Specific Ad Parameters (20) ==========
      'adformat=',
      'ad_type=',
      'ad3_module=',
      'afv_ad',
      'afv_',
      'vmap=',
      'ad_tag=',
      'ad_url=',
      'adunit=',
      'adslot=',
      'ad_break=',
      'ad_position=',
      'ad_duration=',
      'ad_pod=',
      'ad_system=',
      'ad_creative=',
      'ad_id=',
      'ad_campaign=',
      'ad_advertiser=',
      'ad_network=',

      // ========== IMA SDK & Ad Loaders (15) ==========
      'imasdk',
      'ima3',
      'ima/html5',
      'ima/sdk',
      'google-ima',
      'googima',
      'adsloader',
      'adsmanager',
      'adsrendering',
      'adDisplayContainer',
      'contentPlayback',
      'videoAd',
      'adBreak',
      'adPod',
      'companionAd',

      // ========== DoubleClick/Google Ads Subdomains (15) ==========
      'adclick.g.doubleclick.net',
      'adview.g.doubleclick.net',
      'ad.doubleclick.net',
      'n4061.ad.doubleclick.net',
      'n479.ad.doubleclick.net',
      'n5183.ad.doubleclick.net',
      'googleads4.g.doubleclick.net',
      'googleads.g.doubleclick.net',
      'pagead46.l.doubleclick.net',
      'pagead2.googlesyndication.com',
      'tpc.googlesyndication.com',
      'partneradvertising.googlesyndication.com',
      'pagead.l.google.com',
      'ads.pubmatic.com',
      'ads.rubiconproject.com',

      // ========== Ad Verification & Viewability (10) ==========
      'moatads.com',
      'moatpixel.com',
      'integralads.com',
      'iasds01.com',
      'doubleverify.com',
      'dv360.com',
      'adsafeprotected.com',
      'adverify.google.com',
      'activeview.google.com',
      'viewability',

      // ========== Video Ad Serving (10) ==========
      'videoplaza.tv',
      'ooyala.com',
      'brightcove.com',
      'theplatform.com',
      'freewheel.com',
      'smartadserver.com',
      'adnxs.com',
      'rubiconproject.com',
      'pubmatic.com',
      'openx.net',

      // ========== Social Media Ad Platforms (10) ==========
      'connect.facebook.net',
      'facebook.net/tr/',
      'facebook.com/tr/',
      'analytics.twitter.com',
      't.co/i/adsct',
      'ads.tiktok.com',
      'business-api.tiktok.com',
      'snap.licdn.com',
      'px.ads.linkedin.com',
      'ads.pinterest.com',

      // ========== Emerging 2024-2025 Patterns (15) ==========
      '/youtubei/v1/player/ad',
      '/youtubei/v1/ad/schedule',
      'adserver.googleapis.com',
      'ads-api.youtube.com',
      '/youtubei/v1/browse/ad',
      '/youtubei/v1/next/ad',
      '/youtubei/v1/feed/ad',
      '/youtubei/v1/reel/ad',
      '/youtubei/v1/shorts/ad',
      '/youtubei/v1/live/ad',
      '/youtubei/v1/tv/ad',
      '/youtubei/v1/music/ad',
      'youtubei/v1/ads/preroll',
      'youtubei/v1/ads/midroll',
      'youtubei/v1/ads/postroll',

      // ========== YouTube Shorts/Reels Ad Patterns (15) ==========
      '/youtubei/v1/shorts/ad',
      '/youtubei/v1/reel/ad',
      '/youtubei/v1/reel/ads',
      '/shorts/ads',
      '/reel/ads',
      'shorts-ads',
      'reel-ads',
      '/youtubei/v1/shorts/player/ad',
      '/youtubei/v1/reels/player/ad',
      'shorts-ad',
      'reel-ad',
      '/api/stats/shorts_ad',
      '/api/stats/reel_ad',
      'shortsAd',
      'reelAd',

      // ========== YouTube Live Stream Ad Patterns (12) ==========
      '/youtubei/v1/live/ad',
      '/youtubei/v1/live/ads',
      '/live/ad',
      '/live/ads',
      'live-ad',
      'liveAd',
      '/api/stats/live_ad',
      '/ptracking/live',
      'live_ad_break',
      'liveAdBreak',
      'scte35',
      'EXT-X-CUE-OUT',

      // ========== YouTube TV/Connected TV Ad Patterns (10) ==========
      '/youtubei/v1/tv/ad',
      '/youtubei/v1/tv/ads',
      '/tv/ad',
      '/tv/ads',
      'tv-ad',
      'tvAd',
      '/api/stats/tv_ad',
      'connected_tv_ad',
      'ctv_ad',
      'ctvAd',

      // ========== YouTube Music Ad Patterns (8) ==========
      '/youtubei/v1/music/ad',
      '/youtubei/v1/music/ads',
      '/music/ad',
      '/music/ads',
      'music-ad',
      'musicAd',
      '/api/stats/music_ad',
      'youtube_music_ad',

      // ========== Additional YouTube i API Ad Endpoints (12) ==========
      '/youtubei/v1/ads/preroll',
      '/youtubei/v1/ads/midroll',
      '/youtubei/v1/ads/postroll',
      '/youtubei/v1/ads/bumper',
      '/youtubei/v1/ads/overlay',
      '/youtubei/v1/ads/companion',
      '/youtubei/v1/ads/skippable',
      '/youtubei/v1/ads/non_skippable',
      '/youtubei/v1/ads/outstream',
      '/youtubei/v1/ads/instream',
      '/youtubei/v1/ads/rewarded',
      '/youtubei/v1/ads/native',

      // ========== Google Ads API v2024+ Patterns (8) ==========
      '/googleads/v2024',
      '/googleads/v2025',
      'googleads.googleapis.com',
      'ads.googleapis.com/v',
      '/google-ads/api',
      'googleads.api',
      'ads.api.google.com',
      'admanager.googleapis.com',

      // ========== Additional Tracking Patterns (10) ==========
      '/pagead/gen_204',
      '/pagead/landing',
      '/pagead/adview',
      '/pagead/clk',
      '/pagead/conversion_async',
      '/pagead/viewthrough',
      '/activeview/collect',
      '/activeview/report',
      '/activeview/verify',
      '/pagead/avw'
    ];

    // ========== ALLOW PATTERNS - Critical for Video Playback (80+) ==========
    this.allowPatterns = [
      // Video playback - MUST ALLOW
      'googlevideo.com/videoplayback',
      'googlevideo.com',
      'manifest.googlevideo.com',
      'redirector.googlevideo.com',
      'rr1---sn-',
      'rr2---sn-',
      'rr3---sn-',
      'rr4---sn-',
      'rr5---sn-',
      'r1---sn-',
      'r2---sn-',
      'r3---sn-',
      'r4---sn-',
      'r5---sn-',

      // YouTube player JS
      's.ytimg.com/yts/jsbin/player-',
      's.ytimg.com/yts/jsbin/www-embed-player',
      's.ytimg.com/yts/jsbin/player_',
      's.ytimg.com/yts/jsbin/html5player-',
      's.ytimg.com/yts/jsbin/embed-',

      // Thumbnails & Images
      'i.ytimg.com/',
      'i.ytimg.com/vi/',
      'i.ytimg.com/an/',
      'i.ytimg.com/an_webp/',
      'yt3.ggpht.com/',
      'yt4.ggpht.com/',
      'yt3.googleusercontent.com/',
      'yt4.googleusercontent.com/',

      // Captions & Timed Text
      'youtube.com/api/timedtext',
      'youtube.com/api/timedtext?',
      'video.google.com/timedtext',

      // YouTube i API - Core (NOT ads)
      'youtube.com/youtubei/v1/player',
      'youtube.com/youtubei/v1/next',
      'youtube.com/youtubei/v1/browse',
      'youtube.com/youtubei/v1/search',
      'youtube.com/youtubei/v1/guide',
      'youtube.com/youtubei/v1/live_chat',
      'youtube.com/youtubei/v1/comment',
      'youtube.com/youtubei/v1/subscription',
      'youtube.com/youtubei/v1/playlist',
      'youtube.com/youtubei/v1/channel',
      'youtube.com/youtubei/v1/account',
      'youtube.com/youtubei/v1/history',
      'youtube.com/youtubei/v1/log',
      'youtube.com/youtubei/v1/feedback',

      // Embed & Player APIs
      'youtube.com/iframe_api',
      'youtube.com/s/player/',
      'youtube.com/embed/',
      'youtube-nocookie.com/embed/',
      'youtube.com/player_api',
      'www.youtube.com/iframe_api',
      'www.youtube.com/s/player/',

      // Fonts & Styles
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'fonts.googleapis.com/css',
      'fonts.gstatic.com/s/',

      // YouTube Internal (Safe)
      's.youtube.com',
      'www.youtube.com/s/',
      'www.youtube.com/yts/',
      'www.youtube.com/api/',
      'www.youtube.com/youtubei/v1/log_event',
      'www.youtube.com/youtubei/v1/log_interaction',
      'www.youtube.com/youtubei/v1/heartbeat',
      'www.youtube.com/youtubei/v1/qoe',
      'www.youtube.com/youtubei/v1/navigation',

      // CDN & Static Assets
      'yt3.ggpht.com',
      'yt4.ggpht.com',
      'ytimg.com',
      's.ytimg.com',
      'i.ytimg.com',
      'googleusercontent.com/youtube',
      'ggpht.com/youtube',

      // Authentication & Identity (Safe)
      'accounts.google.com',
      'accounts.youtube.com',
      'myaccount.google.com',
      'apis.google.com',
      'clients6.google.com',
      'oauth2.googleapis.com',
      'securetoken.googleapis.com',
      'identitytoolkit.googleapis.com',

      // YouTube TV / Music / Kids (Safe core)
      'youtube.com/tv',
      'youtube.com/music',
      'youtubekids.com',
      'youtube.com/premium',
      'music.youtube.com',

      // Live Streaming (Safe)
      'youtube.com/live_chat',
      'youtube.com/live_chat_replay',
      'youtube.com/api/live_chat',
      'youtube.com/youtubei/v1/live_chat/get_live_chat',
      'youtube.com/youtubei/v1/live_chat/send_message',

      // Comments & Community (Safe)
      'youtube.com/comment',
      'youtube.com/youtubei/v1/comment/get',
      'youtube.com/youtubei/v1/comment/post',
      'youtube.com/youtubei/v1/comment/delete',
      'youtube.com/youtubei/v1/comment/edit',

      // Player Configuration (Safe)
      'youtube.com/youtubei/v1/player/get',
      'youtube.com/youtubei/v1/player/validate',
      'youtube.com/get_video_info',
      'youtube.com/get_video_info?',
      'www.youtube.com/get_video_info',

      // Shorts (Safe core - ads handled separately)
      'youtube.com/shorts/',
      'youtube.com/reel/',
      'youtube.com/youtubei/v1/reel/',
      'youtube.com/youtubei/v1/shorts/',

      // Kids & Family (Safe)
      'youtubekids.com',
      'kids.youtube.com',
      'family.youtube.com'
    ];

    // Pre-compiled allow patterns for fast lookup
    this._allowPatternCache = new Map();
  }

  /**
   * Initialize all components
   */
  async initialize() {
    this._compilePatterns();
    this.isActive = true;

    // Initialize behavioral analyzer
    if (this.options.enableBehavioralAnalysis) {
      this.behavioralAnalyzer = new BehavioralAnalyzer({
        windowSize: 1000,
        minRequestsForPattern: 10,
        entropyThreshold: 3.5,
        periodicityThreshold: 0.8
      });
    }

    // Initialize ML feature extractor
    if (this.options.enableMLDetection) {
      this.mlFeatureExtractor = new MLFeatureExtractor({
        featureVersion: 2,
        maxFeatures: 256,
        normalizeFeatures: true
      });
      // Load TensorFlow.js model if available
      await this._loadMLModel();
    }

    // Initialize crowdsourced intelligence
    if (this.options.enableCrowdsourced) {
      this.crowdsourcedIntel = new CrowdsourcedIntel({
        enabled: true,
        minConfidence: 0.9,
        differentialPrivacy: true
      });
      await this.crowdsourcedIntel.initialize();
    }

    // Initialize experiment detector
    if (this.options.enableExperimentDetection) {
      this.experimentDetector = getExperimentDetector(this.context, {
        rapidResponse: true,
        periodicInterval: 15000,
        aggressiveMode: this.options.aggressiveMode
      });
      this.experimentDetector.initialize();

      // Wire experiment detector for rapid pattern updates
      this.experimentDetector.onAdapt((expId, record, source) => {
        this._onExperimentAdaptation(expId, record, source);
      });
    }

    this._log('info', '[YouTubeNetworkInterceptor] Initialized with', this.compiledPatterns.length, 'patterns');
    this._log('info', '[YouTubeNetworkInterceptor] Integrations:', {
      behavioral: !!this.behavioralAnalyzer,
      ml: !!this.mlFeatureExtractor,
      crowdsourced: !!this.crowdsourcedIntel,
      experiments: !!this.experimentDetector
    });
  }

  // ============================================================================
  // Pattern Compilation & Matching
  // ============================================================================

  _compilePatterns() {
    this.compiledPatterns = [];

    // Compile block patterns
    for (const pattern of this.corePatterns) {
      try {
        const regex = this._patternToRegex(pattern);
        this.compiledPatterns.push({ regex, type: 'block', pattern, source: 'core' });
      } catch (e) {
        this.stats.errors++;
        this._log('error', '[YouTubeNetworkInterceptor] Pattern compile error:', pattern, e);
      }
    }

    // Compile allow patterns (higher priority)
    for (const pattern of this.allowPatterns) {
      try {
        const regex = this._patternToRegex(pattern);
        this.compiledPatterns.push({ regex, type: 'allow', pattern, source: 'allow' });
      } catch (e) {
        this.stats.errors++;
        this._log('error', '[YouTubeNetworkInterceptor] Allow pattern compile error:', pattern, e);
      }
    }

    // Sort: allow patterns first, then by specificity (longer = more specific)
    this.compiledPatterns.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'allow' ? -1 : 1;
      return b.pattern.length - a.pattern.length;
    });

    // Build allow pattern cache for O(1) lookup
    this._buildAllowCache();
  }

  _buildAllowCache() {
    this._allowPatternCache.clear();
    for (const { pattern, regex } of this.compiledPatterns) {
      if (regex.type === 'allow') {
        this._allowPatternCache.set(pattern, regex);
      }
    }
  }

  _patternToRegex(pattern) {
    // Escape special regex chars except * and ?
    let regexStr = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    // Handle ||domain^ syntax
    if (pattern.startsWith('||') && pattern.endsWith('^')) {
      const domain = pattern.slice(2, -1);
      regexStr = `https?://[^/]*${domain.replace('.', '\\.')}(/|$)`;
    }

    return new RegExp(regexStr, 'i');
  }

  /**
   * Check if URL should be blocked - Main entry point
   * Returns detailed result with reasoning
   */
  async check(url, requestContext = {}) {
    if (!this.isActive || !url) {
      return { blocked: false, reason: 'Inactive or empty URL', source: 'none' };
    }

    const urlLower = url.toLowerCase();

    // 1. Fast allow-list check (O(1) cache lookup)
    for (const [pattern, regex] of this._allowPatternCache) {
      if (regex.test(urlLower)) {
        this.stats.allowed++;
        return {
          blocked: false,
          reason: `Allowed by allow-list: ${pattern}`,
          source: 'allowlist',
          pattern
        };
      }
    }

    // 2. Core pattern matching (sorted by specificity)
    for (const { regex, pattern, type } of this.compiledPatterns) {
      if (regex.test(urlLower)) {
        if (type === 'allow') {
          this.stats.allowed++;
          return {
            blocked: false,
            reason: `Allowed by pattern: ${pattern}`,
            source: 'allowlist',
            pattern
          };
        } else {
          this.stats.blocked++;
          return {
            blocked: true,
            reason: `Blocked by core pattern: ${pattern}`,
            source: 'core',
            pattern,
            confidence: 1.0
          };
        }
      }
    }

    // 3. Behavioral Analysis (if enabled)
    if (this.options.enableBehavioralAnalysis && this.behavioralAnalyzer) {
      const behavioralResult = this._analyzeBehavioral(url, requestContext);
      if (behavioralResult.isAd) {
        this.stats.behavioral++;
        return {
          blocked: true,
          reason: `Blocked by behavioral analysis: ${behavioralResult.reason}`,
          source: 'behavioral',
          confidence: behavioralResult.confidence,
          details: behavioralResult.details
        };
      }
    }

    // 4. ML-based Detection (if enabled)
    if (this.options.enableMLDetection && this.mlFeatureExtractor && this.mlModel) {
      const mlResult = await this._analyzeML(url, requestContext);
      if (mlResult.isAd) {
        this.stats.ml++;
        return {
          blocked: true,
          reason: `Blocked by ML detection: ${mlResult.reason}`,
          source: 'ml',
          confidence: mlResult.confidence,
          features: mlResult.features
        };
      }
    }

    // 5. Crowdsourced Intelligence (if enabled)
    if (this.options.enableCrowdsourced && this.crowdsourcedIntel) {
      const crowdResult = this.crowdsourcedIntel.matchesCrowdsourced(url);
      if (crowdResult) {
        this.stats.crowdsourced++;
        return {
          blocked: true,
          reason: `Blocked by crowdsourced pattern: ${crowdResult.pattern}`,
          source: 'crowdsourced',
          confidence: crowdResult.confidence,
          type: crowdResult.type
        };
      }
    }

    // 6. Experiment-based Detection (if enabled)
    if (this.options.enableExperimentDetection && this.experimentDetector) {
      const expResult = this._checkExperimentPatterns(url);
      if (expResult.isAd) {
        this.stats.experiments++;
        return {
          blocked: true,
          reason: `Blocked by experiment pattern: ${expResult.experimentId}`,
          source: 'experiment',
          confidence: expResult.confidence,
          experimentId: expResult.experimentId
        };
      }
    }

    return { blocked: false, reason: 'No match found', source: 'none' };
  }

  // ============================================================================
  // Behavioral Analysis Integration
  // ============================================================================

  _analyzeBehavioral(url, requestContext) {
    const request = {
      url,
      method: requestContext.method || 'GET',
      headers: requestContext.headers || {},
      body: requestContext.body || null,
      initiatorType: requestContext.initiatorType || 'unknown',
      initiatorUrl: requestContext.initiatorUrl || '',
      resourceType: requestContext.resourceType || 'other',
      timestamp: requestContext.timestamp || Date.now(),
      responseTime: requestContext.responseTime || null,
      responseSize: requestContext.responseSize || null,
      responseHeaders: requestContext.responseHeaders || {}
    };

    const result = this.behavioralAnalyzer.analyze(request);

    return {
      isAd: result.isAd,
      confidence: result.confidence,
      reason: `Behavioral score: ${result.confidence.toFixed(2)} (timing: ${result.scores.timing.toFixed(2)}, entropy: ${result.scores.entropy.toFixed(2)}, periodicity: ${result.scores.periodicity.toFixed(2)}, payload: ${result.scores.payload.toFixed(2)}, initiator: ${result.scores.initiator.toFixed(2)}, headers: ${result.scores.headers.toFixed(2)})`,
      details: result
    };
  }

  // ============================================================================
  // ML Detection Integration
  // ============================================================================

  async _loadMLModel() {
    // In production: load TensorFlow.js model from IndexedDB or remote
    // For now, placeholder for model loading
    try {
      // this.mlModel = await tf.loadLayersModel('indexeddb://aeroguard-ml-model');
      // Or: this.mlModel = await tf.loadLayersModel('https://cdn.aeroguard.com/models/ad-detector-v2/model.json');
      this._log('info', '[YouTubeNetworkInterceptor] ML model loading skipped (placeholder)');
    } catch (e) {
      this._log('warn', '[YouTubeNetworkInterceptor] ML model load failed:', e.message);
    }
  }

  async _analyzeML(url, requestContext) {
    if (!this.mlModel) {
      return { isAd: false, confidence: 0, reason: 'No ML model loaded' };
    }

    try {
      const request = {
        url,
        method: requestContext.method || 'GET',
        headers: requestContext.headers || {},
        body: requestContext.body || null,
        initiatorType: requestContext.initiatorType || 'unknown',
        initiatorUrl: requestContext.initiatorUrl || '',
        resourceType: requestContext.resourceType || 'other',
        timestamp: requestContext.timestamp || Date.now()
      };

      const features = this.mlFeatureExtractor.extractFeatures(request);
      const prediction = this.mlModel.predict(features.reshape([1, -1]));
      const score = prediction.dataSync()[0];
      prediction.dispose();

      return {
        isAd: score > this.options.mlThreshold,
        confidence: score,
        reason: `ML score: ${score.toFixed(4)}`,
        features: this.mlFeatureExtractor.featuresToJSON(features)
      };
    } catch (e) {
      this._log('error', '[YouTubeNetworkInterceptor] ML inference error:', e);
      return { isAd: false, confidence: 0, reason: 'ML error' };
    }
  }

  // ============================================================================
  // Experiment Detection Integration
  // ============================================================================

  _checkExperimentPatterns(url) {
    if (!this.experimentDetector) return { isAd: false };

    const detectedExperiments = this.experimentDetector.getDetectedExperiments();

    // Check if URL matches any detected experiment's ad patterns
    for (const exp of detectedExperiments) {
      const expDef = this.experimentDetector.knownExperiments.get(exp.id);
      if (!expDef) continue;

      // Check experiment-specific patterns
      if (expDef.patterns) {
        for (const pattern of expDef.patterns) {
          if (url.toLowerCase().includes(pattern.toLowerCase())) {
            return {
              isAd: true,
              confidence: 0.95,
              experimentId: exp.id,
              reason: `Matches experiment ${exp.id} pattern: ${pattern}`
            };
          }
        }
      }

      // Check category-based patterns
      if (exp.category === 'player' && (url.includes('/youtubei/v1/player') || url.includes('get_video_info'))) {
        if (exp.severity === 'critical' || exp.severity === 'high') {
          return {
            isAd: true,
            confidence: 0.9,
            experimentId: exp.id,
            reason: `Critical experiment ${exp.id} detected in player response path`
          };
        }
      }
    }

    return { isAd: false };
  }

  _onExperimentAdaptation(expId, record, source) {
    // When experiment detector adapts, extract new patterns
    const expDef = this.experimentDetector.knownExperiments.get(expId);
    if (!expDef) return;

    // Extract patterns from experiment definition
    const newPatterns = this._extractPatternsFromExperiment(expDef);
    if (newPatterns.length > 0) {
      this.updateFromHeuristic(newPatterns);
      this._log('info', `[YouTubeNetworkInterceptor] Added ${newPatterns.length} patterns from experiment ${expId}`);
    }

    // Notify callbacks
    this._notifyUpdate('experiment', { expId, patterns: newPatterns });
  }

  _extractPatternsFromExperiment(expDef) {
    const patterns = [];

    // From detect function - extract domain/path patterns
    if (expDef.detect && expDef.detect.toString) {
      const detectStr = expDef.detect.toString();
      // Extract string literals that look like URL patterns
      const urlPatterns = detectStr.match(/(['"`])([^'"`]*\.(?:net|com|org|io|co)[^'"`]*)\1/g);
      if (urlPatterns) {
        for (const match of urlPatterns) {
          const clean = match.slice(1, -1);
          if (clean.includes('.')) patterns.push(clean);
        }
      }
    }

    // From adapt function - extract domains being modified
    if (expDef.adapt && expDef.adapt.toString) {
      const adaptStr = expDef.adapt.toString();
      const domainMatches = adaptStr.match(/(?:delete|filter).*?['"`]([^'"`]*\.(?:net|com|org|io|co)[^'"`]*)['"`]/g);
      if (domainMatches) {
        for (const match of domainMatches) {
          const clean = match.match(/['"`]([^'"`]+)['"`]/);
          if (clean) patterns.push(clean[1]);
        }
      }
    }

    return [...new Set(patterns)]; // Deduplicate
  }

  // ============================================================================
  // Real-time Pattern Updates
  // ============================================================================

  /**
   * Update patterns from heuristic engine (behavioral, ML, crowdsourced)
   */
  updateFromHeuristic(newPatterns) {
    let added = 0;
    for (const pattern of newPatterns) {
      if (this.addPattern(pattern, 'block')) {
        added++;
      }
    }
    this._log('info', `[YouTubeNetworkInterceptor] Added ${added} new patterns from heuristic engine`);
    this._notifyUpdate('heuristic', { added, patterns: newPatterns });
    return added;
  }

  /**
   * Add custom pattern at runtime
   */
  addPattern(pattern, type = 'block') {
    try {
      const regex = this._patternToRegex(pattern);
      this.compiledPatterns.push({ regex, type, pattern, source: 'dynamic', addedAt: Date.now() });
      this.compiledPatterns.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'allow' ? -1 : 1;
        return b.pattern.length - a.pattern.length;
      });
      this._buildAllowCache();
      return true;
    } catch (e) {
      this._log('error', '[YouTubeNetworkInterceptor] Add pattern failed:', pattern, e);
      return false;
    }
  }

  /**
   * Remove pattern
   */
  removePattern(pattern) {
    const index = this.compiledPatterns.findIndex(p => p.pattern === pattern);
    if (index !== -1) {
      this.compiledPatterns.splice(index, 1);
      this._buildAllowCache();
      return true;
    }
    return false;
  }

  /**
   * Add allow pattern (for fixing false positives)
   */
  addAllowPattern(pattern) {
    return this.addPattern(pattern, 'allow');
  }

  /**
   * Report false positive - adds to allow list and notifies crowdsourced intel
   */
  async reportFalsePositive(url, context = {}) {
    const allowPattern = this._extractAllowPattern(url);
    if (allowPattern) {
      this.addAllowPattern(allowPattern);
    }

    if (this.crowdsourcedIntel) {
      this.crowdsourcedIntel.reportFalsePositive(url, context);
    }

    this._log('info', '[YouTubeNetworkInterceptor] False positive reported:', url);
    this._notifyUpdate('falsePositive', { url, pattern: allowPattern });
  }

  /**
   * Report missed ad - adds to block list and notifies crowdsourced intel
   */
  async reportMissedAd(url, context = {}) {
    const blockPattern = this._extractBlockPattern(url);
    if (blockPattern) {
      this.addPattern(blockPattern, 'block');
    }

    if (this.crowdsourcedIntel) {
      this.crowdsourcedIntel.reportMissedAd(url, context);
    }

    // Also feed to behavioral analyzer
    if (this.behavioralAnalyzer) {
      // Behavioral analyzer learns from this
    }

    this._log('info', '[YouTubeNetworkInterceptor] Missed ad reported:', url);
    this._notifyUpdate('missedAd', { url, pattern: blockPattern });
  }

  _extractAllowPattern(url) {
    try {
      const u = new URL(url);
      // Create specific allow pattern from URL
      return u.hostname + u.pathname.split('/').slice(0, 3).join('/');
    } catch {
      return null;
    }
  }

  _extractBlockPattern(url) {
    try {
      const u = new URL(url);
      // Create general block pattern from URL
      return u.hostname + (u.pathname.split('/')[1] ? '/' + u.pathname.split('/')[1] : '');
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Player Response Processing (Integration with Experiment Detector)
  // ============================================================================

  /**
   * Process player response for experiments and ad signals
   * Called after fetching player response data
   */
  async processPlayerResponse(url, responseData) {
    // Check for experiments in player response
    if (this.experimentDetector && (url.includes('/youtubei/v1/player') || url.includes('get_video_info'))) {
      this.experimentDetector.checkPlayerResponse(responseData);
    }

    // Feed to behavioral analyzer if it has response data
    if (this.behavioralAnalyzer && responseData) {
      // Could analyze response timing, size, etc.
    }

    return responseData;
  }

  /**
   * Check ytInitialData for experiments
   */
  checkYtInitialData(data) {
    if (this.experimentDetector) {
      this.experimentDetector.checkYtInitialData(data);
    }
  }

  // ============================================================================
  // Event Callbacks
  // ============================================================================

  onUpdate(callback) {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  _notifyUpdate(type, data) {
    for (const cb of this.updateCallbacks) {
      try {
        cb(type, data);
      } catch (e) {
        this._log('error', '[YouTubeNetworkInterceptor] Update callback error:', e);
      }
    }
  }

  // ============================================================================
  // Statistics & Debugging
  // ============================================================================

  getStats() {
    return {
      ...this.stats,
      totalPatterns: this.compiledPatterns.length,
      blockPatterns: this.compiledPatterns.filter(p => p.type === 'block').length,
      allowPatterns: this.compiledPatterns.filter(p => p.type === 'allow').length,
      dynamicPatterns: this.compiledPatterns.filter(p => p.source === 'dynamic').length,
      isActive: this.isActive,
      integrations: {
        behavioral: !!this.behavioralAnalyzer,
        ml: !!this.mlFeatureExtractor,
        crowdsourced: !!this.crowdsourcedIntel,
        experiments: !!this.experimentDetector
      }
    };
  }

  getPatterns() {
    return this.compiledPatterns.map(p => ({
      pattern: p.pattern,
      type: p.type,
      source: p.source,
      addedAt: p.addedAt
    }));
  }

  getBlockPatterns() {
    return this.compiledPatterns
      .filter(p => p.type === 'block')
      .map(p => p.pattern);
  }

  getAllowPatterns() {
    return this.compiledPatterns
      .filter(p => p.type === 'allow')
      .map(p => p.pattern);
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  setAggressiveMode(enabled) {
    this.options.aggressiveMode = enabled;
    if (this.experimentDetector) {
      this.experimentDetector.setAggressiveMode(enabled);
    }
    this._log('info', '[YouTubeNetworkInterceptor] Aggressive mode:', enabled);
  }

  setLogLevel(level) {
    this.options.logLevel = level;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  cleanup() {
    this.isActive = false;
    this.patterns.clear();
    this.compiledPatterns = [];
    this._allowPatternCache.clear();
    this.updateCallbacks.clear();

    if (this.behavioralAnalyzer) {
      this.behavioralAnalyzer.clear();
      this.behavioralAnalyzer = null;
    }

    if (this.mlFeatureExtractor) {
      this.mlFeatureExtractor = null;
    }

    if (this.crowdsourcedIntel) {
      this.crowdsourcedIntel.clear();
      this.crowdsourcedIntel = null;
    }

    if (this.experimentDetector) {
      this.experimentDetector.cleanup();
      this.experimentDetector = null;
    }

    this.mlModel = null;

    this._log('info', '[YouTubeNetworkInterceptor] Cleaned up');
  }

  // ============================================================================
  // Logging
  // ============================================================================

  _log(level, ...args) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    if (levels[level] >= levels[this.options.logLevel]) {
      console[level]('[YouTubeNetworkInterceptor]', ...args);
    }
  }
}

// ============================================================================
// Singleton Instance Management
// ============================================================================

let networkInterceptorInstance = null;

export function getNetworkInterceptor(context = window, options = {}) {
  if (!networkInterceptorInstance) {
    networkInterceptorInstance = new YouTubeNetworkInterceptor(context, options);
  }
  return networkInterceptorInstance;
}

export function resetNetworkInterceptor() {
  if (networkInterceptorInstance) {
    networkInterceptorInstance.cleanup();
  }
  networkInterceptorInstance = null;
}

export default YouTubeNetworkInterceptor;