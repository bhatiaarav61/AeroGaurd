/**
 * Statistics Tracker — Privacy-first, local-only, actionable metrics, zero overhead
 * Tracks blocked/allowed requests, performance metrics, filter list effectiveness
 */

import { errorKernel, wrapStorage } from './error-kernel.js';
import { storageEngine } from './storage-engine.js';

// ============================================================================
// Statistics Tracker Class
// ============================================================================

export class StatisticsTracker {
  constructor() {
    this.stats = {
      totalBlocked: 0,
      totalAllowed: 0,
      totalRequests: 0,
      youtubeAdsBlocked: 0,
      youtubeRequests: 0,
      byCategory: {},
      byDomain: {},
      byFilterList: {},
      byResourceType: {},
      sessionStart: Date.now(),
      lastPersisted: 0,
      errors: 0
    };
    this.persistenceTimer = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      const { statistics } = await storageEngine.get('statistics', { backend: 'local' });
      if (statistics) {
        this.stats = { ...this.stats, ...statistics };
        this.stats.sessionStart = Date.now(); // Reset session start
      }
    } catch (e) {
      console.warn('[StatisticsTracker] Failed to load stats:', e.message);
    }

    // Periodic persistence every 30 seconds
    this.persistenceTimer = setInterval(() => this.persist(), 30000);

    // Persist on unload
    self.addEventListener('beforeunload', () => this.persist());

    this.initialized = true;
    console.log('[StatisticsTracker] Initialized');
  }

  /**
   * Track a blocked request
   */
  trackBlocked(url, ruleId = 0, filterList = 'unknown') {
    try {
      this.stats.totalBlocked++;
      this.stats.totalRequests++;

      const domain = this._extractDomain(url);
      const category = this._categorizeUrl(url, filterList);
      const resourceType = this._guessResourceType(url);

      // By category
      this.stats.byCategory[category] = (this.stats.byCategory[category] || 0) + 1;

      // By domain (top 500)
      if (Object.keys(this.stats.byDomain).length < 500) {
        this.stats.byDomain[domain] = (this.stats.byDomain[domain] || 0) + 1;
      }

      // By filter list
      this.stats.byFilterList[filterList] = (this.stats.byFilterList[filterList] || 0) + 1;

      // By resource type
      this.stats.byResourceType[resourceType] = (this.stats.byResourceType[resourceType] || 0) + 1;

      // YouTube specific
      if (this._isYouTubeAdUrl(url)) {
        this.stats.youtubeAdsBlocked++;
      }
      if (domain.includes('youtube.com') || domain.includes('googlevideo.com')) {
        this.stats.youtubeRequests++;
      }
    } catch (e) {
      this.stats.errors++;
    }
  }

  /**
   * Track an allowed request
   */
  trackAllowed(url) {
    try {
      this.stats.totalAllowed++;
      this.stats.totalRequests++;

      const domain = this._extractDomain(url);
      const resourceType = this._guessResourceType(url);

      this.stats.byResourceType[resourceType] = (this.stats.byResourceType[resourceType] || 0) + 1;

      if (domain.includes('youtube.com') || domain.includes('googlevideo.com')) {
        this.stats.youtubeRequests++;
      }
    } catch (e) {
      this.stats.errors++;
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    const now = Date.now();
    const sessionDurationMs = now - this.stats.sessionStart;
    const sessionDurationSec = sessionDurationMs / 1000;

    const blockRate = this.stats.totalRequests > 0
      ? Math.round((this.stats.totalBlocked / this.stats.totalRequests) * 100)
      : 0;

    const youtubeBlockRate = this.stats.youtubeRequests > 0
      ? Math.round((this.stats.youtubeAdsBlocked / this.stats.youtubeRequests) * 100)
      : 0;

    return {
      // Core metrics
      totalBlocked: this.stats.totalBlocked,
      totalAllowed: this.stats.totalAllowed,
      totalRequests: this.stats.totalRequests,
      blockRate,
      sessionDurationSec: Math.round(sessionDurationSec),

      // YouTube metrics
      youtubeAdsBlocked: this.stats.youtubeAdsBlocked,
      youtubeRequests: this.stats.youtubeRequests,
      youtubeBlockRate,

      // Breakdowns
      byCategory: { ...this.stats.byCategory },
      byDomain: this._getTopDomains(20),
      byFilterList: { ...this.stats.byFilterList },
      byResourceType: { ...this.stats.byResourceType },

      // Health
      errors: this.stats.errors,
      lastPersisted: this.stats.lastPersisted
    };
  }

  /**
   * Get top domains by request count
   */
  _getTopDomains(limit = 20) {
    return Object.entries(this.stats.byDomain)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {});
  }

  /**
   * Reset all statistics
   */
  reset() {
    this.stats = {
      totalBlocked: 0,
      totalAllowed: 0,
      totalRequests: 0,
      youtubeAdsBlocked: 0,
      youtubeRequests: 0,
      byCategory: {},
      byDomain: {},
      byFilterList: {},
      byResourceType: {},
      sessionStart: Date.now(),
      lastPersisted: 0,
      errors: 0
    };
    this.persist();
    console.log('[StatisticsTracker] Statistics reset');
  }

  /**
   * Persist statistics to storage
   */
  async persist() {
    if (!this.initialized) return;

    try {
      this.stats.lastPersisted = Date.now();
      await wrapStorage('statistics.persist', () =>
        storageEngine.set({ statistics: this.stats }, { backend: 'local' })
      );
    } catch (e) {
      console.warn('[StatisticsTracker] Persist failed:', e.message);
    }
  }

  /**
   * Save alias for persist
   */
  async save() {
    return this.persist();
  }

  // ========== Helpers ==========

  _extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  _categorizeUrl(url, filterList) {
    const urlLower = url.toLowerCase();

    if (urlLower.includes('doubleclick') || urlLower.includes('googlesyndication') ||
        urlLower.includes('googleadservices') || urlLower.includes('googletagmanager') ||
        urlLower.includes('googletagservices') || urlLower.includes('pagead2') ||
        urlLower.includes('pubads') || urlLower.includes('ad.doubleclick') ||
        urlLower.includes('adservice.google') || urlLower.includes('imasdk')) {
      return 'google_ads';
    }

    if (urlLower.includes('facebook') || urlLower.includes('fbcdn') ||
        urlLower.includes('instagram') || urlLower.includes('connect.facebook')) {
      return 'social_facebook';
    }

    if (urlLower.includes('twitter') || urlLower.includes('t.co') ||
        urlLower.includes('twimg')) {
      return 'social_twitter';
    }

    if (urlLower.includes('linkedin') || urlLower.includes('licdn')) {
      return 'social_linkedin';
    }

    if (urlLower.includes('google-analytics') || urlLower.includes('googletagmanager') ||
        urlLower.includes('gtag') || urlLower.includes('analytics') ||
        urlLower.includes('mixpanel') || urlLower.includes('amplitude') ||
        urlLower.includes('segment') || urlLower.includes('hotjar')) {
      return 'analytics';
    }

    if (urlLower.includes('taboola') || urlLower.includes('outbrain') ||
        urlLower.includes('criteo') || urlLower.includes('rubicon') ||
        urlLower.includes('appnexus') || urlLower.includes('openx') ||
        urlLower.includes('pubmatic') || urlLower.includes('indexexchange') ||
        urlLower.includes('smaato') || urlLower.includes('moat')) {
      return 'ad_network';
    }

    if (filterList !== 'unknown' && filterList !== 'custom') {
      return filterList;
    }

    return 'other';
  }

  _guessResourceType(url) {
    const urlLower = url.toLowerCase();
    if (urlLower.match(/\.(js|mjs)(\?|$)/)) return 'script';
    if (urlLower.match(/\.(css)(\?|$)/)) return 'stylesheet';
    if (urlLower.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)(\?|$)/)) return 'image';
    if (urlLower.match(/\.(woff|woff2|ttf|eot)(\?|$)/)) return 'font';
    if (urlLower.match(/\.(mp4|webm|ogg|mp3|wav)(\?|$)/)) return 'media';
    if (urlLower.includes('xmlhttprequest') || urlLower.includes('fetch') ||
        urlLower.includes('/api/') || urlLower.includes('/graphql')) return 'xmlhttprequest';
    if (urlLower.includes('websocket') || urlLower.includes('ws://') || urlLower.includes('wss://')) return 'websocket';
    if (urlLower.includes('beacon') || urlLower.includes('/collect') || urlLower.includes('/track')) return 'ping';
    return 'other';
  }

  _isYouTubeAdUrl(url) {
    const urlLower = url.toLowerCase();
    return urlLower.includes('/api/stats/ads') ||
           urlLower.includes('/api/stats/qoe') ||
           urlLower.includes('/ptracking') ||
           urlLower.includes('/pagead/') ||
           urlLower.includes('adformat=') ||
           urlLower.includes('ad_type=') ||
           urlLower.includes('vmap=') ||
           urlLower.includes('ad_tag=') ||
           urlLower.includes('ad_url=') ||
           urlLower.includes('/annotations_invideo') ||
           urlLower.includes('imasdk') ||
           urlLower.includes('googleads.g.doubleclick.net/pagead/');
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const statisticsTracker = new StatisticsTracker();

export default StatisticsTracker;