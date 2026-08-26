/**
 * Cloaking Detector — Differential analysis: blocked vs allowed, response comparison
 * Detects when servers serve different content based on ad blocker presence
 */

export class CloakingDetector {
  constructor(options = {}) {
    this.options = {
      comparisonThreshold: options.comparisonThreshold || 0.3,
      minResponseSize: options.minResponseSize || 100,
      maxResponseSize: options.maxResponseSize || 1024 * 1024,
      ...options
    };

    this.baselineResponses = new Map(); // url -> { content, headers, timestamp }
    this.cloakingDetections = [];
    this.testRequests = new Map(); // url -> { blocked, allowed }
  }

  /**
   * Record a response for baseline comparison
   */
  recordResponse(url, response, isBlocked) {
    const key = this._normalizeUrl(url);

    if (!this.testRequests.has(key)) {
      this.testRequests.set(key, { blocked: null, allowed: null });
    }

    const test = this.testRequests.get(key);
    if (isBlocked) {
      test.blocked = { response, timestamp: Date.now() };
    } else {
      test.allowed = { response, timestamp: Date.now() };
    }

    // If we have both, compare
    if (test.blocked && test.allowed) {
      this._compareResponses(key, test.blocked.response, test.allowed.response);
    }
  }

  /**
   * Compare blocked vs allowed responses
   */
  _compareResponses(url, blockedResponse, allowedResponse) {
    const detection = {
      url,
      timestamp: Date.now(),
      cloakingDetected: false,
      confidence: 0,
      differences: []
    };

    // Compare status codes
    if (blockedResponse.status !== allowedResponse.status) {
      detection.differences.push({
        type: 'status_code',
        blocked: blockedResponse.status,
        allowed: allowedResponse.status
      });
    }

    // Compare content length
    const blockedLength = blockedResponse.content?.length || 0;
    const allowedLength = allowedResponse.content?.length || 0;

    if (blockedLength > 0 && allowedLength > 0) {
      const lengthDiff = Math.abs(blockedLength - allowedLength);
      const lengthRatio = lengthDiff / Math.max(blockedLength, allowedLength);

      if (lengthRatio > this.options.comparisonThreshold) {
        detection.differences.push({
          type: 'content_length',
          blocked: blockedLength,
          allowed: allowedLength,
          ratio: lengthRatio
        });
      }
    }

    // Compare content (if both are text)
    if (blockedResponse.content && allowedResponse.content) {
      const contentDiff = this._compareContent(blockedResponse.content, allowedResponse.content);
      if (contentDiff.similarity < (1 - this.options.comparisonThreshold)) {
        detection.differences.push({
          type: 'content',
          similarity: contentDiff.similarity,
          blockedPreview: blockedResponse.content.substring(0, 200),
          allowedPreview: allowedResponse.content.substring(0, 200)
        });
      }
    }

    // Compare headers
    const headerDiff = this._compareHeaders(blockedResponse.headers, allowedResponse.headers);
    if (headerDiff.length > 0) {
      detection.differences.push({
        type: 'headers',
        differences: headerDiff
      });
    }

    // Determine if cloaking detected
    if (detection.differences.length > 0) {
      detection.cloakingDetected = true;
      detection.confidence = this._calculateConfidence(detection.differences);
      this.cloakingDetections.push(detection);
    }

    return detection;
  }

  _compareContent(blocked, allowed) {
    // Simple similarity using n-grams
    const blockedTokens = this._tokenize(blocked);
    const allowedTokens = this._tokenize(allowed);

    const blockedSet = new Set(blockedTokens);
    const allowedSet = new Set(allowedTokens);

    const intersection = new Set([...blockedSet].filter(x => allowedSet.has(x)));
    const union = new Set([...blockedSet, ...allowedSet]);

    return {
      similarity: intersection.size / union.size,
      blockedUnique: blockedSet.size - intersection.size,
      allowedUnique: allowedSet.size - intersection.size
    };
  }

  _tokenize(text) {
    // Simple word tokenization
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  _compareHeaders(blockedHeaders, allowedHeaders) {
    const differences = [];
    const allKeys = new Set([...Object.keys(blockedHeaders || {}), ...Object.keys(allowedHeaders || {})]);

    for (const key of allKeys) {
      const bVal = blockedHeaders[key];
      const aVal = allowedHeaders[key];

      if (bVal !== aVal) {
        differences.push({
          header: key,
          blocked: bVal,
          allowed: aVal
        });
      }
    }

    return differences;
  }

  _calculateConfidence(differences) {
    let confidence = 0;
    for (const diff of differences) {
      switch (diff.type) {
        case 'status_code':
          confidence += 0.3;
          break;
        case 'content_length':
          confidence += 0.2 * diff.ratio;
          break;
        case 'content':
          confidence += 0.3 * (1 - diff.similarity);
          break;
        case 'headers':
          confidence += 0.1 * diff.differences.length;
          break;
      }
    }
    return Math.min(1, confidence);
  }

  _normalizeUrl(url) {
    try {
      const u = new URL(url);
      // Remove query parameters that might vary
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch {
      return url;
    }
  }

  /**
   * Active cloaking test - make paired requests
   */
  async testUrl(url, fetchFn) {
    const key = this._normalizeUrl(url);

    // Make request with ad blocker simulated (blocked)
    const blockedResponse = await this._makeTestRequest(url, fetchFn, true);

    // Make request without ad blocker (allowed)
    const allowedResponse = await this._makeTestRequest(url, fetchFn, false);

    this.recordResponse(url, blockedResponse, true);
    this.recordResponse(url, allowedResponse, false);

    return this._compareResponses(key, blockedResponse, allowedResponse);
  }

  async _makeTestRequest(url, fetchFn, simulateBlocked) {
    try {
      const headers = simulateBlocked ? {
        'X-Adblock': 'true',
        'X-Adblocker': 'true'
      } : {};

      const response = await fetchFn(url, { headers });
      const content = await response.text().catch(() => '');

      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        content,
        timestamp: Date.now()
      };
    } catch (e) {
      return { status: 0, headers: {}, content: '', error: e.message };
    }
  }

  /**
   * Get all cloaking detections
   */
  getDetections() {
    return [...this.cloakingDetections].sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get detections for specific URL
   */
  getDetectionsForUrl(url) {
    const key = this._normalizeUrl(url);
    return this.cloakingDetections.filter(d => this._normalizeUrl(d.url) === key);
  }

  /**
   * Clear all data
   */
  clear() {
    this.baselineResponses.clear();
    this.cloakingDetections = [];
    this.testRequests.clear();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalTests: this.testRequests.size,
      cloakingDetected: this.cloakingDetections.filter(d => d.cloakingDetected).length,
      totalDetections: this.cloakingDetections.length,
      avgConfidence: this.cloakingDetections.length > 0
        ? this.cloakingDetections.reduce((sum, d) => sum + d.confidence, 0) / this.cloakingDetections.length
        : 0
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let cloakingDetectorInstance = null;

export function getCloakingDetector(options = {}) {
  if (!cloakingDetectorInstance) {
    cloakingDetectorInstance = new CloakingDetector(options);
  }
  return cloakingDetectorInstance;
}

export function resetCloakingDetector() {
  if (cloakingDetectorInstance) {
    cloakingDetectorInstance.clear();
  }
  cloakingDetectorInstance = null;
}