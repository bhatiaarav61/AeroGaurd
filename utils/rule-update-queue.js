/**
 * RuleUpdateQueue - Thread-safe queue for chrome.declarativeNetRequest operations.
 * Ensures atomic, sequential updates to prevent ID collisions and race conditions.
 */
export class RuleUpdateQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.maxDynamicRules = 30000; // Chrome MV3 limit
    this.idRanges = new Map(); // Tracks ID ranges per module
    this.currentIds = new Map(); // Tracks next available ID per module
  }

  /**
   * Register a module's ID range to prevent collisions
   */
  registerModuleRange(moduleName, startId, endId) {
    if (this.idRanges.has(moduleName)) {
      throw new Error(`Module ${moduleName} already registered`);
    }
    this.idRanges.set(moduleName, { start: startId, end: endId, nextId: startId });
  }

  /**
   * Get next available ID in a module's range
   */
  async getNextId(moduleName) {
    const range = this.idRanges.get(moduleName);
    if (!range) throw new Error(`Module ${moduleName} not registered`);

    // Get current used IDs in this range
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const usedIds = new Set(
      existingRules
        .filter(r => r.id >= range.start && r.id <= range.end)
        .map(r => r.id)
    );

    // Find next available ID
    for (let id = range.nextId; id <= range.end; id++) {
      if (!usedIds.has(id)) {
        range.nextId = id + 1;
        return id;
      }
    }
    throw new Error(`Module ${moduleName} exhausted ID range (${range.start}-${range.end})`);
  }

  /**
   * Execute a DNR operation with automatic retry and concurrency control
   */
  async enqueue(operation, { retries = 3, baseDelay = 100 } = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({ operation, retries, baseDelay, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const { operation, retries, baseDelay, resolve, reject } = this.queue.shift();

      try {
        const result = await operation();
        resolve(result);
      } catch (error) {
        if (retries > 0 && this.isRetryableError(error)) {
          // Exponential backoff with jitter
          const delay = baseDelay * Math.pow(2, 3 - retries) + Math.random() * 100;
          await new Promise(r => setTimeout(r, delay));
          this.queue.unshift({ operation, retries: retries - 1, baseDelay, resolve, reject });
        } else {
          reject(error);
        }
      }
    }

    this.processing = false;
  }

  isRetryableError(error) {
    // Retry on transient errors
    return error.message.includes('quota') ||
           error.message.includes('temporarily') ||
           error.message.includes('network') ||
           error.message.includes('timeout');
  }

  /**
   * Atomic batch update with collision avoidance
   */
  async atomicUpdate(addRules = [], removeRuleIds = [], maxRetries = 3) {
    return this.enqueue(async () => {
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const existingIds = new Set(existingRules.map(r => r.id));

      // Check for ID collisions before adding
      const newIds = new Set(addRules.map(r => r.id));
      const collisions = [...newIds].filter(id => existingIds.has(id));

      if (collisions.length > 0) {
        throw new Error(`ID collision detected: ${collisions.join(', ')}`);
      }

      // Check quota
      const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
      if (currentRules.length + addRules.length > 30000) {
        throw new Error('Dynamic rule quota exceeded (30,000 limit)');
      }

      // Atomic operation: remove + add in single call
      return chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds,
        addRules
      });
    }, { retries: maxRetries });
  }
}

// Singleton instance
export const ruleUpdateQueue = new RuleUpdateQueue();

// Pre-register standard module ranges
ruleUpdateQueue.idRanges.set('filterManager', { start: 100000, end: 8999999, nextId: 100000 });
ruleUpdateQueue.idRanges.set('httpsUpgrade', { start: 9000000, end: 9999999, nextId: 9000000 });
ruleUpdateQueue.idRanges.set('customRules', { start: 1000000, end: 1999999, nextId: 1000000 });
ruleUpdateQueue.idRanges.set('sessionRules', { start: 20000000, end: 20999999, nextId: 20000000 });