/**
 * Behavioral Analyzer — Request patterns, timing, payloads, entropy, initiator analysis
 * Detects ads by behavioral patterns, not just URL matching
 */

// ============================================================================
// Behavioral Analyzer
// ============================================================================

export class BehavioralAnalyzer {
  constructor(options = {}) {
    this.options = {
      windowSize: options.windowSize || 1000, // requests to track
      minRequestsForPattern: options.minRequestsForPattern || 10,
      entropyThreshold: options.entropyThreshold || 3.5,
      periodicityThreshold: options.periodicityThreshold || 0.8,
      ...options
    };

    this.requestHistory = [];
    this.domainPatterns = new Map();
    this.initiatorPatterns = new Map();
    this.timingPatterns = new Map();
  }

  /**
   * Analyze a request for behavioral ad indicators
   * @param {Object} request - Request object
   * @returns {Object} Analysis result
   */
  analyze(request) {
    const features = this._extractFeatures(request);
    const scores = {
      timing: this._analyzeTiming(features),
      entropy: this._analyzeEntropy(features),
      periodicity: this._analyzePeriodicity(features),
      payload: this._analyzePayload(features),
      initiator: this._analyzeInitiator(features),
      headers: this._analyzeHeaders(features)
    };

    const weightedScore = this._calculateWeightedScore(scores);

    // Update history
    this._updateHistory(request, features);

    return {
      isAd: weightedScore > 0.7,
      confidence: Math.min(1, weightedScore),
      scores,
      features
    };
  }

  _extractFeatures(request) {
    const url = request.url || '';
    const urlObj = this._parseUrl(url);

    return {
      url,
      domain: urlObj.hostname,
      path: urlObj.pathname,
      query: urlObj.searchParams,
      method: request.method || 'GET',
      headers: request.headers || {},
      body: request.body || null,
      initiatorType: request.initiatorType || 'unknown',
      initiatorUrl: request.initiatorUrl || '',
      resourceType: request.resourceType || 'other',
      timestamp: request.timestamp || Date.now(),
      responseTime: request.responseTime || null,
      responseSize: request.responseSize || null,
      responseHeaders: request.responseHeaders || {}
    };
  }

  _parseUrl(url) {
    try {
      const u = new URL(url);
      return {
        hostname: u.hostname,
        pathname: u.pathname,
        searchParams: u.searchParams
      };
    } catch {
      return { hostname: '', pathname: '', searchParams: new URLSearchParams() };
    }
  }

  _analyzeTiming(features) {
    let score = 0;

    // Very fast requests (< 50ms) often indicate cached/blocked ads
    if (features.responseTime !== null && features.responseTime < 50) {
      score += 0.3;
    }

    // Requests at regular intervals
    const domainHistory = this.domainPatterns.get(features.domain) || [];
    if (domainHistory.length >= 3) {
      const intervals = [];
      for (let i = 1; i < domainHistory.length; i++) {
        intervals.push(domainHistory[i].timestamp - domainHistory[i - 1].timestamp);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
      const cv = Math.sqrt(variance) / avgInterval; // Coefficient of variation

      if (cv < 0.2 && avgInterval > 1000 && avgInterval < 60000) {
        // Highly periodic requests (tracking/heartbeat)
        score += 0.4;
      }
    }

    return Math.min(1, score);
  }

  _analyzeEntropy(features) {
    let score = 0;

    // URL entropy
    const urlEntropy = this._calculateEntropy(features.url);
    if (urlEntropy > this.options.entropyThreshold) {
      score += 0.3;
    }

    // Query parameter entropy
    let paramEntropy = 0;
    for (const [key, value] of features.query) {
      paramEntropy += this._calculateEntropy(key + value);
    }
    if (features.query.size > 0) {
      paramEntropy /= features.query.size;
      if (paramEntropy > this.options.entropyThreshold) {
        score += 0.2;
      }
    }

    // Header entropy
    let headerEntropy = 0;
    for (const [key, value] of Object.entries(features.headers)) {
      headerEntropy += this._calculateEntropy(key + value);
    }
    if (Object.keys(features.headers).length > 0) {
      headerEntropy /= Object.keys(features.headers).length;
      if (headerEntropy > this.options.entropyThreshold) {
        score += 0.1;
      }
    }

    return Math.min(1, score);
  }

  _calculateEntropy(str) {
    if (!str || str.length === 0) return 0;
    const freq = {};
    for (const char of str) {
      freq[char] = (freq[char] || 0) + 1;
    }
    let entropy = 0;
    for (const count of Object.values(freq)) {
      const p = count / str.length;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  _analyzePeriodicity(features) {
    const domainHistory = this.domainPatterns.get(features.domain) || [];
    if (domainHistory.length < this.options.minRequestsForPattern) return 0;

    // Check for periodic requests
    const timestamps = domainHistory.map(h => h.timestamp).sort((a, b) => a - b);
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    if (intervals.length < 3) return 0;

    // Check if intervals are consistent (low variance)
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / intervals.length;
    const cv = Math.sqrt(variance) / avg;

    if (cv < 0.15 && avg > 5000 && avg < 300000) {
      // Periodic between 5s and 5min - likely tracking/heartbeat
      return 0.5;
    }

    return 0;
  }

  _analyzePayload(features) {
    if (!features.body) return 0;

    let score = 0;
    const bodyStr = typeof features.body === 'string' ? features.body : JSON.stringify(features.body);

    // Small payloads often indicate beacons
    if (bodyStr.length < 500) {
      score += 0.2;
    }

    // High entropy in small payload = encoded tracking data
    const entropy = this._calculateEntropy(bodyStr);
    if (entropy > 4 && bodyStr.length < 1000) {
      score += 0.3;
    }

    // Common tracking parameters in body
    const trackingKeys = ['tid', 'cid', 'uid', 'sid', 'pid', 'eid', 'event', 'action', 'category', 'label', 'value'];
    for (const key of trackingKeys) {
      if (bodyStr.includes(key)) {
        score += 0.1;
        break;
      }
    }

    return Math.min(1, score);
  }

  _analyzeInitiator(features) {
    let score = 0;

    // Third-party initiators more likely to be ads
    if (features.initiatorUrl) {
      try {
        const initDomain = new URL(features.initiatorUrl).hostname;
        const reqDomain = features.domain;
        if (initDomain !== reqDomain && !reqDomain.endsWith('.' + initDomain) && !initDomain.endsWith('.' + reqDomain)) {
          score += 0.3;
        }
      } catch {}
    }

    // Specific initiator types
    if (features.initiatorType === 'script' || features.initiatorType === 'xmlhttprequest') {
      score += 0.1;
    }

    // Known ad network initiators
    const adInitiators = ['doubleclick.net', 'googlesyndication.com', 'googletagmanager.com', 'googletagservices.com'];
    if (adInitiators.some(d => features.initiatorUrl?.includes(d))) {
      score += 0.4;
    }

    return Math.min(1, score);
  }

  _analyzeHeaders(features) {
    let score = 0;

    // Check for tracking headers
    const trackingHeaders = ['cookie', 'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip'];
    for (const header of trackingHeaders) {
      if (features.headers[header.toLowerCase()]) {
        score += 0.1;
        break;
      }
    }

    // Missing referer on third-party = possible tracking
    if (!features.headers.referer && features.initiatorUrl) {
      try {
        const initDomain = new URL(features.initiatorUrl).hostname;
        if (initDomain !== features.domain) {
          score += 0.1;
        }
      } catch {}
    }

    // Cache control headers indicating tracking
    if (features.headers['cache-control']?.includes('no-store') || features.headers['cache-control']?.includes('private')) {
      score += 0.1;
    }

    return Math.min(1, score);
  }

  _calculateWeightedScore(scores) {
    const weights = {
      timing: 0.15,
      entropy: 0.25,
      periodicity: 0.2,
      payload: 0.15,
      initiator: 0.15,
      headers: 0.1
    };

    let total = 0;
    for (const [key, weight] of Object.entries(weights)) {
      total += (scores[key] || 0) * weight;
    }

    return total;
  }

  _updateHistory(request, features) {
    // Domain history
    if (!this.domainPatterns.has(features.domain)) {
      this.domainPatterns.set(features.domain, []);
    }
    const domainHist = this.domainPatterns.get(features.domain);
    domainHist.push({ timestamp: features.timestamp, features });
    if (domainHist.length > this.options.windowSize) {
      domainHist.shift();
    }

    // Initiator history
    if (features.initiatorUrl) {
      if (!this.initiatorPatterns.has(features.initiatorUrl)) {
        this.initiatorPatterns.set(features.initiatorUrl, []);
      }
      const initHist = this.initiatorPatterns.get(features.initiatorUrl);
      initHist.push({ timestamp: features.timestamp, domain: features.domain });
      if (initHist.length > 100) initHist.shift();
    }

    // Timing patterns
    const hour = new Date(features.timestamp).getHours();
    if (!this.timingPatterns.has(hour)) {
      this.timingPatterns.set(hour, 0);
    }
    this.timingPatterns.set(hour, this.timingPatterns.get(hour) + 1);
  }

  /**
   * Get domain pattern analysis
   */
  getDomainAnalysis(domain) {
    const history = this.domainPatterns.get(domain) || [];
    if (history.length < 3) return null;

    const timestamps = history.map(h => h.timestamp).sort((a, b) => a - b);
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;

    return {
      requestCount: history.length,
      avgInterval,
      variance,
      isPeriodic: variance < Math.pow(avgInterval * 0.2, 2),
      firstSeen: timestamps[0],
      lastSeen: timestamps[timestamps.length - 1]
    };
  }

  /**
   * Clear history
   */
  clear() {
    this.requestHistory = [];
    this.domainPatterns.clear();
    this.initiatorPatterns.clear();
    this.timingPatterns.clear();
  }
}