/**
 * Error Kernel
 * Centralized error handling with wrapper utilities for Chrome API calls
 * Provides graceful degradation and diagnostics
 */

// Error categories
const ERROR_CATEGORIES = {
  STORAGE: 'storage',
  DNR: 'dnr',
  MESSAGING: 'messaging',
  SCRIPT: 'script',
  NETWORK: 'network',
  UNKNOWN: 'unknown'
};

// Max retries for transient failures
const MAX_RETRIES = 3;

// Backoff delays (ms)
const BACKOFF_DELAYS = [100, 500, 2000];

/**
 * Wrap a Chrome API call with error handling
 * @param {string} label - Label for diagnostics
 * @param {Function} fn - Async function to wrap
 * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
 */
export async function wrapAPI(label, fn) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const data = await fn();
      return { success: true, data };
    } catch (error) {
      const isLast = attempt === MAX_RETRIES - 1;
      console.error(
        `[AeroGuard] ${label} failed (attempt ${attempt + 1}/${MAX_RETRIES}):`,
        error.message
      );

      if (isLast) {
        return {
          success: false,
          error: new Error(`${label}: ${error.message}`),
          category: categorizeError(error)
        };
      }

      // Wait before retry
      await sleep(BACKOFF_DELAYS[attempt] || 2000);
    }
  }

  return { success: false, error: new Error(`${label}: max retries exceeded`), category: ERROR_CATEGORIES.UNKNOWN };
}

/**
 * Categorize an error for diagnostics
 */
function categorizeError(error) {
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('storage') || msg.includes('quota')) return ERROR_CATEGORIES.STORAGE;
  if (msg.includes('declarativeNetRequest') || msg.includes('rules')) return ERROR_CATEGORIES.DNR;
  if (msg.includes('messaging') || msg.includes('port')) return ERROR_CATEGORIES.MESSAGING;
  if (msg.includes('script') || msg.includes('inject')) return ERROR_CATEGORIES.SCRIPT;
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('dns')) return ERROR_CATEGORIES.NETWORK;
  return ERROR_CATEGORIES.UNKNOWN;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wrap storage operations with error handling
 */
export async function wrapStorage(label, fn) {
  return wrapAPI(`storage:${label}`, fn);
}

/**
 * Wrap DNR operations with error handling
 */
export async function wrapDNR(label, fn) {
  return wrapAPI(`dnr:${label}`, fn);
}

/**
 * Wrap messaging operations with error handling
 */
export async function wrapMessaging(label, fn) {
  return wrapAPI(`messaging:${label}`, fn);
}

/**
 * Wrap script injection with error handling
 */
export async function wrapScriptInjection(label, fn) {
  return wrapAPI(`script:${label}`, fn);
}

/**
 * Create a safe async wrapper that never throws
 */
export function safeAsync(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error(`[AeroGuard] Safe async error:`, error.message);
      return null;
    }
  };
}

/**
 * Log error to console with context
 */
export function logError(context, error) {
  console.error(`[AeroGuard][${context}]`, error);
}

/**
 * Check if error is transient (retryable)
 */
export function isTransientError(error) {
  const msg = (error.message || '').toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('abort') ||
    msg.includes('unavailable') ||
    msg.includes('service worker') ||
    msg.includes('extension unloaded')
  );
}

/**
 * Error kernel singleton with diagnostics
 */
const errorKernel = {
  errors: [],
  maxErrors: 100,

  /** Record an error */
  record(error, context = 'unknown') {
    this.errors.unshift({
      message: error.message,
      context,
      timestamp: Date.now(),
      stack: error.stack
    });
    if (this.errors.length > this.maxErrors) {
      this.errors.pop();
    }
  },

  /** Get all recorded errors */
  getErrors() {
    return [...this.errors];
  },

  /** Clear error log */
  clearErrors() {
    this.errors = [];
  },

  /** Get error summary */
  getSummary() {
    const counts = {};
    for (const err of this.errors) {
      counts[err.context] = (counts[err.context] || 0) + 1;
    }
    return {
      total: this.errors.length,
      byContext: counts
    };
  }
};

export { ERROR_CATEGORIES, errorKernel };
export default { errorKernel, wrapStorage, wrapDNR, wrapMessaging, wrapScriptInjection, safeAsync, logError, isTransientError, ERROR_CATEGORIES, wrapAPI };