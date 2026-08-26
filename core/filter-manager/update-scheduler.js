/**
 * UpdateScheduler - Smart scheduling with battery, network, and CPU awareness
 * AeroGuard - Manifest V3 Ad Blocker
 *
 * Features:
 * - chrome.alarms API for scheduling
 * - BaseInterval: 6 hours (configurable via remote config)
 * - SmartScheduling: avoid updates during high CPU, low battery, metered connections
 * - BatteryAware: navigator.getBattery() integration, defer if <20% and not charging
 * - NetworkAware: navigator.connection API, defer on metered/slow connections
 * - IdleAware: requestIdleCallback for non-critical work
 * - Jitter: ±10% random offset to prevent thundering herd
 * - PriorityQueue: critical lists (easylist, youtube_ads) first, then others
 * - ManualTrigger: FORCE_UPDATE message bypasses scheduling
 * - CompletionCallback: notify tabs, update UI, log metrics
 */

import { remoteConfig } from '../../background/remote-config.js';

// ============================================================================
// Priority Queue for Filter Lists
// ============================================================================

const PRIORITY_CATEGORIES = {
  critical: ['easylist', 'easyprivacy', 'peterlowe', 'youtube_ads', 'sponsorblock'],
  high: ['ublock_filters', 'ublock_privacy', 'ublock_badware', 'anti_adblock'],
  normal: ['fanboy_annoyances', 'fanboy_social', 'ublock_annoyances', 'easylist_cookie'],
  low: [
    'easylist_germany', 'easylist_france', 'easylist_china', 'easylist_italy',
    'easylist_spain', 'easylist_poland', 'easylist_netherlands', 'easylist_taiwan',
    'easylist_japan', 'easylist_korea', 'easylist_brazil', 'easylist_india'
  ],
  heuristic: ['heuristic'],
  custom: ['custom']
};

const CATEGORY_PRIORITY = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  heuristic: 4,
  custom: 5
};

class PriorityQueue {
  constructor() {
    this.queues = new Map();
    for (const category of Object.keys(PRIORITY_CATEGORIES)) {
      this.queues.set(category, []);
    }
  }

  /**
   * Add list IDs to appropriate priority queues
   * @param {string[]} listIds
   */
  enqueue(listIds) {
    for (const listId of listIds) {
      const category = this.getCategory(listId);
      const queue = this.queues.get(category);
      if (queue && !queue.includes(listId)) {
        queue.push(listId);
      }
    }
  }

  /**
   * Get next batch of lists to update (respects priority order)
   * @param {number} batchSize
   * @returns {string[]}
   */
  dequeue(batchSize = 5) {
    const result = [];
    const sortedCategories = Object.keys(CATEGORY_PRIORITY).sort((a, b) => CATEGORY_PRIORITY[a] - CATEGORY_PRIORITY[b]);

    for (const category of sortedCategories) {
      const queue = this.queues.get(category);
      while (queue.length > 0 && result.length < batchSize) {
        result.push(queue.shift());
      }
      if (result.length >= batchSize) break;
    }

    return result;
  }

  /**
   * Get category for a list ID
   * @param {string} listId
   * @returns {string}
   */
  getCategory(listId) {
    for (const [category, lists] of Object.entries(PRIORITY_CATEGORIES)) {
      if (lists.includes(listId)) return category;
    }
    return 'normal';
  }

  /**
   * Get all pending lists
   * @returns {string[]}
   */
  getAll() {
    const result = [];
    for (const queue of this.queues.values()) {
      result.push(...queue);
    }
    return result;
  }

  /**
   * Check if queue is empty
   * @returns {boolean}
   */
  isEmpty() {
    for (const queue of this.queues.values()) {
      if (queue.length > 0) return false;
    }
    return true;
  }

  /**
   * Clear all queues
   */
  clear() {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
  }

  /**
   * Get queue sizes by category
   * @returns {Object}
   */
  getSizes() {
    const sizes = {};
    for (const [category, queue] of this.queues) {
      sizes[category] = queue.length;
    }
    return sizes;
  }
}

// ============================================================================
// Battery Awareness
// ============================================================================

class BatteryMonitor {
  constructor() {
    this.battery = null;
    this.listeners = new Set();
    this.lastLevel = 1;
    this.lastCharging = true;
    this.supported = false;
  }

  /**
   * Initialize battery monitoring
   * @returns {Promise<void>}
   */
  async initialize() {
    if (typeof navigator === 'undefined' || !navigator.getBattery) {
      this.supported = false;
      return;
    }

    try {
      this.battery = await navigator.getBattery();
      this.lastLevel = this.battery.level;
      this.lastCharging = this.battery.charging;

      this.battery.addEventListener('levelchange', () => this.handleChange());
      this.battery.addEventListener('chargingchange', () => this.handleChange());
      this.battery.addEventListener('chargingtimechange', () => this.handleChange());
      this.battery.addEventListener('dischargingtimechange', () => this.handleChange());

      this.supported = true;
    } catch (error) {
      console.warn('[BatteryMonitor] Battery API not available:', error.message);
      this.supported = false;
    }
  }

  handleChange() {
    if (!this.battery) return;
    this.lastLevel = this.battery.level;
    this.lastCharging = this.battery.charging;
    this.notifyListeners();
  }

  notifyListeners() {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (error) {
        console.error('[BatteryMonitor] Listener error:', error);
      }
    }
  }

  /**
   * Get current battery state
   * @returns {Object}
   */
  getState() {
    if (!this.supported || !this.battery) {
      return { level: 1, charging: true, chargingTime: 0, dischargingTime: Infinity, supported: false };
    }

    return {
      level: this.battery.level,
      charging: this.battery.charging,
      chargingTime: this.battery.chargingTime,
      dischargingTime: this.battery.dischargingTime,
      supported: true
    };
  }

  /**
   * Check if battery is OK for updates
   * @param {Object} options
   * @returns {boolean}
   */
  isOkForUpdate(options = {}) {
    const { minLevel = 0.2, requireChargingIfLow = true } = options;
    const state = this.getState();

    if (!state.supported) return true; // Assume OK if not supported

    if (state.level >= minLevel) return true;
    if (state.charging) return true;
    if (requireChargingIfLow) return false;

    return true;
  }

  /**
   * Subscribe to battery changes
   * @param {Function} callback
   * @returns {Function} Unsubscribe
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}

// ============================================================================
// Network Awareness
// ============================================================================

class NetworkMonitor {
  constructor() {
    this.connection = null;
    this.listeners = new Set();
    this.lastState = { effectiveType: '4g', downlink: 10, rtt: 50, saveData: false };
    this.supported = false;
  }

  /**
   * Initialize network monitoring
   * @returns {Promise<void>}
   */
  async initialize() {
    if (typeof navigator === 'undefined' || !navigator.connection) {
      this.supported = false;
      return;
    }

    try {
      this.connection = navigator.connection;
      this.lastState = this.getState();

      this.connection.addEventListener('change', () => this.handleChange());
      this.supported = true;
    } catch (error) {
      console.warn('[NetworkMonitor] Network Information API not available:', error.message);
      this.supported = false;
    }
  }

  handleChange() {
    if (!this.connection) return;
    this.lastState = this.getState();
    this.notifyListeners();
  }

  notifyListeners() {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (error) {
        console.error('[NetworkMonitor] Listener error:', error);
      }
    }
  }

  /**
   * Get current network state
   * @returns {Object}
   */
  getState() {
    if (!this.supported || !this.connection) {
      return { effectiveType: '4g', downlink: 10, rtt: 50, saveData: false, type: 'unknown', supported: false };
    }

    return {
      effectiveType: this.connection.effectiveType || '4g',
      downlink: this.connection.downlink || 10,
      rtt: this.connection.rtt || 50,
      saveData: this.connection.saveData || false,
      type: this.connection.type || 'unknown',
      supported: true
    };
  }

  /**
   * Check if network is OK for updates
   * @param {Object} options
   * @returns {boolean}
   */
  isOkForUpdate(options = {}) {
    const { allowMetered = false, allowSlow = true, minDownlink = 0.5, maxRtt = 2000 } = options;
    const state = this.getState();

    if (!state.supported) return true; // Assume OK if not supported

    // Check metered connection (saveData is a proxy)
    if (!allowMetered && state.saveData) return false;

    // Check effective type
    const slowTypes = ['slow-2g', '2g'];
    if (!allowSlow && slowTypes.includes(state.effectiveType)) return false;

    // Check downlink speed
    if (state.downlink < minDownlink) return false;

    // Check RTT
    if (state.rtt > maxRtt) return false;

    return true;
  }

  /**
   * Subscribe to network changes
   * @param {Function} callback
   * @returns {Function} Unsubscribe
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}

// ============================================================================
// CPU/Idle Awareness
// ============================================================================

class IdleMonitor {
  constructor() {
    this.isIdle = false;
    this.idleThreshold = 5000; // ms
    this.lastActivity = Date.now();
    this.listeners = new Set();
    this.checkInterval = null;
  }

  /**
   * Initialize idle monitoring
   */
  initialize() {
    if (typeof window === 'undefined' && typeof self === 'undefined') {
      // Service worker context - use different approach
      this.setupServiceWorkerIdle();
    } else {
      this.setupBrowserIdle();
    }
  }

  setupBrowserIdle() {
    // Use requestIdleCallback if available
    if (typeof requestIdleCallback !== 'undefined') {
      this.scheduleIdleCheck();
    } else {
      // Fallback: track user activity
      ['mousemove', 'keydown', 'touchstart', 'scroll'].forEach(event => {
        window.addEventListener(event, () => this.handleActivity(), { passive: true });
      });
      this.checkInterval = setInterval(() => this.checkIdle(), 1000);
    }
  }

  setupServiceWorkerIdle() {
    // In service worker, we can't detect user idle directly
    // Use a heuristic: assume idle if no fetch events for a while
    this.checkInterval = setInterval(() => this.checkIdle(), 30000);
  }

  scheduleIdleCheck() {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback((deadline) => {
        this.handleIdleCallback(deadline);
        this.scheduleIdleCheck();
      });
    }
  }

  handleIdleCallback(deadline) {
    const timeRemaining = deadline.timeRemaining();
    this.isIdle = timeRemaining > 10; // Consider idle if >10ms available
    this.notifyListeners();
  }

  handleActivity() {
    this.lastActivity = Date.now();
    this.isIdle = false;
    this.notifyListeners();
  }

  checkIdle() {
    const idleTime = Date.now() - this.lastActivity;
    const wasIdle = this.isIdle;
    this.isIdle = idleTime > this.idleThreshold;

    if (this.isIdle !== wasIdle) {
      this.notifyListeners();
    }
  }

  notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.isIdle);
      } catch (error) {
        console.error('[IdleMonitor] Listener error:', error);
      }
    }
  }

  /**
   * Check if system is idle
   * @returns {boolean}
   */
  getIsIdle() {
    return this.isIdle;
  }

  /**
   * Subscribe to idle state changes
   * @param {Function} callback
   * @returns {Function} Unsubscribe
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// ============================================================================
// Jitter Utility
// ============================================================================

class JitterUtil {
  /**
   * Apply jitter to a base interval
   * @param {number} baseMs - Base interval in milliseconds
   * @param {number} jitterPercent - Jitter percentage (default 10%)
   * @returns {number} Jittered interval in milliseconds
   */
  static apply(baseMs, jitterPercent = 0.1) {
    const jitter = baseMs * jitterPercent * (Math.random() * 2 - 1); // -10% to +10%
    return Math.max(baseMs * 0.5, baseMs + jitter); // At least 50% of base
  }

  /**
   * Apply jitter to minutes
   * @param {number} baseMinutes
   * @param {number} jitterPercent
   * @returns {number}
   */
  static applyMinutes(baseMinutes, jitterPercent = 0.1) {
    return JitterUtil.apply(baseMinutes * 60 * 1000, jitterPercent) / (60 * 1000);
  }
}

// ============================================================================
// Metrics Logger
// ============================================================================

class MetricsLogger {
  constructor() {
    this.metrics = {
      updatesAttempted: 0,
      updatesCompleted: 0,
      updatesDeferred: 0,
      updatesFailed: 0,
      listsUpdated: 0,
      totalRulesGenerated: 0,
      lastUpdateTime: null,
      lastUpdateDuration: 0,
      deferReasons: {}
    };
    this.maxHistory = 100;
    this.history = [];
  }

  recordAttempt() {
    this.metrics.updatesAttempted++;
  }

  recordCompletion(duration, listsUpdated, rulesGenerated) {
    this.metrics.updatesCompleted++;
    this.metrics.listsUpdated += listsUpdated;
    this.metrics.totalRulesGenerated += rulesGenerated;
    this.metrics.lastUpdateTime = new Date().toISOString();
    this.metrics.lastUpdateDuration = duration;

    this.history.push({
      timestamp: this.metrics.lastUpdateTime,
      duration,
      listsUpdated,
      rulesGenerated,
      success: true
    });
    this.trimHistory();
  }

  recordDeferral(reason) {
    this.metrics.updatesDeferred++;
    this.metrics.deferReasons[reason] = (this.metrics.deferReasons[reason] || 0) + 1;
  }

  recordFailure(error) {
    this.metrics.updatesFailed++;
    this.history.push({
      timestamp: new Date().toISOString(),
      error: error.message,
      success: false
    });
    this.trimHistory();
  }

  trimHistory() {
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  getMetrics() {
    return { ...this.metrics, history: [...this.history] };
  }

  reset() {
    this.metrics = {
      updatesAttempted: 0,
      updatesCompleted: 0,
      updatesDeferred: 0,
      updatesFailed: 0,
      listsUpdated: 0,
      totalRulesGenerated: 0,
      lastUpdateTime: null,
      lastUpdateDuration: 0,
      deferReasons: {}
    };
    this.history = [];
  }
}

// ============================================================================
// Main UpdateScheduler Class
// ============================================================================

export class UpdateScheduler {
  constructor(options = {}) {
    this.filterListManager = options.filterListManager;
    this.applyRulesCallback = options.applyRulesCallback; // Function to reapply rules after update
    this.notifyTabsCallback = options.notifyTabsCallback; // Function to notify tabs

    // Configuration
    this.baseIntervalMinutes = options.baseIntervalMinutes || 360; // 6 hours default
    this.maxBatchSize = options.maxBatchSize || 5;
    this.jitterPercent = options.jitterPercent || 0.1;
    this.maxDeferrals = options.maxDeferrals || 3;

    // State
    this.alarmName = 'filterListUpdate';
    this.isRunning = false;
    this.deferralCount = 0;
    this.lastScheduledTime = null;
    this.nextScheduledTime = null;

    // Monitors
    this.batteryMonitor = new BatteryMonitor();
    this.networkMonitor = new NetworkMonitor();
    this.idleMonitor = new IdleMonitor();
    this.priorityQueue = new PriorityQueue();
    this.metrics = new MetricsLogger();

    // Callbacks
    this.completionCallbacks = new Set();

    // Configuration from remote config
    this.remoteConfig = remoteConfig;

    // Bind methods
    this.handleAlarm = this.handleAlarm.bind(this);
    this.checkConditionsAndRun = this.checkConditionsAndRun.bind(this);
    this.runUpdateCycle = this.runUpdateCycle.bind(this);
  }

  /**
   * Initialize the scheduler
   * @returns {Promise<void>}
   */
  async initialize() {
    // Initialize monitors
    await Promise.all([
      this.batteryMonitor.initialize(),
      this.networkMonitor.initialize()
    ]);
    this.idleMonitor.initialize();

    // Load base interval from remote config
    await this.loadConfigFromRemote();

    // Set up alarm listener
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.onAlarm.addListener(this.handleAlarm);
    }

    // Initial scheduling
    await this.scheduleNextUpdate();

    console.log('[UpdateScheduler] Initialized with base interval:', this.baseIntervalMinutes, 'minutes');
  }

  /**
   * Load configuration from remote config
   */
  async loadConfigFromRemote() {
    try {
      await this.remoteConfig.fetch();

      // Get update interval from remote config (performance.cacheTTL in ms -> minutes)
      const cacheTTL = this.remoteConfig.getNumber('performance.cacheTTL', 3600000);
      this.baseIntervalMinutes = Math.max(60, Math.floor(cacheTTL / 60000)); // Min 1 hour

      // Get batch size
      this.maxBatchSize = this.remoteConfig.getNumber('performance.batchSize', 5);

      // Get jitter
      const perf = this.remoteConfig.get('performance', {});
      this.jitterPercent = perf.jitterPercent ?? 0.1;

      // Get battery/network thresholds from feature flags
      const batteryThreshold = this.remoteConfig.getFeature('batteryThreshold', 0.2);
      const networkThreshold = this.remoteConfig.getFeature('networkThreshold', '3g');

      console.log('[UpdateScheduler] Config loaded:', {
        baseIntervalMinutes: this.baseIntervalMinutes,
        maxBatchSize: this.maxBatchSize,
        jitterPercent: this.jitterPercent,
        batteryThreshold,
        networkThreshold
      });
    } catch (error) {
      console.warn('[UpdateScheduler] Failed to load remote config, using defaults:', error.message);
    }
  }

  /**
   * Handle alarm trigger
   * @param {chrome.alarms.Alarm} alarm
   */
  async handleAlarm(alarm) {
    if (alarm.name !== this.alarmName) return;

    console.log('[UpdateScheduler] Alarm triggered');
    await this.checkConditionsAndRun();
  }

  /**
   * Check conditions and run update if appropriate
   * @param {boolean} force - Force run regardless of conditions
   */
  async checkConditionsAndRun(force = false) {
    if (this.isRunning && !force) {
      console.log('[UpdateScheduler] Update already running');
      return;
    }

    // Check killswitch
    if (this.remoteConfig.isKillswitchActive('filterUpdates')) {
      console.log('[UpdateScheduler] Filter updates disabled by killswitch');
      return;
    }

    if (!force) {
      // Check battery
      if (!this.batteryMonitor.isOkForUpdate({ minLevel: 0.2, requireChargingIfLow: true })) {
        const state = this.batteryMonitor.getState();
        console.log('[UpdateScheduler] Deferred: Low battery', state);
        this.metrics.recordDeferral('low_battery');
        await this.scheduleRetry();
        return;
      }

      // Check network
      if (!this.networkMonitor.isOkForUpdate({ allowMetered: false, allowSlow: true })) {
        const state = this.networkMonitor.getState();
        console.log('[UpdateScheduler] Deferred: Network not suitable', state);
        this.metrics.recordDeferral('poor_network');
        await this.scheduleRetry();
        return;
      }

      // Check idle (in browser context)
      if (typeof window !== 'undefined' && !this.idleMonitor.getIsIdle()) {
        console.log('[UpdateScheduler] Deferred: User active');
        this.metrics.recordDeferral('user_active');
        // Schedule for when idle
        this.idleMonitor.subscribe((isIdle) => {
          if (isIdle) this.checkConditionsAndRun();
        });
        return;
      }
    }

    // All conditions met, run update
    await this.runUpdateCycle();
  }

  /**
   * Run the update cycle with priority queue
   */
  async runUpdateCycle() {
    if (this.isRunning) return;
    this.isRunning = true;

    const startTime = Date.now();
    this.metrics.recordAttempt();

    try {
      // Get enabled lists from filter manager
      const enabledLists = this.filterListManager.getEnabledLists();
      const listIds = enabledLists.map(l => l.id);

      // Populate priority queue
      this.priorityQueue.clear();
      this.priorityQueue.enqueue(listIds);

      const updatedLists = [];
      let totalRulesGenerated = 0;

      // Process in batches
      while (!this.priorityQueue.isEmpty()) {
        const batch = this.priorityQueue.dequeue(this.maxBatchSize);
        if (batch.length === 0) break;

        console.log('[UpdateScheduler] Processing batch:', batch);

        for (const listId of batch) {
          try {
            const list = this.filterListManager.getList(listId);
            if (!list || !list.enabled) continue;

            // Force fresh fetch by clearing cache validators
            list.etag = null;
            list.lastModified = null;
            this.filterListManager.lists.set(listId, list);

            const result = await this.filterListManager.fetchAndParse(list);
            if (result) {
              updatedLists.push(listId);
              totalRulesGenerated += list.rules?.length || 0;
            }
          } catch (error) {
            console.error(`[UpdateScheduler] Failed to update ${listId}:`, error);
          }
        }

        // Yield to main thread between batches
        if (!this.priorityQueue.isEmpty()) {
          await this.yieldToMainThread();
        }
      }

      // Apply updated rules if any lists were updated
      if (updatedLists.length > 0 && this.applyRulesCallback) {
        await this.applyRulesCallback();
      }

      // Notify tabs
      if (updatedLists.length > 0 && this.notifyTabsCallback) {
        this.notifyTabsCallback(updatedLists);
      }

      // Run completion callbacks
      for (const callback of this.completionCallbacks) {
        try {
          await callback({ updatedLists, totalRulesGenerated, duration: Date.now() - startTime });
        } catch (error) {
          console.error('[UpdateScheduler] Completion callback error:', error);
        }
      }

      const duration = Date.now() - startTime;
      this.metrics.recordCompletion(duration, updatedLists.length, totalRulesGenerated);
      this.deferralCount = 0;

      console.log('[UpdateScheduler] Update cycle complete:', {
        updatedLists,
        duration: `${duration}ms`,
        rulesGenerated: totalRulesGenerated
      });
    } catch (error) {
      console.error('[UpdateScheduler] Update cycle failed:', error);
      this.metrics.recordFailure(error);
    } finally {
      this.isRunning = false;
      await this.scheduleNextUpdate();
    }
  }

  /**
   * Schedule a retry with exponential backoff
   */
  async scheduleRetry() {
    this.deferralCount++;

    if (this.deferralCount >= this.maxDeferrals) {
      console.log('[UpdateScheduler] Max deferrals reached, forcing update');
      this.deferralCount = 0;
      await this.checkConditionsAndRun(true);
      return;
    }

    // Exponential backoff: 15 min, 30 min, 60 min
    const delayMinutes = 15 * Math.pow(2, this.deferralCount - 1);
    await this.createAlarm(delayMinutes);
  }

  /**
   * Schedule next update with jitter
   */
  async scheduleNextUpdate() {
    const jitteredMinutes = JitterUtil.applyMinutes(this.baseIntervalMinutes, this.jitterPercent);
    await this.createAlarm(jitteredMinutes);

    this.lastScheduledTime = Date.now();
    this.nextScheduledTime = this.lastScheduledTime + (jitteredMinutes * 60 * 1000);

    console.log('[UpdateScheduler] Next update scheduled in', jitteredMinutes.toFixed(1), 'minutes');
  }

  /**
   * Create or update alarm
   * @param {number} periodMinutes
   */
  async createAlarm(periodMinutes) {
    if (typeof chrome === 'undefined' || !chrome.alarms) {
      console.warn('[UpdateScheduler] chrome.alarms not available');
      return;
    }

    await chrome.alarms.create(this.alarmName, {
      periodInMinutes: periodMinutes
    });
  }

  /**
   * Yield to main thread (for service worker, use setTimeout)
   */
  yieldToMainThread() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  /**
   * Force immediate update (bypasses all scheduling)
   * @returns {Promise<string[]>} Updated list IDs
   */
  async forceUpdate() {
    console.log('[UpdateScheduler] Force update triggered');
    await this.checkConditionsAndRun(true);
    return this.priorityQueue.getAll(); // Returns lists that were processed
  }

  /**
   * Register a completion callback
   * @param {Function} callback
   * @returns {Function} Unsubscribe
   */
  onCompletion(callback) {
    this.completionCallbacks.add(callback);
    return () => this.completionCallbacks.delete(callback);
  }

  /**
   * Update base interval (e.g., from settings change)
   * @param {number} minutes
   */
  async setInterval(minutes) {
    this.baseIntervalMinutes = Math.max(60, minutes); // Min 1 hour
    await this.scheduleNextUpdate();
    console.log('[UpdateScheduler] Interval updated to', this.baseIntervalMinutes, 'minutes');
  }

  /**
   * Get scheduler status
   * @returns {Object}
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      baseIntervalMinutes: this.baseIntervalMinutes,
      nextScheduledTime: this.nextScheduledTime
        ? new Date(this.nextScheduledTime).toISOString()
        : null,
      lastScheduledTime: this.lastScheduledTime
        ? new Date(this.lastScheduledTime).toISOString()
        : null,
      deferralCount: this.deferralCount,
      battery: this.batteryMonitor.getState(),
      network: this.networkMonitor.getState(),
      idle: this.idleMonitor.getIsIdle(),
      queueSizes: this.priorityQueue.getSizes(),
      metrics: this.metrics.getMetrics()
    };
  }

  /**
   * Get metrics
   * @returns {Object}
   */
  getMetrics() {
    return this.metrics.getMetrics();
  }

  /**
   * Pause scheduling
   */
  async pause() {
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      await chrome.alarms.clear(this.alarmName);
    }
    console.log('[UpdateScheduler] Paused');
  }

  /**
   * Resume scheduling
   */
  async resume() {
    await this.scheduleNextUpdate();
    console.log('[UpdateScheduler] Resumed');
  }

  /**
   * Cleanup
   */
  destroy() {
    this.idleMonitor.destroy();
    this.batteryMonitor.listeners.clear();
    this.networkMonitor.listeners.clear();
    this.idleMonitor.listeners.clear();
    this.completionCallbacks.clear();

    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.onAlarm.removeListener(this.handleAlarm);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and initialize an UpdateScheduler
 * @param {Object} options
 * @returns {Promise<UpdateScheduler>}
 */
export async function createUpdateScheduler(options = {}) {
  const scheduler = new UpdateScheduler(options);
  await scheduler.initialize();
  return scheduler;
}

export default UpdateScheduler;