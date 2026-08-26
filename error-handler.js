class ErrorHandler {
  constructor() {
    this.errorCount = 0;
    this.errors = [];
  }

  /**
   * Wraps an async function with retry logic and optional fallback
   * @param {Function} fn - Async function to wrap
   * @param {Object} options - Configuration options
   * @param {number} options.retries - Number of retry attempts (default: 3)
   * @param {number} options.delay - Base delay between retries in ms (default: 1000)
   * @param {Function} options.fallback - Fallback function to call if all retries fail
   * @param {boolean} options.shouldRetry - Function to determine if error is retryable (default: all errors)
   * @returns {Function} Wrapped function
   */
  wrap(fn, options = {}) {
    const {
      retries = 3,
      delay = 1000,
      fallback = null,
      shouldRetry = () => true
    } = options;

    return async (...args) => {
      let lastError;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await fn(...args);
        } catch (error) {
          lastError = error;
          this.incrementErrorCount();
          this.log(error, { attempt: attempt + 1, maxRetries: retries });

          if (attempt < retries && shouldRetry(error)) {
            await this.sleep(delay * Math.pow(2, attempt)); // Exponential backoff
            continue;
          }
          break;
        }
      }

      // All retries exhausted, try fallback
      if (fallback) {
        try {
          return await fallback(lastError, ...args);
        } catch (fallbackError) {
          this.log(fallbackError, { context: 'fallback_failed', originalError: lastError });
        }
      }

      throw lastError;
    };
  }

  /**
   * Wraps a synchronous function with error handling
   * @param {Function} fn - Sync function to wrap
   * @param {Function} fallback - Optional fallback function
   * @returns {Function} Wrapped function
   */
  wrapSync(fn, fallback = null) {
    return (...args) => {
      try {
        return fn(...args);
      } catch (error) {
        this.incrementErrorCount();
        this.log(error, { sync: true });

        if (fallback) {
          try {
            return fallback(error, ...args);
          } catch (fallbackError) {
            this.log(fallbackError, { context: 'fallback_failed', originalError: error });
          }
        }

        throw error;
      }
    };
  }

  /**
   * Increments the error count
   */
  incrementErrorCount() {
    this.errorCount++;
  }

  /**
   * Logs an error with optional context
   * @param {Error} error - Error to log
   * @param {Object} context - Additional context
   */
  log(error, context = {}) {
    const errorEntry = {
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      name: error.name,
      ...context
    };

    this.errors.push(errorEntry);

    // Keep only last 100 errors to prevent memory issues
    if (this.errors.length > 100) {
      this.errors.shift();
    }

    // Also log to console for debugging
    console.error('[ErrorHandler]', errorEntry);
  }

  /**
   * Sleep utility for delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reports an error to chrome.storage
   * @param {Error} error - Error to report
   * @param {Object} context - Additional context
   * @returns {Promise<void>}
   */
  async reportError(error, context = {}) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const errorData = {
          timestamp: Date.now(),
          message: error.message,
          stack: error.stack,
          name: error.name,
          url: typeof window !== 'undefined' ? window.location.href : 'unknown',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          ...context
        };

        // Get existing errors from storage
        const result = await chrome.storage.local.get('errorReports');
        const existingErrors = result.errorReports || [];

        // Add new error (keep last 50)
        existingErrors.unshift(errorData);
        const trimmedErrors = existingErrors.slice(0, 50);

        // Save back to storage
        await chrome.storage.local.set({ errorReports: trimmedErrors });
      }
    } catch (storageError) {
      // Silently fail - don't throw if storage reporting fails
      console.warn('[ErrorHandler] Failed to report error to chrome.storage:', storageError);
    }
  }

  /**
   * Gets error statistics
   * @returns {Object} Error statistics
   */
  getErrorStats() {
    const recentErrors = this.errors.slice(-50);
    const errorTypes = {};

    recentErrors.forEach(err => {
      const type = err.name || 'Unknown';
      errorTypes[type] = (errorTypes[type] || 0) + 1;
    });

    return {
      totalErrors: this.errorCount,
      recentErrorsCount: recentErrors.length,
      errorTypes,
      recentErrors: recentErrors.slice(-10) // Last 10 errors
    };
  }

  /**
   * Clears error history
   */
  clearErrors() {
    this.errors = [];
    this.errorCount = 0;
  }
}

// Export global instance
const errorHandler = new ErrorHandler();

export { ErrorHandler, errorHandler };