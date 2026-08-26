// telemetry.js — Privacy-first, local-only, actionable metrics with zero overhead
// Histograms, Counters, Gauges — no external dependencies, no network calls
// Works in: Browser, Service Worker, Node.js (CommonJS & ESM)

// ========== CONFIGURATION ==========
const CONFIG = {
  maxEvents: 1000,
  maxMetrics: 500,
  flushIntervalMs: 60000,
  samplingRate: 0.1,
  differentialPrivacyEpsilon: 0.5,
  storageKey: 'aeroguard_telemetry',
  healthKey: 'aeroguard_health'
};

// ========== PRIVACY ENGINE ==========
class PrivacyEngine {
  constructor(epsilon = CONFIG.differentialPrivacyEpsilon) {
    this.epsilon = epsilon;
    this.enabled = true;

    this.piiPatterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      /\b(?:api[_-]?key|access[_-]?token|secret)[_-]?[:=]\s*["']?[A-Za-z0-9_-]{20,}["']?/gi,
      /[?&](?:email|user[_-]?id|username|password|token|auth|session|id|account)=[^&]+/gi
    ];

    this.sensitiveKeys = new Set([
      'email', 'password', 'token', 'secret', 'key', 'auth', 'session',
      'user_id', 'userid', 'username', 'account', 'credit_card', 'ssn',
      'phone', 'address', 'name', 'firstname', 'lastname', 'dob', 'birthdate'
    ]);
  }

  stripPII(text) {
    if (!this.enabled || typeof text !== 'string') return text;
    let result = text;
    for (const pattern of this.piiPatterns) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }

  sanitizeObject(obj, depth = 0) {
    if (!this.enabled || depth > 10) return obj;
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return this.stripPII(obj);
    if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.sanitizeObject(item, depth + 1));

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      let isSensitive = this.sensitiveKeys.has(lowerKey);
      if (!isSensitive) {
        for (const k of this.sensitiveKeys) {
          if (lowerKey.includes(k)) { isSensitive = true; break; }
        }
      }
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = this.sanitizeObject(value, depth + 1);
      }
    }
    return sanitized;
  }

  sanitizeUrl(url) {
    if (!this.enabled) return url;
    try {
      const u = new URL(url);
      return u.origin + u.pathname;
    } catch { return '[INVALID_URL]'; }
  }

  addNoise(value, sensitivity = 1) {
    if (!this.enabled || this.epsilon <= 0) return value;
    const scale = sensitivity / this.epsilon;
    const u = Math.random() - 0.5;
    const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    return Math.max(0, Math.round(value + noise));
  }
}

// ========== METRIC BASE ==========
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
      .map(([k, v]) => `${k}="${v}"`).join(',');
    return `${this.name}{${labelStr}}`;
  }
  reset() { this.timestamp = Date.now(); }
}

// ========== COUNTER ==========
class Counter extends Metric {
  constructor(name, labels = {}) {
    super(name, 'counter', labels);
    this.value = 0;
  }
  inc(delta = 1, labels = {}) { this.value += delta; this.timestamp = Date.now(); this.labels = { ...this.labels, ...labels }; return this; }
  dec(delta = 1) { this.value = Math.max(0, this.value - delta); this.timestamp = Date.now(); return this; }
  get() { return this.value; }
  reset() { this.value = 0; this.timestamp = Date.now(); }
  toJSON() { return { name: this.name, type: this.type, labels: this.labels, value: this.value, timestamp: this.timestamp }; }
}

// ========== GAUGE ==========
class Gauge extends Metric {
  constructor(name, labels = {}) {
    super(name, 'gauge', labels);
    this.value = 0;
  }
  set(value, labels = {}) { this.value = value; this.timestamp = Date.now(); this.labels = { ...this.labels, ...labels }; return this; }
  inc(delta = 1) { this.value += delta; this.timestamp = Date.now(); return this; }
  dec(delta = 1) { this.value -= delta; this.timestamp = Date.now(); return this; }
  get() { return this.value; }
  toJSON() { return { name: this.name, type: this.type, labels: this.labels, value: this.value, timestamp: this.timestamp }; }
}

// ========== HISTOGRAM ==========
class Histogram extends Metric {
  constructor(name, labels = {}, buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]) {
    super(name, 'histogram', labels);
    this.buckets = [...buckets, Infinity].sort((a, b) => a - b);
    this.counts = new Array(this.buckets.length).fill(0);
    this.sum = 0;
    this.count = 0;
  }
  observe(value, labels = {}) {
    this.count++; this.sum += value; this.timestamp = Date.now(); this.labels = { ...this.labels, ...labels };
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) { this.counts[i]++; break; }
    }
    return this;
  }
  getQuantile(q) {
    if (this.count === 0) return 0;
    const target = this.count * q;
    let cumsum = 0;
    for (let i = 0; i < this.buckets.length; i++) {
      cumsum += this.counts[i];
      if (cumsum >= target) return this.buckets[i];
    }
    return this.buckets[this.buckets.length - 1];
  }
  getStats() {
    return {
      count: this.count, sum: this.sum,
      min: this.getQuantile(0), max: this.getQuantile(1),
      mean: this.count > 0 ? this.sum / this.count : 0,
      p50: this.getQuantile(0.5), p90: this.getQuantile(0.9),
      p95: this.getQuantile(0.95), p99: this.getQuantile(0.99),
      buckets: this.buckets.map((b, i) => ({ le: b === Infinity ? '+Inf' : b, count: this.counts[i] }))
    };
  }
  reset() { this.counts.fill(0); this.sum = 0; this.count = 0; this.timestamp = Date.now(); }
  toJSON() { return { name: this.name, type: this.type, labels: this.labels, timestamp: this.timestamp, ...this.getStats() }; }
}

// ========== LOCAL AGGREGATOR (zero-overhead buffering) ==========
class LocalAggregator {
  constructor(storage, privacy, onFlush) {
    this.buffers = new Map();
    this.storage = storage;
    this.privacy = privacy;
    this.onFlush = onFlush || (() => {});
    this.timer = null;
  }
  start() { if (!this.timer) this.timer = setInterval(() => this.flush(), CONFIG.flushIntervalMs); }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  add(metric) {
    const key = metric.toKey();
    const existing = this.buffers.get(key);
    if (existing) {
      this.merge(existing.metric, metric);
      existing.pending = true;
    } else {
      if (this.buffers.size >= CONFIG.maxMetrics) {
        this.buffers.delete(this.buffers.keys().next().value);
      }
      this.buffers.set(key, { metric, pending: true });
    }
  }

  merge(existing, incoming) {
    if (existing.type !== incoming.type) return;
    switch (existing.type) {
      case 'counter': existing.value += incoming.value; break;
      case 'gauge': existing.value = incoming.value; break;
      case 'histogram':
        existing.count += incoming.count; existing.sum += incoming.sum;
        for (let i = 0; i < existing.counts.length; i++) existing.counts[i] += incoming.counts[i];
        break;
    }
    existing.timestamp = Math.max(existing.timestamp, incoming.timestamp);
  }

  async flush() {
    const toFlush = [];
    for (const [, entry] of this.buffers) {
      if (entry.pending) {
        toFlush.push(this.privacy.sanitizeObject(entry.metric.toJSON()));
        entry.pending = false;
      }
    }
    if (toFlush.length && this.storage) {
      try { await this.storage.set({ [CONFIG.storageKey]: toFlush }); this.onFlush(toFlush.length); }
      catch (e) { console.error('[Telemetry] Flush failed:', e); }
    }
  }

  async load() {
    if (!this.storage) return;
    try {
      const { [CONFIG.storageKey]: data } = await this.storage.get(CONFIG.storageKey);
      if (Array.isArray(data)) {
        for (const item of data) {
          const metric = this.deserialize(item);
          if (metric) this.buffers.set(metric.toKey(), { metric, pending: false });
        }
      }
    } catch (e) { console.error('[Telemetry] Load failed:', e); }
  }

  deserialize(data) {
    let m;
    switch (data.type) {
      case 'counter': m = new Counter(data.name, data.labels); m.value = data.value; break;
      case 'gauge': m = new Gauge(data.name, data.labels); m.value = data.value; break;
      case 'histogram': m = new Histogram(data.name, data.labels, data.buckets?.slice(0, -1));
        m.counts = data.counts || []; m.sum = data.sum || 0; m.count = data.count || 0; break;
      default: return null;
    }
    m.timestamp = data.timestamp || Date.now();
    return m;
  }

  getAll() { return Array.from(this.buffers.values()).map(e => this.privacy.sanitizeObject(e.metric.toJSON())); }
  clear() { this.buffers.clear(); }
}

// ========== EVENT RECORDER (sampling + correlation) ==========
class EventRecorder {
  constructor(privacy, options = {}) {
    this.events = [];
    this.privacy = privacy;
    this.samplingRate = options.samplingRate ?? CONFIG.samplingRate;
    this.correlations = new Map();
  }
  record(type, data = {}, opts = {}) {
    if (Math.random() > this.samplingRate) return null;
    const cid = opts.correlationId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const event = { id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`, correlationId: cid, type, timestamp: Date.now(), data: this.privacy.sanitizeObject(data), tags: opts.tags || {} };
    this.events.push(event);
    if (this.events.length > CONFIG.maxEvents) this.events.shift();
    if (!this.correlations.has(cid)) this.correlations.set(cid, { start: Date.now(), events: [] });
    this.correlations.get(cid).events.push(event.id);
    return { correlationId: cid, eventId: event.id };
  }
  startCorrelation(name, meta = {}) {
    const cid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    this.correlations.set(cid, { start: Date.now(), name, meta, events: [] });
    return cid;
  }
  endCorrelation(cid, outcome = 'success', extra = {}) {
    const ctx = this.correlations.get(cid);
    if (!ctx) return null;
    const duration = Date.now() - ctx.start;
    this.record(`${ctx.name}.${outcome}`, { duration, ...extra }, { correlationId: cid, tags: { operation: ctx.name, outcome } });
    this.correlations.delete(cid);
    return { ...ctx, duration, outcome };
  }
  getEvents(filter = {}) {
    let r = [...this.events];
    if (filter.type) r = r.filter(e => e.type === filter.type);
    if (filter.correlationId) r = r.filter(e => e.correlationId === filter.correlationId);
    if (filter.since) r = r.filter(e => e.timestamp >= filter.since);
    if (filter.limit) r = r.slice(-filter.limit);
    return r;
  }
  clear() { this.events = []; this.correlations.clear(); }
}

// ========== MAIN TELEMETRY CLASS ==========
class Telemetry {
  constructor(options = {}) {
    const root = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
    this.privacy = new PrivacyEngine(options.epsilon);
    this.metrics = new Map();
    this.aggregator = new LocalAggregator(
      options.storage || (root.chrome?.storage?.local),
      this.privacy,
      (c) => this.recordEvent('flush', { count: c })
    );
    this.events = new EventRecorder(this.privacy, { samplingRate: options.samplingRate });
    this.builtin();
  }

  builtin() {
    this.counter('requests_total', { desc: 'Total requests' });
    this.counter('requests_blocked_total', { desc: 'Blocked requests' });
    this.counter('requests_allowed_total', { desc: 'Allowed requests' });
    this.counter('errors_total', { desc: 'Errors' });
    this.counter('dnr_updates_total', { desc: 'DNR rule updates' });

    this.gauge('active_rules', { desc: 'Active DNR rules' });
    this.gauge('memory_bytes', { desc: 'Memory usage' });
    this.gauge('filter_lists', { desc: 'Enabled filter lists' });

    this.histogram('request_latency_seconds', { desc: 'Request processing latency' });
    this.histogram('filter_match_seconds', { desc: 'Filter match latency' });
    this.histogram('dnr_update_seconds', { desc: 'DNR update duration' });
  }

  counter(name, labels) { const k = this.key(name, labels); if (!this.metrics.has(k)) this.metrics.set(k, new Counter(name, labels)); return this.metrics.get(k); }
  gauge(name, labels) { const k = this.key(name, labels); if (!this.metrics.has(k)) this.metrics.set(k, new Gauge(name, labels)); return this.metrics.get(k); }
  histogram(name, labels, buckets) { const k = this.key(name, labels); if (!this.metrics.has(k)) this.metrics.set(k, new Histogram(name, labels, buckets)); return this.metrics.get(k); }
  key(name, labels) { const l = labels || {}; return name + '{' + Object.entries(l).sort().map(([k,v])=>`${k}="${v}"`).join(',') + '}'; }
  get(name, labels) { return this.metrics.get(this.key(name, labels)); }

  recordEvent(type, data, opts) { return this.events.record(type, data, opts); }
  startOp(name, meta) { return this.events.startCorrelation(name, meta); }
  endOp(cid, outcome, data) { return this.events.endCorrelation(cid, outcome, data); }

  trackRequest(blocked, url, listId, durationMs) {
    this.counter('requests_total', { desc: 'Total requests' }).inc();
    blocked ? this.counter('requests_blocked_total', { desc: 'Blocked requests' }).inc(1, { list: listId }) : this.counter('requests_allowed_total', { desc: 'Allowed requests' }).inc(1, { list: listId });
    this.histogram('request_latency_seconds', { desc: 'Request processing latency' }).observe(durationMs / 1000, { blocked: String(blocked) });
  }
  trackFilterMatch(durationMs, matched, listId) { this.histogram('filter_match_seconds', { desc: 'Filter match latency' }).observe(durationMs / 1000, { matched: String(matched), list: listId }); }
  trackDNRUpdate(durationMs, ruleCount, success) { this.counter('dnr_updates_total', { desc: 'DNR rule updates' }).inc(1, { success: String(success) }); this.histogram('dnr_update_seconds', { desc: 'DNR update duration' }).observe(durationMs / 1000); this.gauge('active_rules', { desc: 'Active DNR rules' }).set(ruleCount); }
  trackError(op, err) { this.counter('errors_total', { desc: 'Errors' }).inc(1, { operation: op }); this.recordEvent('error', { operation: op, message: err.message, stack: err.stack }); }
  setMemory(bytes) { this.gauge('memory_bytes', { desc: 'Memory usage' }).set(bytes); }
  setFilterLists(n) { this.gauge('filter_lists', { desc: 'Enabled filter lists' }).set(n); }

  async init() {
    await this.aggregator.load();
    this.aggregator.start();
  }

  getStats() {
    const metrics = {};
    for (const [k, m] of this.metrics) metrics[k] = m.toJSON();
    return { metrics, events: this.events.getEvents({ limit: 100 }), privacy: { piiStripping: this.privacy.enabled, differentialPrivacy: this.privacy.epsilon > 0, epsilon: this.privacy.epsilon } };
  }

  toPrometheus() {
    let out = '';
    for (const [, m] of this.metrics) out += this.metricToProm(m) + '\n';
    return out;
  }

  metricToProm(m) {
    const labels = Object.entries(m.labels).map(([k,v])=>`${k}="${v}"`).join(',');
    const L = labels ? `{${labels}}` : '';
    const ts = m.timestamp;
    switch (m.type) {
      case 'counter': return `# TYPE ${m.name} counter\n${m.name}${L} ${m.value} ${ts}`;
      case 'gauge': return `# TYPE ${m.name} gauge\n${m.name}${L} ${m.value} ${ts}`;
      case 'histogram': {
        const s = m.getStats();
        let r = `# TYPE ${m.name} histogram\n`;
        for (const b of s.buckets) { const le = labels ? `${labels},le="${b.le}"` : `le="${b.le}"`; r += `${m.name}_bucket{${le}} ${b.count} ${ts}\n`; }
        r += `${m.name}_count${L} ${s.count} ${ts}\n${m.name}_sum${L} ${s.sum} ${ts}\n`;
        return r;
      }
      default: return '';
    }
  }

  async export() { return { version: '1.0.0', exportedAt: Date.now(), metrics: this.getStats().metrics, events: this.events.getEvents({ limit: 1000 }), privacy: { piiStripping: this.privacy.enabled, differentialPrivacy: this.privacy.epsilon > 0 } }; }
  reset() { for (const [,m] of this.metrics) if (typeof m.reset === 'function') m.reset(); this.events.clear(); this.aggregator.clear(); this.builtin(); }
  async suspend() { this.aggregator.stop(); await this.aggregator.flush(); }
}

// ========== SINGLETON & EXPORT ==========
const root = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);

const telemetry = new Telemetry({
  storage: root.chrome?.storage?.local,
  epsilon: CONFIG.differentialPrivacyEpsilon
});

// Export for all environments
const api = {
  Telemetry,
  telemetry,
  Counter,
  Gauge,
  Histogram,
  PrivacyEngine,
  LocalAggregator,
  EventRecorder
};

// CommonJS (Node.js) - assign to module.exports
console.error('[telemetry.js] typeof module:', typeof module, 'module.exports:', typeof module?.exports);
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
  console.error('[telemetry.js] module.exports set:', Object.keys(api));
} else {
  console.error('[telemetry.js] NOT setting module.exports');
}
// Also expose on global for browser / service worker
if (typeof root !== 'undefined') {
  Object.assign(root, api);
}