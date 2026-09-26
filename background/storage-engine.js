/**
 * Storage Engine
 * Wrapper around chrome.storage for persistent storage with fallback
 */

// Storage backends
const BACKENDS = {
  sync: 'sync',
  local: 'local',
  session: 'session'
};

// Default backend is sync (synced across devices)
const DEFAULT_BACKEND = BACKENDS.sync;

/**
 * Get data from storage
 * @param {string|string[]} keys - Key(s) to retrieve
 * @param {Object} options - Options (backend)
 * @returns {Promise<Object>} Retrieved data
 */
export async function get(keys, options = {}) {
  const backend = options.backend || DEFAULT_BACKEND;
  const storage = chrome.storage[backend];

  if (!storage) {
    throw new Error(`Storage backend '${backend}' not available`);
  }

  return new Promise((resolve, reject) => {
    storage.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Set data in storage
 * @param {string|Object} keys - Key or object of key-value pairs
 * @param {any} value - Value (if keys is string)
 * @param {Object} options - Options (backend)
 * @returns {Promise<void>}
 */
export async function set(keys, value, options = {}) {
  const backend = options.backend || DEFAULT_BACKEND;
  const storage = chrome.storage[backend];

  if (!storage) {
    throw new Error(`Storage backend '${backend}' not available`);
  }

  const data = typeof keys === 'string' ? { [keys]: value } : keys;

  return new Promise((resolve, reject) => {
    storage.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Remove data from storage
 * @param {string|string[]} keys - Key(s) to remove
 * @param {Object} options - Options (backend)
 * @returns {Promise<void>}
 */
export async function remove(keys, options = {}) {
  const backend = options.backend || DEFAULT_BACKEND;
  const storage = chrome.storage[backend];

  if (!storage) {
    throw new Error(`Storage backend '${backend}' not available`);
  }

  return new Promise((resolve, reject) => {
    storage.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Clear all data from storage
 * @param {Object} options - Options (backend)
 * @returns {Promise<void>}
 */
export async function clear(options = {}) {
  const backend = options.backend || DEFAULT_BACKEND;
  const storage = chrome.storage[backend];

  if (!storage) {
    throw new Error(`Storage backend '${backend}' not available`);
  }

  return new Promise((resolve, reject) => {
    storage.clear(() => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Get storage usage info
 * @param {Object} options - Options (backend)
 * @returns {Promise<Object>} Usage info
 */
export async function getUsage(options = {}) {
  const backend = options.backend || DEFAULT_BACKEND;
  const storage = chrome.storage[backend];

  if (!storage) {
    throw new Error(`Storage backend '${backend}' not available`);
  }

  return new Promise((resolve, reject) => {
    storage.getBytesInUse(null, (bytesInUse) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve({ bytesInUse });
      }
    });
  });
}

/**
 * Listen for storage changes
 * @param {Function} callback - Change callback
 * @returns {Function} Unsubscribe function
 */
export function onChanged(callback) {
  chrome.storage.onChanged.addListener(callback);
  return () => chrome.storage.onChanged.removeListener(callback);
}

export const storageEngine = {
  get,
  set,
  remove,
  clear,
  getUsage,
  onChanged
};

export default storageEngine;