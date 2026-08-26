/**
 * Network Stack — Retry logic, circuit breakers, ETag/Last-Modified, streaming parse
 * Zero-trust network layer for filter list updates and telemetry
 */

import { errorKernel, wrapNetwork } from './error-kernel.js';

// ============================================================================
// Circuit Breaker
// ============================================================================

export class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30000;
    this.halfOpenRequests = options.halfOpenRequests ?? 3;
    this.state = 'closed'; // closed, open, half-open
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = 0;
    this.halfOpenSuccesses = 0;
  }

  async execute(fn) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
        this.halfOpenSuccesses = 0;
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  _onSuccess() {
    this.failures = 0;
    if (this.state === 'half-open') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.halfOpenRequests) {
        this.state = 'closed';
        this.successes = 0;
      }
    }
  }

  _onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.state === 'half-open') {
      this.state = 'open';
    } else if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  getState() {
    return { name: this.name, state: this.state, failures: this.failures, lastFailure: this.lastFailure };
  }

  reset() {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = 0;
  }
}

// ============================================================================
// Conditional Request Manager (ETag/Last-Modified)
// ============================================================================

export class ConditionalRequestManager {
  constructor(storage) {
    this.storage = storage;
    this.cache = new Map(); // url -> { etag, lastModified, data, timestamp }
  }

  /**
   * Make conditional GET request
   * @param {string} url - URL to fetch
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} { data, fromCache, headers }
   */
  async conditionalGet(url, options = {}) {
    const cached = this.cache.get(url);
    const headers = { ...options.headers };

    if (cached) {
      if (cached.etag) headers['If-None-Match'] = cached.etag;
      if (cached.lastModified) headers['If-Modified-Since'] = cached.lastModified;
    }

    const response = await fetch(url, { ...options, headers });

    // 304 Not Modified
    if (response.status === 304 && cached) {
      return { data: cached.data, fromCache: true, headers: response.headers, status: 304 };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.text();
    const etag = response.headers.get('etag');
    const lastModified = response.headers.get('last-modified');

    // Update cache
    this.cache.set(url, { etag, lastModified, data, timestamp: Date.now() });
    await this._persistCache();

    return { data, fromCache: false, headers: response.headers, status: response.status };
  }

  async _persistCache() {
    const serializable = {};
    for (const [url, entry] of this.cache) {
      serializable[url] = entry;
    }
    await this.storage.set({ conditionalCache: serializable }, { backend: 'indexeddb' });
  }

  async loadCache() {
    const { conditionalCache } = await this.storage.get('conditionalCache', { backend: 'indexeddb' });
    if (conditionalCache) {
      for (const [url, entry] of Object.entries(conditionalCache)) {
        this.cache.set(url, entry);
      }
    }
  }

  clearCache(url) {
    if (url) this.cache.delete(url);
    else this.cache.clear();
  }

  getCacheStats() {
    return { size: this.cache.size, entries: Array.from(this.cache.keys()) };
  }
}

// ============================================================================
// Streaming Parser for Large Responses
// ============================================================================

export class StreamingParser {
  /**
   * Parse large text response line by line without loading all into memory
   * @param {ReadableStream} stream - Response body stream
   * @param {Function} onLine - Callback for each line
   * @param {Object} options - Options
   */
  static async parseLines(stream, onLine, options = {}) {
    const { maxLines = Infinity, skipEmpty = true, trimLines = true } = options;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lineCount = 0;

    try {
      while (lineCount < maxLines) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (lineCount >= maxLines) break;
          const processed = trimLines ? line.trim() : line;
          if (skipEmpty && !processed) continue;
          await onLine(processed, lineCount);
          lineCount++;
        }
      }

      // Process remaining buffer
      if (buffer && lineCount < maxLines) {
        const processed = trimLines ? buffer.trim() : buffer;
        if (!skipEmpty || processed) {
          await onLine(processed, lineCount);
        }
      }
    } finally {
      reader.releaseLock();
    }

    return lineCount;
  }

  /**
   * Parse JSON stream (JSONL/NDJSON)
   */
  static async parseJSONStream(stream, onObject, options = {}) {
    return this.parseLines(stream, async (line, index) => {
      try {
        const obj = JSON.parse(line);
        await onObject(obj, index);
      } catch (e) {
        if (options.skipInvalid) return;
        throw new Error(`Invalid JSON at line ${index}: ${e.message}`);
      }
    }, options);
  }
}

// ============================================================================
// Retry Policy
// ============================================================================

export class RetryPolicy {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelay = options.baseDelay ?? 1000;
    this.maxDelay = options.maxDelay ?? 30000;
    this.backoffMultiplier = options.backoffMultiplier ?? 2;
    this.jitter = options.jitter ?? 0.1;
    this.retryableStatuses = options.retryableStatuses ?? [429, 500, 502, 503, 504];
    this.retryableErrors = options.retryableErrors ?? ['network', 'timeout', 'aborted', 'fetch'];
  }

  async execute(fn, context = {}) {
    let lastError;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        attempt++;

        if (attempt > this.maxRetries) break;
        if (!this._isRetryable(error)) break;

        const delay = this._calculateDelay(attempt);
        await this._sleep(delay);

        // Add retry context
        context.attempt = attempt;
        context.delay = delay;
      }
    }

    throw lastError;
  }

  _isRetryable(error) {
    if (!error) return false;

    // Check status code
    if (error.status && this.retryableStatuses.includes(error.status)) return true;

    // Check error message/type
    const message = (error.message || '').toLowerCase();
    const name = (error.name || '').toLowerCase();

    return this.retryableErrors.some(e =>
      message.includes(e) || name.includes(e)
    );
  }

  _calculateDelay(attempt) {
    const exponentialDelay = this.baseDelay * Math.pow(this.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this.maxDelay);
    const jitterAmount = cappedDelay * this.jitter * Math.random();
    return Math.floor(cappedDelay + jitterAmount);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Network Stack — Main Class
// ============================================================================

export class NetworkStack {
  constructor(options = {}) {
    this.options = {
      defaultTimeout: options.defaultTimeout ?? 30000,
      maxConcurrentRequests: options.maxConcurrentRequests ?? 6,
      userAgent: options.userAgent ?? 'AeroGuard/5.0 (+https://aeroguard.example.com)',
      ...options
    };

    this.circuitBreakers = new Map();
    this.retryPolicy = new RetryPolicy(options.retryPolicy);
    this.conditionalManager = null; // Set after storage init
    this.requestQueue = [];
    this.activeRequests = 0;
    this.metrics = {
      requests: 0,
      successes: 0,
      failures: 0,
      retries: 0,
      cacheHits: 0,
      bytesReceived: 0,
      bytesSent: 0
    };
  }

  async initialize(storage) {
    this.conditionalManager = new ConditionalRequestManager(storage);
    await this.conditionalManager.loadCache();
  }

  /**
   * Register a circuit breaker for a domain/service
   */
  registerCircuitBreaker(name, options) {
    this.circuitBreakers.set(name, new CircuitBreaker(name, options));
  }

  /**
   * Get circuit breaker
   */
  getCircuitBreaker(name) {
    return this.circuitBreakers.get(name);
  }

  /**
   * Fetch with all network stack features
   */
  async fetch(url, options = {}) {
    const {
      timeout = this.options.defaultTimeout,
      useCircuitBreaker = null,
      useConditional = false,
      useRetry = true,
      headers = {},
      ...fetchOptions
    } = options;

    this.metrics.requests++;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const defaultHeaders = {
      'User-Agent': this.options.userAgent,
      'Accept': 'text/plain, text/*, */*;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      ...headers
    };

    const executeFetch = async () => {
      // Wait for queue slot
      await this._waitForSlot();

      this.activeRequests++;
      try {
        if (useCircuitBreaker) {
          const breaker = this.circuitBreakers.get(useCircuitBreaker);
          if (breaker) {
            return await breaker.execute(() => this._doFetch(url, { ...fetchOptions, headers: defaultHeaders, signal: controller.signal }));
          }
        }

        if (useRetry) {
          return await this.retryPolicy.execute(
            () => this._doFetch(url, { ...fetchOptions, headers: defaultHeaders, signal: controller.signal })
          );
        }

        return await this._doFetch(url, { ...fetchOptions, headers: defaultHeaders, signal: controller.signal });
      } finally {
        this.activeRequests--;
        clearTimeout(timeoutId);
        this._processQueue();
      }
    };

    const result = await errorKernel.wrap(`network.fetch.${new URL(url).hostname}`, executeFetch, {
      timeout: timeout + 5000,
      circuitBreaker: useCircuitBreaker || 'network',
      retry: false // We handle retry internally
    });

    if (result.success) {
      this.metrics.successes++;
      this.metrics.bytesReceived += result.value.headers.get('content-length') ? parseInt(result.value.headers.get('content-length')) : 0;
    } else {
      this.metrics.failures++;
    }

    return result;
  }

  async _doFetch(url, options) {
    const response = await fetch(url, options);

    if (!response.ok && response.status !== 304) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.status = response.status;
      throw error;
    }

    return response;
  }

  /**
   * Conditional fetch for filter lists
   */
  async conditionalFetch(url, options = {}) {
    if (!this.conditionalManager) {
      throw new Error('ConditionalRequestManager not initialized');
    }

    const result = await this.conditionalManager.conditionalGet(url, options);
    this.metrics.requests++;

    if (result.fromCache) {
      this.metrics.cacheHits++;
    }

    return Result.ok(result);
  }

  /**
   * Download and parse filter list with streaming
   */
  async downloadFilterList(url, parser, options = {}) {
    const { maxSize = 50 * 1024 * 1024 } = options; // 50MB max

    const fetchResult = await this.fetch(url, {
      timeout: 60000,
      useRetry: true,
      useCircuitBreaker: 'filter-list-download'
    });

    if (!fetchResult.success) return fetchResult;

    const response = fetchResult.value;

    // Check content length
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > maxSize) {
      return Result.err(new Error(`Response too large: ${contentLength} bytes`));
    }

    // Stream parse
    const rules = [];
    let bytesReceived = 0;

    try {
      await StreamingParser.parseLines(response.body, async (line) => {
        bytesReceived += line.length + 1;
        if (bytesReceived > maxSize) throw new Error('Max size exceeded during parsing');

        const parsed = parser(line);
        if (parsed) rules.push(parsed);
      }, { skipEmpty: true });
    } catch (e) {
      return Result.err(e);
    }

    this.metrics.bytesReceived += bytesReceived;

    return Result.ok({ rules, bytesReceived, url });
  }

  /**
   * Concurrent fetch with concurrency limit
   */
  async fetchAll(urls, options = {}) {
    const { concurrency = this.options.maxConcurrentRequests } = options;
    const results = [];

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(url => this.fetch(url, options))
      );

      for (const r of batchResults) {
        if (r.status === 'fulfilled') results.push(r.value);
        else results.push(Result.err(r.reason));
      }
    }

    return results;
  }

  /**
   * Get network metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.length,
      circuitBreakers: Array.from(this.circuitBreakers.values()).map(b => b.getState())
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      requests: 0, successes: 0, failures: 0, retries: 0,
      cacheHits: 0, bytesReceived: 0, bytesSent: 0
    };
  }

  // ========== Queue Management ==========

  _waitForSlot() {
    return new Promise(resolve => {
      if (this.activeRequests < this.options.maxConcurrentRequests) {
        resolve();
      } else {
        this.requestQueue.push(resolve);
      }
    });
  }

  _processQueue() {
    while (this.requestQueue.length > 0 && this.activeRequests < this.options.maxConcurrentRequests) {
      const resolve = this.requestQueue.shift();
      resolve();
    }
  }
}

// ============================================================================
// Result type re-export
// ============================================================================

export { Result } from './error-kernel.js';

// ============================================================================
// Singleton
// ============================================================================

export const networkStack = new NetworkStack({
  defaultTimeout: 30000,
  maxConcurrentRequests: 6,
  retryPolicy: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: 0.1
  }
});

export default NetworkStack;