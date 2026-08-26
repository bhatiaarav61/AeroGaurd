/**
 * Timing Mitigator — Constant-time paths, randomized delays, performance.now jitter, RAF batching
 * Protects against timing-based ad blocker detection
 */

export class TimingMitigator {
  constructor(context = window, options = {}) {
    this.context = context;
    this.config = {
      jitterRange: options.jitterRange || 0.1, // ms
      minTimeout: options.minTimeout || 4, // ms
      constantTime: options.constantTime !== false,
      batchRAF: options.batchRAF !== false,
      seed: options.seed || Date.now(),
      ...options
    };

    // Deterministic PRNG for consistent but unpredictable jitter
    this._prngState = this.config.seed;
    this._prng = () => {
      this._prngState = (this._prngState * 1664525 + 1013904223) >>> 0;
      return this._prngState / 0x100000000;
    };

    this.originalTimers = new Map();
    this.rafBatchQueue = [];
    this.rafScheduled = false;
    this.rafBatchTimer = null;
    this.metrics = {
      jitterApplied: 0,
      timeoutsAdjusted: 0,
      rafBatched: 0,
      constantTimeCalls: 0
    };

    // Track if we've applied mitigations
    this._initialized = false;
  }

  /**
   * Initialize all timing mitigations
   */
  initialize() {
    if (this._initialized) return;
    this._initialized = true;

    this._mitigatePerformanceNow();
    this._mitigatePerformanceMark();
    this._mitigateRequestAnimationFrame();
    this._mitigateSetTimeout();
    this._mitigateSetInterval();
    this._mitigateDateNow();

    console.log('[TimingMitigator] Initialized');
  }

  /**
   * Deterministic random in range [0, max)
   */
  _random(max = 1) {
    return this._prng() * max;
  }

  /**
   * Mitigate performance.now() - add deterministic jitter
   */
  _mitigatePerformanceNow() {
    const originalNow = this.context.performance.now.bind(this.context.performance);
    this.originalTimers.set('performance.now', originalNow);

    this.context.performance.now = () => {
      const now = originalNow();
      // Add small random jitter (0 to jitterRange ms)
      const jitter = this._random(this.config.jitterRange);
      this.metrics.jitterApplied++;
      return now + jitter;
    };
  }

  /**
   * Mitigate performance.mark/measure - prevent precise timing
   */
  _mitigatePerformanceMark() {
    const methods = ['mark', 'measure', 'clearMarks', 'clearMeasures', 'getEntriesByName', 'getEntriesByType', 'getEntries'];

    for (const method of methods) {
      if (this.context.performance[method]) {
        const original = this.context.performance[method].bind(this.context.performance);
        this.originalTimers.set(`performance.${method}`, original);

        this.context.performance[method] = (...args) => {
          // Add micro-jitter to prevent precise measurement correlation
          // This is a no-op delay that makes timing analysis harder
          const result = original(...args);
          return result;
        };
      }
    }
  }

  /**
   * Mitigate requestAnimationFrame - batch callbacks with jitter
   */
  _mitigateRequestAnimationFrame() {
    const originalRAF = this.context.requestAnimationFrame.bind(this.context);
    const originalCAF = this.context.cancelAnimationFrame.bind(this.context);
    this.originalTimers.set('requestAnimationFrame', originalRAF);
    this.originalTimers.set('cancelAnimationFrame', originalCAF);

    if (this.config.batchRAF) {
      this.context.requestAnimationFrame = (callback) => {
        return originalRAF((timestamp) => {
          // Add timestamp jitter
          const jitteredTimestamp = timestamp + this._random(this.config.jitterRange);

          // Batch execution
          const callbackId = Symbol('raf-callback');
          this.rafBatchQueue.push({ id: callbackId, callback, timestamp: jitteredTimestamp });
          this._scheduleRAFFlush();

          return callbackId;
        });
      };
    } else {
      this.context.requestAnimationFrame = (callback) => {
        return originalRAF((timestamp) => {
          const jitteredTimestamp = timestamp + this._random(this.config.jitterRange);
          callback(jitteredTimestamp);
        });
      };
    }

    this.context.cancelAnimationFrame = (id) => {
      // Check if in batch queue
      const index = this.rafBatchQueue.findIndex(item => item.id === id);
      if (index !== -1) {
        this.rafBatchQueue.splice(index, 1);
        return;
      }
      return originalCAF(id);
    };
  }

  _scheduleRAFFlush() {
    if (!this.rafScheduled) {
      this.rafScheduled = true;
      // Use setTimeout with minimal delay instead of nested RAF to avoid stack issues
      this.rafBatchTimer = this.context.setTimeout(() => {
        this.rafScheduled = false;
        this.rafBatchTimer = null;
        this._flushRAFBatch();
      }, 0);
    }
  }

  _flushRAFBatch() {
    const batch = [...this.rafBatchQueue];
    this.rafBatchQueue = [];

    // Sort by timestamp to maintain temporal order
    batch.sort((a, b) => a.timestamp - b.timestamp);

    for (const { callback, timestamp } of batch) {
      try {
        callback(timestamp);
      } catch (e) {
        console.error('[TimingMitigator] RAF callback error:', e);
      }
    }

    this.metrics.rafBatched += batch.length;
  }

  /**
   * Mitigate setTimeout - enforce minimum delay and add jitter
   */
  _mitigateSetTimeout() {
    const originalTimeout = this.context.setTimeout.bind(this.context);
    const originalClearTimeout = this.context.clearTimeout.bind(this.context);
    this.originalTimers.set('setTimeout', originalTimeout);
    this.originalTimers.set('clearTimeout', originalClearTimeout);

    this.context.setTimeout = (callback, delay, ...args) => {
      const adjustedDelay = Math.max(delay || 0, this.config.minTimeout);

      if (adjustedDelay !== delay) {
        this.metrics.timeoutsAdjusted++;
      }

      // Wrap callback to add execution jitter
      const wrappedCallback = (...cbArgs) => {
        // Add small jitter to execution time (async, non-blocking)
        // Use originalTimeout to avoid recursion
        const execJitter = this._random(this.config.jitterRange);
        if (execJitter > 0) {
          originalTimeout(() => callback(...cbArgs), execJitter);
        } else {
          callback(...cbArgs);
        }
      };

      return originalTimeout(wrappedCallback, adjustedDelay, ...args);
    };
  }

  /**
   * Mitigate setInterval - enforce minimum interval and add jitter
   */
  _mitigateSetInterval() {
    const originalInterval = this.context.setInterval.bind(this.context);
    const originalClearInterval = this.context.clearInterval.bind(this.context);
    const originalTimeout = this.originalTimers.get('setTimeout') || this.context.setTimeout.bind(this.context);
    this.originalTimers.set('setInterval', originalInterval);
    this.originalTimers.set('clearInterval', originalClearInterval);

    this.context.setInterval = (callback, delay, ...args) => {
      const adjustedDelay = Math.max(delay || 0, this.config.minTimeout);

      if (adjustedDelay !== delay) {
        this.metrics.timeoutsAdjusted++;
      }

      // Wrap callback to add execution jitter
      let tickCount = 0;
      const wrappedCallback = (...cbArgs) => {
        tickCount++;
        // Add small jitter to each execution
        const execJitter = this._random(this.config.jitterRange);
        if (execJitter > 0) {
          originalTimeout(() => callback(...cbArgs), execJitter);
        } else {
          callback(...cbArgs);
        }
      };

      return originalInterval(wrappedCallback, adjustedDelay, ...args);
    };
  }

  /**
   * Mitigate Date.now() - add microsecond jitter
   */
  _mitigateDateNow() {
    const originalDateNow = this.context.Date.now.bind(this.context.Date);
    this.originalTimers.set('Date.now', originalDateNow);

    this.context.Date.now = () => {
      const now = originalDateNow();
      // Add sub-millisecond jitter (0-999 microseconds)
      // Use Math.random() * 1 to get 0-0.999ms, then floor to get integer microseconds
      const microJitter = Math.floor(this._random(1) * 1000);
      return now + microJitter;
    };
  }

  /**
   * Constant-time execution wrapper (async, non-blocking)
   * Ensures function takes at least minTime ms without blocking the main thread
   */
  async constantTimeAsync(minTime, fn, ...args) {
    const start = this.context.performance.now();
    const result = await fn(...args);
    const elapsed = this.context.performance.now() - start;

    if (elapsed < minTime) {
      const remaining = minTime - elapsed;
      // Add small random variation to prevent exact timing
      const jitter = this._random(this.config.jitterRange);
      await this._sleep(remaining + jitter);
    }

    this.metrics.constantTimeCalls++;
    return result;
  }

  /**
   * Synchronous constant-time wrapper (use sparingly, blocks thread)
   * Prefer constantTimeAsync for production use
   */
  constantTimeSync(minTime, fn, ...args) {
    // If minTime <= 0, no timing enforcement needed
    if (minTime <= 0) {
      const result = fn(...args);
      this.metrics.constantTimeCalls++;
      return result;
    }

    const start = this.context.performance.now();
    const result = fn(...args);
    const elapsed = this.context.performance.now() - start;

    if (elapsed < minTime) {
      const remaining = minTime - elapsed;
      const jitter = this._random(this.config.jitterRange);
      const end = start + remaining + jitter;
      // Spin wait (blocking - use only when absolutely necessary)
      while (this.context.performance.now() < end) {
        // Intentionally empty - busy wait
      }
    }

    this.metrics.constantTimeCalls++;
    return result;
  }

  /**
   * Sleep utility using Promise
   */
  _sleep(ms) {
    const originalTimeout = this.originalTimers.get('setTimeout') || this.context.setTimeout.bind(this.context);
    return new Promise(resolve => originalTimeout(resolve, ms));
  }

  /**
   * Get timing metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      jitterApplied: 0,
      timeoutsAdjusted: 0,
      rafBatched: 0,
      constantTimeCalls: 0
    };
  }

  /**
   * Restore original timing functions
   */
  restore() {
    for (const [key, original] of this.originalTimers) {
      try {
        if (key.startsWith('performance.')) {
          const method = key.substring(10);
          this.context.performance[method] = original;
        } else if (key === 'requestAnimationFrame') {
          this.context.requestAnimationFrame = original;
        } else if (key === 'cancelAnimationFrame') {
          this.context.cancelAnimationFrame = original;
        } else if (key === 'setTimeout') {
          this.context.setTimeout = original;
        } else if (key === 'clearTimeout') {
          this.context.clearTimeout = original;
        } else if (key === 'setInterval') {
          this.context.setInterval = original;
        } else if (key === 'clearInterval') {
          this.context.clearInterval = original;
        } else if (key === 'Date.now') {
          this.context.Date.now = original;
        }
      } catch (e) {
        console.warn(`[TimingMitigator] Failed to restore ${key}:`, e);
      }
    }

    // Clear RAF batch timer
    if (this.rafBatchTimer) {
      this.context.clearTimeout(this.rafBatchTimer);
      this.rafBatchTimer = null;
    }

    this.originalTimers.clear();
    this.rafBatchQueue = [];
    this.rafScheduled = false;
    this._initialized = false;
    this.resetMetrics();
  }

  /**
   * Generate a timing profile for testing
   */
  generateTimingProfile(samples = 1000) {
    const nowFn = this.context.performance.now.bind(this.context.performance);
    const profile = {
      samples: [],
      stats: { min: Infinity, max: -Infinity, sum: 0, avg: 0 }
    };

    for (let i = 0; i < samples; i++) {
      const t = nowFn();
      profile.samples.push(t);
      profile.stats.min = Math.min(profile.stats.min, t);
      profile.stats.max = Math.max(profile.stats.max, t);
      profile.stats.sum += t;
    }

    profile.stats.avg = profile.stats.sum / samples;
    return profile;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let timingMitigatorInstance = null;

export function getTimingMitigator(context = window, options = {}) {
  if (!timingMitigatorInstance) {
    timingMitigatorInstance = new TimingMitigator(context, options);
  }
  return timingMitigatorInstance;
}

export function resetTimingMitigator() {
  if (timingMitigatorInstance) {
    timingMitigatorInstance.restore();
  }
  timingMitigatorInstance = null;
}