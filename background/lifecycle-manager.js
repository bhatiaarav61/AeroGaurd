/**
 * Lifecycle Manager — Install/Update/Startup/Suspend/Resume/Termination
 * Instant cold-start recovery, state reconciliation, service worker resilience
 */

import { errorKernel, wrapStorage } from './error-kernel.js';
import { storageEngine } from './storage-engine.js';
import { networkStack } from './network-stack.js';

// ============================================================================
// State Management
// ============================================================================

export const LifecycleState = {
  UNINITIALIZED: 'uninitialized',
  INITIALIZING: 'initializing',
  READY: 'ready',
  SUSPENDED: 'suspended',
  TERMINATING: 'terminating',
  ERROR: 'error'
};

export class LifecycleManager {
  constructor(options = {}) {
    this.options = {
      enableColdStartRecovery: options.enableColdStartRecovery !== false,
      enableStateReconciliation: options.enableStateReconciliation !== false,
      maxColdStartTime: options.maxColdStartTime ?? 5000,
      healthCheckInterval: options.healthCheckInterval ?? 60000,
      ...options
    };

    this.state = LifecycleState.UNINITIALIZED;
    this.initializationPromise = null;
    this.startTime = Date.now();
    this.lastActivity = Date.now();
    this.healthCheckTimer = null;
    this.suspendedAt = null;
    this.initializationContext = null;
    this.recoveryData = null;
    this.listeners = new Map(); // event -> callbacks[]
  }

  /**
   * Initialize the extension lifecycle
   */
  async initialize(context = {}) {
    if (this.state === LifecycleState.READY) return { success: true, fromCache: false };

    this.state = LifecycleState.INITIALIZING;
    this.initializationContext = context;
    const initStart = performance.now();

    try {
      // Try cold start recovery
      let fromCache = false;
      if (this.options.enableColdStartRecovery) {
        const recovery = await this._attemptColdStartRecovery();
        if (recovery.success) {
          fromCache = true;
          this.recoveryData = recovery.data;
        }
      }

      // Initialize core services
      await this._initializeServices();

      // Run health checks
      await this._runHealthChecks();

      // Start background tasks
      this._startBackgroundTasks();

      this.state = LifecycleState.READY;
      this._emit('ready', { fromCache, duration: performance.now() - initStart });

      console.log(`[LifecycleManager] Initialized in ${(performance.now() - initStart).toFixed(2)}ms (fromCache: ${fromCache})`);
      return { success: true, fromCache, duration: performance.now() - initStart };
    } catch (error) {
      this.state = LifecycleState.ERROR;
      this._emit('error', { error });
      throw error;
    }
  }

  /**
   * Attempt cold start recovery from persisted state
   */
  async _attemptColdStartRecovery() {
    try {
      const { recoveryData, lastState, timestamp } = await storageEngine.get('lifecycle_recovery', { backend: 'local' });

      if (!recoveryData || !timestamp) {
        return { success: false, reason: 'No recovery data' };
      }

      // Check if recovery data is recent (within 24 hours)
      if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
        return { success: false, reason: 'Recovery data expired' };
      }

      // Validate recovery data integrity
      if (!this._validateRecoveryData(recoveryData)) {
        return { success: false, reason: 'Recovery data corrupted' };
      }

      console.log('[LifecycleManager] Cold start recovery successful');
      return { success: true, data: recoveryData, lastState };
    } catch (error) {
      console.warn('[LifecycleManager] Cold start recovery failed:', error.message);
      return { success: false, reason: error.message };
    }
  }

  _validateRecoveryData(data) {
    return data &&
           typeof data === 'object' &&
           data.filterLists &&
           data.settings &&
           Array.isArray(data.filterLists);
  }

  /**
   * Initialize core services
   */
  async _initializeServices() {
    // Initialize storage
    await storageEngine.initialize();

    // Initialize network stack
    await networkStack.initialize(storageEngine);

    // Load settings
    const { settings } = await storageEngine.get('settings', { backend: 'sync' });
    this.settings = settings || {
      enabled: true,
      filterLists: [],
      youtubeBlocking: 'aggressive',
      customRules: [],
      autoUpdate: true,
      updateInterval: 6,
      debug: false
    };

    // Persist current state for recovery
    await this._persistRecoveryState();
  }

  /**
   * Run health checks
   */
  async _runHealthChecks() {
    const checks = [
      { name: 'storage', fn: () => storageEngine.getUsage() },
      { name: 'network', fn: () => networkStack.getMetrics() },
      { name: 'chrome_api', fn: () => chrome.runtime.getManifest() }
    ];

    const results = await Promise.allSettled(checks.map(c => c.fn()));
    const failed = results.filter((r, i) => r.status === 'rejected').map((r, i) => checks[i].name);

    if (failed.length > 0) {
      console.warn('[LifecycleManager] Health checks failed:', failed);
      this._emit('health_check_failed', { failed });
    }

    return { passed: checks.length - failed.length, failed };
  }

  /**
   * Start background tasks (alarms, periodic updates)
   */
  _startBackgroundTasks() {
    // Health check timer
    this.healthCheckTimer = setInterval(() => {
      this._runHealthChecks().catch(e => console.error('[LifecycleManager] Health check error:', e));
    }, this.options.healthCheckInterval);

    // Schedule filter list updates if enabled
    if (this.settings.autoUpdate) {
      this._scheduleFilterListUpdate();
    }

    // Activity tracker
    this._trackActivity();
  }

  _scheduleFilterListUpdate() {
    chrome.alarms.create('filterListUpdate', {
      periodInMinutes: this.settings.updateInterval * 60
    });
  }

  _trackActivity() {
    // Update last activity on user interaction
    const updateActivity = () => { this.lastActivity = Date.now(); };
    ['click', 'keydown', 'scroll', 'mousemove'].forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });
  }

  /**
   * Persist state for cold start recovery
   */
  async _persistRecoveryState() {
    const recoveryData = {
      filterLists: this.settings.filterLists || [],
      settings: this.settings,
      timestamp: Date.now(),
      version: chrome.runtime.getManifest().version
    };

    await storageEngine.set({
      lifecycle_recovery: {
        recoveryData,
        lastState: this.state,
        timestamp: Date.now()
      }
    }, { backend: 'local' });
  }

  /**
   * Handle service worker suspend
   */
  async suspend() {
    if (this.state === LifecycleState.SUSPENDED) return;

    console.log('[LifecycleManager] Suspending...');
    this.state = LifecycleState.SUSPENDED;
    this.suspendedAt = Date.now();

    // Clear timers
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Persist state
    await this._persistRecoveryState();

    this._emit('suspend', { timestamp: this.suspendedAt });
  }

  /**
   * Handle service worker resume
   */
  async resume() {
    if (this.state === LifecycleState.READY) return;

    console.log('[LifecycleManager] Resuming...');
    const wasSuspended = this.state === LifecycleState.SUSPENDED;
    this.state = LifecycleState.INITIALIZING;

    try {
      // Quick recovery
      if (wasSuspended && this.options.enableStateReconciliation) {
        await this._reconcileState();
      }

      // Re-initialize services
      await this._initializeServices();

      // Restart background tasks
      this._startBackgroundTasks();

      this.state = LifecycleState.READY;
      this._emit('resume', { wasSuspended, suspendedDuration: wasSuspended ? Date.now() - this.suspendedAt : 0 });

      console.log('[LifecycleManager] Resumed');
    } catch (error) {
      this.state = LifecycleState.ERROR;
      this._emit('error', { error, during: 'resume' });
      throw error;
    }
  }

  /**
   * Reconcile state after suspend/resume
   */
  async _reconcileState() {
    // Check for filter list updates missed during suspension
    const { lastUpdateCheck } = await storageEngine.get('lastUpdateCheck', { backend: 'local' });
    const now = Date.now();

    if (!lastUpdateCheck || now - lastUpdateCheck > this.settings.updateInterval * 60 * 60 * 1000) {
      this._emit('reconcile_update_needed', { lastUpdateCheck });
    }

    // Reconcile DNR rules
    this._emit('reconcile_dnr_rules');
  }

  /**
   * Handle extension termination
   */
  async terminate() {
    console.log('[LifecycleManager] Terminating...');
    this.state = LifecycleState.TERMINATING;

    // Clear all timers
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // Clear alarms
    await chrome.alarms.clearAll();

    // Final state persistence
    await this._persistRecoveryState();

    this._emit('terminate', { uptime: Date.now() - this.startTime });
  }

  /**
   * Handle extension update
   */
  async handleUpdate(previousVersion) {
    console.log(`[LifecycleManager] Update detected: ${previousVersion} -> ${chrome.runtime.getManifest().version}`);

    this._emit('update', { previousVersion, currentVersion: chrome.runtime.getManifest().version });

    // Clear old caches
    await storageEngine.clear({ indexedDB: true });

    // Re-initialize
    await this.initialize({ isUpdate: true, previousVersion });
  }

  /**
   * Get current lifecycle status
   */
  getStatus() {
    return {
      state: this.state,
      uptime: Date.now() - this.startTime,
      lastActivity: this.lastActivity,
      suspendedAt: this.suspendedAt,
      settings: this.settings,
      metrics: networkStack.getMetrics(),
      recoveryData: this.recoveryData ? 'available' : 'none'
    };
  }

  /**
   * Force re-initialization
   */
  async reinitialize() {
    await this.terminate();
    this.state = LifecycleState.UNINITIALIZED;
    return this.initialize({ force: true });
  }

  // ========== Event System ==========

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index !== -1) callbacks.splice(index, 1);
  }

  _emit(event, data) {
    if (!this.listeners.has(event)) return;
    for (const callback of this.listeners.get(event)) {
      try {
        callback(data);
      } catch (e) {
        console.error(`[LifecycleManager] Listener error for ${event}:`, e);
      }
    }
  }

  // ========== Chrome Event Handlers ==========

  static setupChromeListeners(lifecycleManager) {
    // Runtime events
    chrome.runtime.onInstalled.addListener(async (details) => {
      if (details.reason === 'install') {
        await lifecycleManager.initialize({ isInstall: true });
        chrome.tabs.create({ url: 'welcome.html' });
      } else if (details.reason === 'update') {
        await lifecycleManager.handleUpdate(details.previousVersion);
      }
    });

    chrome.runtime.onStartup.addListener(async () => {
      await lifecycleManager.initialize({ isStartup: true });
    });

    chrome.runtime.onSuspend.addListener(async () => {
      await lifecycleManager.suspend();
    });

    // Message handler for lifecycle queries
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'GET_LIFECYCLE_STATUS') {
        sendResponse(lifecycleManager.getStatus());
        return true;
      }
      if (msg.type === 'FORCE_REINIT') {
        lifecycleManager.reinitialize().then(r => sendResponse(r)).catch(e => sendResponse({ error: e.message }));
        return true;
      }
    });
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const lifecycleManager = new LifecycleManager({
  enableColdStartRecovery: true,
  enableStateReconciliation: true,
  maxColdStartTime: 5000,
  healthCheckInterval: 60000
});

export default LifecycleManager;