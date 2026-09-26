/**
 * Lifecycle Manager
 * Manages extension lifecycle (install, update, startup, shutdown)
 */

import storageEngine from './storage-engine.js';

class LifecycleManager {
  constructor() {
    this.initialized = false;
    this.settings = null;
    this.version = null;
  }

  /** Initialize the lifecycle manager with settings */
  async initialize({ settings }) {
    this.settings = settings;
    this.version = chrome.runtime.getManifest().version;
    this.initialized = true;

    // Register alarm for periodic filter list updates
    if (settings.autoUpdate) {
      chrome.alarms.create('filterListUpdate', {
        periodInMinutes: settings.updateInterval * 60
      });
    }

    console.log('[AeroGuard] Lifecycle manager initialized');
  }

  /** Handle extension install */
  async onInstall(details) {
    if (details.reason === 'install') {
      // First install - set defaults
      await storageEngine.set('settings', {
        enabled: true,
        filterLists: [
          'easylist', 'easyprivacy', 'ublock_filters', 'ublock_badware',
          'ublock_privacy', 'ublock_unbreak', 'ublock_resource_abuse',
          'adguard_base', 'adguard_tracking', 'adguard_annoyances',
          'adguard_social', 'adguard_dns', 'fanboy_annoyances',
          'fanboy_social', 'easylist_cookie', 'peterlowe', 'nocoin'
        ],
        youtubeBlocking: 'aggressive',
        customRules: [],
        autoUpdate: true,
        updateInterval: 6,
        debug: false
      }, { backend: 'sync' });

      // Create welcome tab
      chrome.tabs.create({ url: 'welcome.html' });
    } else if (details.reason === 'update') {
      // Version update
      const oldVersion = details.previousVersion;
      console.log(`[AeroGuard] Updated from ${oldVersion} to ${this.version}`);

      // Migrate settings if needed
      await this.migrateSettings(oldVersion);
    }
  }

  /** Handle extension startup */
  async onStartup() {
    if (!this.initialized) {
      const settings = await storageEngine.get('settings', { backend: 'sync' });
      await this.initialize({ settings: settings.settings || {} });
    }
  }

  /** Handle extension shutdown */
  async onShutdown() {
    // Save any pending state
    console.log('[AeroGuard] Shutdown');
  }

  /** Migrate settings from old version */
  async migrateSettings(oldVersion) {
    const currentVersion = chrome.runtime.getManifest().version;

    // Add migration logic here if needed
    console.log(`[AeroGuard] Migrating settings from ${oldVersion} to ${currentVersion}`);
  }

  /** Get current settings */
  getSettings() {
    return this.settings;
  }

  /** Update settings */
  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    await storageEngine.set('settings', this.settings, { backend: 'sync' });
  }

  /** Check if initialized */
  isInitialized() {
    return this.initialized;
  }

  /** Status snapshot for diagnostics */
  getStatus() {
    return {
      initialized: this.initialized,
      version: this.version || chrome.runtime.getManifest().version,
      hasSettings: !!this.settings
    };
  }
}

export const lifecycleManager = new LifecycleManager();