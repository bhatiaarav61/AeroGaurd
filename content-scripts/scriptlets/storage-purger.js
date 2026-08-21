/**
 * Storage State Sanitizer
 * Freezes and clears anti-adblock flags in localStorage/sessionStorage
 * Prevents paywall enforcement and anti-adblock persistence across reloads
 * Runs in MAIN world at document_start
 */
(function () {
  'use strict';

  // ============================================
  // Configuration
  // ============================================

  // Blacklisted key patterns (case-insensitive substring matching)
  const BLACKLISTED_KEY_PATTERNS = [
    // Anti-adblock detection
    'adblock',
    'ab_detected',
    'adblocker',
    'ad_block',
    'adblock_detected',
    'adblock_detected_once',
    'is_adblocked',
    'has_adblock',
    'adblock_status',
    'adblock_warning',
    'disable_adblock',
    'please_disable',
    'adblock_message',

    // Paywall tracking
    'paywall',
    'article_count',
    'articles_read',
    'articles_remaining',
    'free_articles',
    'free_articles_left',
    'metered_count',
    'metered_limit',
    'subscription_required',
    'premium_required',
    'article_limit',
    'reading_limit',
    'content_limit',
    'paywall_state',
    'paywall_viewed',
    'paywall_dismissed',

    // Reading history tracking
    'reading_history',
    'read_articles',
    'viewed_articles',
    'visited_articles',
    'article_history',
    'post_history',
    'content_history',
    'visit_count',
    'page_views',
    'session_count',

    // First-party tracking cookies in storage
    'fc_state',
    'fc_consent',
    'fc_settings',
    'funding_choices',
    'google_adsense_settings',
    'google_pub_config',
    'goog_pub_config',
    'adsbygoogle_status',
    'amp_ad_blocked',

    // Anti-adblock libraries
    'blockadblock',
    'fuckadblock',
    'adblock_detector',
    'admiral',
    'piano',
    'tpv',
    'tinypass',
    'poool',
    'metered_paywall',
    'soft_paywall',
    'hard_paywall',

    // User tracking for paywalls
    'user_id',
    'visitor_id',
    'client_id',
    'device_id',
    'browser_id',
    'fingerprint',
    'fpjs',
    'fingerprintjs',

    // Newsletter/modal suppression
    'newsletter_shown',
    'popup_shown',
    'modal_shown',
    'welcome_shown',
    'exit_intent_shown',
    'signup_prompt_shown',
    'subscribe_prompt_shown',

    // A/B testing for paywalls
    'experiment',
    'variant',
    'ab_test',
    'paywall_variant',
    'meter_variant',

    // Local storage keys used by specific paywall providers
    'poool_access',
    'poool_user',
    'piano_id',
    'piano_visitor',
    'tpv_id',
    'tpv_session',
    'admiral_user',
    'admiral_session',
    'sailthru_visitor',
    'sailthru_session',

    // Consent management
    'cmp_consent',
    'euconsent',
    'iab_tcf',
    'gdpr_consent',
    'ccpa_consent',
    'consent_string',
    'consent_data'
  ];

  // Whitelisted key patterns that should NEVER be removed
  const WHITELISTED_KEY_PATTERNS = [
    // Authentication tokens
    'token',
    'access_token',
    'refresh_token',
    'id_token',
    'auth_token',
    'csrf_token',
    'xsrf_token',
    'session_id',
    'sessionid',
    'phpsessid',
    'jsessionid',
    'asp.net_sessionid',

    // User preferences
    'theme',
    'language',
    'locale',
    'preferences',
    'settings',
    'user_prefs',
    'ui_state',
    'dark_mode',
    'font_size',
    'display_mode',

    // Shopping cart
    'cart',
    'basket',
    'checkout',
    'order',
    'wishlist',

    // Form data
    'form_data',
    'draft',
    'autosave',
    'unsaved',

    // Legitimate app state
    'app_state',
    'redux_state',
    'vuex_state',
    'pinia_state',
    'mobx_state',
    'recoil_state',

    // Editor/IDE state
    'editor_content',
    'code',
    'snippet',
    'workspace',

    // Game progress
    'save_game',
    'game_progress',
    'high_score',
    'level',

    // Video/audio position
    'playback_position',
    'video_position',
    'audio_position',
    'current_time',
    'volume',

    // Accessibility
    'a11y',
    'accessibility',
    'screen_reader',
    'high_contrast',
    'reduced_motion'
  ];

  // ============================================
  // Core Logic
  // ============================================

  let sanitizedCount = 0;
  let blockedWrites = 0;
  let lastSanitization = 0;

  function matchesPattern(key, patterns) {
    if (!key) return false;
    const keyLower = String(key).toLowerCase();
    return patterns.some(pattern => keyLower.includes(pattern.toLowerCase()));
  }

  function isWhitelisted(key) {
    return matchesPattern(key, WHITELISTED_KEY_PATTERNS);
  }

  function isBlacklisted(key) {
    return matchesPattern(key, BLACKLISTED_KEY_PATTERNS);
  }

  function sanitizeStorage(storageInstance, storageName) {
    if (!storageInstance) return 0;
    let cleaned = 0;

    try {
      // Iterate backwards to safely remove items
      for (let i = storageInstance.length - 1; i >= 0; i--) {
        const key = storageInstance.key(i);
        if (!key) continue;

        if (isWhitelisted(key)) {
          continue; // Skip whitelisted keys
        }

        if (isBlacklisted(key)) {
          try {
            const value = storageInstance.getItem(key);
            storageInstance.removeItem(key);
            cleaned++;
            sanitizedCount++;
            console.log(`[AeroGuard] Removed ${storageName} key: ${key} = ${String(value).substring(0, 100)}`);
          } catch (e) {
            // Cross-origin or other error
            console.debug(`[AeroGuard] Could not remove ${storageName} key: ${key}`, e);
          }
        }
      }
    } catch (e) {
      console.warn(`[AeroGuard] Error sanitizing ${storageName}:`, e);
    }

    return cleaned;
  }

  function sanitizeAllStorage() {
    let totalCleaned = 0;

    // Standard storages
    totalCleaned += sanitizeStorage(window.localStorage, 'localStorage');
    totalCleaned += sanitizeStorage(window.sessionStorage, 'sessionStorage');

    // IndexedDB (attempt to clear known anti-adblock databases)
    if (window.indexedDB) {
      try {
        // We can't enumerate databases without permission, but we can try to delete known ones
        const knownAntiAdblockDBs = [
          'adblock', 'adBlock', 'AdBlock',
          'paywall', 'Paywall',
          'admiral', 'Admiral',
          'piano', 'Piano',
          'tpv', 'TPV',
          'fingerprint', 'Fingerprint',
          'blockadblock', 'BlockAdBlock',
          'fuckadblock', 'FuckAdBlock'
        ];

        knownAntiAdblockDBs.forEach(dbName => {
          try {
            const request = indexedDB.deleteDatabase(dbName);
            request.onsuccess = () => {
              console.log(`[AeroGuard] Deleted IndexedDB: ${dbName}`);
              totalCleaned++;
              sanitizedCount++;
            };
            request.onerror = () => {
              // Ignore errors (database might not exist)
            };
          } catch (e) {
            // Ignore
          }
        });
      } catch (e) {
        // Ignore IndexedDB errors
      }
    }

    lastSanitization = Date.now();
    return totalCleaned;
  }

  // ============================================
  // Intercept setItem
  // ============================================

  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;
  const nativeClear = Storage.prototype.clear;

  Storage.prototype.setItem = function (key, value) {
    if (key && isBlacklisted(key) && !isWhitelisted(key)) {
      blockedWrites++;
      console.warn(`[AeroGuard] Prevented writing anti-adblock flag: ${key} = ${String(value).substring(0, 100)}`);
      return; // Silently ignore
    }
    return nativeSetItem.apply(this, arguments);
  };

  Storage.prototype.removeItem = function (key) {
    // Allow removal of blacklisted keys
    if (key && isBlacklisted(key) && !isWhitelisted(key)) {
      console.log(`[AeroGuard] Allowed removal of blacklisted key: ${key}`);
    }
    return nativeRemoveItem.apply(this, arguments);
  };

  Storage.prototype.clear = function () {
    // We don't block clear() as it might be legitimate
    // But we could log it
    console.debug('[AeroGuard] Storage.clear() called');
    return nativeClear.apply(this, arguments);
  };

  // ============================================
  // Intercept IndexedDB
  // ============================================

  if (window.indexedDB) {
    const nativeOpenDB = window.indexedDB.open;
    const nativeDeleteDB = window.indexedDB.deleteDatabase;

    window.indexedDB.open = function (name, version) {
      if (typeof name === 'string' && isBlacklisted(name) && !isWhitelisted(name)) {
        console.warn(`[AeroGuard] Blocked IndexedDB open: ${name}`);
        // Return a request that fails
        const request = {
          result: null,
          error: new DOMException('Blocked by AeroGuard', 'SecurityError'),
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
          onblocked: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
          readyState: 'done'
        };
        // Trigger error asynchronously
        setTimeout(() => {
          if (request.onerror) request.onerror({ target: request });
        }, 0);
        return request;
      }
      return nativeOpenDB.apply(this, arguments);
    };

    window.indexedDB.deleteDatabase = function (name) {
      if (typeof name === 'string' && isBlacklisted(name) && !isWhitelisted(name)) {
        console.log(`[AeroGuard] Allowed deletion of blacklisted IndexedDB: ${name}`);
      }
      return nativeDeleteDB.apply(this, arguments);
    };
  }

  // ============================================
  // Cookie Protection (for cookies that mimic storage)
  // ============================================

  // Monitor cookie changes for anti-adblock patterns
  const cookieBlacklist = [
    'adblock',
    'ab_detected',
    'paywall',
    'article_count',
    'free_articles',
    'metered',
    'fc_state',
    'blockadblock',
    'admiral',
    'piano',
    'tpv'
  ];

  function isCookieBlacklisted(name) {
    return cookieBlacklist.some(pattern => name.toLowerCase().includes(pattern));
  }

  // Hook document.cookie setter
  const nativeCookieSetter = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')?.set;
  const nativeCookieGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')?.get;

  if (nativeCookieSetter) {
    Object.defineProperty(Document.prototype, 'cookie', {
      configurable: true,
      enumerable: true,
      get: nativeCookieGetter,
      set: function (cookieString) {
        if (cookieString && typeof cookieString === 'string') {
          // Parse cookie name
          const eqIndex = cookieString.indexOf('=');
          if (eqIndex > 0) {
            const name = cookieString.substring(0, eqIndex).trim();
            if (isCookieBlacklisted(name)) {
              console.warn(`[AeroGuard] Blocked cookie set: ${name}`);
              return; // Silently ignore
            }
          }
        }
        return nativeCookieSetter.call(this, cookieString);
      }
    });
  }

  // ============================================
  // MutationObserver for Storage Events
  // ============================================

  let storageObserver = null;

  function initStorageObserver() {
    // Listen for storage events from other tabs
    window.addEventListener('storage', (event) => {
      if (event.key && isBlacklisted(event.key) && !isWhitelisted(event.key)) {
        console.log(`[AeroGuard] Detected anti-adblock storage from another tab: ${event.key}`);
        // Re-sanitize
        setTimeout(sanitizeAllStorage, 100);
      }
    });
  }

  // ============================================
  // Periodic Sanitization
  // ============================================

  let sanitizeInterval = null;

  function startPeriodicSanitization() {
    // Initial sanitization
    sanitizeAllStorage();

    // Periodic sanitization every 5 seconds
    sanitizeInterval = setInterval(() => {
      sanitizeAllStorage();
    }, 5000);
  }

  function stopPeriodicSanitization() {
    if (sanitizeInterval) {
      clearInterval(sanitizeInterval);
      sanitizeInterval = null;
    }
  }

  // ============================================
  // Initialize
  // ============================================

  function init() {
    console.log('[AeroGuard] Storage purger initializing...');

    // Wait for DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initStorageObserver();
        startPeriodicSanitization();
        // Also sanitize on visibility change (tab focus)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            sanitizeAllStorage();
          }
        });
      });
    } else {
      initStorageObserver();
      startPeriodicSanitization();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          sanitizeAllStorage();
        }
      });
    }

    // Sanitize before unload (to clean up for next visit)
    window.addEventListener('beforeunload', () => {
      stopPeriodicSanitization();
      sanitizeAllStorage();
    });

    console.log('[AeroGuard] Storage purger active');
  }

  // ============================================
  // Expose API
  // ============================================

  window.AeroGuardStoragePurger = {
    sanitizeNow: sanitizeAllStorage,
    getStats: () => ({
      sanitizedCount,
      blockedWrites,
      lastSanitization,
      blacklistedPatterns: BLACKLISTED_KEY_PATTERNS.length,
      whitelistedPatterns: WHITELISTED_KEY_PATTERNS.length
    }),
    addBlacklistPattern: (pattern) => {
      if (!BLACKLISTED_KEY_PATTERNS.includes(pattern)) {
        BLACKLISTED_KEY_PATTERNS.push(pattern);
      }
    },
    addWhitelistPattern: (pattern) => {
      if (!WHITELISTED_KEY_PATTERNS.includes(pattern)) {
        WHITELISTED_KEY_PATTERNS.push(pattern);
      }
    },
    removeBlacklistPattern: (pattern) => {
      const idx = BLACKLISTED_KEY_PATTERNS.indexOf(pattern);
      if (idx > -1) BLACKLISTED_KEY_PATTERNS.splice(idx, 1);
    },
    removeWhitelistPattern: (pattern) => {
      const idx = WHITELISTED_KEY_PATTERNS.indexOf(pattern);
      if (idx > -1) WHITELISTED_KEY_PATTERNS.splice(idx, 1);
    },
    pause: () => {
      stopPeriodicSanitization();
      window.removeEventListener('storage', initStorageObserver);
    },
    resume: () => {
      initStorageObserver();
      startPeriodicSanitization();
    },
    // Manual inspection
    inspectStorage: () => {
      const items = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          items[key] = localStorage.getItem(key);
        }
        return items;
      } catch (e) {
        return { error: e.message };
      }
    }
  };

  // Auto-initialize
  init();
})();