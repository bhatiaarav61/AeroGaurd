/**
 * Error Kernel — The Heart of AeroGuard
 * Zero uncaught exceptions, automatic recovery, state reconciliation
 * Every async operation MUST use errorKernel.wrap()
 */

// ============================================================================
// Result Type — Railway-oriented programming
// ============================================================================

export class Result {
  constructor(success, value, error) {
    this.success = success;
    this.value = value;
    this.error = error;
  }

  static ok(value) { return new Result(true, value, null); }
  static err(error) { return new Result(false, null, error); }

  map(fn) {
    if (!this.success) return this;
    try { return Result.ok(fn(this.value)); }
    catch (e) { return Result.err(e); }
  }

  flatMap(fn) {
    if (!this.success) return this;
    try { return fn(this.value); }
    catch (e) { return Result.err(e); }
  }

  mapError(fn) {
    if (this.success) return this;
    return Result.err(fn(this.error));
  }

  unwrap() {
    if (!this.success) throw this.error;
    return this.value;
  }

  unwrapOr(defaultValue) {
    return this.success ? this.value : defaultValue;
  }
}

// ============================================================================
// Error Kernel — Central error handling with retry, circuit breaker, fallback
// ============================================================================

export class ErrorKernel {
  constructor(options = {}) {
    this.circuitBreakers = new Map();
    this.metrics = options.metrics || null;
    this.logger = options.logger || console;
    this.defaultRetry = options.defaultRetry ?? 3;
    this.defaultRetryDelay = options.defaultRetryDelay ?? 1000;
    this.defaultTimeout = options.defaultTimeout ?? 30000;
  }

  /**
   * Wrap any async operation with comprehensive error handling
   * @param {string} operationName - Name for logging/metrics
   * @param {Function} fn - Async function to wrap
   * @param {Object} options - Configuration
   * @returns {Promise<Result>}
   */
  async wrap(operationName, fn, options = {}) {
    const {
      retry = this.defaultRetry,
      retryDelay = this.defaultRetryDelay,
      fallback = null,
      circuitBreaker = null,
      timeout = this.defaultTimeout,
      metrics = null,
      context = {},
      shouldRetry = (error) => this._isRetryableError(error)
    } = options;

    const correlationId = crypto.randomUUID();
    const startTime = performance.now();
    const metricName = metrics?.histogram || `operation.${operationName}.duration`;

    // Check circuit breaker
    if (circuitBreaker && this._isCircuitOpen(circuitBreaker)) {
      this.logger.warn(`[ErrorKernel] Circuit open for ${circuitBreaker}, using fallback`);
      return this._executeFallback(fallback, operationName, new Error('Circuit breaker open'), correlationId);
    }

    let lastError = null;
    let attempt = 0;

    while (attempt <= retry) {
      try {
        // Execute with timeout
        const result = await this._withTimeout(fn(), timeout);

        // Record success metrics
        const duration = performance.now() - startTime;
        this._recordMetric(metricName, duration, true);
        this._recordMetric(`operation.${operationName}.success`, 1);

        if (attempt > 0) {
          this.logger.info(`[ErrorKernel] ${operationName} succeeded on retry ${attempt}`);
        }

        return Result.ok(result);
      } catch (error) {
        lastError = error;
        attempt++;

        this.logger.warn(`[ErrorKernel] ${operationName} attempt ${attempt}/${retry + 1} failed:`, error.message, { correlationId, ...context });
        this._recordMetric(`operation.${operationName}.retry`, 1);
        this._recordMetric(`operation.${operationName}.error`, 1, { error: error.name });

        // Check if we should retry
        if (attempt <= retry && shouldRetry(error)) {
          await this._sleep(retryDelay * attempt); // Exponential backoff
          continue;
        }
        break;
      }
    }

    // All retries exhausted, try fallback
    this.logger.error(`[ErrorKernel] ${operationName} failed after ${attempt} attempts`, { correlationId, ...context });

    if (circuitBreaker) {
      this._recordCircuitFailure(circuitBreaker);
    }

    return this._executeFallback(fallback, operationName, lastError, correlationId);
  }

  /**
   * Execute fallback function
   */
  async _executeFallback(fallback, operationName, error, correlationId) {
    if (!fallback) {
      this._recordMetric(`operation.${operationName}.failure`, 1);
      return Result.err(error);
    }

    try {
      this.logger.info(`[ErrorKernel] Executing fallback for ${operationName}`, { correlationId });
      const result = await fallback(error);
      this._recordMetric(`operation.${operationName}.fallback_success`, 1);
      return Result.ok(result);
    } catch (fallbackError) {
      this.logger.error(`[ErrorKernel] Fallback for ${operationName} also failed`, fallbackError, { correlationId });
      this._recordMetric(`operation.${operationName}.fallback_failure`, 1);
      return Result.err(fallbackError);
    }
  }

  /**
   * Execute with timeout
   */
  _withTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Sleep utility
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if error is retryable
   */
  _isRetryableError(error) {
    if (!error) return false;
    const message = error.message?.toLowerCase() || '';
    const name = error.name?.toLowerCase() || '';

    // Network errors
    if (name === 'networkerror' || name === 'timeouterror') return true;
    if (message.includes('network') || message.includes('timeout') || message.includes('fetch')) return true;
    if (message.includes('aborted') || message.includes('503') || message.includes('502') || message.includes('504')) return true;
    if (message.includes('429') || message.includes('econnrefused') || message.includes('econnreset')) return true;

    // Chrome extension specific
    if (message.includes('extension context invalidated')) return true;
    if (message.includes('message port closed')) return true;

    return false;
  }

  /**
   * Circuit breaker management
   */
  _isCircuitOpen(name) {
    const breaker = this.circuitBreakers.get(name);
    if (!breaker) return false;
    if (breaker.state === 'open') {
      // Check if we should try half-open
      if (Date.now() - breaker.lastFailure > breaker.resetTimeout) {
        breaker.state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }

  _recordCircuitFailure(name) {
    let breaker = this.circuitBreakers.get(name);
    if (!breaker) {
      breaker = { failures: 0, state: 'closed', lastFailure: 0, resetTimeout: 30000 };
      this.circuitBreakers.set(name, breaker);
    }
    breaker.failures++;
    breaker.lastFailure = Date.now();
    if (breaker.failures >= 5) {
      breaker.state = 'open';
      this.logger.warn(`[ErrorKernel] Circuit breaker opened for ${name}`);
    }
  }

  /**
   * Record metrics
   */
  _recordMetric(name, value, tags = {}) {
    if (this.metrics) {
      this.metrics.record(name, value, tags);
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitStatus(name) {
    return this.circuitBreakers.get(name) || { state: 'unknown' };
  }

  /**
   * Reset circuit breaker
   */
  resetCircuit(name) {
    this.circuitBreakers.delete(name);
  }

  /**
   * Wrap multiple operations in parallel with individual error handling
   */
  async wrapAll(operations) {
    const results = await Promise.allSettled(
      operations.map(({ name, fn, options }) => this.wrap(name, fn, options))
    );

    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return Result.err(r.reason);
    });
  }

  /**
   * Wrap operations in sequence, stopping on first failure (unless continueOnError)
   */
  async wrapSequence(operations, continueOnError = false) {
    const results = [];
    for (const { name, fn, options } of operations) {
      const result = await this.wrap(name, fn, options);
      results.push(result);
      if (!result.success && !continueOnError) break;
    }
    return results;
  }
}

// ============================================================================
// Global error kernel instance
// ============================================================================

export const errorKernel = new ErrorKernel({
  defaultRetry: 3,
  defaultRetryDelay: 1000,
  defaultTimeout: 30000
});

// ============================================================================
// Convenience wrapper for common patterns
// ============================================================================

/**
 * Wrap chrome.storage operations
 */
export async function wrapStorage(operationName, fn) {
  return errorKernel.wrap(`storage.${operationName}`, fn, {
    retry: 2,
    retryDelay: 500,
    timeout: 10000,
    fallback: async () => ({ error: 'Storage unavailable, using defaults' }),
    circuitBreaker: 'chrome.storage'
  });
}

/**
 * Wrap chrome.runtime messaging
 */
export async function wrapMessaging(operationName, fn) {
  return errorKernel.wrap(`messaging.${operationName}`, fn, {
    retry: 1,
    retryDelay: 100,
    timeout: 5000,
    circuitBreaker: 'chrome.runtime'
  });
}

/**
 * Wrap fetch/network operations
 */
export async function wrapNetwork(operationName, fn) {
  return errorKernel.wrap(`network.${operationName}`, fn, {
    retry: 3,
    retryDelay: 1000,
    timeout: 30000,
    circuitBreaker: 'network'
  });
}

/**
 * Wrap DNR operations
 */
export async function wrapDNR(operationName, fn) {
  return errorKernel.wrap(`dnr.${operationName}`, fn, {
    retry: 2,
    retryDelay: 500,
    timeout: 10000,
    circuitBreaker: 'chrome.declarativeNetRequest'
  });
}

/**
 * Wrap content script injection
 */
export async function wrapScriptInjection(operationName, fn) {
  return errorKernel.wrap(`scripting.${operationName}`, fn, {
    retry: 1,
    retryDelay: 100,
    timeout: 10000,
    circuitBreaker: 'chrome.scripting',
    shouldRetry: (error) => error.message.includes('context invalidated') || error.message.includes('frame')
  });
}

export default ErrorKernel;