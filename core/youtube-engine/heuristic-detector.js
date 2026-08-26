/**
 * YouTube Heuristic Detector — Behavioral ad detection, timing patterns, payload analysis, ML-ready
 * Integrates: TimingAnalyzer, PayloadAnalyzer, DOMMutationAnalyzer, NetworkPatternAnalyzer
 * ML-ready feature extraction compatible with MLFeatureExtractor
 * Ensemble scoring with learning loop feedback
 */

// ============================================================================
// Core Detector Class
// ============================================================================

export class YouTubeHeuristicDetector {
  constructor(context = window, options = {}) {
    this.context = context;
    this.document = context.document;
    this.options = {
      confidenceThreshold: options.confidenceThreshold || 0.85,
      maxHistorySize: options.maxHistorySize || 1000,
      minRequestsForPattern: options.minRequestsForPattern || 10,
      entropyThreshold: options.entropyThreshold || 3.5,
      periodicityThreshold: options.periodicityThreshold || 0.8,
      enableMLFeatures: options.enableMLFeatures !== false,
      enableLearning: options.enableLearning !== false,
      ...options
    };

    this.isActive = false;
    this.stats = {
      detected: 0,
      falsePositives: 0,
      requestsAnalyzed: 0,
      timingScore: 0,
      payloadScore: 0,
      domScore: 0,
      networkScore: 0
    };

    // Request history for pattern analysis
    this.requestHistory = [];
    this.domainHistory = new Map();
    this.initiatorHistory = new Map();

    // Detection models
    this.models = {
      timing: new TimingAnalyzer(this.options),
      payload: new PayloadAnalyzer(this.options),
      dom: new DOMMutationAnalyzer(this.options),
      network: new NetworkPatternAnalyzer(this.options)
    };

    // ML Feature Extractor (lazy loaded)
    this.mlExtractor = null;

    // Detected ad requests
    this.detectedAds = new Set();

    // Learning loop integration
    this.learningBuffer = [];
    this.feedbackCallbacks = new Set();

    // Confidence threshold
    this.confidenceThreshold = this.options.confidenceThreshold;

    // Ensemble weights (adjustable based on feedback)
    this.ensembleWeights = {
      timing: 0.25,
      payload: 0.25,
      dom: 0.25,
      network: 0.25
    };
  }

  /**
   * Initialize heuristic detection
   */
  initialize() {
    if (this.isActive) return;

    // Initialize ML feature extractor if enabled
    if (this.options.enableMLFeatures) {
      this._initMLExtractor();
    }

    // Hook into fetch/XHR
    this._hookNetwork();

    // Observe DOM mutations
    this._observeDOM();

    // Periodic analysis
    this._startPeriodicAnalysis();

    this.isActive = true;
    console.log('[YouTubeHeuristicDetector] Initialized with ML features:', this.options.enableMLFeatures);
  }

  _initMLExtractor() {
    try {
      // Dynamic import to avoid circular dependency
      import('../heuristic-engine/ml-feature-extractor.js').then(module => {
        this.mlExtractor = new module.MLFeatureExtractor({
          featureVersion: 2,
          maxFeatures: 256,
          normalizeFeatures: true
        });
        console.log('[YouTubeHeuristicDetector] ML Feature Extractor loaded');
      }).catch(() => {
        console.warn('[YouTubeHeuristicDetector] ML Feature Extractor not available');
      });
    } catch (e) {
      console.warn('[YouTubeHeuristicDetector] ML Feature Extractor import failed:', e.message);
    }
  }

  /**
   * Hook into fetch and XHR for network monitoring
   */
  _hookNetwork() {
    const originalFetch = this.context.fetch;
    this.originalFetch = originalFetch;

    this.context.fetch = async (...args) => {
      const url = args[0];
      const startTime = this.context.performance.now();

      const response = await originalFetch.apply(this.context, args);

      const endTime = this.context.performance.now();
      const duration = endTime - startTime;

      // Analyze request
      this._analyzeRequest({
        url,
        method: args[1]?.method || 'GET',
        headers: args[1]?.headers,
        body: args[1]?.body,
        duration,
        responseStatus: response.status,
        responseHeaders: response.headers,
        initiatorType: 'fetch',
        timestamp: Date.now()
      });

      return response;
    };

    // Hook XHR
    const originalXHROpen = this.context.XMLHttpRequest.prototype.open;
    const originalXHRSend = this.context.XMLHttpRequest.prototype.send;

    this.context.XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._xhrUrl = url;
      this._xhrMethod = method;
      this._xhrStartTime = this.context.performance.now();
      return originalXHROpen.apply(this, [method, url, ...args]);
    }.bind(this);

    this.context.XMLHttpRequest.prototype.send = function(...args) {
      this._xhrBody = args[0];
      return originalXHRSend.apply(this, args);
    };

    const originalOnLoad = this.context.XMLHttpRequest.prototype.onload;
    this.context.XMLHttpRequest.prototype.onload = function() {
      const duration = this.context.performance.now() - this._xhrStartTime;
      this._analyzeRequest({
        url: this._xhrUrl,
        method: this._xhrMethod,
        body: this._xhrBody,
        duration,
        responseStatus: this.status,
        initiatorType: 'xmlhttprequest',
        timestamp: Date.now()
      });
      if (originalOnLoad) originalOnLoad.apply(this, arguments);
    }.bind(this);
  }

  /**
   * Main request analysis entry point
   */
  _analyzeRequest(request) {
    this.stats.requestsAnalyzed++;

    // Skip non-YouTube requests
    if (!this._isYouTubeRequest(request.url)) return;

    // Add to history
    this._addToHistory(request);

    // Extract ML features if available
    let mlFeatures = null;
    if (this.mlExtractor) {
      try {
        mlFeatures = this.mlExtractor.extractFeatures(request);
      } catch (e) {
        console.warn('[YouTubeHeuristicDetector] ML feature extraction failed:', e.message);
      }
    }

    // Run all detection models
    const scores = {
      timing: this.models.timing.analyze(request, this.requestHistory),
      payload: this.models.payload.analyze(request),
      dom: this.models.dom.analyze(request, this.document),
      network: this.models.network.analyze(request, this.requestHistory)
    };

    // Update stats
    this.stats.timingScore = scores.timing;
    this.stats.payloadScore = scores.payload;
    this.stats.domScore = scores.dom;
    this.stats.networkScore = scores.network;

    // Ensemble scoring
    const ensembleScore = this._calculateEnsembleScore(scores);

    // Apply learning adjustments
    const adjustedScore = this._applyLearningAdjustments(request, ensembleScore);

    if (adjustedScore > this.confidenceThreshold) {
      this._reportAd(request, adjustedScore, scores, mlFeatures);
    }

    // Store for learning
    if (this.options.enableLearning) {
      this.learningBuffer.push({
        request,
        scores,
        ensembleScore: adjustedScore,
        mlFeatures,
        timestamp: Date.now()
      });
      if (this.learningBuffer.length > 100) this.learningBuffer.shift();
    }
  }

  /**
   * Calculate weighted ensemble score
   */
  _calculateEnsembleScore(scores) {
    return (
      scores.timing * this.ensembleWeights.timing +
      scores.payload * this.ensembleWeights.payload +
      scores.dom * this.ensembleWeights.dom +
      scores.network * this.ensembleWeights.network
    );
  }

  /**
   * Apply learning-based adjustments to score
   */
  _applyLearningAdjustments(request, score) {
    // Check for known false positive patterns
    const url = request.url;
    for (const feedback of this.learningBuffer) {
      if (feedback.request.url === url && feedback.wasFalsePositive) {
        return score * 0.5; // Reduce confidence for known false positives
      }
    }
    return score;
  }

  _isYouTubeRequest(url) {
    const youtubeDomains = [
      'youtube.com', 'youtube-nocookie.com', 'googlevideo.com',
      'ytimg.com', 'doubleclick.net', 'googlesyndication.com',
      'googleadservices.com', 'googletagmanager.com', 'imasdk.googleapis.com',
      'googletagservices.com', 'pagead2.googlesyndication.com',
      'pubads.g.doubleclick.net', 'securepubads.g.doubleclick.net',
      'adservice.google.com', 'googleads.g.doubleclick.net',
      'ads.youtube.com', 'advertising.youtube.com',
      'partneradvertising.youtube.com', 'sponsorships.youtube.com',
      'paidcontent.youtube.com', 'ads-pa.googleapis.com',
      'adserver.googleapis.com', 'ads-api.youtube.com',
      'fls.doubleclick.net', 'ad.doubleclick.net',
      'www.googleadservices.com', 'advertiser.youtube.com',
      'gstatic.com/imasdk', 'cdn.jsdelivr.net/npm/google-ima',
      'imasdk.s3.amazonaws.com', 'yt3.ggpht.com'
    ];

    return youtubeDomains.some(domain => url.includes(domain));
  }

  _addToHistory(request) {
    this.requestHistory.push(request);
    if (this.requestHistory.length > this.options.maxHistorySize) {
      this.requestHistory.shift();
    }

    // Domain-specific history
    try {
      const domain = new URL(request.url).hostname;
      if (!this.domainHistory.has(domain)) {
        this.domainHistory.set(domain, []);
      }
      const domainHist = this.domainHistory.get(domain);
      domainHist.push({ timestamp: request.timestamp, ...request });
      if (domainHist.length > this.options.maxHistorySize) domainHist.shift();
    } catch (e) {}
  }

  _reportAd(request, confidence, scores, mlFeatures) {
    const key = `${request.url}|${request.method}`;
    if (this.detectedAds.has(key)) return;

    this.detectedAds.add(key);
    this.stats.detected++;

    const detection = {
      url: request.url,
      method: request.method,
      confidence: confidence.toFixed(3),
      scores,
      mlFeatures: mlFeatures ? this.mlExtractor.featuresToJSON(mlFeatures) : null,
      timestamp: Date.now(),
      initiatorType: request.initiatorType
    };

    console.log('[YouTubeHeuristicDetector] Heuristic ad detected:', detection);

    // Dispatch event for coordinator
    this.context.dispatchEvent(new CustomEvent('aeroguard:heuristic-ad', {
      detail: detection
    }));

    // Trigger feedback callbacks
    for (const callback of this.feedbackCallbacks) {
      try {
        callback(detection);
      } catch (e) {}
    }
  }

  /**
   * Observe DOM mutations for ad elements
   */
  _observeDOM() {
    this.domObserver = new this.context.MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === this.context.Node.ELEMENT_NODE) {
              this.models.dom.processNode(node, this.document);
            }
          }
        }
      }
    });

    this.domObserver.observe(this.document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'id', 'src', 'data-ad', 'data-ad-slot', 'data-ad-client']
    });
  }

  _startPeriodicAnalysis() {
    this.periodicTimer = setInterval(() => {
      this._analyzePatterns();
    }, 60000); // Every minute
  }

  /**
   * Analyze accumulated patterns for periodicity, clustering
   */
  _analyzePatterns() {
    // Look for periodic requests per domain
    for (const [domain, timestamps] of this.domainHistory) {
      if (timestamps.length < 5) continue;

      const sorted = [...timestamps].sort((a, b) => a.timestamp - b.timestamp);
      const intervals = [];
      for (let i = 1; i < sorted.length; i++) {
        intervals.push(sorted[i].timestamp - sorted[i - 1].timestamp);
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
      const cv = Math.sqrt(variance) / avgInterval;

      if (cv < 0.2 && avgInterval > 10000 && avgInterval < 120000) {
        console.log('[YouTubeHeuristicDetector] Periodic requests detected:', domain, `every ${(avgInterval/1000).toFixed(1)}s`);
        // Could flag domain as tracking/heartbeat
        this._flagPeriodicDomain(domain, avgInterval);
      }
    }

    // Analyze request clustering (burst detection)
    this._detectRequestBursts();
  }

  _flagPeriodicDomain(domain, interval) {
    this.context.dispatchEvent(new CustomEvent('aeroguard:periodic-domain', {
      detail: { domain, interval, type: 'tracking-heartbeat' }
    }));
  }

  _detectRequestBursts() {
    // Detect bursts of requests to same domain in short time
    const now = Date.now();
    const recent = this.requestHistory.filter(r => now - r.timestamp < 10000); // Last 10s

    const byDomain = new Map();
    for (const req of recent) {
      try {
        const domain = new URL(req.url).hostname;
        if (!byDomain.has(domain)) byDomain.set(domain, []);
        byDomain.get(domain).push(req);
      } catch {}
    }

    for (const [domain, reqs] of byDomain) {
      if (reqs.length >= 10) {
        console.log('[YouTubeHeuristicDetector] Request burst detected:', domain, reqs.length, 'requests in 10s');
        this.context.dispatchEvent(new CustomEvent('aeroguard:request-burst', {
          detail: { domain, count: reqs.length, requests: reqs }
        }));
      }
    }
  }

  /**
   * Analyze a specific request manually
   */
  analyzeRequest(request) {
    this._analyzeRequest(request);
  }

  /**
   * Get ML feature vector for a request
   */
  getMLFeatures(request) {
    if (!this.mlExtractor) return null;
    return this.mlExtractor.extractFeatures(request);
  }

  /**
   * Register feedback callback for learning
   */
  onDetection(callback) {
    this.feedbackCallbacks.add(callback);
    return () => this.feedbackCallbacks.delete(callback);
  }

  /**
   * Report false positive for learning
   */
  reportFalsePositive(url, context = {}) {
    this.stats.falsePositives++;

    // Mark in learning buffer
    for (const item of this.learningBuffer) {
      if (item.request.url === url) {
        item.wasFalsePositive = true;
      }
    }

    // Adjust ensemble weights if too many false positives
    if (this.stats.falsePositives > this.stats.detected * 0.1) {
      this._adjustWeightsForPrecision();
    }

    this.context.dispatchEvent(new CustomEvent('aeroguard:false-positive', {
      detail: { url, context }
    }));
  }

  _adjustWeightsForPrecision() {
    // Increase weight of more precise models, decrease noisy ones
    // This is a simplified adjustment - in production use proper optimization
    const total = this.stats.timingScore + this.stats.payloadScore + this.stats.domScore + this.stats.networkScore;
    if (total > 0) {
      this.ensembleWeights.timing = Math.max(0.15, this.stats.timingScore / total * 0.8 + 0.1);
      this.ensembleWeights.payload = Math.max(0.15, this.stats.payloadScore / total * 0.8 + 0.1);
      this.ensembleWeights.dom = Math.max(0.15, this.stats.domScore / total * 0.8 + 0.1);
      this.ensembleWeights.network = Math.max(0.15, this.stats.networkScore / total * 0.8 + 0.1);

      // Renormalize
      const sum = Object.values(this.ensembleWeights).reduce((a, b) => a + b, 0);
      for (const key of Object.keys(this.ensembleWeights)) {
        this.ensembleWeights[key] /= sum;
      }
    }
  }

  getStats() {
    return {
      ...this.stats,
      ensembleWeights: { ...this.ensembleWeights },
      historySize: this.requestHistory.length,
      domainCount: this.domainHistory.size,
      learningBufferSize: this.learningBuffer.length
    };
  }

  /**
   * Set confidence threshold
   */
  setThreshold(threshold) {
    this.confidenceThreshold = Math.max(0.5, Math.min(0.99, threshold));
  }

  /**
   * Export learning data for model training
   */
  exportLearningData() {
    return {
      detections: Array.from(this.detectedAds),
      buffer: this.learningBuffer,
      stats: this.getStats(),
      timestamp: Date.now()
    };
  }

  cleanup() {
    if (this.originalFetch) {
      this.context.fetch = this.originalFetch;
    }
    if (this.domObserver) {
      this.domObserver.disconnect();
    }
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
    }
    this.isActive = false;
  }
}

// ============================================================================
// Detection Models
// ============================================================================

class TimingAnalyzer {
  constructor(options) {
    this.options = options;
  }

  analyze(request, history) {
    let score = 0;

    // Very fast response (< 50ms) - likely cached or blocked
    if (request.duration !== undefined && request.duration < 50) {
      score += 0.3;
    }

    // Requests at regular intervals (heartbeat/tracking)
    const domainReqs = history.filter(r => {
      try { return new URL(r.url).hostname === new URL(request.url).hostname; } catch { return false; }
    });

    if (domainReqs.length >= 3) {
      const timestamps = domainReqs.map(r => r.timestamp).sort((a, b) => a - b);
      const intervals = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(timestamps[i] - timestamps[i - 1]);
      }

      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / intervals.length;
      const cv = Math.sqrt(variance) / avg;

      if (cv < 0.2 && avg > 5000 && avg < 300000) {
        score += 0.4; // Highly periodic
      }
    }

    // Beacon/fetch with no response body
    if (request.initiatorType === 'beacon' || request.responseStatus === 204) {
      score += 0.3;
    }

    // Very short interval since last request to same domain (< 1s)
    if (domainReqs.length >= 2) {
      const lastTwo = domainReqs.slice(-2);
      const interval = lastTwo[1].timestamp - lastTwo[0].timestamp;
      if (interval < 1000) score += 0.2;
    }

    // Request during video playback (check if video is playing)
    if (this._isVideoPlaying()) {
      score += 0.1;
    }

    return Math.min(1, score);
  }

  _isVideoPlaying() {
    try {
      const video = this.context.document.querySelector('video.html5-main-video, video#movie_player');
      return video && !video.paused && video.currentTime > 0;
    } catch { return false; }
  }
}

class PayloadAnalyzer {
  constructor(options) {
    this.options = options;

    // Ad-specific parameters
    this.adParams = new Set([
      'adformat', 'ad_type', 'ad3_module', 'afv', 'vmap', 'ad_tag', 'ad_url',
      'adunit', 'adslot', 'ad_client', 'ad_width', 'ad_height', 'ad_format',
      'ad_rule', 'ad_pod', 'ad_duration', 'ad_system', 'ad_title', 'ad_id',
      'vast', 'vpaid', 'omid', 'skippable', 'linear', 'nonlinear', 'companion',
      'preroll', 'midroll', 'postroll', 'bumper', 'overlay', 'banner', 'display'
    ]);

    // Tracking parameters
    this.trackingParams = new Set([
      'tid', 'cid', 'uid', 'sid', 'pid', 'eid', 'event', 'action', 'category',
      'label', 'value', 'client_id', 'user_id', 'session_id', 'device_id',
      'advertising_id', 'ga', 'fbp', 'fbc', 'gclid', 'fbclid', 'msclkid',
      'ttclid', 'li_fat_id', '_ga', '_gid', 'utm_source', 'utm_medium',
      'utm_campaign', 'utm_term', 'utm_content'
    ]);
  }

  analyze(request) {
    if (!request.body) return 0;

    let score = 0;
    const bodyStr = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);

    // Small payload = beacon/tracking
    if (bodyStr.length < 500) score += 0.2;

    // High entropy = encoded data
    const entropy = this._entropy(bodyStr);
    if (entropy > this.options.entropyThreshold && bodyStr.length < 1000) score += 0.3;

    // Tracking parameters
    for (const param of this.trackingParams) {
      if (bodyStr.includes(param)) { score += 0.1; break; }
    }

    // Ad parameters
    for (const param of this.adParams) {
      if (bodyStr.includes(param)) { score += 0.5; break; }
    }

    // VAST/VPAID XML indicators
    if (bodyStr.includes('<VAST') || bodyStr.includes('<Ad>') || bodyStr.includes('vpaid') || bodyStr.includes('omid')) {
      score += 0.6;
    }

    // JSON with ad structure
    if (bodyStr.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(bodyStr);
        if (this._hasAdStructure(parsed)) score += 0.4;
      } catch {}
    }

    // Base64 encoded payload (common for tracking)
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(bodyStr.trim()) && bodyStr.length % 4 === 0 && bodyStr.length > 100) {
      score += 0.2;
    }

    return Math.min(1, score);
  }

  _hasAdStructure(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const adKeys = ['ad', 'ads', 'adBreak', 'adSlot', 'adPlacement', 'vast', 'vmap', 'adTag'];
    for (const key of Object.keys(obj)) {
      if (adKeys.some(adk => key.toLowerCase().includes(adk.toLowerCase()))) return true;
      if (typeof obj[key] === 'object' && this._hasAdStructure(obj[key])) return true;
    }
    return false;
  }

  _entropy(str) {
    if (!str || str.length === 0) return 0;
    const freq = {};
    for (const char of str) freq[char] = (freq[char] || 0) + 1;
    let entropy = 0;
    for (const count of Object.values(freq)) {
      const p = count / str.length;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }
}

class DOMMutationAnalyzer {
  constructor(options) {
    this.options = options;

    // YouTube-specific ad element selectors (high precision)
    this.adSelectors = [
      // Video overlay ads
      '.ytp-ad-player-overlay', '.ytp-ad-overlay-container', '.ytp-ad-overlay-slot',
      '.ytp-ad-text-overlay', '.ytp-ad-image-overlay', '.ytp-ad-branding-overlay',
      '.ytp-ad-companion-slot', '.ytp-ad-banner-slot', '.ytp-ad-skip-button-container',
      '.ytp-ad-preview-container', '.ytp-ad-preview-slot', '.ytp-ad-progress-bar-container',
      '.ytp-ad-progress-bar', '.ytp-ad-duration-remaining', '.ytp-ad-button-container',
      '.ytp-ad-button', '.ytp-ad-cta-button', '.ytp-ad-visit-advertiser-button',
      '.ytp-ad-learn-more-button', '.ytp-ad-feedback-button', '.ytp-ad-info-button',
      '.ytp-ad-cancel-button', '.ytp-ce-covering-overlay', '.ytp-ce-element.ytp-ce-ad',
      '.ytp-ce-video.ytp-ce-ad', '.ytp-ad-module', '.ytp-ad-overlay',

      // Feed/component ads
      'ytd-ad-slot-renderer', 'ytd-display-ad-renderer', 'ytd-promoted-video-renderer',
      'ytd-promoted-sparkles-web-renderer', 'ytd-action-companion-ad-renderer',
      'ytd-in-feed-ad-renderer', 'ytd-banner-ad-renderer', 'ytd-companion-slot-renderer',
      'ytd-mealbar-promo-renderer', 'ytd-merch-shelf-renderer', 'ytd-shopping-renderer',
      'ytd-masthead-ad-renderer', '#masthead-ad', '.masthead-ad',

      // Sponsored content
      'ytd-sponsored-content-renderer', 'ytd-promoted-video-renderer',
      '[data-ad-slot]', '[data-ad-client]', '[data-ad-format]',

      // Iframe ads
      'iframe[src*="googleads.g.doubleclick.net/pagead/ads"]',
      'iframe[src*="pubads.g.doubleclick.net/gampad/ads"]',
      'iframe[src*="pagead2.googlesyndication.com/pagead/ads"]',
      'iframe[src*="/ads?"]', 'iframe[src*="adformat="]', 'iframe[src*="ad_type="]'
    ];

    // Player elements to protect (never hide)
    this.playerAllowList = [
      'video.html5-main-video', 'video#movie_player', '#movie_player',
      'video.html5-video-player', 'video.ytp-video',
      'video[src*="googlevideo.com/videoplayback"]',
      '.html5-video-player', '.html5-video-container',
      '.ytp-chrome-bottom', '.ytp-chrome-top', '.ytp-chrome-controls',
      '.ytp-play-button', '.ytp-progress-bar', '.ytp-volume-panel',
      '.ytp-fullscreen-button', '.ytp-settings-button'
    ];
  }

  analyze(request, document) {
    // Check if recent DOM mutations correlate with this request
    // This would be enhanced with a mutation buffer
    return 0; // Placeholder - main detection via processNode
  }

  processNode(node, document) {
    if (!node.matches) return;

    for (const selector of this.adSelectors) {
      try {
        if (node.matches(selector) || node.querySelector(selector)) {
          // Verify it's not a player element
          if (this._isPlayerElement(node)) continue;

          // Ad element detected in DOM
          document.dispatchEvent(new CustomEvent('aeroguard:dom-ad', {
            detail: { selector, element: node, timestamp: Date.now() }
          }));
          return true;
        }
      } catch {}
    }
    return false;
  }

  _isPlayerElement(el) {
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
}

class NetworkPatternAnalyzer {
  constructor(options) {
    this.options = options;

    // Known ad network domains
    this.adDomains = new Set([
      'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
      'googletagmanager.com', 'googletagservices.com', 'pagead2.googlesyndication.com',
      'pubads.g.doubleclick.net', 'securepubads.g.doubleclick.net',
      'adservice.google.com', 'imasdk.googleapis.com', 'imasdk.s3.amazonaws.com',
      'googleads.g.doubleclick.net', 'fls.doubleclick.net', 'ad.doubleclick.net',
      'www.googleadservices.com', 'advertiser.youtube.com', 'ads-pa.googleapis.com',
      'adserver.googleapis.com', 'ads-api.youtube.com', 'ads.youtube.com',
      'advertising.youtube.com', 'partneradvertising.youtube.com',
      'sponsorships.youtube.com', 'paidcontent.youtube.com',
      'gstatic.com/imasdk', 'cdn.jsdelivr.net/npm/google-ima',
      'yt3.ggpht.com', 'facebook.net', 'fbcdn.net', 'connect.facebook.net',
      'analytics.twitter.com', 't.co', 'analytics.tiktok.com'
    ]);

    // Ad endpoint patterns
    this.adEndpoints = [
      '/pagead/', '/ads?', '/ad?', '/collect', '/beacon', '/pixel',
      '/track', '/impression', '/click', '/conversion', '/analytics',
      '/pagead/conversion', '/pagead/viewthroughconversion',
      '/activity/', '/activityi/', '/ads/measurement',
      '/ads/remarketing', '/ads/conversion', '/ads/impression'
    ];

    // YouTube ad API endpoints
    this.ytAdEndpoints = [
      '/youtubei/v1/ad/', '/youtubei/v1/ad/get', '/youtubei/v1/ad/click',
      '/youtubei/v1/ad/schedule', '/youtubei/v1/player/ad',
      '/api/stats/ads', '/api/stats/qoe', '/ptracking',
      '/get_video_info?adformat=', '/get_video_info?ad_type=',
      '/get_video_info?ad3_module=', '/get_video_info?afv_',
      '/get_video_info?vmap=', '/get_video_info?ad_tag=',
      '/get_video_info?ad_url=', '/annotations_invideo'
    ];
  }

  analyze(request, history) {
    let score = 0;

    try {
      const reqUrl = new URL(request.url);
      const reqDomain = reqUrl.hostname;

      // Check against known ad domains
      for (const adDomain of this.adDomains) {
        if (reqDomain === adDomain || reqDomain.endsWith('.' + adDomain)) {
          score += 0.5;
          break;
        }
      }

      // Check ad endpoints
      for (const endpoint of this.adEndpoints) {
        if (request.url.includes(endpoint)) {
          score += 0.4;
          break;
        }
      }

      // Check YouTube-specific ad endpoints
      for (const endpoint of this.ytAdEndpoints) {
        if (request.url.includes(endpoint)) {
          score += 0.6;
          break;
        }
      }

      // Third-party request check
      if (request.initiatorUrl) {
        try {
          const initDomain = new URL(request.initiatorUrl).hostname;
          if (initDomain !== reqDomain && !reqDomain.endsWith('.' + initDomain) && !initDomain.endsWith('.' + reqDomain)) {
            score += 0.3;
          }
        } catch {}
      }

      // Request method patterns
      if (request.method === 'POST' && request.body) {
        // POST to ad endpoints with small payload = beacon
        if (request.body.length < 1000) score += 0.2;
      }

      // Beacon/fetch with keepalive
      if (request.initiatorType === 'beacon' || request.keepalive) {
        score += 0.3;
      }

      // Response status patterns
      if (request.responseStatus === 204 || request.responseStatus === 302) {
        score += 0.2;
      }

      // Cookie-heavy requests to third parties
      if (request.headers?.cookie && request.headers.cookie.length > 100) {
        if (this.adDomains.has(reqDomain) || [...this.adDomains].some(d => reqDomain.endsWith('.' + d))) {
          score += 0.2;
        }
      }

    } catch (e) {}

    return Math.min(1, score);
  }
}

// ============================================================================
// Singleton Management
// ============================================================================

let heuristicDetectorInstance = null;

export function getHeuristicDetector(context = window, options = {}) {
  if (!heuristicDetectorInstance) {
    heuristicDetectorInstance = new YouTubeHeuristicDetector(context, options);
  }
  return heuristicDetectorInstance;
}

export function resetHeuristicDetector() {
  if (heuristicDetectorInstance) {
    heuristicDetectorInstance.cleanup();
  }
  heuristicDetectorInstance = null;
}

// ============================================================================
// Feature Extraction Utilities (ML-ready)
// ============================================================================

/**
 * Extract lightweight features for quick analysis without full ML extractor
 * Compatible with MLFeatureExtractor feature schema
 */
export function extractQuickFeatures(request) {
  const features = {};
  const url = request.url || '';

  try {
    const u = new URL(url);

    // URL features
    features.url_len = Math.min(1, url.length / 2000);
    features.path_len = Math.min(1, u.pathname.length / 500);
    features.query_len = Math.min(1, u.search.length / 500);
    features.path_depth = Math.min(1, u.pathname.split('/').filter(p => p).length / 20);
    features.param_count = Math.min(1, u.searchParams.size / 50);
    features.is_https = u.protocol === 'https:' ? 1 : 0;
    features.subdomain_count = Math.max(0, Math.min(1, (u.hostname.split('.').length - 2) / 5));
    features.path_entropy = entropy(u.pathname);
    features.query_entropy = entropy([...u.searchParams.entries()].map(([k, v]) => k + v).join(''));

    // Suspicious patterns
    features.suspicious_path = /pixel|track|beacon|collect|analytics|ads|ad\.|adserver|advert|banner/i.test(u.pathname) ? 1 : 0;
    features.suspicious_query = /pixel|track|beacon|collect|analytics|ads|ad\.|adserver|advert|banner/i.test(u.search) ? 1 : 0;

    // Domain features
    features.domain_len = Math.min(1, u.hostname.length / 100);
    features.domain_entropy = entropy(u.hostname);
    features.known_ad_domain = isKnownAdDomain(u.hostname) ? 1 : 0;
    features.is_google = u.hostname.includes('google') ? 1 : 0;
    features.is_youtube = u.hostname.includes('youtube') ? 1 : 0;
    features.is_doubleclick = u.hostname.includes('doubleclick') ? 1 : 0;

    // Request features
    features.method_post = request.method === 'POST' ? 1 : 0;
    features.has_body = request.body ? 1 : 0;
    features.body_size = request.body ? Math.min(1, (typeof request.body === 'string' ? request.body.length : JSON.stringify(request.body).length) / 10000) : 0;
    features.is_beacon = request.initiatorType === 'beacon' ? 1 : 0;
    features.is_fetch = request.initiatorType === 'fetch' ? 1 : 0;
    features.is_xhr = request.initiatorType === 'xmlhttprequest' ? 1 : 0;
    features.response_status = request.responseStatus / 599 || 0;
    features.is_204 = request.responseStatus === 204 ? 1 : 0;
    features.is_redirect = [301, 302, 307, 308].includes(request.responseStatus) ? 1 : 0;

    // Timing
    features.duration = request.duration ? Math.min(1, request.duration / 5000) : 0;
    features.very_fast = request.duration && request.duration < 50 ? 1 : 0;

  } catch (e) {}

  return features;
}

function entropy(str) {
  if (!str || str.length === 0) return 0;
  const freq = {};
  for (const char of str) freq[char] = (freq[char] || 0) + 1;
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return Math.min(1, entropy / 5);
}

function isKnownAdDomain(hostname) {
  const adDomains = [
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
    'googletagmanager.com', 'pagead2.googlesyndication.com',
    'pubads.g.doubleclick.net', 'securepubads.g.doubleclick.net',
    'adservice.google.com', 'imasdk.googleapis.com', 'googleads.g.doubleclick.net'
  ];
  return adDomains.some(d => hostname === d || hostname.endsWith('.' + d));
}

export default YouTubeHeuristicDetector;