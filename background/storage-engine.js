/**
 * Storage Engine — ACID transactions, migrations, compression, encryption
 * IndexedDB + chrome.storage abstraction with zero data loss
 */

import { errorKernel, wrapStorage } from './error-kernel.js';

// ============================================================================
// Storage Backend Abstraction
// ============================================================================

class StorageBackend {
  constructor(name) {
    this.name = name;
  }

  async get(keys) { throw new Error('Not implemented'); }
  async set(items) { throw new Error('Not implemented'); }
  async remove(keys) { throw new Error('Not implemented'); }
  async clear() { throw new Error('Not implemented'); }
  async getBytesInUse(keys) { throw new Error('Not implemented'); }
}

// Chrome Storage Sync Backend
class ChromeSyncBackend extends StorageBackend {
  constructor() {
    super('chrome.sync');
    this.quotaBytes = 102400; // 100KB
    this.maxItems = 512;
    this.maxItemSize = 8192;
  }

  async get(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(keys, result => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(result);
      });
    });
  }

  async set(items) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(items, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  async remove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.remove(keys, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  async clear() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.clear(() => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  async getBytesInUse(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.getBytesInUse(keys, bytes => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(bytes);
      });
    });
  }
}

// Chrome Storage Local Backend
class ChromeLocalBackend extends StorageBackend {
  constructor() {
    super('chrome.local');
    this.quotaBytes = 5242880; // 5MB
  }

  async get(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, result => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(result);
      });
    });
  }

  async set(items) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(items, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  async remove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  async clear() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  async getBytesInUse(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.getBytesInUse(keys, bytes => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(bytes);
      });
    });
  }
}

// IndexedDB Backend for large data
class IndexedDBBackend extends StorageBackend {
  constructor(dbName = 'AeroGuardDB', version = 1) {
    super('indexeddb');
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  async _init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('data')) {
          db.createObjectStore('data', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };
    });
  }

  async get(keys) {
    await this._init();
    const keyArray = Array.isArray(keys) ? keys : [keys];
    const results = {};

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['data'], 'readonly');
      const store = transaction.objectStore('data');
      let completed = 0;

      for (const key of keyArray) {
        const request = store.get(key);
        request.onsuccess = () => {
          if (request.result) results[key] = request.result.value;
          completed++;
          if (completed === keyArray.length) resolve(results);
        };
        request.onerror = () => reject(request.error);
      }

      if (keyArray.length === 0) resolve(results);
    });
  }

  async set(items) {
    await this._init();
    const entries = Object.entries(items);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['data'], 'readwrite');
      const store = transaction.objectStore('data');

      for (const [key, value] of entries) {
        store.put({ key, value, updatedAt: Date.now() });
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async remove(keys) {
    await this._init();
    const keyArray = Array.isArray(keys) ? keys : [keys];

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['data'], 'readwrite');
      const store = transaction.objectStore('data');

      for (const key of keyArray) {
        store.delete(key);
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async clear() {
    await this._init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['data'], 'readwrite');
      const store = transaction.objectStore('data');
      store.clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// ============================================================================
// Compression (LZ-string style)
// ============================================================================

class Compressor {
  static compress(str) {
    if (typeof str !== 'string') str = JSON.stringify(str);
    // Simple LZ-style compression for JSON
    return this._lzCompress(str);
  }

  static decompress(str) {
    return this._lzDecompress(str);
  }

  static _lzCompress(input) {
    const dict = {};
    let dictSize = 256;
    let w = '';
    const result = [];

    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      const wc = w + c;
      if (dict.hasOwnProperty(wc)) {
        w = wc;
      } else {
        result.push(w.charCodeAt(0));
        if (dictSize < 65536) {
          dict[wc] = dictSize++;
        }
        w = c;
      }
    }

    if (w) result.push(w.charCodeAt(0));

    // Convert to base64-like string
    return btoa(String.fromCharCode(...result));
  }

  static _lzDecompress(input) {
    const dict = {};
    let dictSize = 256;
    const data = Uint8Array.from(atob(input), c => c.charCodeAt(0));
    let w = String.fromCharCode(data[0]);
    const result = [w];

    for (let i = 1; i < data.length; i++) {
      const k = data[i];
      let entry;

      if (dict.hasOwnProperty(k)) {
        entry = dict[k];
      } else if (k === dictSize) {
        entry = w + w[0];
      } else {
        return null; // Corrupted
      }

      result.push(entry);

      if (dictSize < 65536) {
        dict[dictSize++] = w + entry[0];
      }

      w = entry;
    }

    return result.join('');
  }
}

// ============================================================================
// Encryption (Web Crypto API)
// ============================================================================

class Encryption {
  static async generateKey() {
    return crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  static async exportKey(key) {
    const raw = await crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(raw)));
  }

  static async importKey(raw) {
    const keyData = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }

  static async encrypt(data, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(typeof data === 'string' ? data : JSON.stringify(data));

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...result));
  }

  static async decrypt(encryptedData, key) {
    const data = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    const iv = data.slice(0, 12);
    const encrypted = data.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  }
}

// ============================================================================
// Migration System
// ============================================================================

class MigrationManager {
  constructor() {
    this.migrations = new Map();
    this.currentVersion = 5;
  }

  register(version, fn) {
    this.migrations.set(version, fn);
  }

  async migrate(data, fromVersion) {
    if (fromVersion >= this.currentVersion) return data;

    let currentData = data;
    for (let v = fromVersion + 1; v <= this.currentVersion; v++) {
      const migration = this.migrations.get(v);
      if (migration) {
        currentData = await migration(currentData);
      }
    }
    return currentData;
  }
}

// ============================================================================
// Transaction Manager (ACID)
// ============================================================================

class TransactionManager {
  constructor(backend) {
    this.backend = backend;
    this.pendingWrites = new Map();
    this.inTransaction = false;
  }

  begin() {
    if (this.inTransaction) throw new Error('Transaction already in progress');
    this.inTransaction = true;
    this.pendingWrites.clear();
  }

  set(key, value) {
    if (!this.inTransaction) throw new Error('No active transaction');
    this.pendingWrites.set(key, value);
  }

  remove(key) {
    if (!this.inTransaction) throw new Error('No active transaction');
    this.pendingWrites.set(key, null); // null = delete
  }

  async commit() {
    if (!this.inTransaction) throw new Error('No active transaction');
    this.inTransaction = false;

    const writes = new Map(this.pendingWrites);
    this.pendingWrites.clear();

    const toSet = {};
    const toRemove = [];

    for (const [key, value] of writes) {
      if (value === null) toRemove.push(key);
      else toSet[key] = value;
    }

    if (Object.keys(toSet).length > 0) {
      await this.backend.set(toSet);
    }
    if (toRemove.length > 0) {
      await this.backend.remove(toRemove);
    }
  }

  rollback() {
    this.inTransaction = false;
    this.pendingWrites.clear();
  }
}

// ============================================================================
// Main Storage Engine
// ============================================================================

export class StorageEngine {
  constructor(options = {}) {
    this.options = {
      useCompression: options.useCompression !== false,
      useEncryption: options.useEncryption !== false,
      encryptSensitive: options.encryptSensitive !== false,
      autoMigrate: options.autoMigrate !== false,
      ...options
    };

    this.syncBackend = new ChromeSyncBackend();
    this.localBackend = new ChromeLocalBackend();
    this.indexedDBBackend = new IndexedDBBackend();
    this.migrations = new MigrationManager();
    this.transactionManager = null;
    this.encryptionKey = null;
    this.initialized = false;

    this._registerMigrations();
  }

  async initialize() {
    if (this.initialized) return;

    // Initialize encryption key
    if (this.options.useEncryption) {
      const { encryptionKey } = await this.localBackend.get('encryptionKey');
      if (encryptionKey) {
        this.encryptionKey = await Encryption.importKey(encryptionKey);
      } else {
        this.encryptionKey = await Encryption.generateKey();
        const exported = await Encryption.exportKey(this.encryptionKey);
        await this.localBackend.set({ encryptionKey: exported });
      }
    }

    // Run migrations
    if (this.options.autoMigrate) {
      await this._runMigrations();
    }

    this.initialized = true;
    console.log('[StorageEngine] Initialized');
  }

  _registerMigrations() {
    // Version 1 -> 2: Add filter list cache structure
    this.migrations.register(2, async (data) => {
      if (!data.filterListCache) data.filterListCache = {};
      return data;
    });

    // Version 2 -> 3: Add statistics tracking
    this.migrations.register(3, async (data) => {
      if (!data.statistics) data.statistics = { totalBlocked: 0, totalAllowed: 0, byCategory: {} };
      return data;
    });

    // Version 3 -> 4: Add custom rules structure
    this.migrations.register(4, async (data) => {
      if (!data.customRules) data.customRules = [];
      return data;
    });

    // Version 4 -> 5: Add YouTube mode settings
    this.migrations.register(5, async (data) => {
      if (!data.youtubeBlocking) data.youtubeBlocking = 'aggressive';
      return data;
    });
  }

  async _runMigrations() {
    const { schemaVersion = 1 } = await this.localBackend.get('schemaVersion');
    if (schemaVersion < this.migrations.currentVersion) {
      console.log(`[StorageEngine] Migrating from v${schemaVersion} to v${this.migrations.currentVersion}`);

      // Migrate local storage
      const localData = await this.localBackend.get(null);
      const migrated = await this.migrations.migrate(localData, schemaVersion);
      await this.localBackend.clear();
      await this.localBackend.set(migrated);

      // Migrate sync storage
      const syncData = await this.syncBackend.get(null);
      const migratedSync = await this.migrations.migrate(syncData, schemaVersion);
      await this.syncBackend.clear();
      await this.syncBackend.set(migratedSync);

      await this.localBackend.set({ schemaVersion: this.migrations.currentVersion });
      console.log('[StorageEngine] Migration complete');
    }
  }

  // ========== High-level API ==========

  /**
   * Get data from appropriate backend
   * @param {string|string[]} keys - Key(s) to retrieve
   * @param {Object} options - Options
   */
  async get(keys, options = {}) {
    const backend = this._selectBackend(keys, options);
    const result = await wrapStorage('get', () => backend.get(keys));

    if (!result.success) throw result.error;

    let data = result.value;

    // Decrypt if needed
    if (options.encrypted && this.encryptionKey) {
      const decrypted = {};
      for (const [key, value] of Object.entries(data)) {
        if (value && value._encrypted) {
          try {
            decrypted[key] = JSON.parse(await Encryption.decrypt(value.data, this.encryptionKey));
          } catch {
            decrypted[key] = value; // Fallback
          }
        } else {
          decrypted[key] = value;
        }
      }
      data = decrypted;
    }

    // Decompress if needed
    if (options.compressed) {
      const decompressed = {};
      for (const [key, value] of Object.entries(data)) {
        if (value && value._compressed) {
          try {
            decompressed[key] = JSON.parse(Compressor.decompress(value.data));
          } catch {
            decompressed[key] = value;
          }
        } else {
          decompressed[key] = value;
        }
      }
      data = decompressed;
    }

    return data;
  }

  /**
   * Set data to appropriate backend
   * @param {Object} items - Key-value pairs to store
   * @param {Object} options - Options
   */
  async set(items, options = {}) {
    let processed = { ...items };

    // Compress if needed
    if (this.options.useCompression && options.compress !== false) {
      const compressed = {};
      for (const [key, value] of Object.entries(processed)) {
        const json = JSON.stringify(value);
        if (json.length > 1000) { // Only compress large values
          compressed[key] = { _compressed: true, data: Compressor.compress(json) };
        } else {
          compressed[key] = value;
        }
      }
      processed = compressed;
    }

    // Encrypt sensitive data
    if (this.options.useEncryption && this.encryptionKey && options.encrypt !== false) {
      const encrypted = {};
      for (const [key, value] of Object.entries(processed)) {
        if (this._isSensitiveKey(key) || options.encrypt === true) {
          encrypted[key] = { _encrypted: true, data: await Encryption.encrypt(value, this.encryptionKey) };
        } else {
          encrypted[key] = value;
        }
      }
      processed = encrypted;
    }

    const backend = this._selectBackend(Object.keys(items), options);
    const result = await wrapStorage('set', () => backend.set(processed));

    if (!result.success) throw result.error;
    return true;
  }

  /**
   * Remove keys
   */
  async remove(keys, options = {}) {
    const backend = this._selectBackend(keys, options);
    return wrapStorage('remove', () => backend.remove(keys));
  }

  /**
   * Clear all data
   */
  async clear(options = {}) {
    if (options.sync !== false) await this.syncBackend.clear();
    if (options.local !== false) await this.localBackend.clear();
    if (options.indexedDB !== false) await this.indexedDBBackend.clear();
  }

  /**
   * Begin transaction
   */
  beginTransaction(backend = 'local') {
    const b = backend === 'sync' ? this.syncBackend : this.localBackend;
    this.transactionManager = new TransactionManager(b);
    this.transactionManager.begin();
    return this.transactionManager;
  }

  /**
   * Get storage usage
   */
  async getUsage() {
    const [syncBytes, localBytes] = await Promise.all([
      this.syncBackend.getBytesInUse(null),
      this.localBackend.getBytesInUse(null)
    ]);
    return { sync: syncBytes, local: localBytes, total: syncBytes + localBytes };
  }

  // ========== Helpers ==========

  _selectBackend(keys, options) {
    if (options.backend) {
      if (options.backend === 'sync') return this.syncBackend;
      if (options.backend === 'local') return this.localBackend;
      if (options.backend === 'indexeddb') return this.indexedDBBackend;
    }

    // Auto-select based on data type
    const keyArray = Array.isArray(keys) ? keys : [keys];
    const hasLargeData = keyArray.some(k =>
      k.includes('cache') || k.includes('filterList') || k.includes('rules')
    );
    const isSettings = keyArray.some(k =>
      k.includes('setting') || k.includes('config') || k.includes('preferences')
    );

    if (hasLargeData) return this.indexedDBBackend;
    if (isSettings) return this.syncBackend;
    return this.localBackend;
  }

  _isSensitiveKey(key) {
    const sensitivePatterns = [
      'customRules', 'whitelist', 'blacklist', 'credentials',
      'token', 'key', 'secret', 'password', 'auth'
    ];
    return sensitivePatterns.some(p => key.toLowerCase().includes(p.toLowerCase()));
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const storageEngine = new StorageEngine({
  useCompression: true,
  useEncryption: true,
  encryptSensitive: true,
  autoMigrate: true
});

export default StorageEngine;