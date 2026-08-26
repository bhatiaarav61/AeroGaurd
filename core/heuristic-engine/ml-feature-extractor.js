/**
 * ML Feature Extractor — Ready for on-device inference, feature vectors, TensorFlow.js compatible
 * Extracts numerical features from requests/responses for ML-based ad detection
 */

export class MLFeatureExtractor {
  constructor(options = {}) {
    this.options = {
      featureVersion: options.featureVersion || 2,
      maxFeatures: options.maxFeatures || 256,
      normalizeFeatures: options.normalizeFeatures !== false,
      ...options
    };

    // Feature statistics for normalization (learned from training data)
    this.featureStats = {
      mean: new Map(),
      std: new Map(),
      min: new Map(),
      max: new Map()
    };

    // Domain embeddings (pre-trained or learned)
    this.domainEmbeddings = new Map();

    // Known ad/tracking domains for categorical features
    this.knownAdDomains = new Set([
      'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
      'googletagmanager.com', 'googletagservices.com', 'pagead2.googlesyndication.com',
      'pubads.g.doubleclick.net', 'securepubads.g.doubleclick.net',
      'adservice.google.com', 'facebook.com', 'connect.facebook.net',
      'analytics.twitter.com', 't.co', 'analytics.tiktok.com',
      'cdn.ampproject.org', 'www.google-analytics.com', 'www.googletagmanager.com'
    ]);

    this.knownTrackingParams = new Set([
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'ttclid', 'li_fat_id', '_ga', '_gid',
      'session_id', 'user_id', 'client_id', 'device_id', 'advertising_id'
    ]);
  }

  /**
   * Extract feature vector from request
   * @param {Object} request - Request object
   * @returns {Float32Array} Feature vector (length = maxFeatures)
   */
  extractFeatures(request) {
    const features = [];

    // 1. URL-based features (64 features)
    features.push(...this._extractUrlFeatures(request.url));

    // 2. Domain-based features (32 features)
    features.push(...this._extractDomainFeatures(request.url));

    // 3. Request metadata features (24 features)
    features.push(...this._extractRequestFeatures(request));

    // 4. Timing features (16 features)
    features.push(...this._extractTimingFeatures(request));

    // 5. Header features (32 features)
    features.push(...this._extractHeaderFeatures(request.headers));

    // 6. Payload features (24 features)
    features.push(...this._extractPayloadFeatures(request.body));

    // 5. Initiator features (16 features)
    features.push(...this._extractInitiatorFeatures(request));

    // 6. Response features (if available) (24 features)
    if (request.response) {
      features.push(...this._extractResponseFeatures(request.response));
    } else {
      features.push(...new Array(24).fill(0));
    }

    // 7. Behavioral features (24 features)
    features.push(...this._extractBehavioralFeatures(request));

    // Truncate or pad to maxFeatures
    const featureVector = new Float32Array(this.options.maxFeatures);
    for (let i = 0; i < Math.min(features.length, this.options.maxFeatures); i++) {
      featureVector[i] = features[i];
    }

    // Normalize if enabled
    if (this.options.normalizeFeatures) {
      this._normalizeInPlace(featureVector);
    }

    return featureVector;
  }

  /**
   * Extract features from URL string
   */
  _extractUrlFeatures(url) {
    const features = new Array(64).fill(0);

    if (!url) return features;

    try {
      const u = new URL(url);

      // URL length features
      features[0] = Math.min(1, url.length / 2000);
      features[1] = Math.min(1, u.pathname.length / 500);
      features[2] = Math.min(1, u.search.length / 500);

      // Path depth
      const pathParts = u.pathname.split('/').filter(p => p.length > 0);
      features[3] = Math.min(1, pathParts.length / 20);

      // Query parameter count
      features[4] = Math.min(1, u.searchParams.size / 50);

      // Has fragment
      features[5] = u.hash ? 1 : 0;

      // Protocol
      features[6] = u.protocol === 'https:' ? 1 : 0;

      // Port
      features[7] = u.port ? 1 : 0;

      // Subdomain count
      const subdomains = u.hostname.split('.').length - 2;
      features[8] = Math.max(0, Math.min(1, subdomains / 5));

      // TLD
      const tld = u.hostname.split('.').pop() || '';
      features[9] = this._tldToFeature(tld);

      // Path entropy
      features[10] = this._entropy(u.pathname);

      // Query entropy
      let queryStr = '';
      for (const [k, v] of u.searchParams) {
        queryStr += k + '=' + v + '&';
      }
      features[11] = this._entropy(queryStr);

      // Suspicious path patterns
      features[12] = /pixel|track|beacon|collect|analytics|ads|ad\.|ads\.|adserver|advert|banner/i.test(u.pathname) ? 1 : 0;
      features[13] = /pixel|track|beacon|collect|analytics|ads|ad\.|ads\.|adserver|advert|banner/i.test(u.search) ? 1 : 0;

      // File extension
      const ext = u.pathname.split('.').pop()?.toLowerCase() || '';
      features[14] = ['js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'woff', 'woff2', 'ttf', 'eot', 'ico', 'json', 'xml', 'html', 'htm', 'php', 'asp', 'jsp'].indexOf(ext) + 1 || 0;

      // Number of path segments with numbers
      features[15] = pathParts.filter(p => /\d/.test(p)).length / Math.max(1, pathParts.length);

      // Has suspicious keywords in path
      const suspiciousPath = ['ads', 'ad', 'banner', 'track', 'pixel', 'beacon', 'collect', 'analytics', 'adserver', 'advert', 'sponsor', 'promo', 'click', 'impression', 'conversion'];
      features[16] = suspiciousPath.some(w => pathParts.some(p => p.includes(w))) ? 1 : 0;

      // Query parameter features
      let paramIdx = 17;
      for (const [key, value] of u.searchParams) {
        if (paramIdx >= 64) break;
        features[paramIdx] = this.knownTrackingParams.has(key.toLowerCase()) ? 1 : 0;
        paramIdx++;
        if (paramIdx >= 64) break;
        features[paramIdx] = this._entropy(value) > 3 ? 1 : 0;
        paramIdx++;
      }

      // Pad remaining with URL structure features
      features[60] = u.searchParams.has('fbclid') ? 1 : 0;
      features[61] = u.searchParams.has('gclid') ? 1 : 0;
      features[62] = u.searchParams.has('utm_source') ? 1 : 0;
      features[63] = u.searchParams.has('clickid') ? 1 : 0;

    } catch (e) {
      // Invalid URL
    }

    return features;
  }

  _extractDomainFeatures(url) {
    const features = new Array(32).fill(0);

    if (!url) return features;

    try {
      const domain = new URL(url).hostname;

      // Known ad domain
      features[0] = this.knownAdDomains.has(domain) ? 1 : 0;

      // Subdomain of known ad domain
      for (const adDomain of this.knownAdDomains) {
        if (domain.endsWith('.' + adDomain) || domain === adDomain) {
          features[1] = 1;
          break;
        }
      }

      // Domain length
      features[2] = Math.min(1, domain.length / 100);

      // Subdomain count
      features[3] = Math.min(1, (domain.split('.').length - 2) / 5);

      // TLD feature
      const tld = domain.split('.').pop() || '';
      features[4] = this._tldToFeature(tld);

      // Domain entropy
      features[5] = this._entropy(domain);

      // Digit ratio in domain
      const digits = (domain.match(/\d/g) || []).length;
      features[6] = digits / Math.max(1, domain.length);

      // Hyphen count
      features[7] = (domain.match(/-/g) || []).length / 10;

      // Suspicious keywords
      const suspicious = ['ads', 'ad', 'track', 'analytics', 'banner', 'pixel', 'beacon', 'click', 'adserver', 'advert', 'sponsor', 'promo', 'affiliate', 'partner', 'aff', 'pub', 'adx', 'ssp', 'dsp', 'rtb'];
      for (let i = 0; i < suspicious.length && i + 8 < 32; i++) {
        features[8 + i] = domain.includes(suspicious[i]) ? 1 : 0;
      }

      // Known CDN patterns
      features[20] = /cdn|edge|static|assets|media|img|images/i.test(domain) ? 1 : 0;

      // Google/YouTube domains
      features[21] = domain.endsWith('.google.com') || domain.endsWith('.googleusercontent.com') || domain.endsWith('.ggpht.com') ? 1 : 0;
      features[22] = domain.endsWith('.youtube.com') || domain.endsWith('.ytimg.com') || domain.endsWith('.googlevideo.com') ? 1 : 0;
      features[23] = domain.endsWith('.doubleclick.net') ? 1 : 0;
      features[24] = domain.endsWith('.facebook.net') || domain.endsWith('.fbcdn.net') ? 1 : 0;

      // Domain age heuristic (entropy of subdomains)
      const subdomain = domain.split('.')[0];
      if (subdomain && subdomain !== 'www') {
        features[25] = this._entropy(subdomain) > 3 ? 1 : 0;
      }

      // Internationalized domain
      features[26] = /xn--/.test(domain) ? 1 : 0;

      // IP address as domain
      features[27] = /^\d+\.\d+\.\d+\.\d+$/.test(domain) ? 1 : 0;

      // Short domain (< 8 chars)
      features[28] = domain.length < 8 ? 1 : 0;

      // Brand impersonation check (simplified)
      const brands = ['google', 'facebook', 'amazon', 'microsoft', 'apple', 'paypal', 'bank', 'secure', 'login', 'account', 'verify', 'update', 'confirm', 'security'];
      for (const brand of brands) {
        if (domain.includes(brand) && !domain.endsWith('.' + brand + '.com')) {
          features[29] = 1;
          break;
        }
      }

      // Homograph attack detection (simplified)
      features[30] = /[а-яА-Я]/.test(domain) ? 1 : 0; // Cyrillic

      // Subdomain takeover patterns
      features[31] = /(cdn|static|assets|media|img|images|static)\.(?!cloudflare|cloudfront|fastly|akamai|amazonaws)/.test(domain) ? 1 : 0;

    } catch (e) {}

    return features;
  }

  _extractRequestFeatures(request) {
    const features = new Array(24).fill(0);

    // Method
    const methodMap = { GET: 0, POST: 1, PUT: 2, DELETE: 3, HEAD: 4, OPTIONS: 5, PATCH: 6 };
    features[0] = methodMap[request.method?.toUpperCase()] / 6 || 0;

    // Resource type
    const resourceMap = { script: 0, image: 1, stylesheet: 2, font: 3, xmlhttprequest: 4, fetch: 5, websocket: 6, media: 7, ping: 8, csp_report: 9, other: 10 };
    features[1] = resourceMap[request.resourceType] / 10 || 0;

    // Initiator type
    const initiatorMap = { parser: 0, script: 1, preload: 2, prefetch: 3, navigation: 4, other: 5 };
    features[2] = initiatorMap[request.initiatorType] / 5 || 0;

    // Has body
    features[3] = request.body ? 1 : 0;

    // Body size
    if (request.body) {
      const size = typeof request.body === 'string' ? request.body.length : JSON.stringify(request.body).length;
      features[4] = Math.min(1, size / 10000);
    }

    // Content type from headers
    const ct = request.headers?.['content-type'] || '';
    features[5] = ct.includes('json') ? 1 : 0;
    features[6] = ct.includes('form') ? 1 : 0;
    features[7] = ct.includes('multipart') ? 1 : 0;

    // Referrer policy
    const rp = request.headers?.['referrer-policy'] || request.headers?.['referer-policy'] || '';
    features[8] = rp.includes('no-referrer') ? 1 : 0;
    features[9] = rp.includes('same-origin') ? 1 : 0;
    features[10] = rp.includes('strict-origin') ? 1 : 0;

    // Cache control
    const cc = request.headers?.['cache-control'] || '';
    features[11] = cc.includes('no-cache') ? 1 : 0;
    features[12] = cc.includes('no-store') ? 1 : 0;
    features[13] = cc.includes('must-revalidate') ? 1 : 0;

    // Priority
    features[14] = request.priority === 'high' ? 1 : 0;

    // Destination
    const destMap = { document: 0, script: 1, style: 2, image: 3, font: 4, manifest: 5, worker: 6, sharedworker: 7, serviceworker: 8, xslt: 9, audio: 10, video: 11, track: 12, object: 13, embed: 14, iframe: 15, frame: 16, prefetch: 17, preload: 18, prerender: 18 };
    features[15] = destMap[request.destination] / 18 || 0;

    // Keepalive
    features[16] = request.keepalive ? 1 : 0;

    // Credentials mode
    const credMap = { omit: 0, same_origin: 1, include: 2 };
    features[17] = credMap[request.credentials] / 2 || 0;

    // Mode
    const modeMap = { cors: 0, no_cors: 1, same_origin: 2, navigate: 3 };
    features[18] = modeMap[request.mode] / 3 || 0;

    // Redirect
    features[19] = request.redirect === 'manual' ? 1 : 0;

    // Integrity
    features[20] = request.integrity ? 1 : 0;

    // Signal
    features[21] = request.signal ? 1 : 0;

    // Window ID (if available)
    features[22] = 0; // Placeholder

    // Frame ID (if available)
    features[23] = 0; // Placeholder

    return features;
  }

  _extractTimingFeatures(request) {
    const features = new Array(16).fill(0);

    if (!request.timestamp) return features;

    const date = new Date(request.timestamp);

    // Hour of day (cyclical encoding)
    const hour = date.getHours();
    features[0] = Math.sin(2 * Math.PI * hour / 24);
    features[1] = Math.cos(2 * Math.PI * hour / 24);

    // Day of week
    const day = date.getDay();
    features[2] = Math.sin(2 * Math.PI * day / 7);
    features[3] = Math.cos(2 * Math.PI * day / 7);

    // Is weekend
    features[4] = (day === 0 || day === 6) ? 1 : 0;

    // Business hours (9-17)
    features[5] = (hour >= 9 && hour <= 17) ? 1 : 0;

    // Night hours (22-6)
    features[6] = (hour >= 22 || hour <= 6) ? 1 : 0;

    // Response time (if available)
    if (request.responseTime !== undefined && request.responseTime !== null) {
      features[7] = Math.min(1, request.responseTime / 5000); // Normalize to 5s
      features[8] = request.responseTime < 50 ? 1 : 0; // Very fast
      features[9] = request.responseTime > 2000 ? 1 : 0; // Very slow
    }

    // Request timestamp relative to page load (if available)
    if (request.pageLoadTime) {
      const delta = request.timestamp - request.pageLoadTime;
      features[10] = Math.min(1, delta / 60000); // Minutes after load
      features[11] = delta < 1000 ? 1 : 0; // Before load
    }

    return features;
  }

  _extractHeaderFeatures(headers) {
    const features = new Array(32).fill(0);

    if (!headers) return features;

    const h = {};
    for (const [k, v] of Object.entries(headers)) {
      h[k.toLowerCase()] = v;
    }

    // Cookie presence
    features[0] = h.cookie ? 1 : 0;
    features[1] = h.cookie ? Math.min(1, h.cookie.length / 2000) : 0;

    // Referer
    features[2] = h.referer ? 1 : 0;
    if (h.referer) {
      try {
        const refDomain = new URL(h.referer).hostname;
        const reqDomain = new URL(request?.url || '').hostname || '';
        features[3] = refDomain === reqDomain ? 1 : 0; // Same origin referer
      } catch {}
    }

    // User-Agent
    features[4] = h['user-agent'] ? 1 : 0;

    // Accept headers
    features[5] = h.accept ? 1 : 0;
    features[6] = h['accept-language'] ? 1 : 0;
    features[7] = h['accept-encoding'] ? 1 : 0;

    // Origin
    features[8] = h.origin ? 1 : 0;

    // Sec-Fetch headers
    features[9] = h['sec-fetch-site'] ? 1 : 0;
    features[10] = h['sec-fetch-mode'] ? 1 : 0;
    features[11] = h['sec-fetch-dest'] ? 1 : 0;
    features[12] = h['sec-fetch-user'] ? 1 : 0;

    // CSP
    features[13] = h['content-security-policy'] ? 1 : 0;
    features[14] = h['content-security-policy-report-only'] ? 1 : 0;

    // Permissions Policy
    features[15] = h['permissions-policy'] ? 1 : 0;

    // CORS headers
    features[16] = h['access-control-allow-origin'] ? 1 : 0;
    features[17] = h['access-control-allow-credentials'] ? 1 : 0;

    // Timing headers
    features[18] = h['server-timing'] ? 1 : 0;
    features[19] = h['timing-allow-origin'] ? 1 : 0;

    // Tracking headers
    features[20] = h['x-forwarded-for'] ? 1 : 0;
    features[21] = h['x-real-ip'] ? 1 : 0;
    features[22] = h['cf-connecting-ip'] ? 1 : 0;
    features[23] = h['true-client-ip'] ? 1 : 0;

    // Custom headers that indicate tracking
    features[24] = h['x-requested-with'] ? 1 : 0;
    features[25] = h['x-csrf-token'] ? 1 : 0;
    features[26] = h['x-xsrf-token'] ? 1 : 0;

    // Edge/Cloudflare headers
    features[27] = h['cf-ray'] ? 1 : 0;
    features[28] = h['cf-cache-status'] ? 1 : 0;
    features[29] = h['x-amz-cf-id'] ? 1 : 0;
    features[30] = h['x-cache'] ? 1 : 0;

    // Server info
    features[31] = h.server ? 1 : 0;

    return features;
  }

  _extractPayloadFeatures(body) {
    const features = new Array(24).fill(0);

    if (!body) return features;

    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

    // Size
    features[0] = Math.min(1, bodyStr.length / 10000);

    // Is JSON
    features[1] = bodyStr.trim().startsWith('{') || bodyStr.trim().startsWith('[') ? 1 : 0;

    // Is form data
    features[2] = bodyStr.includes('=') && bodyStr.includes('&') && !bodyStr.includes('{') ? 1 : 0;

    // Entropy
    features[3] = Math.min(1, this._entropy(bodyStr) / 5);

    // Tracking parameters in body
    const trackingInBody = ['tid', 'cid', 'uid', 'sid', 'pid', 'eid', 'event', 'action', 'category', 'label', 'value', 'client_id', 'user_id', 'session_id', 'device_id', 'advertising_id', 'ga', 'fbp', 'fbc'];
    let found = 0;
    for (const param of trackingInBody) {
      if (bodyStr.includes(param)) found++;
    }
    features[4] = Math.min(1, found / 5);

    // Base64 encoded
    features[5] = /^[A-Za-z0-9+/]+={0,2}$/.test(bodyStr.trim()) && bodyStr.length % 4 === 0 ? 1 : 0;

    // Has PII patterns
    features[6] = /\b\d{3}-\d{2}-\d{4}\b/.test(bodyStr) ? 1 : 0; // SSN
    features[7] = /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/.test(bodyStr) ? 1 : 0; // Credit card
    features[8] = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(bodyStr) ? 1 : 0; // Email

    // Encoding
    features[9] = /%[0-9A-Fa-f]{2}/.test(bodyStr) ? 1 : 0; // URL encoded
    features[10] = /\\u[0-9a-fA-F]{4}/.test(bodyStr) ? 1 : 0; // Unicode escaped

    // Repeated characters (obfuscation)
    features[11] = /(.)\1{10,}/.test(bodyStr) ? 1 : 0;

    // Very long single line
    const lines = bodyStr.split('\n');
    features[12] = lines.length === 1 && bodyStr.length > 1000 ? 1 : 0;

    // Minified
    features[13] = bodyStr.length > 100 && (bodyStr.match(/[{};,]/g) || []).length / bodyStr.length > 0.1 ? 1 : 0;

    return features;
  }

  _extractInitiatorFeatures(request) {
    const features = new Array(16).fill(0);

    if (!request.initiatorUrl) return features;

    try {
      const initUrl = new URL(request.initiatorUrl);
      const reqUrl = new URL(request.url);

      // Same origin
      features[0] = initUrl.origin === reqUrl.origin ? 1 : 0;

      // Same domain
      features[1] = initUrl.hostname === reqUrl.hostname ? 1 : 0;

      // Subdomain relationship
      features[2] = initUrl.hostname.endsWith('.' + reqUrl.hostname) || reqUrl.hostname.endsWith('.' + initUrl.hostname) ? 1 : 0;

      // Known ad network initiator
      const adInitiators = ['doubleclick.net', 'googlesyndication.com', 'googletagmanager.com', 'googletagservices.com', 'facebook.net', 'fbcdn.net'];
      features[3] = adInitiators.some(d => initUrl.hostname.includes(d)) ? 1 : 0;

      // Google initiator
      features[4] = initUrl.hostname.includes('google') ? 1 : 0;

      // Facebook initiator
      features[5] = initUrl.hostname.includes('facebook') || initUrl.hostname.includes('fbcdn') ? 1 : 0;

      // Analytics initiator
      features[6] = initUrl.hostname.includes('analytics') || initUrl.hostname.includes('stats') ? 1 : 0;

      // CDN initiator
      features[7] = /cdn|edge|static|cloudfront|akamai|fastly/i.test(initUrl.hostname) ? 1 : 0;

      // Path depth of initiator
      const initPathParts = initUrl.pathname.split('/').filter(p => p.length > 0);
      features[8] = Math.min(1, initPathParts.length / 20);

      // Initiator has query params
      features[9] = initUrl.searchParams.size > 0 ? 1 : 0;

    } catch (e) {}

    return features;
  }

  _extractResponseFeatures(response) {
    const features = new Array(24).fill(0);

    // Status code
    features[0] = response.status / 599 || 0;
    features[1] = response.status >= 400 ? 1 : 0;
    features[2] = response.status === 304 ? 1 : 0;
    features[2] = response.status === 204 ? 1 : 0;
    features[3] = response.status === 302 || response.status === 301 ? 1 : 0;

    // Content length
    if (response.contentLength) {
      features[4] = Math.min(1, response.contentLength / 1000000);
      features[5] = response.contentLength < 100 ? 1 : 0; // Very small
      features[6] = response.contentLength > 1000000 ? 1 : 0; // Very large
    }

    // Content type
    const ct = response.headers?.['content-type'] || '';
    features[7] = ct.includes('javascript') ? 1 : 0;
    features[8] = ct.includes('json') ? 1 : 0;
    features[9] = ct.includes('image') ? 1 : 0;
    features[10] = ct.includes('video') ? 1 : 0;
    features[11] = ct.includes('audio') ? 1 : 0;
    features[12] = ct.includes('text/html') ? 1 : 0;
    features[13] = ct.includes('text/css') ? 1 : 0;
    features[14] = ct.includes('font') ? 1 : 0;
    features[15] = ct.includes('xml') ? 1 : 0;

    // Cache headers
    const cc = response.headers?.['cache-control'] || '';
    features[16] = cc.includes('no-store') ? 1 : 0;
    features[17] = cc.includes('private') ? 1 : 0;
    features[18] = cc.includes('max-age=0') ? 1 : 0;
    features[19] = response.headers?.etag ? 1 : 0;
    features[20] = response.headers?.['last-modified'] ? 1 : 0;

    // Security headers
    features[21] = response.headers?.['x-frame-options'] ? 1 : 0;
    features[22] = response.headers?.['content-security-policy'] ? 1 : 0;
    features[23] = response.headers?.['strict-transport-security'] ? 1 : 0;

    return features;
  }

  _extractBehavioralFeatures(request) {
    const features = new Array(24).fill(0);

    // Would need history - placeholder for behavioral analyzer integration
    // These would be populated by BehavioralAnalyzer

    return features;
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  _entropy(str) {
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

  _tldToFeature(tld) {
    const tldMap = {
      'com': 0.1, 'org': 0.2, 'net': 0.3, 'io': 0.4, 'co': 0.5,
      'ai': 0.6, 'app': 0.7, 'dev': 0.8, 'xyz': 0.9, 'info': 1.0,
      'cn': 0.11, 'ru': 0.12, 'br': 0.13, 'in': 0.14, 'de': 0.15,
      'uk': 0.16, 'fr': 0.17, 'jp': 0.18, 'au': 0.19, 'ca': 0.20
    };
    return tldMap[tld] || 0;
  }

  _normalizeInPlace(vector) {
    // Simple min-max normalization per feature
    // In production, use pre-computed mean/std from training data
    for (let i = 0; i < vector.length; i++) {
      // Clamp to reasonable range
      if (vector[i] > 10) vector[i] = 10;
      if (vector[i] < -10) vector[i] = -10;
      // Normalize to [-1, 1] roughly
      vector[i] = Math.tanh(vector[i]);
    }
  }

  /**
   * Extract features from batch of requests
   */
  extractBatch(requests) {
    return requests.map(r => this.extractFeatures(r));
  }

  /**
   * Get feature names for debugging
   */
  getFeatureNames() {
    const names = [];

    // URL features (64)
    const urlNames = ['url_len', 'path_len', 'query_len', 'path_depth', 'param_count', 'has_fragment', 'is_https', 'has_port', 'subdomain_count', 'tld', 'path_entropy', 'query_entropy', 'suspicious_path', 'suspicious_query', 'ext', 'numeric_segments', 'suspicious_keyword_path'];
    for (let i = 0; i < 64; i++) names.push(urlNames[i] || `url_${i}`);

    // Domain features (32)
    const domainNames = ['known_ad', 'subdomain_ad', 'domain_len', 'subdomain_count', 'tld', 'domain_entropy', 'digit_ratio', 'hyphen_count'];
    for (let i = 0; i < 32; i++) names.push(domainNames[i] || `domain_${i}`);

    // Request features (24)
    const reqNames = ['method', 'resource_type', 'initiator_type', 'has_body', 'body_size', 'ct_json', 'ct_form', 'ct_multipart', 'rp_no_referrer', 'rp_same_origin', 'rp_strict', 'cc_no_cache', 'cc_no_store', 'cc_must_revalidate', 'priority', 'destination', 'keepalive', 'credentials', 'mode', 'redirect', 'integrity', 'signal'];
    for (let i = 0; i < 24; i++) names.push(reqNames[i] || `req_${i}`);

    // Timing features (16)
    const timeNames = ['hour_sin', 'hour_cos', 'day_sin', 'day_cos', 'is_weekend', 'business_hours', 'night_hours', 'resp_time', 'very_fast', 'very_slow', 'delta_load', 'pre_load'];
    for (let i = 0; i < 16; i++) names.push(timeNames[i] || `time_${i}`);

    // Header features (32)
    const headerNames = ['has_cookie', 'cookie_len', 'has_referer', 'same_origin_ref', 'has_ua', 'has_accept', 'has_accept_lang', 'has_accept_enc', 'has_origin', 'sec_fetch_site', 'sec_fetch_mode', 'sec_fetch_dest', 'sec_fetch_user', 'has_csp', 'has_csp_ro', 'has_permissions', 'cors_allow_origin', 'cors_allow_cred', 'server_timing', 'timing_allow', 'x_forwarded_for', 'x_real_ip', 'cf_connecting_ip', 'true_client_ip', 'x_requested_with', 'x_csrf', 'x_xsrf', 'cf_ray', 'cf_cache', 'amz_cf', 'x_cache', 'server'];
    for (let i = 0; i < 32; i++) names.push(headerNames[i] || `header_${i}`);

    // Payload features (24)
    const payloadNames = ['body_size', 'is_json', 'is_form', 'entropy', 'tracking_params', 'base64', 'ssn', 'cc', 'email', 'url_encoded', 'unicode_escaped', 'repeated_chars', 'single_line', 'minified'];
    for (let i = 0; i < 24; i++) names.push(payloadNames[i] || `payload_${i}`);

    // Initiator features (16)
    const initNames = ['same_origin', 'same_domain', 'subdomain_rel', 'ad_network_init', 'google_init', 'fb_init', 'analytics_init', 'cdn_init', 'init_path_depth', 'init_has_query'];
    for (let i = 0; i < 16; i++) names.push(initNames[i] || `init_${i}`);

    // Response features (24)
    const respNames = ['status', 'is_error', 'is_304', 'is_204', 'is_redirect', 'content_len', 'small_body', 'large_body', 'ct_js', 'ct_json', 'ct_image', 'ct_video', 'ct_audio', 'ct_html', 'ct_css', 'ct_font', 'ct_xml', 'cc_no_store', 'cc_private', 'cc_max_age_0', 'has_etag', 'has_lm', 'xfo', 'csp', 'hsts'];
    for (let i = 0; i < 24; i++) names.push(respNames[i] || `resp_${i}`);

    // Behavioral features (24)
    for (let i = 0; i < 24; i++) names.push(`behavioral_${i}`);

    return names.slice(0, this.options.maxFeatures);
  }

  /**
   * Export feature vector as JSON for debugging
   */
  featuresToJSON(vector) {
    const names = this.getFeatureNames();
    const obj = {};
    for (let i = 0; i < vector.length; i++) {
      if (vector[i] !== 0) {
        obj[names[i]] = vector[i];
      }
    }
    return obj;
  }
}