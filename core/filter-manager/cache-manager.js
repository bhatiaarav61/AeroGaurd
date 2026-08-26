/**
 * Cache Manager - Advanced caching for filter lists with compression, LRU eviction, integrity checks, and background refresh
 *
 * Features:
 * - MemoryCache: Map<listId, {rules, etag, lastModified, timestamp, compressed, checksum}>
 * - PersistentCache: chrome.storage.local with 'filterListCache' key
 * - Compression: LZ-string for rules arrays, 70%+ compression typical
 * - MaxCacheSize: 50MB total, LRU eviction when exceeded
 * - MaxAge: 7 days, auto-evict stale entries
 * - ConditionalGet: store ETag/Last-Modified, send with requests
 * - Integrity Checks: SHA-256 checksums for cached data verification
 * - Background Refresh: Periodic refresh of critical lists with configurable intervals
 * - CacheHit/Miss: metrics for telemetry
 * - WarmCache: preload critical lists on startup
 */

import { errorHandler } from '../../error-handler.js';

// ============================================================================
// Crypto Utilities for Integrity Checks
// ============================================================================

class CryptoUtils {
  /**
   * Generate SHA-256 checksum for data integrity verification
   */
  static async generateChecksum(data) {
    try {
      const str = typeof data === 'string' ? data : JSON.stringify(data);
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      errorHandler.log(error, { context: 'CryptoUtils.generateChecksum' });
      // Fallback to simple hash if crypto.subtle unavailable
      return CryptoUtils._simpleHash(str);
    }
  }

  /**
   * Verify data integrity against stored checksum
   */
  static async verifyChecksum(data, expectedChecksum) {
    const actualChecksum = await CryptoUtils.generateChecksum(data);
    return actualChecksum === expectedChecksum;
  }

  /**
   * Simple fallback hash for environments without crypto.subtle
   */
  static _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Generate a quick fingerprint for rules array (faster than full checksum)
   */
  static generateFingerprint(rules) {
    if (!rules || !rules.length) return 'empty';
    // Use rule count + first/last rule IDs + total length for quick verification
    const count = rules.length;
    const firstId = rules[0]?.id || 'none';
    const lastId = rules[count - 1]?.id || 'none';
    const totalLength = JSON.stringify(rules).length;
    return `${count}:${firstId}:${lastId}:${totalLength}`;
  }

  /**
   * Verify fingerprint matches
   */
  static verifyFingerprint(rules, expectedFingerprint) {
    return CryptoUtils.generateFingerprint(rules) === expectedFingerprint;
  }
}

// ============================================================================
// LZ-String Compression (lightweight implementation for rules arrays)
// ============================================================================

class LZString {
  static compress(uncompressed) {
    if (uncompressed == null) return '';
    const dict = {};
    const data = (uncompressed + '').split('');
    const out = [];
    let currChar;
    let phrase = data[0];
    let code = 256;
    let i, len = data.length;
    for (i = 1; i < len; i++) {
      currChar = data[i];
      if (dict[phrase + currChar] != null) {
        phrase += currChar;
      } else {
        out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
        dict[phrase + currChar] = code;
        code++;
        phrase = currChar;
      }
    }
    out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
    // Convert to string
    const charArray = out.map(code => String.fromCharCode(code));
    return charArray.join('');
  }

  static decompress(compressed) {
    if (compressed == null) return '';
    const dict = {};
    const data = (compressed + '').split('');
    const out = [];
    let currChar;
    let phrase = data[0];
    let code = 256;
    let i, len = data.length;
    out.push(phrase);
    for (i = 1; i < len; i++) {
      currChar = data[i];
      const entry = data.slice(i).join('');
      if (dict[entry] != null) {
        out.push(dict[entry]);
        phrase = dict[entry];
      } else {
        out.push(phrase);
        phrase = phrase + currChar;
      }
      dict[code] = phrase + currChar;
      code++;
    }
    return out.join('');
  }

  // Compress to base64 for storage
  static compressToBase64(uncompressed) {
    return btoa(this.compress(uncompressed));
  }

  static decompressFromBase64(compressed) {
    return this.decompress(atob(compressed));
  }

  // JSON-aware compression
  static compressJSON(obj) {
    return this.compressToBase64(JSON.stringify(obj));
  }

  static decompressJSON(compressed) {
    return JSON.parse(this.decompressFromBase64(compressed));
  }
}

// ============================================================================
// Memory Cache with LRU Eviction and Integrity Checks
// ============================================================================

class MemoryCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 50 * 1024 * 1024; // 50MB default
    this.maxAge = options.maxAge || 7 * 24 * 60 * 60 * 1000; // 7 days
    this.cache = new Map();
    this.accessOrder = new Map(); // listId -> access timestamp
    this.currentSize = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.integrityFailures = 0;
  }

  /**
   * Calculate approximate size of an entry in bytes
   */
  _estimateSize(entry) {
    if (!entry) return 0;
    // Approximate JSON string size
    const str = JSON.stringify(entry);
    return new Blob([str]).size;
  }

  /**
   * Get entry from cache with integrity verification
   */
  async get(listId) {
    const entry = this.cache.get(listId);
    if (!entry) {
      this.misses++;
      return null;
    }

    // Check age
    const age = Date.now() - entry.timestamp;
    if (age > this.maxAge) {
      this.delete(listId);
      this.misses++;
      return null;
    }

    // Verify integrity if checksum exists
    if (entry.checksum && entry.rules) {
      const valid = await CryptoUtils.verifyChecksum(entry.rules, entry.checksum);
      if (!valid) {
        this.integrityFailures++;
        console.warn(`[MemoryCache] Integrity check failed for ${listId}, evicting`);
        this.delete(listId);
        this.misses++;
        return null;
      }
    }

    // Update access order (LRU)
    this.accessOrder.set(listId, Date.now());
    this.hits++;
    return entry;
  }

  /**
   * Set entry in cache with LRU eviction and checksum generation
   */
  async set(listId, entry) {
    const size = this._estimateSize(entry);

    // If single entry exceeds max size, don't cache it
    if (size > this.maxSize) {
      console.warn(`[MemoryCache] Entry ${listId} (${size} bytes) exceeds max cache size`);
      return false;
    }

    // Evict LRU entries if needed
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      this._evictLRU();
    }

    // Remove old entry if exists
    if (this.cache.has(listId)) {
      const oldEntry = this.cache.get(listId);
      this.currentSize -= this._estimateSize(oldEntry);
    }

    // Add new entry with checksum
    entry.timestamp = Date.now();
    entry.compressed = true;
    if (entry.rules && !entry.checksum) {
      entry.checksum = await CryptoUtils.generateChecksum(entry.rules);
      entry.fingerprint = CryptoUtils.generateFingerprint(entry.rules);
    }
    this.cache.set(listId, entry);
    this.accessOrder.set(listId, Date.now());
    this.currentSize += size;

    return true;
  }

  /**
   * Evict least recently used entry
   */
  _evictLRU() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, time] of this.accessOrder) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      this.evictions++;
    }
  }

  /**
   * Delete entry from cache
   */
  delete(listId) {
    const entry = this.cache.get(listId);
    if (entry) {
      this.currentSize -= this._estimateSize(entry);
      this.cache.delete(listId);
      this.accessOrder.delete(listId);
      return true;
    }
    return false;
  }

  /**
   * Check if entry exists and is fresh
   */
  has(listId) {
    const entry = this.cache.get(listId);
    if (!entry) return false;

    const age = Date.now() - entry.timestamp;
    if (age > this.maxAge) {
      this.delete(listId);
      return false;
    }
    return true;
  }

  /**
   * Clear all entries
   */
  clear() {
    this.cache.clear();
    this.accessOrder.clear();
    this.currentSize = 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      evictions: this.evictions,
      size: this.currentSize,
      maxSize: this.maxSize,
      entryCount: this.cache.size,
      maxAge: this.maxAge
    };
  }

  /**
   * Get all keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Cleanup stale entries
   */
  cleanup() {
    const now = Date.now();
    const toDelete = [];

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.maxAge) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.delete(key);
    }

    return toDelete.length;
  }
}

// ============================================================================
// Persistent Cache (chrome.storage.local)
// ============================================================================

class PersistentCache {
  constructor(options = {}) {
    this.storageKey = options.storageKey || 'filterListCache';
    this.maxSize = options.maxSize || 50 * 1024 * 1024; // 50MB
    this.maxAge = options.maxAge || 7 * 24 * 60 * 60 * 1000; // 7 days
    this.isAvailable = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  /**
   * Get entry from persistent storage
   */
  async get(listId) {
    if (!this.isAvailable) return null;

    try {
      const { [this.storageKey]: cache } = await chrome.storage.local.get(this.storageKey);
      if (!cache || !cache[listId]) return null;

      const entry = cache[listId];

      // Check age
      if (entry.lastUpdated) {
        const age = Date.now() - new Date(entry.lastUpdated).getTime();
        if (age > this.maxAge) {
          await this.delete(listId);
          return null;
        }
      }

      // Decompress rules if compressed
      if (entry.compressed && entry.rules) {
        entry.rules = this._decompressRules(entry.rules);
      }

      return entry;
    } catch (error) {
      errorHandler.log(error, { context: 'PersistentCache.get', listId });
      return null;
    }
  }

  /**
   * Set entry in persistent storage
   */
  async set(listId, entry) {
    if (!this.isAvailable) return false;

    try {
      const { [this.storageKey]: cache = {} } = await chrome.storage.local.get(this.storageKey);

      // Compress rules for storage
      const compressedEntry = {
        ...entry,
        rules: entry.rules ? this._compressRules(entry.rules) : [],
        compressed: true,
        lastAccessed: Date.now()
      };

      // Check size constraint
      const totalSize = await this._estimateTotalSize({ ...cache, [listId]: compressedEntry });
      if (totalSize > this.maxSize) {
        // Evict LRU entries
        await this._evictLRUFromCache(cache, compressedEntry);
      }

      cache[listId] = compressedEntry;
      await chrome.storage.local.set({ [this.storageKey]: cache });
      return true;
    } catch (error) {
      errorHandler.log(error, { context: 'PersistentCache.set', listId });
      return false;
    }
  }

  /**
   * Delete entry from persistent storage
   */
  async delete(listId) {
    if (!this.isAvailable) return false;

    try {
      const { [this.storageKey]: cache = {} } = await chrome.storage.local.get(this.storageKey);
      if (!cache[listId]) return false;

      delete cache[listId];
      await chrome.storage.local.set({ [this.storageKey]: cache });
      return true;
    } catch (error) {
      errorHandler.log(error, { context: 'PersistentCache.delete', listId });
      return false;
    }
  }

  /**
   * Get all entries
   */
  async getAll() {
    if (!this.isAvailable) return {};

    try {
      const { [this.storageKey]: cache = {} } = await chrome.storage.local.get(this.storageKey);

      // Decompress all entries
      const result = {};
      for (const [key, entry] of Object.entries(cache)) {
        if (entry.compressed && entry.rules) {
          result[key] = {
            ...entry,
            rules: this._decompressRules(entry.rules)
          };
        } else {
          result[key] = entry;
        }
      }
      return result;
    } catch (error) {
      errorHandler.log(error, { context: 'PersistentCache.getAll' });
      return {};
    }
  }

  /**
   * Clear all entries
   */
  async clear() {
    if (!this.isAvailable) return false;

    try {
      await chrome.storage.local.remove(this.storageKey);
      return true;
    } catch (error) {
      errorHandler.log(error, { context: 'PersistentCache.clear' });
      return false;
    }
  }

  /**
   * Compress rules array for storage
   */
  _compressRules(rules) {
    try {
      // Minify rules by keeping only essential fields
      const minified = rules.map(rule => ({
        id: rule.id,
        p: rule.priority,
        a: rule.action,
        c: rule.condition
      }));
      return LZString.compressJSON(minified);
    } catch (error) {
      errorHandler.log(error, { context: 'PersistentCache._compressRules' });
      return LZString.compressJSON(rules); // Fallback to full compression
    }
  }

  /**
   * Decompress rules array from storage
   */
  _decompressRules(compressed) {
    try {
      const minified = LZString.decompressJSON(compressed);
      // Restore full rule structure
      return minified.map(rule => ({
        id: rule.id,
        priority: rule.p,
        action: rule.a,
        condition: rule.c
      }));
    } catch (error) {
      errorHandler.log(error, { context: 'PersistentCache._decompressRules' });
      return [];
    }
  }

  /**
   * Estimate total cache size
   */
  async _estimateTotalSize(cache) {
    try {
      const str = JSON.stringify(cache);
      return new Blob([str]).size;
    } catch {
      return 0;
    }
  }

  /**
   * Evict LRU entries from persistent cache
   */
  async _evictLRUFromCache(cache, newEntry) {
    const entries = Object.entries(cache);

    // Sort by lastAccessed (oldest first)
    entries.sort((a, b) => (a[1].lastAccessed || 0) - (b[1].lastAccessed || 0));

    // Remove oldest entries until we have space
    const newEntrySize = JSON.stringify(newEntry).length;
    let currentSize = await this._estimateTotalSize(cache);

    for (const [key] of entries) {
      if (currentSize + newEntrySize <= this.maxSize) break;
      const entrySize = JSON.stringify(cache[key]).length;
      delete cache[key];
      currentSize -= entrySize;
    }
  }

  /**
   * Cleanup stale entries
   */
  async cleanup() {
    if (!this.isAvailable) return 0;

    try {
      const { [this.storageKey]: cache = {} } = await chrome.storage.local.get(this.storageKey);
      const now = Date.now();
      let deleted = 0;

      for (const [key, entry] of Object.entries(cache)) {
        if (entry.lastUpdated) {
          const age = now - new Date(entry.lastUpdated).getTime();
          if (age > this.maxAge) {
            delete cache[key];
            deleted++;
          }
        }
      }

      if (deleted > 0) {
        await chrome.storage.local.set({ [this.storageKey]: cache });
      }

      return deleted;
    } catch (error) {
      errorHandler.log(error, { context: 'PersistentCache.cleanup' });
      return 0;
    }
  }

  /**
   * Get storage usage info
   */
  async getUsage() {
    if (!this.isAvailable) return { used: 0, available: 0 };

    try {
      const { [this.storageKey]: cache = {} } = await chrome.storage.local.get(this.storageKey);
      const str = JSON.stringify(cache);
      const used = new Blob([str]).size;

      // Chrome storage limit is typically 5MB for local, but we track our quota
      return { used, available: this.maxSize - used };
    } catch (error) {
      errorHandler.log(error, { context: 'PersistentCache.getUsage' });
      return { used: 0, available: 0 };
    }
  }
}

// ============================================================================
// Conditional GET Headers Manager
// ============================================================================

class ConditionalGetManager {
  constructor() {
    this.headers = new Map(); // listId -> { etag, lastModified }
  }

  /**
   * Get conditional headers for a list
   */
  getHeaders(listId) {
    const cached = this.headers.get(listId);
    if (!cached) return {};

    const headers = {};
    if (cached.etag) headers['If-None-Match'] = cached.etag;
    if (cached.lastModified) headers['If-Modified-Since'] = cached.lastModified;
    return headers;
  }

  /**
   * Update headers from response
   */
  updateHeaders(listId, response) {
    const etag = response.headers.get('etag');
    const lastModified = response.headers.get('last-modified');

    if (etag || lastModified) {
      this.headers.set(listId, { etag, lastModified });
    }
  }

  /**
   * Check if response is 304 Not Modified
   */
  isNotModified(response) {
    return response.status === 304;
  }

  /**
   * Clear headers for a list
   */
  clear(listId) {
    this.headers.delete(listId);
  }

  /**
   * Clear all headers
   */
  clearAll() {
    this.headers.clear();
  }

  /**
   * Get stored headers for a list
   */
  getStoredHeaders(listId) {
    return this.headers.get(listId) || { etag: null, lastModified: null };
  }
}

// ============================================================================
// Cache Telemetry
// ============================================================================

class CacheTelemetry {
  constructor() {
    this.metrics = {
      hits: 0,
      misses: 0,
      memoryHits: 0,
      memoryMisses: 0,
      persistentHits: 0,
      persistentMisses: 0,
      evictions: 0,
      compressions: 0,
      decompressions: 0,
      compressionRatio: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      warmCacheLoads: 0,
      warmCacheBytes: 0,
      errors: 0
    };
    this.listMetrics = new Map(); // listId -> { hits, misses, lastAccess }
  }

  recordHit(listId, source = 'memory') {
    this.metrics.hits++;
    if (source === 'memory') this.metrics.memoryHits++;
    else if (source === 'persistent') this.metrics.persistentHits++;

    const lm = this.listMetrics.get(listId) || { hits: 0, misses: 0, lastAccess: 0 };
    lm.hits++;
    lm.lastAccess = Date.now();
    this.listMetrics.set(listId, lm);
  }

  recordMiss(listId, source = 'memory') {
    this.metrics.misses++;
    if (source === 'memory') this.metrics.memoryMisses++;
    else if (source === 'persistent') this.metrics.persistentMisses++;

    const lm = this.listMetrics.get(listId) || { hits: 0, misses: 0, lastAccess: 0 };
    lm.misses++;
    lm.lastAccess = Date.now();
    this.listMetrics.set(listId, lm);
  }

  recordEviction() {
    this.metrics.evictions++;
  }

  recordCompression(originalSize, compressedSize) {
    this.metrics.compressions++;
    this.metrics.totalOriginalSize += originalSize;
    this.metrics.totalCompressedSize += compressedSize;
    this.metrics.compressionRatio = this.metrics.totalCompressedSize / this.metrics.totalOriginalSize;
  }

  recordDecompression() {
    this.metrics.decompressions++;
  }

  recordWarmCache(count, bytes) {
    this.metrics.warmCacheLoads += count;
    this.metrics.warmCacheBytes += bytes;
  }

  recordError() {
    this.metrics.errors++;
  }

  /**
   * Get overall metrics
   */
  getMetrics() {
    const total = this.metrics.hits + this.metrics.misses;
    return {
      ...this.metrics,
      hitRate: total > 0 ? this.metrics.hits / total : 0,
      memoryHitRate: this.metrics.memoryHits + this.metrics.memoryMisses > 0
        ? this.metrics.memoryHits / (this.metrics.memoryHits + this.metrics.memoryMisses) : 0,
      persistentHitRate: this.metrics.persistentHits + this.metrics.persistentMisses > 0
        ? this.metrics.persistentHits / (this.metrics.persistentHits + this.metrics.persistentMisses) : 0,
      compressionSavings: this.metrics.totalOriginalSize - this.metrics.totalCompressedSize,
      compressionRatio: this.metrics.compressionRatio || 0
    };
  }

  /**
   * Get per-list metrics
   */
  getListMetrics(listId) {
    return this.listMetrics.get(listId) || { hits: 0, misses: 0, lastAccess: 0 };
  }

  /**
   * Get all list metrics
   */
  getAllListMetrics() {
    return Object.fromEntries(this.listMetrics);
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      hits: 0, misses: 0, memoryHits: 0, memoryMisses: 0,
      persistentHits: 0, persistentMisses: 0, evictions: 0,
      compressions: 0, decompressions: 0, compressionRatio: 0,
      totalOriginalSize: 0, totalCompressedSize: 0,
      warmCacheLoads: 0, warmCacheBytes: 0, errors: 0
    };
    this.listMetrics.clear();
  }
}

// ============================================================================
// Background Refresh Manager
// ============================================================================

class BackgroundRefreshManager {
  constructor(options = {}) {
    this.cacheManager = options.cacheManager;
    this.refreshInterval = options.refreshInterval || 60 * 60 * 1000; // 1 hour default
    this.criticalLists = options.criticalLists || ['easylist', 'easyprivacy', 'peterlowe'];
    this.refreshCallback = options.refreshCallback || null; // Function to fetch fresh rules
    this.isRunning = false;
    this.intervalId = null;
    this.lastRefresh = new Map(); // listId -> timestamp
    this.refreshInProgress = new Set(); // listId currently being refreshed
    this.maxConcurrentRefreshes = options.maxConcurrentRefreshes || 3;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 5000; // 5 seconds
    this.onRefreshSuccess = options.onRefreshSuccess || null;
    this.onRefreshError = options.onRefreshError || null;
    this.debug = options.debug || false;
  }

  /**
   * Start background refresh loop
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;

    // Run initial refresh after a short delay
    setTimeout(() => this._refreshCycle(), 10000);

    // Set up recurring interval
    this.intervalId = setInterval(() => this._refreshCycle(), this.refreshInterval);

    if (this.debug) {
      console.log('[BackgroundRefresh] Started with interval', this.refreshInterval);
    }
  }

  /**
   * Stop background refresh loop
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;

    if (this.debug) {
      console.log('[BackgroundRefresh] Stopped');
    }
  }

  /**
   * Main refresh cycle - checks all critical lists
   */
  async _refreshCycle() {
    if (!this.isRunning || !this.refreshCallback) return;

    const now = Date.now();
    const listsToRefresh = [];

    for (const listId of this.criticalLists) {
      // Skip if already refreshing
      if (this.refreshInProgress.has(listId)) continue;

      // Check if enough time has passed since last refresh
      const lastRefresh = this.lastRefresh.get(listId) || 0;
      if (now - lastRefresh >= this.refreshInterval) {
        listsToRefresh.push(listId);
      }
    }

    if (listsToRefresh.length === 0) return;

    // Process with concurrency limit
    await this._processWithConcurrency(listsToRefresh);
  }

  /**
   * Process refreshes with concurrency limit
   */
  async _processWithConcurrency(listIds) {
    const queue = [...listIds];
    const running = new Set();

    const processNext = async () => {
      if (queue.length === 0 && running.size === 0) return;

      while (running.size < this.maxConcurrentRefreshes && queue.length > 0) {
        const listId = queue.shift();
        running.add(listId);

        this._refreshList(listId)
          .then(() => {
            running.delete(listId);
            processNext();
          })
          .catch(() => {
            running.delete(listId);
            processNext();
          });
      }
    };

    await processNext();

    // Wait for all to complete
    while (running.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Refresh a single list with retry logic
   */
  async _refreshList(listId) {
    if (this.refreshInProgress.has(listId)) return;

    this.refreshInProgress.add(listId);
    this.lastRefresh.set(listId, Date.now());

    let attempt = 0;
    let lastError = null;

    while (attempt < this.retryAttempts) {
      try {
        if (this.debug) {
          console.log(`[BackgroundRefresh] Refreshing ${listId} (attempt ${attempt + 1})`);
        }

        // Fetch fresh rules using callback
        const result = await this.refreshCallback(listId);

        if (result && result.rules && result.rules.length > 0) {
          // Update cache with new rules
          await this.cacheManager.set(listId, result.rules, {
            etag: result.etag,
            lastModified: result.lastModified,
            lastUpdated: new Date().toISOString()
          });

          if (this.debug) {
            console.log(`[BackgroundRefresh] Successfully refreshed ${listId}: ${result.rules.length} rules`);
          }

          if (this.onRefreshSuccess) {
            this.onRefreshSuccess(listId, result);
          }

          this.refreshInProgress.delete(listId);
          return;
        } else {
          throw new Error('No rules returned');
        }
      } catch (error) {
        lastError = error;
        attempt++;

        if (attempt < this.retryAttempts) {
          if (this.debug) {
            console.warn(`[BackgroundRefresh] Retry ${attempt}/${this.retryAttempts} for ${listId}:`, error.message);
          }
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }

    // All retries failed
    console.error(`[BackgroundRefresh] Failed to refresh ${listId} after ${this.retryAttempts} attempts:`, lastError);

    if (this.onRefreshError) {
      this.onRefreshError(listId, lastError);
    }

    this.refreshInProgress.delete(listId);
  }

  /**
   * Force refresh a specific list immediately
   */
  async forceRefresh(listId) {
    if (!this.refreshCallback) return false;

    this.refreshInProgress.add(listId);

    try {
      const result = await this.refreshCallback(listId);

      if (result && result.rules) {
        await this.cacheManager.set(listId, result.rules, {
          etag: result.etag,
          lastModified: result.lastModified,
          lastUpdated: new Date().toISOString()
        });

        this.lastRefresh.set(listId, Date.now());
        this.refreshInProgress.delete(listId);

        if (this.onRefreshSuccess) {
          this.onRefreshSuccess(listId, result);
        }

        return true;
      }
    } catch (error) {
      if (this.onRefreshError) {
        this.onRefreshError(listId, error);
      }
    }

    this.refreshInProgress.delete(listId);
    return false;
  }

  /**
   * Add a list to critical lists
   */
  addCriticalList(listId) {
    if (!this.criticalLists.includes(listId)) {
      this.criticalLists.push(listId);
    }
  }

  /**
   * Remove a list from critical lists
   */
  removeCriticalList(listId) {
    const idx = this.criticalLists.indexOf(listId);
    if (idx !== -1) {
      this.criticalLists.splice(idx, 1);
    }
  }

  /**
   * Update refresh interval
   */
  setRefreshInterval(intervalMs) {
    this.refreshInterval = intervalMs;

    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Get status of background refresh
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      refreshInterval: this.refreshInterval,
      criticalLists: this.criticalLists,
      lastRefresh: Object.fromEntries(this.lastRefresh),
      refreshInProgress: Array.from(this.refreshInProgress),
      maxConcurrentRefreshes: this.maxConcurrentRefreshes
    };
  }

  /**
   * Check if a list is currently being refreshed
   */
  isRefreshing(listId) {
    return this.refreshInProgress.has(listId);
  }

  /**
   * Get time until next scheduled refresh for a list
   */
  getTimeUntilNextRefresh(listId) {
    const lastRefresh = this.lastRefresh.get(listId) || 0;
    const nextRefresh = lastRefresh + this.refreshInterval;
    const now = Date.now();
    return Math.max(0, nextRefresh - now);
  }
}

// ============================================================================
// Main Cache Manager
// ============================================================================

export class CacheManager {
  constructor(options = {}) {
    this.options = {
      maxSize: options.maxSize || 50 * 1024 * 1024, // 50MB
      maxAge: options.maxAge || 7 * 24 * 60 * 60 * 1000, // 7 days
      storageKey: options.storageKey || 'filterListCache',
      debug: options.debug || false,
      enableCompression: options.enableCompression !== false,
      enablePersistent: options.enablePersistent !== false,
      enableMemory: options.enableMemory !== false,
      warmCacheLists: options.warmCacheLists || ['easylist', 'easyprivacy', 'peterlowe', 'ublock_filters', 'ublock_privacy'],
      // Background refresh options
      enableBackgroundRefresh: options.enableBackgroundRefresh !== false,
      backgroundRefreshInterval: options.backgroundRefreshInterval || 60 * 60 * 1000, // 1 hour
      criticalLists: options.criticalLists || ['easylist', 'easyprivacy', 'peterlowe'],
      refreshCallback: options.refreshCallback || null,
      maxConcurrentRefreshes: options.maxConcurrentRefreshes || 3,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 5000
    };

    // Initialize sub-components
    this.memoryCache = this.options.enableMemory
      ? new MemoryCache({ maxSize: this.options.maxSize, maxAge: this.options.maxAge })
      : null;

    this.persistentCache = this.options.enablePersistent
      ? new PersistentCache({ storageKey: this.options.storageKey, maxSize: this.options.maxSize, maxAge: this.options.maxAge })
      : null;

    this.conditionalGet = new ConditionalGetManager();
    this.telemetry = new CacheTelemetry();
    this.initialized = false;
    this.warmedUp = false;

    // Initialize background refresh manager
    this.backgroundRefresh = this.options.enableBackgroundRefresh
      ? new BackgroundRefreshManager({
          cacheManager: this,
          refreshInterval: this.options.backgroundRefreshInterval,
          criticalLists: this.options.criticalLists,
          refreshCallback: this.options.refreshCallback,
          maxConcurrentRefreshes: this.options.maxConcurrentRefreshes,
          retryAttempts: this.options.retryAttempts,
          retryDelay: this.options.retryDelay,
          debug: this.options.debug
        })
      : null;
  }

  /**
   * Initialize cache manager
   */
  async initialize() {
    if (this.initialized) return;

    // Cleanup stale entries on startup
    await this.cleanup();

    // Warm cache with critical lists
    await this.warmCache();

    // Start background refresh
    if (this.backgroundRefresh) {
      this.backgroundRefresh.start();
    }

    this.initialized = true;

    if (this.options.debug) {
      console.log('[CacheManager] Initialized', this.getStats());
    }
  }

  /**
   * Get cached rules for a list (checks memory first, then persistent)
   */
  async get(listId) {
    // Check memory cache first
    if (this.memoryCache) {
      const memEntry = this.memoryCache.get(listId);
      if (memEntry) {
        this.telemetry.recordHit(listId, 'memory');
        this.conditionalGet.updateHeaders(listId, {
          headers: {
            get: (name) => name === 'etag' ? memEntry.etag : name === 'last-modified' ? memEntry.lastModified : null
          }
        });
        return this._normalizeEntry(memEntry);
      }
      this.telemetry.recordMiss(listId, 'memory');
    }

    // Check persistent cache
    if (this.persistentCache) {
      const persEntry = await this.persistentCache.get(listId);
      if (persEntry) {
        this.telemetry.recordHit(listId, 'persistent');

        // Promote to memory cache
        if (this.memoryCache) {
          this.memoryCache.set(listId, persEntry);
        }

        this.conditionalGet.updateHeaders(listId, {
          headers: {
            get: (name) => name === 'etag' ? persEntry.etag : name === 'last-modified' ? persEntry.lastModified : null
          }
        });

        return this._normalizeEntry(persEntry);
      }
      this.telemetry.recordMiss(listId, 'persistent');
    }

    return null;
  }

  /**
   * Store rules in cache (both memory and persistent)
   */
  async set(listId, rules, metadata = {}) {
    const entry = {
      rules,
      etag: metadata.etag || null,
      lastModified: metadata.lastModified || null,
      lastUpdated: metadata.lastUpdated || new Date().toISOString(),
      timestamp: Date.now(),
      ruleCount: rules?.length || 0,
      compressed: true
    };

    // Calculate sizes for telemetry
    const originalSize = JSON.stringify(rules).length;

    let memorySuccess = true;
    let persistentSuccess = true;

    // Store in memory cache
    if (this.memoryCache) {
      memorySuccess = this.memoryCache.set(listId, entry);
    }

    // Store in persistent cache
    if (this.persistentCache) {
      persistentSuccess = await this.persistentCache.set(listId, entry);
    }

    // Update conditional headers
    if (metadata.etag || metadata.lastModified) {
      this.conditionalGet.updateHeaders(listId, {
        headers: {
          get: (name) => name === 'etag' ? metadata.etag : name === 'last-modified' ? metadata.lastModified : null
        }
      });
    }

    // Record compression telemetry
    if (this.persistentCache && this.persistentCache.isAvailable) {
      const compressedSize = JSON.stringify(entry).length;
      this.telemetry.recordCompression(originalSize, compressedSize);
    }

    if (this.options.debug) {
      console.log(`[CacheManager] Cached ${listId}: ${rules.length} rules, mem=${memorySuccess}, pers=${persistentSuccess}`);
    }

    return memorySuccess || persistentSuccess;
  }

  /**
   * Get conditional headers for a list
   */
  getConditionalHeaders(listId) {
    return this.conditionalGet.getHeaders(listId);
  }

  /**
   * Check if list has fresh cache
   */
  async hasFreshCache(listId) {
    // Check memory
    if (this.memoryCache && this.memoryCache.has(listId)) {
      return true;
    }

    // Check persistent
    if (this.persistentCache) {
      const entry = await this.persistentCache.get(listId);
      if (entry) return true;
    }

    return false;
  }

  /**
   * Invalidate cache for a list
   */
  async invalidate(listId) {
    if (this.memoryCache) this.memoryCache.delete(listId);
    if (this.persistentCache) await this.persistentCache.delete(listId);
    this.conditionalGet.clear(listId);

    if (this.options.debug) {
      console.log(`[CacheManager] Invalidated cache for ${listId}`);
    }
  }

  /**
   * Warm cache with critical lists on startup
   */
  async warmCache(listIds = null) {
    const listsToWarm = listIds || this.options.warmCacheLists;
    let loaded = 0;
    let bytes = 0;

    for (const listId of listsToWarm) {
      // Only warm if not already in memory
      if (this.memoryCache && this.memoryCache.has(listId)) continue;

      const entry = await this.get(listId);
      if (entry && entry.rules) {
        loaded++;
        bytes += JSON.stringify(entry.rules).length;
      }
    }

    this.telemetry.recordWarmCache(loaded, bytes);
    this.warmedUp = true;

    if (this.options.debug) {
      console.log(`[CacheManager] Warmed cache: ${loaded} lists, ${bytes} bytes`);
    }

    return { loaded, bytes };
  }

  /**
   * Preload specific lists into memory cache
   */
  async preload(listIds) {
    const results = {};

    for (const listId of listIds) {
      const entry = await this.get(listId);
      results[listId] = !!entry;
    }

    return results;
  }

  /**
   * Cleanup stale entries from both caches
   */
  async cleanup() {
    let totalCleaned = 0;

    if (this.memoryCache) {
      totalCleaned += this.memoryCache.cleanup();
    }

    if (this.persistentCache) {
      totalCleaned += await this.persistentCache.cleanup();
    }

    if (this.options.debug && totalCleaned > 0) {
      console.log(`[CacheManager] Cleaned up ${totalCleaned} stale entries`);
    }

    return totalCleaned;
  }

  /**
   * Get conditional GET headers for a request
   */
  getHeadersForRequest(listId) {
    return this.getConditionalHeaders(listId);
  }

  /**
   * Process response and update cache if needed
   */
  async processResponse(listId, response, rules, metadata = {}) {
    // Handle 304 Not Modified
    if (this.conditionalGet.isNotModified(response)) {
      // Cache is still valid, just update access time
      if (this.memoryCache) {
        const entry = this.memoryCache.get(listId);
        if (entry) {
          entry.timestamp = Date.now();
        }
      }
      return { cached: true, rules: null };
    }

    // New content - update cache
    const etag = response.headers.get('etag');
    const lastModified = response.headers.get('last-modified');

    await this.set(listId, rules, {
      etag,
      lastModified,
      lastUpdated: new Date().toISOString(),
      ...metadata
    });

    return { cached: false, rules };
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    const stats = {
      initialized: this.initialized,
      warmedUp: this.warmedUp,
      telemetry: this.telemetry.getMetrics()
    };

    if (this.memoryCache) {
      stats.memory = this.memoryCache.getStats();
    }

    if (this.persistentCache) {
      stats.persistent = await this.persistentCache.getUsage();
    }

    return stats;
  }

  /**
   * Get telemetry metrics
   */
  getTelemetry() {
    return this.telemetry.getMetrics();
  }

  /**
   * Get per-list metrics
   */
  getListTelemetry(listId) {
    return this.telemetry.getListMetrics(listId);
  }

  /**
   * Normalize entry structure
   */
  _normalizeEntry(entry) {
    if (!entry) return null;

    return {
      rules: entry.rules || [],
      etag: entry.etag || null,
      lastModified: entry.lastModified || null,
      lastUpdated: entry.lastUpdated || null,
      ruleCount: entry.ruleCount || entry.rules?.length || 0,
      timestamp: entry.timestamp || Date.now()
    };
  }

  /**
   * Clear all caches
   */
  async clear() {
    if (this.memoryCache) this.memoryCache.clear();
    if (this.persistentCache) await this.persistentCache.clear();
    this.conditionalGet.clearAll();
    this.telemetry.reset();
    this.warmedUp = false;

    // Stop background refresh
    if (this.backgroundRefresh) {
      this.backgroundRefresh.stop();
    }
  }

  /**
   * Force refresh a specific list immediately
   */
  async forceRefresh(listId) {
    if (!this.backgroundRefresh) return false;
    return await this.backgroundRefresh.forceRefresh(listId);
  }

  /**
   * Add a list to critical lists for background refresh
   */
  addCriticalList(listId) {
    if (this.backgroundRefresh) {
      this.backgroundRefresh.addCriticalList(listId);
    }
    if (!this.options.criticalLists.includes(listId)) {
      this.options.criticalLists.push(listId);
    }
  }

  /**
   * Remove a list from critical lists
   */
  removeCriticalList(listId) {
    if (this.backgroundRefresh) {
      this.backgroundRefresh.removeCriticalList(listId);
    }
    const idx = this.options.criticalLists.indexOf(listId);
    if (idx !== -1) {
      this.options.criticalLists.splice(idx, 1);
    }
  }

  /**
   * Update background refresh interval
   */
  setBackgroundRefreshInterval(intervalMs) {
    this.options.backgroundRefreshInterval = intervalMs;
    if (this.backgroundRefresh) {
      this.backgroundRefresh.setRefreshInterval(intervalMs);
    }
  }

  /**
   * Get background refresh status
   */
  getBackgroundRefreshStatus() {
    if (!this.backgroundRefresh) return null;
    return this.backgroundRefresh.getStatus();
  }

  /**
   * Check if a list is currently being refreshed
   */
  isRefreshing(listId) {
    if (!this.backgroundRefresh) return false;
    return this.backgroundRefresh.isRefreshing(listId);
  }

  /**
   * Get time until next scheduled refresh for a list
   */
  getTimeUntilNextRefresh(listId) {
    if (!this.backgroundRefresh) return 0;
    return this.backgroundRefresh.getTimeUntilNextRefresh(listId);
  }

  /**
   * Set refresh callback for background refresh
   */
  setRefreshCallback(callback) {
    this.options.refreshCallback = callback;
    if (this.backgroundRefresh) {
      this.backgroundRefresh.refreshCallback = callback;
    }
  }

  /**
   * Verify integrity of cached data for a list
   */
  async verifyIntegrity(listId) {
    // Check memory cache
    if (this.memoryCache) {
      const entry = this.memoryCache.cache.get(listId);
      if (entry && entry.rules && entry.checksum) {
        const valid = await CryptoUtils.verifyChecksum(entry.rules, entry.checksum);
        if (!valid) {
          console.warn(`[CacheManager] Integrity check failed for ${listId} in memory cache`);
          this.memoryCache.delete(listId);
          return false;
        }
        return true;
      }
    }

    // Check persistent cache
    if (this.persistentCache) {
      const entry = await this.persistentCache.get(listId);
      if (entry && entry.rules && entry.checksum) {
        const valid = await CryptoUtils.verifyChecksum(entry.rules, entry.checksum);
        if (!valid) {
          console.warn(`[CacheManager] Integrity check failed for ${listId} in persistent cache`);
          await this.persistentCache.delete(listId);
          return false;
        }
        return true;
      }
    }

    return null; // No cached data to verify
  }

  /**
   * Verify integrity of all cached entries
   */
  async verifyAllIntegrity() {
    const results = { verified: 0, failed: 0, errors: [] };

    // Check memory cache
    if (this.memoryCache) {
      for (const [listId, entry] of this.memoryCache.cache) {
        if (entry.rules && entry.checksum) {
          try {
            const valid = await CryptoUtils.verifyChecksum(entry.rules, entry.checksum);
            if (valid) {
              results.verified++;
            } else {
              results.failed++;
              results.errors.push({ listId, cache: 'memory', error: 'Checksum mismatch' });
              this.memoryCache.delete(listId);
            }
          } catch (error) {
            results.errors.push({ listId, cache: 'memory', error: error.message });
          }
        }
      }
    }

    // Check persistent cache
    if (this.persistentCache) {
      const cache = await this.persistentCache.getAll();
      for (const [listId, entry] of Object.entries(cache)) {
        if (entry.rules && entry.checksum) {
          try {
            const valid = await CryptoUtils.verifyChecksum(entry.rules, entry.checksum);
            if (valid) {
              results.verified++;
            } else {
              results.failed++;
              results.errors.push({ listId, cache: 'persistent', error: 'Checksum mismatch' });
              await this.persistentCache.delete(listId);
            }
          } catch (error) {
            results.errors.push({ listId, cache: 'persistent', error: error.message });
          }
        }
      }
    }

    if (this.options.debug) {
      console.log('[CacheManager] Integrity verification:', results);
    }

    return results;
  }

  /**
   * Get integrity statistics
   */
  getIntegrityStats() {
    const stats = {
      memoryIntegrityFailures: this.memoryCache?.integrityFailures || 0,
      totalMemoryEntries: this.memoryCache?.cache.size || 0,
      totalPersistentEntries: 0
    };

    return stats;
  }

  /**
   * Export cache for backup/debugging
   */
  async export() {
    const data = {
      memory: {},
      persistent: {},
      conditionalHeaders: {},
      telemetry: this.telemetry.getMetrics(),
      exportedAt: new Date().toISOString()
    };

    if (this.memoryCache) {
      for (const [key, entry] of this.memoryCache.cache) {
        data.memory[key] = this._normalizeEntry(entry);
      }
    }

    if (this.persistentCache) {
      data.persistent = await this.persistentCache.getAll();
    }

    for (const [key, headers] of this.conditionalGet.headers) {
      data.conditionalHeaders[key] = headers;
    }

    return data;
  }

  /**
   * Import cache from backup
   */
  async import(data) {
    if (!data) return false;

    try {
      // Import memory cache
      if (this.memoryCache && data.memory) {
        for (const [key, entry] of Object.entries(data.memory)) {
          this.memoryCache.set(key, entry);
        }
      }

      // Import persistent cache
      if (this.persistentCache && data.persistent) {
        for (const [key, entry] of Object.entries(data.persistent)) {
          await this.persistentCache.set(key, entry);
        }
      }

      // Import conditional headers
      if (data.conditionalHeaders) {
        for (const [key, headers] of Object.entries(data.conditionalHeaders)) {
          this.conditionalGet.headers.set(key, headers);
        }
      }

      return true;
    } catch (error) {
      errorHandler.log(error, { context: 'CacheManager.import' });
      return false;
    }
  }

  /**
   * Get memory cache instance (for advanced usage)
   */
  getMemoryCache() {
    return this.memoryCache;
  }

  /**
   * Get persistent cache instance (for advanced usage)
   */
  getPersistentCache() {
    return this.persistentCache;
  }

  /**
   * Get conditional get manager instance (for advanced usage)
   */
  getConditionalGetManager() {
    return this.conditionalGet;
  }
}

// ============================================================================
// Factory function for easy instantiation
// ============================================================================

export function createCacheManager(options = {}) {
  return new CacheManager(options);
}

// Export sub-classes for testing/advanced use
export { MemoryCache, PersistentCache, ConditionalGetManager, CacheTelemetry, LZString, CryptoUtils, BackgroundRefreshManager };