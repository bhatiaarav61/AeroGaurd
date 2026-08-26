// telemetry.js — Privacy-first telemetry for AeroGuard Ultra
// Zero-overhead, local-only, actionable metrics with PII protection

const STORAGE_KEY = 'telemetry_data';
const HEALTH_STORAGE_KEY = 'telemetry_health';
const MAX_EVENTS = 5000;
const MAX_HISTORY_DAYS = 7;
const FLUSH_INTERVAL_MS = 60000; // 1 minute
const HEALTH_INTERVAL_MS = 300000; // 5 minutes
const SAMPLING_RATE = 0.1; // 10% default sampling
const DIFFERENTIAL_PRIVACY_EPSILON = 0.5;

// ========== UTILITY: UUID v4 ==========
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] % 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ========== UTILITY: Correlation ID ==========
function generateCorrelationId() {
  return `${Date.now().toString(36)}-${generateUUID().slice(0, 8)}`;
}

// ========== PRIVACY ENGINE ==========
class PrivacyEngine {
  constructor(options = {}) {
    this.piiPatterns = [
      // Email addresses
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      // IP addresses (IPv4)
      /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      // IP addresses (IPv6)
      /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
      // UUIDs
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      // JWT tokens
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      // API keys (common patterns)
      /\b(?:api[_-]?key|access[_-]?token|secret)[_-]?[:=]\s*["']?[A-Za-z0-9_-]{20,}["']?/gi,
      // Credit card numbers (basic)
      /\b(?:\d[ -]*?){13,16}\b/g,
      // Phone numbers
      /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
      // Social security numbers
      /\b\d{3}-?\d{2}-?\d{4}\b/g,
      // URLs with potential PII in query params
      /[?&](?:email|user[_-]?id|username|password|token|auth|session|id|account)[=][^&]+/gi,
    ];

    this.sensitiveKeys = new Set([
      'email', 'password', 'token', 'secret', 'key', 'auth', 'session',
      'user_id', 'userid', 'username', 'account', 'credit_card', 'ssn',
      'phone', 'address', 'name', 'firstname', 'lastname', 'dob', 'birthdate'
    ]);

    this.epsilon = options.epsilon ?? DIFFERENTIAL_PRIVACY_EPSILON;
    this.enabled = options.enabled !== false;
  }

  /**
   * Strip PII from a string
   */
  stripPII(text) {
    if (!this.enabled || typeof text !== 'string') return text;
    let result = text;
    for (const pattern of this.piiPatterns) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }

  /**
   * Strip PII from an object recursively
   */
  sanitizeObject(obj, depth = 0) {
    if (!this.enabled || depth > 10) return obj;
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return this.stripPII(obj);
    if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.sanitizeObject(item, depth + 1));

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (this.sensitiveKeys.has(lowerKey) || this.sensitiveKeys.some(k => lowerKey.includes(k))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = this.sanitizeObject(value, depth + 1);
      }
    }
    return sanitized;
  }

  /**
   * Sanitize URL - keep only origin + pathname
   */
  sanitizeUrl(url) {
    if (!this.enabled) return url;
    try {
      const urlObj = new URL(url);
      // Remove query params and hash that might contain PII
      return urlObj.origin + urlObj.pathname;
    } catch {
      return '[INVALID_URL]';
    }
  }

  /**
   * Apply differential privacy noise to a numeric value
   */
  addNoise(value, sensitivity = 1) {
    if (!this.enabled || this.epsilon <= 0) return value;
    // Laplace mechanism
    const scale = sensitivity / this.epsilon;
    const u = Math.random() - 0.5;
    const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    return Math.max(0, Math.round(value + noise));
  }

  /**
   * Aggregate values with differential privacy
   */
  aggregateWithPrivacy(values, sensitivity = 1) {
    if (!this.enabled) return values.reduce((a, b) => a + b, 0);
    const sum = values.reduce((a, b) => a + b, 0);
    return this.addNoise(sum, sensitivity);
  }
}

// ========== METRIC TYPES ==========
class Metric {
  constructor(name, type, labels = {}) {
    this.name = name;
    this.type = type;
    this.labels = labels;
    this.timestamp = Date.now();
  }

  toKey() {
    const labelStr = Object.entries(this.labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${this.name}{${labelStr}}`;
  }
}

class Counter extends Metric {
  constructor(name, labels = {}) {
    super(name, 'counter', labels);
    this.value = 0;
  }

  inc(delta = 1, labels = {}) {
    this.value += delta;
    this.timestamp = Date.now();
    this.labels = { ...this.labels, ...labels };
    return this;
  }

  dec(delta = 1) {
    this.value = Math.max(0, this.value - delta);
    this.timestamp = Date.now();
    return this;
  }

  get() {
    return this.value;
  }

  reset() {
    this.value = 0;
    this.timestamp = Date.now();
  }
}

class Gauge extends Metric {
  constructor(name, labels = {}) {
    super(name, 'gauge', labels);
    this.value = 0;
  }

  set(value, labels = {}) {
    this.value = value;
    this.timestamp = Date.now();
    this.labels = { ...this.labels, ...labels };
    return this;
  }

  inc(delta = 1) {
    this.value += delta;
    this.timestamp = Date.now();
    return this;
  }

  dec(delta = 1) {
    this.value -= delta;
    this.timestamp = Date.now();
    return this;
  }

  get() {
    return this.value;
  }
}

class Histogram extends Metric {
  constructor(name, labels = {}, buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]) {
    super(name, 'histogram', labels);
    this.buckets = [...buckets, Infinity].sort((a, b) => a - b);
    this.counts = new Array(this.buckets.length).fill(0);
    this.sum = 0;
    this.count = 0;
  }

  observe(value, labels = {}) {
    this.count++;
    this.sum += value;
    this.timestamp = Date.now();
    this.labels = { ...this.labels, ...labels };

    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        this.counts[i]++;
        break;
      }
    }
    return this;
  }

  getQuantile(q) {
    if (this.count === 0) return 0;
    const target = this.count * q;
    let cumsum = 0;
    for (let i = 0; i < this.buckets.length; i++) {
      cumsum += this.counts[i];
      if (cumsum >= target) {
        return this.buckets[i];
      }
    }
    return this.buckets[this.buckets.length - 1];
  }

  getStats() {
    return {
      count: this.count,
      sum: this.sum,
      min: this.count > 0 ? this.getQuantile(0) : 0,
      max: this.count > 0 ? this.getQuantile(1) : 0,
      mean: this.count > 0 ? this.sum / this.count : 0,
      p50: this.getQuantile(0.5),
      p90: this.getQuantile(0.9),
      p95: this.getQuantile(0.95),
      p99: this.getQuantile(0.99),
      buckets: this.buckets.map((b, i) => ({ le: b === Infinity ? '+Inf' : b, count: this.counts[i] }))
    };
  }

  reset() {
    this.counts.fill(0);
    this.sum = 0;
    this.count = 0;
    this.timestamp = Date.now();
  }
}

class Summary extends Metric {
  constructor(name, labels = {}, maxAgeSeconds = 600, ageBuckets = 5) {
    super(name, 'summary', labels);
    this.maxAgeSeconds = maxAgeSeconds;
    this.ageBuckets = ageBuckets;
    this.buckets = Array.from({ length: ageBuckets }, () => ({
      values: [],
      startTime: Date.now()
    }));
    this.currentBucket = 0;
  }

  _rotateBuckets() {
    const now = Date.now();
    const bucketDuration = (this.maxAgeSeconds * 1000) / this.ageBuckets;
    while (now - this.buckets[this.currentBucket].startTime > bucketDuration) {
      this.buckets[this.currentBucket] = { values: [], startTime: now };
      this.currentBucket = (this.currentBucket + 1) % this.ageBuckets;
    }
  }

  observe(value, labels = {}) {
    this._rotateBuckets();
    this.buckets[this.currentBucket].values.push(value);
    this.timestamp = Date.now();
    this.labels = { ...this.labels, ...labels };
    return this;
  }

  getQuantile(q) {
    this._rotateBuckets();
    const allValues = this.buckets.flatMap(b => b.values).sort((a, b) => a - b);
    if (allValues.length === 0) return 0;
    const index = Math.min(allValues.length - 1, Math.floor(q * allValues.length));
    return allValues[index];
  }

  getStats() {
    this._rotateBuckets();
    const allValues = this.buckets.flatMap(b => b.values);
    const count = allValues.length;
    const sum = allValues.reduce((a, b) => a + b, 0);
    return {
      count,
      sum,
      min: count > 0 ? Math.min(...allValues) : 0,
      max: count > 0 ? Math.max(...allValues) : 0,
      mean: count > 0 ? sum / count : 0,
      p50: this.getQuantile(0.5),
      p90: this.getQuantile(0.9),
      p95: this.getQuantile(0.95),
      p99: this.getQuantile(0.99)
    };
  }

  reset() {
    this.buckets.forEach(b => b.values = []);
    this.currentBucket = 0;
    this.timestamp = Date.now();
  }
}

// ========== LOCAL AGGREGATOR ==========
class LocalAggregator {
  constructor(options = {}) {
    this.buffers = new Map(); // metricKey -> { metric, pendingFlush: boolean }
    this.flushInterval = options.flushInterval ?? FLUSH_INTERVAL_MS;
    this.maxBufferSize = options.maxBufferSize ?? MAX_EVENTS;
    this.timer = null;
    this.storage = options.storage || (typeof chrome !== 'undefined' ? chrome.storage.local : null);
    this.privacyEngine = new PrivacyEngine(options.privacy);
    this.onFlush = options.onFlush || (() => {});
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), this.flushInterval);
    if (this.timer.unref) this.timer.unref();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  add(metric) {
    const key = metric.toKey();
    const existing = this.buffers.get(key);

    if (existing) {
      // Merge metric values
      this.mergeMetrics(existing.metric, metric);
      existing.pendingFlush = true;
    } else {
      if (this.buffers.size >= this.maxBufferSize) {
        // Evict oldest
        const firstKey = this.buffers.keys().next().value;
        this.buffers.delete(firstKey);
      }
      this.buffers.set(key, { metric, pendingFlush: true });
    }
  }

  mergeMetrics(existing, incoming) {
    if (existing.type !== incoming.type) return;

    switch (existing.type) {
      case 'counter':
        existing.value += incoming.value;
        break;
      case 'gauge':
        existing.value = incoming.value; // Last write wins
        break;
      case 'histogram':
        existing.count += incoming.count;
        existing.sum += incoming.sum;
        for (let i = 0; i < existing.counts.length; i++) {
          existing.counts[i] += incoming.counts[i];
        }
        break;
      case 'summary':
        existing.buckets[incoming.currentBucket].values.push(...incoming.buckets[incoming.currentBucket].values);
        break;
    }
    existing.timestamp = Math.max(existing.timestamp, incoming.timestamp);
    existing.labels = { ...existing.labels, ...incoming.labels };
  }

  async flush() {
    if (this.buffers.size === 0) return;

    const toFlush = [];
    for (const [key, entry] of this.buffers) {
      if (entry.pendingFlush) {
        toFlush.push(this.privacyEngine.sanitizeObject(entry.metric));
        entry.pendingFlush = false;
      }
    }

    if (toFlush.length > 0 && this.storage) {
      try {
        await this.storage.set({ [STORAGE_KEY]: toFlush });
        this.onFlush(toFlush.length);
      } catch (error) {
        console.error('[LocalAggregator] Flush failed:', error);
      }
    }
  }

  async load() {
    if (!this.storage) return;
    try {
      const { [STORAGE_KEY]: data } = await this.storage.get(STORAGE_KEY);
      if (data && Array.isArray(data)) {
        for (const item of data) {
          const metric = this.deserializeMetric(item);
          if (metric) this.buffers.set(metric.toKey(), { metric, pendingFlush: false });
        }
      }
    } catch (error) {
      console.error('[LocalAggregator] Load failed:', error);
    }
  }

  deserializeMetric(data) {
    let metric;
    switch (data.type) {
      case 'counter': metric = new Counter(data.name, data.labels); metric.value = data.value; break;
      case 'gauge': metric = new Gauge(data.name, data.labels); metric.value = data.value; break;
      case 'histogram':
        metric = new Histogram(data.name, data.labels, data.buckets?.slice(0, -1));
        metric.counts = data.counts || [];
        metric.sum = data.sum || 0;
        metric.count = data.count || 0;
        break;
      case 'summary':
        metric = new Summary(data.name, data.labels, data.maxAgeSeconds, data.ageBuckets);
        metric.buckets = data.buckets || [];
        metric.currentBucket = data.currentBucket || 0;
        break;
      default: return null;
    }
    metric.timestamp = data.timestamp || Date.now();
    return metric;
  }

  getAllMetrics() {
    const result = [];
    for (const [, entry] of this.buffers) {
      result.push(this.privacyEngine.sanitizeObject(entry.metric));
    }
    return result;
  }

  clear() {
    this.buffers.clear();
  }
}

// ========== EVENT RECORDER ==========
class EventRecorder {
  constructor(options = {}) {
    this.events = [];
    this.maxEvents = options.maxEvents ?? MAX_EVENTS;
    this.samplingRate = options.samplingRate ?? SAMPLING_RATE;
    this.privacyEngine = new PrivacyEngine(options.privacy);
    this.correlationContext = new Map(); // correlationId -> context
  }

  /**
   * Record a structured event
   */
  record(eventType, data = {}, options = {}) {
    // Sampling
    if (Math.random() > this.samplingRate) return null;

    const correlationId = options.correlationId || generateCorrelationId();
    const timestamp = Date.now();

    const event = {
      id: generateUUID(),
      correlationId,
      type: eventType,
      timestamp,
      data: this.privacyEngine.sanitizeObject(data),
      tags: options.tags || {},
      source: options.source || 'background'
    };

    // Add to correlation context
    if (!this.correlationContext.has(correlationId)) {
      this.correlationContext.set(correlationId, {
        startTime: timestamp,
        events: [],
        metadata: options.metadata || {}
      });
    }
    this.correlationContext.get(correlationId).events.push(event.id);

    // Add to buffer
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    return { correlationId, eventId: event.id };
  }

  /**
   * Start a correlated operation
   */
  startCorrelation(operationName, metadata = {}) {
    const correlationId = generateCorrelationId();
    this.correlationContext.set(correlationId, {
      startTime: Date.now(),
      operationName,
      events: [],
      metadata
    });
    return correlationId;
  }

  /**
   * End a correlated operation
   */
  endCorrelation(correlationId, outcome = 'success', extraData = {}) {
    const context = this.correlationContext.get(correlationId);
    if (!context) return null;

    const duration = Date.now() - context.startTime;
    this.record(`${context.operationName}.${outcome}`, {
      duration,
      ...extraData
    }, { correlationId, tags: { operation: context.operationName, outcome } });

    const result = { ...context, duration, outcome };
    this.correlationContext.delete(correlationId);
    return result;
  }

  /**
   * Get events with optional filtering
   */
  getEvents(filter = {}) {
    let result = [...this.events];

    if (filter.type) {
      result = result.filter(e => e.type === filter.type);
    }
    if (filter.correlationId) {
      result = result.filter(e => e.correlationId === filter.correlationId);
    }
    if (filter.since) {
      result = result.filter(e => e.timestamp >= filter.since);
    }
    if (filter.limit) {
      result = result.slice(-filter.limit);
    }

    return result;
  }

  /**
   * Get correlation trace
   */
  getTrace(correlationId) {
    const context = this.correlationContext.get(correlationId);
    if (!context) return null;

    const events = this.events.filter(e => e.correlationId === correlationId);
    return { ...context, events };
  }

  clear() {
    this.events = [];
    this.correlationContext.clear();
  }
}

// ========== PERFORMANCE TRACKER ==========
class PerformanceTracker {
  constructor(options = {}) {
    this.privacyEngine = new PrivacyEngine(options.privacy);
    this.navigationTiming = null;
    this.resourceTimings = [];
    this.userTimings = [];
    this.longTasks = [];
    this.observers = [];
    this.enabled = options.enabled !== false;
  }

  init() {
    if (!this.enabled || typeof performance === 'undefined') return;

    // Navigation Timing
    this.captureNavigationTiming();

    // Resource Timing
    this.setupResourceTimingObserver();

    // User Timing
    this.setupUserTimingObserver();

    // Long Tasks
    this.setupLongTaskObserver();

    // Memory
    this.setupMemoryMonitoring();
  }

  captureNavigationTiming() {
    if (performance.timing) {
      const t = performance.timing;
      this.navigationTiming = {
        dns: t.domainLookupEnd - t.domainLookupStart,
        tcp: t.connectEnd - t.connectStart,
        ssl: t.connectEnd - t.secureConnectionStart,
        ttfb: t.responseStart - t.requestStart,
        download: t.responseEnd - t.responseStart,
        domInteractive: t.domInteractive - t.navigationStart,
        domComplete: t.domComplete - t.navigationStart,
        loadComplete: t.loadEventEnd - t.navigationStart,
        redirect: t.redirectEnd - t.redirectStart,
        unload: t.unloadEventEnd - t.unloadEventStart
      };
    }

    // Navigation Timing Level 2
    if (performance.getEntriesByType) {
      const navEntries = performance.getEntriesByType('navigation');
      if (navEntries.length > 0) {
        const nav = navEntries[0];
        this.navigationTiming = {
          ...this.navigationTiming,
          type: nav.type,
          redirectCount: nav.redirectCount,
          domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
          loadEvent: nav.loadEventEnd - nav.loadEventStart,
          domInteractive: nav.domInteractive,
          domComplete: nav.domComplete
        };
      }
    }
  }

  setupResourceTimingObserver() {
    if (!PerformanceObserver) return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.resourceTimings.push({
            name: this.privacyEngine.sanitizeUrl(entry.name),
            type: entry.initiatorType,
            duration: entry.duration,
            size: entry.transferSize || entry.encodedBodySize || 0,
            startTime: entry.startTime,
            redirect: entry.redirectStart ? entry.redirectEnd - entry.redirectStart : 0,
            dns: entry.domainLookupEnd - entry.domainLookupStart,
            tcp: entry.connectEnd - entry.connectStart,
            ssl: entry.secureConnectionStart ? entry.connectEnd - entry.secureConnectionStart : 0,
            ttfb: entry.responseStart - entry.requestStart,
            download: entry.responseEnd - entry.responseStart
          });
        }
        // Keep only recent
        if (this.resourceTimings.length > 1000) {
          this.resourceTimings = this.resourceTimings.slice(-500);
        }
      });
      observer.observe({ type: 'resource', buffered: true });
      this.observers.push(observer);
    } catch (e) {
      // Not supported
    }
  }

  setupUserTimingObserver() {
    if (!PerformanceObserver) return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.userTimings.push({
            name: entry.name,
            type: entry.entryType,
            startTime: entry.startTime,
            duration: entry.duration
          });
        }
        if (this.userTimings.length > 500) {
          this.userTimings = this.userTimings.slice(-250);
        }
      });
      observer.observe({ type: 'measure', buffered: true });
      observer.observe({ type: 'mark', buffered: true });
      this.observers.push(observer);
    } catch (e) {
      // Not supported
    }
  }

  setupLongTaskObserver() {
    if (!PerformanceObserver) return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTasks.push({
            startTime: entry.startTime,
            duration: entry.duration,
            attribution: entry.attribution?.map(a => ({
              name: a.name,
              type: a.attributionType,
              container: a.containerType
            })) || []
          });
        }
        if (this.longTasks.length > 100) {
          this.longTasks = this.longTasks.slice(-50);
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
      this.observers.push(observer);
    } catch (e) {
      // Not supported
    }
  }

  setupMemoryMonitoring() {
    if (performance.memory) {
      setInterval(() => {
        this.recordMemorySnapshot();
      }, 60000);
    }
  }

  recordMemorySnapshot() {
    if (!performance.memory) return;
    this.memorySnapshots = this.memorySnapshots || [];
    this.memorySnapshots.push({
      timestamp: Date.now(),
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit
    });
    if (this.memorySnapshots.length > 1440) { // 24 hours at 1/min
      this.memorySnapshots = this.memorySnapshots.slice(-720);
    }
  }

  mark(name) {
    if (performance.mark) performance.mark(name);
  }

  measure(name, startMark, endMark) {
    if (performance.measure) performance.measure(name, startMark, endMark);
  }

  getNavigationTiming() {
    return this.navigationTiming;
  }

  getResourceTimings(limit = 100) {
    return this.resourceTimings.slice(-limit);
  }

  getUserTimings(limit = 100) {
    return this.userTimings.slice(-limit);
  }

  getLongTasks(limit = 50) {
    return this.longTasks.slice(-limit);
  }

  getMemorySnapshots(limit = 60) {
    return this.memorySnapshots?.slice(-limit) || [];
  }

  disconnect() {
    for (const observer of this.observers) {
      observer.disconnect();
    }
    this.observers = [];
  }
}

// ========== HEALTH REPORTER ==========
class HealthReporter {
  constructor(options = {}) {
    this.telemetry = options.telemetry;
    this.interval = options.interval ?? HEALTH_INTERVAL_MS;
    this.timer = null;
    this.snapshots = [];
    this.maxSnapshots = 288; // 24 hours at 5 min intervals
    this.anomalyThresholds = {
      memoryGrowthRate: 10 * 1024 * 1024, // 10 MB/min
      errorRate: 0.1, // 10%
      cpuTime: 5000, // 5 seconds per minute
      ruleProcessingTime: 100 // 100ms
    };
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.captureSnapshot(), this.interval);
    if (this.timer.unref) this.timer.unref();
    // Initial snapshot
    this.captureSnapshot();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async captureSnapshot() {
    const now = Date.now();
    const snapshot = {
      timestamp: now,
      memory: this.getMemoryInfo(),
      cpu: this.getCPUInfo(),
      extension: this.getExtensionHealth(),
      anomalies: []
    };

    // Detect anomalies
    snapshot.anomalies = this.detectAnomalies(snapshot);

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    // Persist
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        await chrome.storage.local.set({ [HEALTH_STORAGE_KEY]: this.snapshots });
      } catch (e) {
        // Ignore
      }
    }

    return snapshot;
  }

  getMemoryInfo() {
    if (typeof performance !== 'undefined' && performance.memory) {
      const mem = performance.memory;
      return {
        used: mem.usedJSHeapSize,
        total: mem.totalJSHeapSize,
        limit: mem.jsHeapSizeLimit,
        usagePercent: (mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100
      };
    }
    return null;
  }

  getCPUInfo() {
    // In service worker, we can't get real CPU time
    // But we can track our own processing time
    return {
      // Estimated from our own metrics
      ruleProcessingTime: this.telemetry?.getMetric('rule_processing_duration')?.get() || 0,
      filterMatchingTime: this.telemetry?.getMetric('filter_match_duration')?.get() || 0
    };
  }

  getExtensionHealth() {
    if (!this.telemetry) return {};

    const stats = this.telemetry.getStats?.() || {};
    return {
      isEnabled: stats.isEnabled !== false,
      dnrAvailable: stats.dnrAvailable !== false,
      totalRules: stats.totalRules || 0,
      blockedRequests: stats.totalBlocked || 0,
      errorCount: stats.errorCount || 0,
      uptime: stats.uptime || 0
    };
  }

  detectAnomalies(current) {
    const anomalies = [];

    // Memory growth
    if (this.snapshots.length > 1) {
      const prev = this.snapshots[this.snapshots.length - 1];
      if (prev.memory && current.memory) {
        const growthRate = (current.memory.used - prev.memory.used) / (this.interval / 60000);
        if (growthRate > this.anomalyThresholds.memoryGrowthRate) {
          anomalies.push({
            type: 'memory_growth',
            severity: 'warning',
            value: growthRate,
            threshold: this.anomalyThresholds.memoryGrowthRate,
            message: `Memory growing at ${(growthRate / 1024 / 1024).toFixed(1)} MB/min`
          });
        }
      }
    }

    // High memory usage
    if (current.memory && current.memory.usagePercent > 90) {
      anomalies.push({
        type: 'high_memory',
        severity: 'critical',
        value: current.memory.usagePercent,
        threshold: 90,
        message: `Memory usage at ${current.memory.usagePercent.toFixed(1)}%`
      });
    }

    // Error rate
    if (this.telemetry) {
      const errorRate = this.telemetry.getErrorRate?.() || 0;
      if (errorRate > this.anomalyThresholds.errorRate) {
        anomalies.push({
          type: 'high_error_rate',
          severity: 'warning',
          value: errorRate,
          threshold: this.anomalyThresholds.errorRate,
          message: `Error rate at ${(errorRate * 100).toFixed(1)}%`
        });
      }
    }

    return anomalies;
  }

  getSnapshots(limit = 60) {
    return this.snapshots.slice(-limit);
  }

  getAnomalies(since = 0) {
    const allAnomalies = this.snapshots.flatMap(s => s.anomalies);
    return allAnomalies.filter(a => a.timestamp >= since);
  }

  async loadPersisted() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const { [HEALTH_STORAGE_KEY]: data } = await chrome.storage.local.get(HEALTH_STORAGE_KEY);
        if (data && Array.isArray(data)) {
          this.snapshots = data.slice(-this.maxSnapshots);
        }
      } catch (e) {
        // Ignore
      }
    }
  }
}

// ========== EXPORT API ==========
class ExportAPI {
  constructor(telemetry) {
    this.telemetry = telemetry;
    this.setupMessageHandlers();
  }

  setupMessageHandlers() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'GET_TELEMETRY_STATS':
          sendResponse(this.getStats());
          return true;

        case 'GET_TELEMETRY_METRICS':
          sendResponse(this.getPrometheusMetrics());
          return true;

        case 'GET_TELEMETRY_EVENTS':
          sendResponse(this.getEvents(message.filter));
          return true;

        case 'GET_TELEMETRY_HEALTH':
          sendResponse(this.getHealth());
          return true;

        case 'GET_TELEMETRY_PERFORMANCE':
          sendResponse(this.getPerformance());
          return true;

        case 'TELEMETRY_RESET':
          this.telemetry.reset();
          sendResponse({ success: true });
          return true;

        case 'TELEMETRY_EXPORT':
          sendResponse(this.telemetry.exportData());
          return true;
      }
      return false;
    });
  }

  getStats() {
    return this.telemetry.getStats();
  }

  getPrometheusMetrics() {
    return this.telemetry.toPrometheusFormat();
  }

  getEvents(filter = {}) {
    return this.telemetry.eventRecorder.getEvents(filter);
  }

  getHealth() {
    return this.telemetry.healthReporter.getSnapshots(60);
  }

  getPerformance() {
    return {
      navigation: this.telemetry.performanceTracker.getNavigationTiming(),
      resources: this.telemetry.performanceTracker.getResourceTimings(50),
      userTimings: this.telemetry.performanceTracker.getUserTimings(50),
      longTasks: this.telemetry.performanceTracker.getLongTasks(20),
      memory: this.telemetry.performanceTracker.getMemorySnapshots(30)
    };
  }
}

// ========== MAIN TELEMETRY CLASS ==========
class Telemetry {
  constructor(options = {}) {
    this.options = options;
    this.privacyEngine = new PrivacyEngine(options.privacy);
    this.metrics = new Map(); // key -> Metric
    this.aggregator = new LocalAggregator({
      flushInterval: options.flushInterval,
      maxBufferSize: options.maxBufferSize,
      privacy: options.privacy,
      onFlush: (count) => this.onFlush(count)
    });
    this.eventRecorder = new EventRecorder({
      maxEvents: options.maxEvents,
      samplingRate: options.samplingRate,
      privacy: options.privacy
    });
    this.performanceTracker = new PerformanceTracker({ privacy: options.privacy });
    this.healthReporter = new HealthReporter({ telemetry: this, interval: options.healthInterval });
    this.exportAPI = new ExportAPI(this);

    // Built-in metrics
    this.initBuiltinMetrics();

    this.isInitialized = false;
  }

  initBuiltinMetrics() {
    // Counters
    this.counter('requests_total', { description: 'Total requests processed' });
    this.counter('requests_blocked_total', { description: 'Total requests blocked' });
    this.counter('requests_allowed_total', { description: 'Total requests allowed' });
    this.counter('errors_total', { description: 'Total errors' });
    this.counter('filter_list_updates_total', { description: 'Filter list updates' });
    this.counter('dnr_rule_updates_total', { description: 'DNR rule updates' });
    this.counter('fallback_activations_total', { description: 'WebRequest fallback activations' });

    // Gauges
    this.gauge('active_rules', { description: 'Currently active DNR rules' });
    this.gauge('memory_usage_bytes', { description: 'Memory usage in bytes' });
    this.gauge('filter_lists_enabled', { description: 'Number of enabled filter lists' });
    this.gauge('youtube_blocking_mode', { description: 'YouTube blocking mode (0=off, 1=standard, 2=aggressive)' });

    // Histograms
    this.histogram('request_processing_duration_seconds', { description: 'Request processing latency' });
    this.histogram('filter_match_duration_seconds', { description: 'Filter matching latency' });
    this.histogram('dnr_update_duration_seconds', { description: 'DNR rule update duration' });
    this.histogram('storage_operation_duration_seconds', { description: 'Storage operation latency' });

    // Summaries
    this.summary('session_duration_seconds', { description: 'Session duration' });
    this.summary('rules_per_list', { description: 'Rules per filter list' });
  }

  async init() {
    if (this.isInitialized) return;

    await this.aggregator.load();
    await this.healthReporter.loadPersisted();
    this.performanceTracker.init();
    this.aggregator.start();
    this.healthReporter.start();
    this.isInitialized = true;

    // Record startup event
    this.recordEvent('telemetry_started', { version: this.options.version });

    console.log('[Telemetry] Initialized');
  }

  // ========== Metric Factory Methods ==========
  counter(name, labels = {}) {
    const key = this._metricKey(name, labels);
    if (!this.metrics.has(key)) {
      this.metrics.set(key, new Counter(name, labels));
    }
    return this.metrics.get(key);
  }

  gauge(name, labels = {}) {
    const key = this._metricKey(name, labels);
    if (!this.metrics.has(key)) {
      this.metrics.set(key, new Gauge(name, labels));
    }
    return this.metrics.get(key);
  }

  histogram(name, labels = {}, buckets) {
    const key = this._metricKey(name, labels);
    if (!this.metrics.has(key)) {
      this.metrics.set(key, new Histogram(name, labels, buckets));
    }
    return this.metrics.get(key);
  }

  summary(name, labels = {}, maxAgeSeconds, ageBuckets) {
    const key = this._metricKey(name, labels);
    if (!this.metrics.has(key)) {
      this.metrics.set(key, new Summary(name, labels, maxAgeSeconds, ageBuckets));
    }
    return this.metrics.get(key);
  }

  _metricKey(name, labels) {
    const labelStr = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}="${v}"`).join(',');
    return `${name}{${labelStr}}`;
  }

  getMetric(name, labels = {}) {
    return this.metrics.get(this._metricKey(name, labels));
  }

  // ========== Recording Methods ==========
  recordEvent(eventType, data = {}, options = {}) {
    return this.eventRecorder.record(eventType, data, options);
  }

  startOperation(name, metadata = {}) {
    return this.eventRecorder.startCorrelation(name, metadata);
  }

  endOperation(correlationId, outcome = 'success', data = {}) {
    return this.eventRecorder.endCorrelation(correlationId, outcome, data);
  }

  // ========== High-level tracking ==========
  trackRequest(blocked, url, ruleId, listId, durationMs) {
    this.counter('requests_total').inc();
    if (blocked) {
      this.counter('requests_blocked_total').inc(1, { list: listId });
    } else {
      this.counter('requests_allowed_total').inc(1, { list: listId });
    }
    this.histogram('request_processing_duration_seconds').observe(durationMs / 1000, { blocked: String(blocked) });
  }

  trackFilterMatch(durationMs, matched, listId) {
    this.histogram('filter_match_duration_seconds').observe(durationMs / 1000, { matched: String(matched), list: listId });
  }

  trackDNRUpdate(durationMs, ruleCount, success) {
    this.counter('dnr_rule_updates_total').inc(1, { success: String(success) });
    this.histogram('dnr_update_duration_seconds').observe(durationMs / 1000);
    this.gauge('active_rules').set(ruleCount);
  }

  trackError(operation, error) {
    this.counter('errors_total').inc(1, { operation });
    this.recordEvent('error', { operation, message: error.message, stack: error.stack });
  }

  trackStorageOperation(operation, durationMs, success) {
    this.histogram('storage_operation_duration_seconds').observe(durationMs / 1000, { operation, success: String(success) });
  }

  trackFilterListUpdate(listId, ruleCount, success) {
    this.counter('filter_list_updates_total').inc(1, { list: listId, success: String(success) });
    this.summary('rules_per_list').observe(ruleCount, { list: listId });
  }

  setYouTubeMode(mode) {
    const modeMap = { off: 0, standard: 1, aggressive: 2 };
    this.gauge('youtube_blocking_mode').set(modeMap[mode] ?? 0);
  }

  setFilterListsEnabled(count) {
    this.gauge('filter_lists_enabled').set(count);
  }

  updateMemoryUsage(bytes) {
    this.gauge('memory_usage_bytes').set(bytes);
  }

  // ========== Stats & Export ==========
  getStats() {
    const metrics = {};
    for (const [key, metric] of this.metrics) {
      metrics[key] = this._serializeMetric(metric);
    }

    return {
      metrics,
      events: this.eventRecorder.getEvents({ limit: 100 }),
      health: this.healthReporter.getSnapshots(10),
      performance: this.getPerformanceSummary(),
      privacy: {
        piiStripping: this.privacyEngine.enabled,
        differentialPrivacy: this.privacyEngine.epsilon > 0,
        epsilon: this.privacyEngine.epsilon
      }
    };
  }

  _serializeMetric(metric) {
    const base = {
      name: metric.name,
      type: metric.type,
      labels: metric.labels,
      timestamp: metric.timestamp
    };

    switch (metric.type) {
      case 'counter':
        return { ...base, value: metric.value };
      case 'gauge':
        return { ...base, value: metric.value };
      case 'histogram':
        return { ...base, ...metric.getStats() };
      case 'summary':
        return { ...base, ...metric.getStats() };
      default:
        return base;
    }
  }

  getPerformanceSummary() {
    const nav = this.performanceTracker.getNavigationTiming();
    const resources = this.performanceTracker.getResourceTimings(100);
    const longTasks = this.performanceTracker.getLongTasks(20);

    return {
      navigation: nav,
      resourceCount: resources.length,
      slowResources: resources.filter(r => r.duration > 1000).length,
      longTaskCount: longTasks.length,
      totalLongTaskTime: longTasks.reduce((sum, t) => sum + t.duration, 0)
    };
  }

  toPrometheusFormat() {
    let output = '';
    for (const [, metric] of this.metrics) {
      output += this._metricToPrometheus(metric) + '\n';
    }
    return output;
  }

  _metricToPrometheus(metric) {
    const labels = Object.entries(metric.labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    const labelStr = labels ? `{${labels}}` : '';
    const timestamp = metric.timestamp;

    switch (metric.type) {
      case 'counter':
        return `# TYPE ${metric.name} counter\n${metric.name}${labelStr} ${metric.value} ${timestamp}`;
      case 'gauge':
        return `# TYPE ${metric.name} gauge\n${metric.name}${labelStr} ${metric.value} ${timestamp}`;
      case 'histogram': {
        const stats = metric.getStats();
        let result = `# TYPE ${metric.name} histogram\n`;
        for (const bucket of stats.buckets) {
          const leLabel = labels ? `${labels},le="${bucket.le}"` : `le="${bucket.le}"`;
          result += `${metric.name}_bucket{${leLabel}} ${bucket.count} ${timestamp}\n`;
        }
        result += `${metric.name}_count${labelStr} ${stats.count} ${timestamp}\n`;
        result += `${metric.name}_sum${labelStr} ${stats.sum} ${timestamp}\n`;
        return result;
      }
      case 'summary': {
        const stats = metric.getStats();
        let result = `# TYPE ${metric.name} summary\n`;
        result += `${metric.name}_count${labelStr} ${stats.count} ${timestamp}\n`;
        result += `${metric.name}_sum${labelStr} ${stats.sum} ${timestamp}\n`;
        for (const q of [0.5, 0.9, 0.95, 0.99]) {
          const qLabel = labels ? `${labels},quantile="${q}"` : `quantile="${q}"`;
          result += `${metric.name}{${qLabel}} ${metric.getQuantile(q)} ${timestamp}\n`;
        }
        return result;
      }
      default:
        return '';
    }
  }

  async exportData() {
    return {
      version: this.options.version || '1.0.0',
      exportedAt: Date.now(),
      metrics: this.getStats().metrics,
      events: this.eventRecorder.getEvents({ limit: 1000 }),
      health: this.healthReporter.getSnapshots(),
      performance: this.performanceTracker.getResourceTimings(500),
      privacy: {
        piiStripping: this.privacyEngine.enabled,
        differentialPrivacy: this.privacyEngine.epsilon > 0
      }
    };
  }

  reset() {
    for (const [, metric] of this.metrics) {
      metric.reset();
    }
    this.eventRecorder.clear();
    this.aggregator.clear();
    this.healthReporter.snapshots = [];
    this.performanceTracker.resourceTimings = [];
    this.performanceTracker.userTimings = [];
    this.performanceTracker.longTasks = [];
    this.recordEvent('telemetry_reset', {});
  }

  async suspend() {
    this.aggregator.stop();
    this.healthReporter.stop();
    await this.aggregator.flush();
    this.performanceTracker.disconnect();
  }

  onFlush(count) {
    // Called when aggregator flushes
    this.recordEvent('metrics_flushed', { count });
  }
}

// ========== SINGLETON EXPORT ==========
const telemetry = new Telemetry({
  version: '5.0.0',
  flushInterval: FLUSH_INTERVAL_MS,
  healthInterval: HEALTH_INTERVAL_MS,
  maxEvents: MAX_EVENTS,
  maxBufferSize: MAX_EVENTS,
  samplingRate: SAMPLING_RATE,
  privacy: {
    enabled: true,
    epsilon: DIFFERENTIAL_PRIVACY_EPSILON
  }
});

export {
  Telemetry,
  telemetry,
  PrivacyEngine,
  Counter,
  Gauge,
  Histogram,
  Summary,
  LocalAggregator,
  EventRecorder,
  PerformanceTracker,
  HealthReporter,
  ExportAPI,
  generateUUID,
  generateCorrelationId
};

export default telemetry;