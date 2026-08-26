/**
 * Error Kernel - Comprehensive Error Handling Framework
 *
 * Provides:
 * - Result<T, E> pattern for explicit error handling
 * - Try/Catch/Recover/Reconcile patterns
 * - Circuit Breakers with configurable policies
 * - Retry Logic with exponential backoff and jitter
 * - Metrics collection and structured logging
 * - Structured error taxonomy
 */

'use strict';

// ============================================================================
// TYPE DEFINITIONS (JSDoc for IDE support)
// ============================================================================

/**
 * @template T
 * @template E
 * @typedef {Object} Result
 * @property {boolean} ok - Whether the result is successful
 * @property {T} [value] - Success value (present when ok=true)
 * @property {E} [error] - Error value (present when ok=false)
 * @property {boolean} [isRecovered] - Whether error was recovered
 * @property {boolean} [isReconciled] - Whether error was reconciled
 */

/**
 * @template T
 * @template E
 * @typedef {Object} ResultFactory
 * @property {function(T): Result<T, E>} ok
 * @property {function(E): Result<T, E>} err
 */

/**
 * @typedef {Object} RetryOptions
 * @property {number} [maxAttempts=3] - Maximum retry attempts
 * @property {number} [baseDelay=1000] - Base delay in ms
 * @property {number} [maxDelay=30000] - Maximum delay cap
 * @property {number} [backoffMultiplier=2] - Exponential backoff multiplier
 * @property {number} [jitter=0.1] - Jitter factor (0-1)
 * @property {function(Error): boolean} [shouldRetry] - Predicate for retryable errors
 * @property {function(Error, number): void} [onRetry] - Callback on each retry
 */

/**
 * @typedef {Object} CircuitBreakerOptions
 * @property {number} [failureThreshold=5] - Failures before opening
 * @property {number} [successThreshold=2] - Successes before closing
 * @property {number} [timeout=30000] - Time in ms before half-open
 * @property {function(Error): boolean} [isFailure] - Predicate for failure
 * @property {function(string): void} [onStateChange] - State change callback
 */

/**
 * @typedef {Object} CircuitBreakerState
 * @property {'closed'|'open'|'half-open'} state
 * @property {number} failures
 * @property {number} successes
 * @property {number} lastFailureTime
 * @property {number} nextAttemptTime
 */

/**
 * @typedef {Object} MetricEntry
 * @property {string} name
 * @property {number} value
 * @property {Object<string, string>} labels
 * @property {number} timestamp
 */

/**
 * @typedef {Object} LogEntry
 * @property {string} level - 'debug'|'info'|'warn'|'error'|'fatal'
 * @property {string} message
 * @property {Object} [context]
 * @property {Error} [error]
 * @property {number} timestamp
 * @property {string} [traceId]
 * @property {string} [spanId]
 */

/**
 * @typedef {Object} ErrorKernelConfig
 * @property {boolean} [enableMetrics=true]
 * @property {boolean} [enableStructuredLogging=true]
 * @property {LogEntry[]} [logBuffer]
 * @property {number} [maxLogBuffer=1000]
 * @property {function(LogEntry): void} [logSink]
 */

// ============================================================================
// RESULT<T, E> PATTERN IMPLEMENTATION
// ============================================================================

/**
 * Creates a successful Result
 * @template T, E
 * @param {T} value
 * @returns {Result<T, E>}
 */
function ok(value) {
  return { ok: true, value, error: undefined };
}

/**
 * Creates a failed Result
 * @template T, E
 * @param {E} error
 * @returns {Result<T, E>}
 */
function err(error) {
  return { ok: false, value: undefined, error };
}

/**
 * Creates a Result factory for a specific error type
 * @template T, E
 * @returns {ResultFactory<T, E>}
 */
function createResultFactory() {
  return { ok, err };
}

/**
 * Checks if a Result is successful
 * @template T, E
 * @param {Result<T, E>} result
 * @returns {result is Result<T, E> & { ok: true; value: T }}
 */
function isOk(result) {
  return result.ok === true;
}

/**
 * Checks if a Result is an error
 * @template T, E
 * @param {Result<T, E>} result
 * @returns {result is Result<T, E> & { ok: false; error: E }}
 */
function isErr(result) {
  return result.ok === false;
}

/**
 * Maps a successful Result value
 * @template T, U, E
 * @param {Result<T, E>} result
 * @param {function(T): U} fn
 * @returns {Result<U, E>}
 */
function map(result, fn) {
  if (isOk(result)) {
    try {
      return ok(fn(result.value));
    } catch (error) {
      return err(error);
    }
  }
  return result;
}

/**
 * Maps a failed Result error
 * @template T, E, F
 * @param {Result<T, E>} result
 * @param {function(E): F} fn
 * @returns {Result<T, F>}
 */
function mapErr(result, fn) {
  if (isErr(result)) {
    try {
      return err(fn(result.error));
    } catch (error) {
      return err(error);
    }
  }
  return result;
}

/**
 * Chains a Result-returning function
 * @template T, U, E
 * @param {Result<T, E>} result
 * @param {function(T): Result<U, E>} fn
 * @returns {Result<U, E>}
 */
function andThen(result, fn) {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
}

/**
 * Chains a Result-returning function on error
 * @template T, E, F
 * @param {Result<T, E>} result
 * @param {function(E): Result<T, F>} fn
 * @returns {Result<T, F>}
 */
function orElse(result, fn) {
  if (isErr(result)) {
    return fn(result.error);
  }
  return result;
}

/**
 * Unwraps a Result, throwing on error
 * @template T, E
 * @param {Result<T, E>} result
 * @returns {T}
 * @throws {E}
 */
function unwrap(result) {
  if (isOk(result)) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwraps a Result or returns default
 * @template T, E
 * @param {Result<T, E>} result
 * @param {T} defaultValue
 * @returns {T}
 */
function unwrapOr(result, defaultValue) {
  return isOk(result) ? result.value : defaultValue;
}

/**
 * Unwraps a Result or computes default
 * @template T, E
 * @param {Result<T, E>} result
 * @param {function(E): T} fn
 * @returns {T}
 */
function unwrapOrElse(result, fn) {
  return isOk(result) ? result.value : fn(result.error);
}

/**
 * Converts a Promise to a Result
 * @template T, E
 * @param {Promise<T>} promise
 * @param {function(Error): E} [errorMapper]
 * @returns {Promise<Result<T, E>>}
 */
async function fromPromise(promise, errorMapper = (e) => e) {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    return err(errorMapper(error));
  }
}

/**
 * Converts a sync function to a Result
 * @template T, E
 * @param {function(): T} fn
 * @param {function(Error): E} [errorMapper]
 * @returns {Result<T, E>}
 */
function fromSync(fn, errorMapper = (e) => e) {
  try {
    return ok(fn());
  } catch (error) {
    return err(errorMapper(error));
  }
}

// ============================================================================
// ERROR TAXONOMY
// ============================================================================

class KernelError extends Error {
  constructor(message, code, context = {}) {
    super(message);
    this.name = 'KernelError';
    this.code = code;
    this.context = context;
    this.timestamp = Date.now();
    this.recoverable = false;
    this.reconciled = false;
  }
}

class NetworkError extends KernelError {
  constructor(message, context = {}) {
    super(message, 'NETWORK_ERROR', context);
    this.name = 'NetworkError';
    this.recoverable = true;
  }
}

class TimeoutError extends KernelError {
  constructor(message, context = {}) {
    super(message, 'TIMEOUT_ERROR', context);
    this.name = 'TimeoutError';
    this.recoverable = true;
  }
}

class ValidationError extends KernelError {
  constructor(message, context = {}) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
    this.recoverable = false;
  }
}

class ConfigurationError extends KernelError {
  constructor(message, context = {}) {
    super(message, 'CONFIGURATION_ERROR', context);
    this.name = 'ConfigurationError';
    this.recoverable = false;
  }
}

class CircuitOpenError extends KernelError {
  constructor(message, context = {}) {
    super(message, 'CIRCUIT_OPEN', context);
    this.name = 'CircuitOpenError';
    this.recoverable = true;
  }
}

class RetryExhaustedError extends KernelError {
  constructor(message, context = {}) {
    super(message, 'RETRY_EXHAUSTED', context);
    this.name = 'RetryExhaustedError';
    this.recoverable = false;
  }
}

class ResourceExhaustedError extends KernelError {
  constructor(message, context = {}) {
    super(message, 'RESOURCE_EXHAUSTED', context);
    this.name = 'ResourceExhaustedError';
    this.recoverable = true;
  }
}

class ConcurrencyError extends KernelError {
  constructor(message, context = {}) {
    super(message, 'CONCURRENCY_ERROR', context);
    this.name = 'ConcurrencyError';
    this.recoverable = true;
  }
}

// ============================================================================
// STRUCTURED LOGGING
// ============================================================================

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
};

const LEVEL_NAMES = ['debug', 'info', 'warn', 'error', 'fatal'];

class StructuredLogger {
  constructor(config = {}) {
    this.config = {
      minLevel: LOG_LEVELS.INFO,
      maxBufferSize: 1000,
      logSink: null,
      enableConsole: true,
      ...config
    };
    this.buffer = [];
    this.traceIdCounter = 0;
  }

  generateTraceId() {
    return `tr_${Date.now()}_${++this.traceIdCounter}_${Math.random().toString(36).slice(2, 9)}`;
  }

  generateSpanId() {
    return `sp_${Math.random().toString(36).slice(2, 11)}`;
  }

  log(level, message, context = {}, error = null) {
    if (level < this.config.minLevel) return;

    const entry = {
      level: LEVEL_NAMES[level],
      message,
      context: this.sanitizeContext(context),
      error: error ? this.serializeError(error) : null,
      timestamp: Date.now(),
      traceId: context.traceId || this.generateTraceId(),
      spanId: context.spanId || this.generateSpanId()
    };

    // Add to buffer
    this.buffer.push(entry);
    if (this.buffer.length > this.config.maxBufferSize) {
      this.buffer.shift();
    }

    // Console output
    if (this.config.enableConsole) {
      const prefix = `[${entry.level.toUpperCase()}]`;
      const ctx = JSON.stringify(entry.context);
      console[level >= LOG_LEVELS.ERROR ? 'error' : level === LOG_LEVELS.WARN ? 'warn' : 'log'](
        `${prefix} [${entry.traceId}] ${message}`,
        ctx || ''
      );
      if (error) console.error(error);
    }

    // External sink
    if (this.config.logSink) {
      try {
        this.config.logSink(entry);
      } catch (sinkError) {
        console.warn('[StructuredLogger] Log sink failed:', sinkError);
      }
    }

    return entry;
  }

  debug(message, context = {}) {
    return this.log(LOG_LEVELS.DEBUG, message, context);
  }

  info(message, context = {}) {
    return this.log(LOG_LEVELS.INFO, message, context);
  }

  warn(message, context = {}, error = null) {
    return this.log(LOG_LEVELS.WARN, message, context, error);
  }

  error(message, context = {}, error = null) {
    return this.log(LOG_LEVELS.ERROR, message, context, error);
  }

  fatal(message, context = {}, error = null) {
    return this.log(LOG_LEVELS.FATAL, message, context, error);
  }

  sanitizeContext(context) {
    const sanitized = {};
    for (const [key, value] of Object.entries(context)) {
      if (key === 'password' || key === 'token' || key === 'secret' || key === 'authorization') {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = '[Object]';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  serializeError(error) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack,
      context: error.context,
      recoverable: error.recoverable,
      reconciled: error.reconciled
    };
  }

  getBuffer() {
    return [...this.buffer];
  }

  clearBuffer() {
    this.buffer = [];
  }

  setMinLevel(level) {
    this.config.minLevel = level;
  }

  createChild(defaultContext = {}) {
    return new ChildLogger(this, defaultContext);
  }
}

class ChildLogger {
  constructor(parent, defaultContext) {
    this.parent = parent;
    this.defaultContext = defaultContext;
  }

  log(level, message, context = {}, error = null) {
    return this.parent.log(level, message, { ...this.defaultContext, ...context }, error);
  }

  debug(message, context = {}) {
    return this.log(LOG_LEVELS.DEBUG, message, context);
  }

  info(message, context = {}) {
    return this.log(LOG_LEVELS.INFO, message, context);
  }

  warn(message, context = {}, error = null) {
    return this.log(LOG_LEVELS.WARN, message, context, error);
  }

  error(message, context = {}, error = null) {
    return this.log(LOG_LEVELS.ERROR, message, context, error);
  }

  fatal(message, context = {}, error = null) {
    return this.log(LOG_LEVELS.FATAL, message, context, error);
  }
}

// ============================================================================
// METRICS COLLECTION
// ============================================================================

class MetricsCollector {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      maxMetrics: 10000,
      flushInterval: 60000,
      ...config
    };
    this.metrics = [];
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.timers = new Map();
    this.flushTimer = null;

    if (this.config.enabled && this.config.flushInterval > 0) {
      this.startFlushTimer();
    }
  }

  startFlushTimer() {
    this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  incrementCounter(name, labels = {}, value = 1) {
    if (!this.config.enabled) return;
    const key = this.makeKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
    this.recordMetric(name, current + value, labels, 'counter');
  }

  decrementCounter(name, labels = {}, value = 1) {
    this.incrementCounter(name, labels, -value);
  }

  setGauge(name, value, labels = {}) {
    if (!this.config.enabled) return;
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
    this.recordMetric(name, value, labels, 'gauge');
  }

  recordHistogram(name, value, labels = {}) {
    if (!this.config.enabled) return;
    const key = this.makeKey(name, labels);
    const buckets = this.histograms.get(key) || [];
    buckets.push(value);
    // Keep last 1000 values per histogram
    if (buckets.length > 1000) buckets.shift();
    this.histograms.set(key, buckets);
    this.recordMetric(name, value, labels, 'histogram');
  }

  startTimer(name, labels = {}) {
    const key = this.makeKey(name, labels);
    this.timers.set(key, { start: Date.now(), labels });
    return () => this.stopTimer(name, labels);
  }

  stopTimer(name, labels = {}) {
    const key = this.makeKey(name, labels);
    const timer = this.timers.get(key);
    if (timer) {
      const duration = Date.now() - timer.start;
      this.timers.delete(key);
      this.recordHistogram(`${name}_duration_ms`, duration, labels);
      return duration;
    }
    return null;
  }

  makeKey(name, labels) {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  recordMetric(name, value, labels, type) {
    const entry = {
      name,
      value,
      labels,
      type,
      timestamp: Date.now()
    };
    this.metrics.push(entry);
    if (this.metrics.length > this.config.maxMetrics) {
      this.metrics.shift();
    }
  }

  getCounter(name, labels = {}) {
    return this.counters.get(this.makeKey(name, labels)) || 0;
  }

  getGauge(name, labels = {}) {
    return this.gauges.get(this.makeKey(name, labels));
  }

  getHistogramStats(name, labels = {}) {
    const key = this.makeKey(name, labels);
    const values = this.histograms.get(key) || [];
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  getAllMetrics() {
    return [...this.metrics];
  }

  flush() {
    // Override in subclass or use logSink
    if (this.config.onFlush) {
      this.config.onFlush(this.getAllMetrics());
    }
    this.metrics = [];
  }

  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.timers.clear();
    this.metrics = [];
  }

  destroy() {
    this.stopFlushTimer();
    this.reset();
  }
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

const CIRCUIT_STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half-open'
};

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.options = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
      isFailure: (error) => error instanceof Error,
      onStateChange: null,
      ...options
    };

    this.state = CIRCUIT_STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;

    this.logger = options.logger || console;
    this.metrics = options.metrics;
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  async execute(fn) {
    if (this.state === CIRCUIT_STATES.OPEN) {
      if (Date.now() >= this.nextAttemptTime) {
        this.transitionToHalfOpen();
      } else {
        const error = new CircuitOpenError(
          `Circuit breaker "${this.name}" is OPEN`,
          { circuitBreaker: this.name, nextAttempt: this.nextAttemptTime }
        );
        this.recordFailure(error);
        throw error;
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;

    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.options.successThreshold) {
        this.transitionToClosed();
      }
    }

    this.recordMetric('success');
  }

  onFailure(error) {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      this.transitionToOpen();
    } else if (this.state === CIRCUIT_STATES.CLOSED &&
               this.failures >= this.options.failureThreshold) {
      this.transitionToOpen();
    }

    this.recordMetric('failure');
  }

  transitionToOpen() {
    this.state = CIRCUIT_STATES.OPEN;
    this.nextAttemptTime = Date.now() + this.options.timeout;
    this.successes = 0;
    this.notifyStateChange();
    this.logger.warn?.(`Circuit breaker "${this.name}" opened`);
  }

  transitionToHalfOpen() {
    this.state = CIRCUIT_STATES.HALF_OPEN;
    this.successes = 0;
    this.notifyStateChange();
    this.logger.warn?.(`Circuit breaker "${this.name}" half-open`);
  }

  transitionToClosed() {
    this.state = CIRCUIT_STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.notifyStateChange();
    this.logger.info?.(`Circuit breaker "${this.name}" closed`);
  }

  notifyStateChange() {
    if (this.options.onStateChange) {
      try {
        this.options.onStateChange(this.name, this.state);
      } catch (e) {
        this.logger.error?.('State change callback failed', { error: e });
      }
    }
  }

  recordMetric(type) {
    if (this.metrics) {
      this.metrics.incrementCounter(`circuit_breaker_${type}`, {
        circuit: this.name,
        state: this.state
      });
    }
  }

  reset() {
    this.state = CIRCUIT_STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
  }

  forceOpen() {
    this.transitionToOpen();
  }

  forceClosed() {
    this.transitionToClosed();
  }
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

class RetryPolicy {
  constructor(options = {}) {
    this.options = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: 0.1,
      shouldRetry: (error) => error?.recoverable !== false,
      onRetry: null,
      ...options
    };
  }

  async execute(fn, context = {}) {
    let lastError;

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      try {
        return await fn(attempt);
      } catch (error) {
        lastError = error;

        const shouldRetry = attempt < this.options.maxAttempts &&
                           this.options.shouldRetry(error);

        if (!shouldRetry) {
          break;
        }

        const delay = this.calculateDelay(attempt);

        if (this.options.onRetry) {
          try {
            this.options.onRetry(error, attempt, context);
          } catch (cbError) {
            // Ignore callback errors
          }
        }

        await this.sleep(delay);
      }
    }

    throw new RetryExhaustedError(
      `Retry exhausted after ${this.options.maxAttempts} attempts`,
      { originalError: lastError, attempts: this.options.maxAttempts }
    );
  }

  calculateDelay(attempt) {
    const exponentialDelay = this.options.baseDelay *
                            Math.pow(this.options.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this.options.maxDelay);
    const jitter = cappedDelay * this.options.jitter * Math.random();
    return Math.floor(cappedDelay + jitter);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// TRY/CATCH/RECOVER/RECONCILE PATTERNS
// ============================================================================

/**
 * Executes a function with full error handling pipeline
 * @template T, E
 * @param {function(): Promise<T>} fn - Function to execute
 * @param {Object} options - Configuration
 * @param {function(E): Promise<T>} [options.recover] - Recovery function
 * @param {function(E): Promise<T>} [options.reconcile] - Reconciliation function
 * @param {RetryPolicy} [options.retry] - Retry policy
 * @param {CircuitBreaker} [options.circuitBreaker] - Circuit breaker
 * @param {StructuredLogger} [options.logger] - Logger instance
 * @param {MetricsCollector} [options.metrics] - Metrics collector
 * @param {string} [options.operationName] - Operation name for metrics
 * @returns {Promise<Result<T, E>>}
 */
async function tryCatchRecoverReconcile(fn, options = {}) {
  const {
    recover = null,
    reconcile = null,
    retry = null,
    circuitBreaker = null,
    logger = null,
    metrics = null,
    operationName = 'unknown'
  } = options;

  const log = logger || defaultLogger;
  const traceId = log.generateTraceId();
  const childLog = log.createChild({ operation: operationName, traceId });

  childLog.debug('Operation started', { operation: operationName });

  const timer = metrics?.startTimer('operation_duration', { operation: operationName });
  metrics?.incrementCounter('operation_started', { operation: operationName });

  let result;

  try {
    // Wrap with circuit breaker if provided
    const executeFn = circuitBreaker
      ? () => circuitBreaker.execute(fn)
      : fn;

    // Wrap with retry if provided
    const executeWithRetry = retry
      ? () => retry.execute(executeFn, { operationName })
      : executeFn;

    const value = await executeWithRetry();
    result = ok(value);
    childLog.debug('Operation succeeded', { operation: operationName });

  } catch (error) {
    childLog.error('Operation failed', { operation: operationName }, error);
    metrics?.incrementCounter('operation_failed', {
      operation: operationName,
      error: error.name || 'Unknown'
    });

    // Try recovery
    if (recover) {
      try {
        childLog.info('Attempting recovery', { operation: operationName });
        const recoveredValue = await recover(error);
        result = ok(recoveredValue);
        result.isRecovered = true;
        childLog.info('Recovery succeeded', { operation: operationName });
        metrics?.incrementCounter('operation_recovered', { operation: operationName });
      } catch (recoveryError) {
        childLog.error('Recovery failed', { operation: operationName }, recoveryError);
        metrics?.incrementCounter('operation_recovery_failed', { operation: operationName });
        result = err(error);
      }
    } else {
      result = err(error);
    }

    // Try reconciliation (cleanup, compensation, etc.)
    if (reconcile && isErr(result)) {
      try {
        childLog.info('Attempting reconciliation', { operation: operationName });
        await reconcile(result.error);
        result.isReconciled = true;
        childLog.info('Reconciliation completed', { operation: operationName });
        metrics?.incrementCounter('operation_reconciled', { operation: operationName });
      } catch (reconcileError) {
        childLog.error('Reconciliation failed', { operation: operationName }, reconcileError);
        metrics?.incrementCounter('operation_reconciliation_failed', { operation: operationName });
      }
    }
  } finally {
    timer?.();
    metrics?.incrementCounter('operation_completed', {
      operation: operationName,
      status: isOk(result) ? 'success' : 'failure'
    });
  }

  return result;
}

/**
 * Synchronous version of tryCatchRecoverReconcile
 * @template T, E
 * @param {function(): T} fn
 * @param {Object} options
 * @returns {Result<T, E>}
 */
function tryCatchRecoverReconcileSync(fn, options = {}) {
  const {
    recover = null,
    reconcile = null,
    logger = null,
    metrics = null,
    operationName = 'unknown'
  } = options;

  const log = logger || defaultLogger;
  const traceId = log.generateTraceId();
  const childLog = log.createChild({ operation: operationName, traceId });

  let result;

  try {
    const value = fn();
    result = ok(value);
  } catch (error) {
    childLog.error('Sync operation failed', { operation: operationName }, error);

    if (recover) {
      try {
        const recoveredValue = recover(error);
        result = ok(recoveredValue);
        result.isRecovered = true;
      } catch (recoveryError) {
        result = err(error);
      }
    } else {
      result = err(error);
    }

    if (reconcile && isErr(result)) {
      try {
        reconcile(result.error);
        result.isReconciled = true;
      } catch (reconcileError) {
        // Log but don't override original error
        childLog.error('Reconciliation failed', { operation: operationName }, reconcileError);
      }
    }
  }

  return result;
}

/**
 * Creates a composable error handler pipeline
 * @param {Object} middleware - Array of middleware functions
 * @returns {function(fn): Promise<Result>}
 */
function createPipeline(...middleware) {
  return async function execute(fn) {
    let result = await fromPromise(fn());

    for (const mw of middleware) {
      result = await mw(result);
    }

    return result;
  };
}

// ============================================================================
// HIGHER-ORDER FUNCTIONS FOR COMMON PATTERNS
// ============================================================================

/**
 * Wraps an async function with retry and circuit breaker
 * @template T, Args extends any[]
 * @param {function(...Args): Promise<T>} fn
 * @param {Object} options
 * @returns {function(...Args): Promise<Result<T, Error>>}
 */
function withResilience(fn, options = {}) {
  const {
    retry = null,
    circuitBreaker = null,
    logger = defaultLogger,
    metrics = defaultMetrics,
    operationName = fn.name || 'anonymous'
  } = options;

  const retryPolicy = retry instanceof RetryPolicy ? retry : new RetryPolicy(retry);
  const breaker = circuitBreaker instanceof CircuitBreaker ? circuitBreaker :
                  (circuitBreaker ? new CircuitBreaker(operationName, circuitBreaker) : null);

  return async (...args) => {
    return tryCatchRecoverReconcile(
      () => fn(...args),
      {
        retry: retryPolicy,
        circuitBreaker: breaker,
        logger,
        metrics,
        operationName
      }
    );
  };
}

/**
 * Wraps a sync function with error handling
 * @template T, Args extends any[]
 * @param {function(...Args): T} fn
 * @param {Object} options
 * @returns {function(...Args): Result<T, Error>}
 */
function withSyncResilience(fn, options = {}) {
  const { logger = defaultLogger, metrics = defaultMetrics, operationName = fn.name || 'anonymous' } = options;

  return (...args) => {
    return tryCatchRecoverReconcileSync(
      () => fn(...args),
      { logger, metrics, operationName }
    );
  };
}

/**
 * Creates a timeout wrapper
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} [message]
 * @returns {Promise<Result<T, TimeoutError>>}
 */
async function withTimeout(promise, ms, message = 'Operation timed out') {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(message, { timeout: ms }));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return ok(result);
  } catch (error) {
    return err(error);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Creates a concurrency limiter
 * @param {number} maxConcurrent
 * @returns {function(fn): Promise<Result>}
 */
function createConcurrencyLimiter(maxConcurrent) {
  let running = 0;
  const queue = [];

  return async function limited(fn) {
    return new Promise((resolve) => {
      const execute = async () => {
        running++;
        try {
          const result = await fromPromise(fn());
          resolve(result);
        } finally {
          running--;
          if (queue.length > 0) {
            queue.shift()();
          }
        }
      };

      if (running < maxConcurrent) {
        execute();
      } else {
        queue.push(execute);
      }
    });
  };
}

// ============================================================================
// DEFAULT INSTANCES
// ============================================================================

const defaultLogger = new StructuredLogger({
  minLevel: LOG_LEVELS.INFO,
  enableConsole: true
});

const defaultMetrics = new MetricsCollector({
  enabled: true,
  flushInterval: 60000
});

// ============================================================================
// ERROR KERNEL CLASS - MAIN ENTRY POINT
// ============================================================================

class ErrorKernel {
  constructor(config = {}) {
    this.config = {
      enableMetrics: true,
      enableStructuredLogging: true,
      defaultRetry: {},
      defaultCircuitBreaker: {},
      ...config
    };

    this.logger = new StructuredLogger({
      minLevel: this.config.logLevel || LOG_LEVELS.INFO,
      logSink: this.config.logSink
    });

    this.metrics = new MetricsCollector({
      enabled: this.config.enableMetrics,
      onFlush: this.config.onMetricsFlush
    });

    this.circuitBreakers = new Map();
    this.retryPolicies = new Map();
  }

  getLogger(context = {}) {
    return this.logger.createChild(context);
  }

  getMetrics() {
    return this.metrics;
  }

  createCircuitBreaker(name, options = {}) {
    const breaker = new CircuitBreaker(name, {
      ...this.config.defaultCircuitBreaker,
      ...options,
      logger: this.logger,
      metrics: this.metrics
    });
    this.circuitBreakers.set(name, breaker);
    return breaker;
  }

  getCircuitBreaker(name) {
    return this.circuitBreakers.get(name);
  }

  createRetryPolicy(name, options = {}) {
    const policy = new RetryPolicy({
      ...this.config.defaultRetry,
      ...options
    });
    this.retryPolicies.set(name, policy);
    return policy;
  }

  getRetryPolicy(name) {
    return this.retryPolicies.get(name);
  }

  async execute(fn, options = {}) {
    return tryCatchRecoverReconcile(fn, {
      logger: this.logger,
      metrics: this.metrics,
      ...options
    });
  }

  executeSync(fn, options = {}) {
    return tryCatchRecoverReconcileSync(fn, {
      logger: this.logger,
      metrics: this.metrics,
      ...options
    });
  }

  withResilience(fn, options = {}) {
    return withResilience(fn, {
      logger: this.logger,
      metrics: this.metrics,
      ...options
    });
  }

  withSyncResilience(fn, options = {}) {
    return withSyncResilience(fn, {
      logger: this.logger,
      metrics: this.metrics,
      ...options
    });
  }

  getHealth() {
    const breakers = {};
    for (const [name, breaker] of this.circuitBreakers) {
      breakers[name] = breaker.getState();
    }

    return {
      circuitBreakers: breakers,
      metrics: {
        counters: Object.fromEntries(this.metrics.counters),
        gauges: Object.fromEntries(this.metrics.gauges)
      },
      logBufferSize: this.logger.buffer.length
    };
  }

  destroy() {
    this.metrics.destroy();
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
    this.circuitBreakers.clear();
    this.retryPolicies.clear();
    this.logger.clearBuffer();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Result pattern
export { ok, err, createResultFactory, isOk, isErr, map, mapErr, andThen, orElse, unwrap, unwrapOr, unwrapOrElse, fromPromise, fromSync };

// Error taxonomy
export { KernelError, NetworkError, TimeoutError, ValidationError, ConfigurationError, CircuitOpenError, RetryExhaustedError, ResourceExhaustedError, ConcurrencyError };

// Logging
export { StructuredLogger, ChildLogger, LOG_LEVELS };

// Metrics
export { MetricsCollector };

// Circuit Breaker
export { CircuitBreaker, CIRCUIT_STATES };

// Retry
export { RetryPolicy };

// Pipeline patterns
export { tryCatchRecoverReconcile, tryCatchRecoverReconcileSync, createPipeline };

// Higher-order functions
export { withResilience, withSyncResilience, withTimeout, createConcurrencyLimiter };

// Main class
export { ErrorKernel };

// Default instances
export { defaultLogger, defaultMetrics };

// Convenience: create a kernel with defaults
export function createErrorKernel(config) {
  return new ErrorKernel(config);
}

export default {
  // Result
  ok, err, createResultFactory, isOk, isErr, map, mapErr, andThen, orElse, unwrap, unwrapOr, unwrapOrElse, fromPromise, fromSync,
  // Errors
  KernelError, NetworkError, TimeoutError, ValidationError, ConfigurationError, CircuitOpenError, RetryExhaustedError, ResourceExhaustedError, ConcurrencyError,
  // Logging
  StructuredLogger, ChildLogger, LOG_LEVELS,
  // Metrics
  MetricsCollector,
  // Circuit Breaker
  CircuitBreaker, CIRCUIT_STATES,
  // Retry
  RetryPolicy,
  // Pipeline
  tryCatchRecoverReconcile, tryCatchRecoverReconcileSync, createPipeline,
  // Higher-order
  withResilience, withSyncResilience, withTimeout, createConcurrencyLimiter,
  // Kernel
  ErrorKernel, createErrorKernel,
  // Defaults
  defaultLogger, defaultMetrics
};