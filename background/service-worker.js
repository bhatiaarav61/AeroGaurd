/**
 * AeroGuard - Background Service Worker (Manifest V3)
 * Handles declarativeNetRequest rules, statistics, filter list updates, and messaging
 * All modules are bundled inline to avoid ES module import issues in service workers
 */

// Import the enhanced ABP parser
import {
  parseAbpFilter,
  convertToUrlFilter,
  createDnrRule,
  parseFilterList,
  filterValidRules
} from './abp-parser.js';

// Import privacy modules
import { CNAMEUncloaking } from '../privacy-modules/cname-uncloaking.js';
import { WebRTCProtection } from '../privacy-modules/webrtc-protection.js';
import { FingerprintingProtection } from '../privacy-modules/fingerprinting-protection.js';
import { BounceTrackingProtection } from '../privacy-modules/bounce-tracking-protection.js';
import { CookieProtection } from '../privacy-modules/cookie-protection.js';
import { HTTPSUpgrade } from '../privacy-modules/https-upgrade.js';
import { ScriptletManager } from '../privacy-modules/scriptlet-injection.js';

// ============================================
// SETTINGS MANAGER (inline)
// ============================================
const DEFAULT_SETTINGS = {
  enabled: true,
  blockAds: true,
  blockTrackers: true,
  blockMalware: true,
  blockAnnoyances: true,
  blockSocial: true,
  blockCookieNotices: true,
  allowlist: [],
  customRules: [],
  cosmeticFilters: [
    // Common ad element selectors
    { id: 'cos_1', filter: '##.ad-banner', enabled: true, domains: [] },
    { id: 'cos_2', filter: '##.adsbox', enabled: true, domains: [] },
    { id: 'cos_3', filter: '##.advertisement', enabled: true, domains: [] },
    { id: 'cos_4', filter: '##.sponsor', enabled: true, domains: [] },
    { id: 'cos_5', filter: '##.ad-unit', enabled: true, domains: [] },
    { id: 'cos_6', filter: '##.ad-slot', enabled: true, domains: [] },
    { id: 'cos_7', filter: '##.ad-wrapper', enabled: true, domains: [] },
    { id: 'cos_8', filter: '##.ad-container', enabled: true, domains: [] },
    { id: 'cos_9', filter: '##.ad-inner', enabled: true, domains: [] },
    { id: 'cos_10', filter: '##[id^="ad-"]', enabled: true, domains: [] },
    { id: 'cos_11', filter: '##[id*="ad_"]', enabled: true, domains: [] },
    { id: 'cos_12', filter: '##[class^="ad-"]', enabled: true, domains: [] },
    { id: 'cos_13', filter: '##[class*="ad_"]', enabled: true, domains: [] },
    { id: 'cos_14', filter: '##[class*=" banner"]', enabled: true, domains: [] },
    { id: 'cos_15', filter: '##[class*="sponsor"]', enabled: true, domains: [] },
    { id: 'cos_16', filter: '##.native-ad', enabled: true, domains: [] },
    { id: 'cos_17', filter: '##.promoted-content', enabled: true, domains: [] },
    { id: 'cos_18', filter: '##.recommended-by', enabled: true, domains: [] },
    { id: 'cos_19', filter: '##.outbrain', enabled: true, domains: [] },
    { id: 'cos_20', filter: '##.taboola', enabled: true, domains: [] },
    { id: 'cos_21', filter: '##.mgid', enabled: true, domains: [] },
    { id: 'cos_22', filter: '##.revcontent', enabled: true, domains: [] },
    { id: 'cos_23', filter: '##.content-ad', enabled: true, domains: [] },
    { id: 'cos_24', filter: '##.feed-ad', enabled: true, domains: [] },
    { id: 'cos_25', filter: '##.in-feed-ad', enabled: true, domains: [] },
    { id: 'cos_26', filter: '##.advert', enabled: true, domains: [] },
    { id: 'cos_27', filter: '##.advertisment', enabled: true, domains: [] },
    { id: 'cos_28', filter: '##.advertizing', enabled: true, domains: [] },
    { id: 'cos_29', filter: '##.adspace', enabled: true, domains: [] },
    { id: 'cos_30', filter: '##.ad-place', enabled: true, domains: [] },
    { id: 'cos_31', filter: '##.ad-position', enabled: true, domains: [] },
    { id: 'cos_32', filter: '##.ad-location', enabled: true, domains: [] },
    { id: 'cos_33', filter: '##.ad-area', enabled: true, domains: [] },
    { id: 'cos_34', filter: '##.ad-zone', enabled: true, domains: [] },
    { id: 'cos_35', filter: '##.ad-block', enabled: true, domains: [] },
    { id: 'cos_36', filter: '##.ad-module', enabled: true, domains: [] },
    { id: 'cos_37', filter: '##.ad-widget', enabled: true, domains: [] },
    { id: 'cos_38', filter: '##.ad-component', enabled: true, domains: [] },
    { id: 'cos_39', filter: '##.ad-element', enabled: true, domains: [] },
    { id: 'cos_40', filter: '##.ad-item', enabled: true, domains: [] },
    { id: 'cos_41', filter: '##[id*="google_ads"]', enabled: true, domains: [] },
    { id: 'cos_42', filter: '##[id*="adsense"]', enabled: true, domains: [] },
    { id: 'cos_43', filter: '##[id*="doubleclick"]', enabled: true, domains: [] },
    { id: 'cos_44', filter: '##[id*="advert"]', enabled: true, domains: [] },
    { id: 'cos_45', filter: '##[class*="google_ads"]', enabled: true, domains: [] },
    { id: 'cos_46', filter: '##[class*="adsense"]', enabled: true, domains: [] },
    { id: 'cos_47', filter: '##[class*="doubleclick"]', enabled: true, domains: [] },
    { id: 'cos_48', filter: '##[class*="advert"]', enabled: true, domains: [] },
    { id: 'cos_49', filter: '##[class*="sponsored"]', enabled: true, domains: [] },
    { id: 'cos_50', filter: '##[class*="partner"]', enabled: true, domains: [] },
    { id: 'cos_51', filter: '##[class*="affiliate"]', enabled: true, domains: [] },
    { id: 'cos_52', filter: '##[class*="promo"]', enabled: true, domains: [] },
    { id: 'cos_53', filter: '##[class*="banner"]', enabled: true, domains: [] },
    { id: 'cos_54', filter: '##[class*="leaderboard"]', enabled: true, domains: [] },
    { id: 'cos_55', filter: '##[class*="skyscraper"]', enabled: true, domains: [] },
    { id: 'cos_56', filter: '##[class*="rectangle"]', enabled: true, domains: [] },
    { id: 'cos_57', filter: '##[class*="popup"]', enabled: true, domains: [] },
    { id: 'cos_58', filter: '##[class*="overlay"]', enabled: true, domains: [] },
    { id: 'cos_59', filter: '##[class*="modal"]', enabled: true, domains: [] },
    { id: 'cos_60', filter: '##[class*="interstitial"]', enabled: true, domains: [] },
    { id: 'cos_61', filter: '##[class*="preroll"]', enabled: true, domains: [] },
    { id: 'cos_62', filter: '##[class*="midroll"]', enabled: true, domains: [] },
    { id: 'cos_63', filter: '##[class*="postroll"]', enabled: true, domains: [] },
    { id: 'cos_64', filter: '##[data-ad]', enabled: true, domains: [] },
    { id: 'cos_65', filter: '##[data-advert]', enabled: true, domains: [] },
    { id: 'cos_66', filter: '##[data-advertisement]', enabled: true, domains: [] },
    { id: 'cos_67', filter: '##[data-sponsor]', enabled: true, domains: [] },
    { id: 'cos_68', filter: '##[data-promo]', enabled: true, domains: [] },
    { id: 'cos_69', filter: '##[data-affiliate]', enabled: true, domains: [] },
    { id: 'cos_70', filter: '##iframe[src*="ads"]', enabled: true, domains: [] },
    { id: 'cos_71', filter: '##iframe[src*="advert"]', enabled: true, domains: [] },
    { id: 'cos_72', filter: '##iframe[src*="doubleclick"]', enabled: true, domains: [] },
    { id: 'cos_73', filter: '##iframe[src*="googleads"]', enabled: true, domains: [] },
    { id: 'cos_74', filter: '##iframe[src*="adsense"]', enabled: true, domains: [] },
    { id: 'cos_75', filter: '##iframe[src*="googlesyndication"]', enabled: true, domains: [] },
    { id: 'cos_76', filter: '##.cookie-banner', enabled: true, domains: [] },
    { id: 'cos_77', filter: '##.cookie-notice', enabled: true, domains: [] },
    { id: 'cos_78', filter: '##.cookie-consent', enabled: true, domains: [] },
    { id: 'cos_79', filter: '##.cookie-warning', enabled: true, domains: [] },
    { id: 'cos_80', filter: '##.cookie-popup', enabled: true, domains: [] },
    { id: 'cos_81', filter: '##.cookie-overlay', enabled: true, domains: [] },
    { id: 'cos_82', filter: '##.gdpr-banner', enabled: true, domains: [] },
    { id: 'cos_83', filter: '##.gdpr-notice', enabled: true, domains: [] },
    { id: 'cos_84', filter: '##.gdpr-consent', enabled: true, domains: [] },
    { id: 'cos_85', filter: '##.ccpa-banner', enabled: true, domains: [] },
    { id: 'cos_86', filter: '##.consent-banner', enabled: true, domains: [] },
    { id: 'cos_87', filter: '##.consent-notice', enabled: true, domains: [] },
    { id: 'cos_88', filter: '##.consent-popup', enabled: true, domains: [] },
    { id: 'cos_89', filter: '##[id*="cookie"]', enabled: true, domains: [] },
    { id: 'cos_90', filter: '##[class*="cookie"]', enabled: true, domains: [] },
    { id: 'cos_91', filter: '##[id*="gdpr"]', enabled: true, domains: [] },
    { id: 'cos_92', filter: '##[class*="gdpr"]', enabled: true, domains: [] },
    { id: 'cos_93', filter: '##[id*="consent"]', enabled: true, domains: [] },
    { id: 'cos_94', filter: '##[class*="consent"]', enabled: true, domains: [] },
    { id: 'cos_95', filter: '##.newsletter-popup', enabled: true, domains: [] },
    { id: 'cos_96', filter: '##.newsletter-signup', enabled: true, domains: [] },
    { id: 'cos_97', filter: '##.email-capture', enabled: true, domains: [] },
    { id: 'cos_98', filter: '##.subscribe-popup', enabled: true, domains: [] },
    { id: 'cos_99', filter: '##.mailchimp', enabled: true, domains: [] },
    { id: 'cos_100', filter: '##.push-notification', enabled: true, domains: [] },
    { id: 'cos_101', filter: '##.app-install-banner', enabled: true, domains: [] },
    { id: 'cos_102', filter: '##.app-download-banner', enabled: true, domains: [] },
    { id: 'cos_103', filter: '##[class*="sticky"]', enabled: true, domains: [] },
    { id: 'cos_104', filter: '##[class*="fixed-bottom"]', enabled: true, domains: [] },
    { id: 'cos_105', filter: '##[class*="fixed-top"]', enabled: true, domains: [] },
    { id: 'cos_106', filter: '##[class*="floating"]', enabled: true, domains: [] },
    { id: 'cos_107', filter: '##[class*="toast"]', enabled: true, domains: [] },
    { id: 'cos_108', filter: '##[class*="snackbar"]', enabled: true, domains: [] },
    { id: 'cos_109', filter: '##[class*="notification"]', enabled: true, domains: [] },
    { id: 'cos_110', filter: '##[class*="alert"]', enabled: true, domains: [] },
  ],
  filterLists: {
    easylist: true,
    easyprivacy: true,
    easylistCookie: true,
    malware: true,
    annoyances: true,
    social: true,
    peterLowe: true,
    oisd: true,
    ublockFilters: true,
    ublockBadware: true,
    ublockPrivacy: true,
    ublockResourceAbuse: true,
    ublockUnbreak: true,
    fanboyAnnoyances: true,
    fanboySocial: true,
    easylistGermany: true,
    easylistFrance: true,
    easyListChina: true,
    easylistItaly: true,
    easylistLithuania: true,
    easylistPoland: true,
    easylistSpanish: true,
    easylistBulgaria: true,
    easylistCzech: true,
    easylistDenmark: true,
    easylistGreece: true,
    easylistHungary: true,
    easylistIsrael: true,
    easylistLatvia: true,
    easylistNetherlands: true,
    easylistPortugal: true,
    easylistRomania: true,
    easylistSerbia: true,
    easylistSlovakia: true,
    easylistSweden: true,
    easylistTurkey: true,
    nocoin: true,
    adguardDns: true,
    adguardMobileDns: true,
    adguardBase: true,
    adguardMobile: true,
    adguardTracking: true,
    adguardAnnoyances: true,
    adguardSocial: true
  },
  updateInterval: 6,
  showBadge: true,
  showNotifications: true,
  debugMode: false,
  filterListsLastUpdate: 0,
  statistics: {
    totalBlocked: 0,
    blockedByType: {}
  },
  theme: 'system',
  language: 'en',
  advanced: {
    blockWebRTC: true,
    blockFontApi: true,
    blockRemoteFonts: true,
    blockThirdPartyFrames: true,
    strictBlocking: true
  },
  privacy: {
    cnameUncloaking: {
      enabled: true
    },
    webrtcProtection: {
      enabled: true,
      blockAll: true
    },
    fingerprintingProtection: {
      enabled: true,
      canvas: true,
      webgl: true,
      audio: true,
      fonts: true,
      clientRects: true,
      mediaDevices: true,
      screenResolution: true,
      battery: true,
      hardwareConcurrency: true,
      deviceMemory: true,
      timezone: true,
      plugins: true,
      mimeTypes: true
    },
    bounceTrackingProtection: {
      enabled: true
    },
    cookieProtection: {
      enabled: true,
      blockThirdParty: true,
      partitionCookies: true,
      autoDeleteOnClose: true
    },
    httpsUpgrade: {
      enabled: true,
      upgradeNavigations: true,
      upgradeSubresources: true,
      blockMixedContent: true
    }
  }
};

class SettingsManager {
  constructor() {
    this.cache = null;
    this.listeners = new Map();
  }

  async initialize() {
    const stored = await chrome.storage.local.get('settings');
    this.cache = { ...DEFAULT_SETTINGS, ...stored.settings };
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) {
        this.cache = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
        this.notifyListeners('settings', this.cache);
      }
    });
    console.log('[SettingsManager] Initialized');
  }

  async migrate() {
    const version = await chrome.storage.local.get('settingsVersion');
    const currentVersion = 2;
    if (!version.settingsVersion) {
      await chrome.storage.local.set({ settingsVersion: currentVersion });
    }
  }

  async get(key, defaultValue = null) {
    if (!this.cache) await this.initialize();
    const keys = key.split('.');
    let value = this.cache;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    return value !== undefined ? value : defaultValue;
  }

  async set(key, value) {
    if (!this.cache) await this.initialize();
    const keys = key.split('.');
    let obj = this.cache;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in obj) || typeof obj[k] !== 'object') {
        obj[k] = {};
      }
      obj = obj[k];
    }
    obj[keys[keys.length - 1]] = value;
    await this.save();
    this.notifyListeners(key, value);
    return value;
  }

  async save() {
    await chrome.storage.local.set({ settings: this.cache });
  }

  async getAll() {
    if (!this.cache) await this.initialize();
    return { ...this.cache };
  }

  async setAll(settings) {
    this.cache = { ...DEFAULT_SETTINGS, ...settings };
    await this.save();
    this.notifyListeners('settings', this.cache);
  }

  async reset() {
    this.cache = { ...DEFAULT_SETTINGS };
    await this.save();
    this.notifyListeners('settings', this.cache);
  }

  async getTabEnabled(tabId) {
    const tabSettings = await this.get('tabSettings', {});
    return tabSettings[tabId] !== false;
  }

  async setTabEnabled(tabId, enabled) {
    const tabSettings = await this.get('tabSettings', {});
    tabSettings[tabId] = enabled;
    await this.set('tabSettings', tabSettings);
  }

  async addToAllowlist(url) {
    const allowlist = await this.get('allowlist', []);
    const domain = this.extractDomain(url);
    if (!allowlist.includes(domain)) {
      allowlist.push(domain);
      await this.set('allowlist', allowlist);
    }
  }

  async removeFromAllowlist(url) {
    const allowlist = await this.get('allowlist', []);
    const domain = this.extractDomain(url);
    const filtered = allowlist.filter(d => d !== domain);
    await this.set('allowlist', filtered);
  }

  async isAllowed(url) {
    const allowlist = await this.get('allowlist', []);
    const domain = this.extractDomain(url);
    return allowlist.some(allowed => this.domainMatches(domain, allowed));
  }

  domainMatches(domain, pattern) {
    if (pattern.startsWith('*.')) {
      return domain === pattern.slice(2) || domain.endsWith('.' + pattern.slice(2));
    }
    return domain === pattern || domain.endsWith('.' + pattern);
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `http://${url}`);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    }
  }

  async incrementBlocked(type = 'other') {
    const stats = await this.get('statistics', { totalBlocked: 0, blockedByType: {} });
    stats.totalBlocked = (stats.totalBlocked || 0) + 1;
    stats.blockedByType[type] = (stats.blockedByType[type] || 0) + 1;
    await this.set('statistics', stats);
    this.notifyListeners('statistics', stats);
    return stats;
  }

  async getStatistics() {
    return await this.get('statistics', { totalBlocked: 0, blockedByType: {} });
  }

  async resetStatistics() {
    const stats = { totalBlocked: 0, blockedByType: {} };
    await this.set('statistics', stats);
    return stats;
  }

  onChange(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    return () => this.listeners.get(key)?.delete(callback);
  }

  notifyListeners(key, value) {
    this.listeners.get(key)?.forEach(cb => cb(value));
    this.listeners.get('settings')?.forEach(cb => cb(this.cache));
  }

  async export() {
    return {
      version: 2,
      timestamp: Date.now(),
      settings: await this.getAll()
    };
  }

  async import(data) {
    if (data.settings) {
      await this.setAll(data.settings);
    }
  }
}

const settingsManager = new SettingsManager();

// ============================================
// STATISTICS MANAGER (inline)
// ============================================
class StatisticsManager {
  constructor() {
    this.globalStats = {
      totalBlocked: 0,
      blockedByType: {},
      blockedByDomain: {},
      sessionStart: Date.now()
    };
    this.tabStats = new Map();
    this.maxTabHistory = 100;
    this.persistTimer = null;
  }

  async initialize() {
    const stored = await chrome.storage.local.get('statistics');
    if (stored.statistics) {
      this.globalStats = { ...this.globalStats, ...stored.statistics.global };
    }
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.tabStats.delete(tabId);
    });
    console.log('[StatisticsManager] Initialized');
  }

  handleRuleMatched(details) {
    const { tabId, rule, request } = details;
    if (tabId < 0) return;

    const resourceType = request.type || 'other';
    const url = request.url;
    const domain = this.extractDomain(url);

    // Categorize the blocked request
    const category = this.categorizeBlockedRequest(resourceType, domain, rule);

    this.globalStats.totalBlocked++;
    this.globalStats.blockedByType[category] = (this.globalStats.blockedByType[category] || 0) + 1;
    this.globalStats.blockedByDomain[domain] = (this.globalStats.blockedByDomain[domain] || 0) + 1;

    if (!this.tabStats.has(tabId)) {
      this.tabStats.set(tabId, {
        blockedCount: 0,
        blockedByType: {},
        blockedByDomain: {},
        firstBlocked: Date.now(),
        lastBlocked: Date.now()
      });
    }

    const tabStat = this.tabStats.get(tabId);
    tabStat.blockedCount++;
    tabStat.blockedByType[category] = (tabStat.blockedByType[category] || 0) + 1;
    tabStat.blockedByDomain[domain] = (tabStat.blockedByDomain[domain] || 0) + 1;
    tabStat.lastBlocked = Date.now();

    if (this.tabStats.size > this.maxTabHistory) {
      const firstKey = this.tabStats.keys().next().value;
      this.tabStats.delete(firstKey);
    }

    this.schedulePersist();
  }

  categorizeBlockedRequest(resourceType, domain, rule) {
    // Map DNR resource types to display categories
    const typeMap = {
      'script': 'trackers',
      'xmlhttprequest': 'trackers',
      'fetch': 'trackers',
      'websocket': 'trackers',
      'image': 'ads',
      'sub_frame': 'ads',
      'main_frame': 'ads',
      'stylesheet': 'trackers',
      'font': 'other',
      'object': 'other',
      'media': 'ads',
      'websocket': 'trackers',
      'csp': 'trackers',
      'cookie': 'trackers',
      'ping': 'trackers',
      'other': 'other'
    };

    // Check if it's a known malware domain
    const malwareDomains = ['malware', 'phishing', 'trojan', 'virus'];
    if (malwareDomains.some(m => domain.includes(m))) {
      return 'malware';
    }

    // Check if it's a known tracker domain
    const trackerKeywords = ['analytics', 'tracking', 'tracker', 'pixel', 'beacon', 'metric', 'telemetry'];
    if (trackerKeywords.some(k => domain.includes(k))) {
      return 'trackers';
    }

    // Check if it's a known ad domain
    const adKeywords = ['ads', 'advert', 'doubleclick', 'googlesyndication', 'adnxs', 'rubicon', 'pubmatic', 'openx', 'criteo', 'outbrain', 'taboola'];
    if (adKeywords.some(k => domain.includes(k))) {
      return 'ads';
    }

    return typeMap[resourceType] || 'other';
  }

  schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persist();
      this.persistTimer = null;
    }, 5000);
  }

  async persist() {
    await chrome.storage.local.set({
      statistics: {
        global: this.globalStats,
        timestamp: Date.now()
      }
    });
  }

  async getTabStats(tabId) {
    const stats = this.tabStats.get(tabId);
    if (!stats) {
      return {
        blockedCount: 0,
        blockedByType: {},
        blockedByDomain: {},
        firstBlocked: 0,
        lastBlocked: 0
      };
    }
    return { ...stats };
  }

  async getGlobalStats() {
    return {
      ...this.globalStats,
      sessionDuration: Date.now() - this.globalStats.sessionStart,
      activeTabs: this.tabStats.size
    };
  }

  async resetGlobalStats() {
    this.globalStats = {
      totalBlocked: 0,
      blockedByType: {},
      blockedByDomain: {},
      sessionStart: Date.now()
    };
    this.tabStats.clear();
    await this.persist();
  }

  async resetTabStats(tabId) {
    this.tabStats.delete(tabId);
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return 'unknown';
    }
  }

  async export() {
    return {
      global: this.globalStats,
      tabs: Object.fromEntries(this.tabStats),
      exportTime: Date.now()
    };
  }

  async import(data) {
    if (data.global) {
      this.globalStats = { ...this.globalStats, ...data.global };
    }
    if (data.tabs) {
      this.tabStats = new Map(Object.entries(data.tabs));
    }
    await this.persist();
  }
}

const statisticsManager = new StatisticsManager();

// ============================================
// FILTER LIST MANAGER (inline)
// ============================================
const FILTER_LISTS = {
  // Base lists (enabled by default) - matching Brave's default lists
  easylist: {
    id: 'easylist', name: 'EasyList', description: 'Primary ad blocking filter list (English)',
    url: 'https://easylist.to/easylist/easylist.txt', homepage: 'https://easylist.to/',
    category: 'ads', enabled: true, rulesetId: 'ruleset_easylist', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easyprivacy: {
    id: 'easyprivacy', name: 'EasyPrivacy', description: 'Privacy-focused tracker blocking',
    url: 'https://easylist.to/easylist/easyprivacy.txt', homepage: 'https://easylist.to/',
    category: 'trackers', enabled: true, rulesetId: 'ruleset_easyprivacy', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistCookie: {
    id: 'easylistCookie', name: 'EasyList Cookie', description: 'Cookie notice and GDPR banner blocking',
    url: 'https://secure.fanboy.co.nz/fanboy-cookiemonster.txt', homepage: 'https://www.fanboy.co.nz/',
    category: 'cookieNotices', enabled: true, rulesetId: 'ruleset_easylist_cookie', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  peterLowe: {
    id: 'peterLowe', name: 'Peter Lowe\'s List', description: 'Tracking and malware domains',
    url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext',
    homepage: 'https://pgl.yoyo.org/adservers/',
    category: 'malware', enabled: true, rulesetId: 'ruleset_peterlowe', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  oisd: {
    id: 'oisd', name: 'OISD', description: 'Comprehensive ads/tracking/malware blocking',
    url: 'https://big.oisd.nl/', homepage: 'https://oisd.nl/',
    category: 'ads', enabled: true, rulesetId: 'ruleset_oisd', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  ublockFilters: {
    id: 'ublockFilters', name: 'uBlock Origin Filters', description: 'Comprehensive uBlock Origin filters',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
    homepage: 'https://github.com/uBlockOrigin/uAssets',
    category: 'ads', enabled: true, rulesetId: 'ruleset_ublock_filters', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  ublockBadware: {
    id: 'ublockBadware', name: 'uBlock Badware', description: 'Malware and unwanted software',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt',
    homepage: 'https://github.com/uBlockOrigin/uAssets',
    category: 'malware', enabled: true, rulesetId: 'ruleset_ublock_badware', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  ublockPrivacy: {
    id: 'ublockPrivacy', name: 'uBlock Privacy', description: 'Privacy-focused filters',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt',
    homepage: 'https://github.com/uBlockOrigin/uAssets',
    category: 'trackers', enabled: true, rulesetId: 'ruleset_ublock_privacy', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  ublockResourceAbuse: {
    id: 'ublockResourceAbuse', name: 'uBlock Resource Abuse', description: 'Crypto miners and resource abuse',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/resource-abuse.txt',
    homepage: 'https://github.com/uBlockOrigin/uAssets',
    category: 'malware', enabled: true, rulesetId: 'ruleset_ublock_resource_abuse', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  ublockUnbreak: {
    id: 'ublockUnbreak', name: 'uBlock Unbreak', description: 'Anti-adblock circumvention',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt',
    homepage: 'https://github.com/uBlockOrigin/uAssets',
    category: 'annoyances', enabled: true, rulesetId: 'ruleset_ublock_unbreak', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  fanboyAnnoyances: {
    id: 'fanboyAnnoyances', name: 'Fanboy Annoyances', description: 'Annoyances, popups, overlays',
    url: 'https://easylist.to/easylist/fanboy-annoyance.txt',
    homepage: 'https://easylist.to/',
    category: 'annoyances', enabled: true, rulesetId: 'ruleset_fanboy_annoyances', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  fanboySocial: {
    id: 'fanboySocial', name: 'Fanboy Social', description: 'Social media buttons and widgets',
    url: 'https://easylist.to/easylist/fanboy-social.txt',
    homepage: 'https://easylist.to/',
    category: 'social', enabled: true, rulesetId: 'ruleset_fanboy_social', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },

  // Regional lists (disabled by default, enable as needed)
  easylistGermany: {
    id: 'easylistGermany', name: 'EasyList Germany', description: 'German-specific ad blocking',
    url: 'https://easylist.to/easylistgermany/easylistgermany.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_germany', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistFrance: {
    id: 'easylistFrance', name: 'EasyList France', description: 'French-specific ad blocking',
    url: 'https://easylist.to/easylistfr/easylistfr.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_france', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easyListChina: {
    id: 'easyListChina', name: 'EasyList China', description: 'Chinese-specific ad blocking',
    url: 'https://easylist-downloads.adblockplus.org/easylistchina.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_china', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistItaly: {
    id: 'easylistItaly', name: 'EasyList Italy', description: 'Italian-specific ad blocking',
    url: 'https://easylist.to/easylistitaly/easylistitaly.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_italy', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistLithuania: {
    id: 'easylistLithuania', name: 'EasyList Lithuania', description: 'Lithuanian-specific ad blocking',
    url: 'https://easylist.to/easylistlithuania/easylistlithuania.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_lithuania', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistPoland: {
    id: 'easylistPoland', name: 'EasyList Poland', description: 'Polish-specific ad blocking',
    url: 'https://easylist.to/easylistpoland/easylistpoland.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_poland', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistSpanish: {
    id: 'easylistSpanish', name: 'EasyList Spanish', description: 'Spanish-specific ad blocking',
    url: 'https://easylist.to/easylistspanish/easylistspanish.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_spanish', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistBulgaria: {
    id: 'easylistBulgaria', name: 'EasyList Bulgaria', description: 'Bulgarian-specific ad blocking',
    url: 'https://easylist.to/easylistbulgaria/easylistbulgaria.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_bulgaria', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistCzech: {
    id: 'easylistCzech', name: 'EasyList Czech', description: 'Czech-specific ad blocking',
    url: 'https://easylist.to/easylistczech/easylistczech.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_czech', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistDenmark: {
    id: 'easylistDenmark', name: 'EasyList Denmark', description: 'Danish-specific ad blocking',
    url: 'https://easylist.to/easylistdenmark/easylistdenmark.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_denmark', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistGreece: {
    id: 'easylistGreece', name: 'EasyList Greece', description: 'Greek-specific ad blocking',
    url: 'https://easylist.to/easylistgreece/easylistgreece.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_greece', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistHungary: {
    id: 'easylistHungary', name: 'EasyList Hungary', description: 'Hungarian-specific ad blocking',
    url: 'https://easylist.to/easylisthungary/easylisthungary.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_hungary', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistIsrael: {
    id: 'easylistIsrael', name: 'EasyList Israel', description: 'Israeli-specific ad blocking',
    url: 'https://easylist.to/easylistisrael/easylistisrael.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_israel', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistLatvia: {
    id: 'easylistLatvia', name: 'EasyList Latvia', description: 'Latvian-specific ad blocking',
    url: 'https://easylist.to/easylistlatvia/easylistlatvia.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_latvia', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistNetherlands: {
    id: 'easylistNetherlands', name: 'EasyList Netherlands', description: 'Dutch-specific ad blocking',
    url: 'https://easylist.to/easylistnetherlands/easylistnetherlands.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_netherlands', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistPortugal: {
    id: 'easylistPortugal', name: 'EasyList Portugal', description: 'Portuguese-specific ad blocking',
    url: 'https://easylist.to/easylistportugal/easylistportugal.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_portugal', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistRomania: {
    id: 'easylistRomania', name: 'EasyList Romania', description: 'Romanian-specific ad blocking',
    url: 'https://easylist.to/easylistromania/easylistromania.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_romania', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistSerbia: {
    id: 'easylistSerbia', name: 'EasyList Serbia', description: 'Serbian-specific ad blocking',
    url: 'https://easylist.to/easylistserbia/easylistserbia.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_serbia', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistSlovakia: {
    id: 'easylistSlovakia', name: 'EasyList Slovakia', description: 'Slovak-specific ad blocking',
    url: 'https://easylist.to/easylistslovakia/easylistslovakia.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_slovakia', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistSweden: {
    id: 'easylistSweden', name: 'EasyList Sweden', description: 'Swedish-specific ad blocking',
    url: 'https://easylist.to/easylistsweden/easylistsweden.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_sweden', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  easylistTurkey: {
    id: 'easylistTurkey', name: 'EasyList Turkey', description: 'Turkish-specific ad blocking',
    url: 'https://easylist.to/easylistturkey/easylistturkey.txt', homepage: 'https://easylist.to/',
    category: 'regional', enabled: true, rulesetId: 'ruleset_easylist_turkey', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  // Additional specialized lists
  nocoin: {
    id: 'nocoin', name: 'NoCoin', description: 'Cryptocurrency mining protection',
    url: 'https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/nocoin.txt',
    homepage: 'https://github.com/hoshsadiq/adblock-nocoin-list',
    category: 'malware', enabled: true, rulesetId: 'ruleset_nocoin', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  adguardDns: {
    id: 'adguardDns', name: 'AdGuard DNS', description: 'AdGuard DNS filter for network-level blocking',
    url: 'https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/dns.txt',
    homepage: 'https://github.com/AdguardTeam/AdGuardSDNSFilter',
    category: 'ads', enabled: true, rulesetId: 'ruleset_adguard_dns', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  },
  adguardMobileDns: {
    id: 'adguardMobileDns', name: 'AdGuard Mobile DNS', description: 'Mobile DNS filter',
    url: 'https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/mobile_dns.txt',
    homepage: 'https://github.com/AdguardTeam/AdGuardSDNSFilter',
    category: 'ads', enabled: true, rulesetId: 'ruleset_adguard_mobile_dns', priority: 1,
    ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
  }
};

const RULE_ID_BASE = {
  easylist: 100000, easyprivacy: 150000, easylistCookie: 200000, malware: 250000,
  annoyances: 300000, social: 350000, easylistGermany: 400000, easylistFrance: 450000, easyListChina: 500000,
  peterLowe: 550000, oisd: 600000, adguardBase: 650000, adguardMobile: 700000, adguardTracking: 750000,
  adguardAnnoyances: 800000, adguardSocial: 850000, ublockFilters: 900000, ublockBadware: 950000,
  ublockPrivacy: 1000000, ublockResourceAbuse: 1050000, ublockUnbreak: 1100000, fanboyAnnoyances: 1150000,
  fanboySocial: 1200000, easylistItaly: 1250000, easylistLithuania: 1300000, easylistPoland: 1350000,
  easylistSpanish: 1400000, easylistBulgaria: 1450000, easylistCzech: 1500000, easylistDenmark: 1550000,
  easylistGreece: 1600000, easylistHungary: 1650000, easylistIsrael: 1700000, easylistLatvia: 1750000,
  easylistNetherlands: 1800000, easylistPortugal: 1850000, easylistRomania: 1900000, easylistSerbia: 1950000,
  easylistSlovakia: 2000000, easylistSweden: 2050000, easylistTurkey: 2100000, nocoin: 2150000,
  adguardDns: 2200000, adguardMobileDns: 2250000
};

class FilterListManager {
  constructor(settingsManager) {
    this.settingsManager = settingsManager;
    this.lists = { ...FILTER_LISTS };
    this.ruleIdCounters = { ...RULE_ID_BASE };
    this.updateInProgress = false;
    this.listeners = new Set();
  }

  setFilterManager(filterManager) {
    this.filterManager = filterManager;
  }

  async initialize() {
    const saved = await this.settingsManager.get('filterLists', {});
    for (const [key, list] of Object.entries(this.lists)) {
      if (saved[key] !== undefined) {
        list.enabled = saved[key];
      }
    }
    await this.loadCache();

    // Apply rules immediately after loading cache
    if (await this.settingsManager.get('enabled', true)) {
      await this.refreshRulesFromCache();
    }

    console.log('[FilterListManager] Initialized');
  }

  async refreshRulesFromCache() {
    try {
      const dynamicRules = await this.getDynamicRules();
      if (dynamicRules.length > 0) {
        console.log(`[FilterListManager] Applying ${dynamicRules.length} cached rules`);
        // Apply rules through FilterManager
        if (this.filterManager) {
          await this.filterManager.refreshRules();
        }
      }
    } catch (error) {
      console.error('[FilterListManager] Failed to refresh rules from cache:', error);
    }
  }

  async loadCache() {
    const cached = await chrome.storage.local.get('filterListCache');
    if (cached.filterListCache) {
      for (const [key, data] of Object.entries(cached.filterListCache)) {
        if (this.lists[key]) {
          this.lists[key].ruleCount = data.ruleCount || 0;
          this.lists[key].lastUpdated = data.lastUpdated || 0;
          this.lists[key].size = data.size || 0;
          this.lists[key].etag = data.etag || null;
          this.lists[key].lastModified = data.lastModified || null;
          this.lists[key].rules = data.rules || [];
        }
      }
    }
  }

  async saveCache() {
    const cache = {};
    for (const [key, list] of Object.entries(this.lists)) {
      cache[key] = {
        ruleCount: list.ruleCount, lastUpdated: list.lastUpdated,
        size: list.size, etag: list.etag, lastModified: list.lastModified,
        rules: list.rules || []
      };
    }
    await chrome.storage.local.set({ filterListCache: cache });
  }

  async getListStatus() {
    return Object.values(this.lists).map(list => ({
      ...list, rules: undefined
    }));
  }

  async setListEnabled(key, enabled) {
    const list = this.lists[key];
    if (!list) return false;
    list.enabled = enabled;
    await this.settingsManager.set(`filterLists.${key}`, enabled);
    this.notifyListeners('listChanged', { key, enabled });
    return true;
  }

  async updateAllLists() {
    if (this.updateInProgress) return;
    this.updateInProgress = true;
    this.notifyListeners('updateStarted', {});

    try {
      const enabledLists = Object.entries(this.lists)
        .filter(([_, list]) => list.enabled)
        .map(([key, _]) => key);

      console.log(`[FilterListManager] Updating ${enabledLists.length} filter lists...`);

      const concurrency = 3;
      for (let i = 0; i < enabledLists.length; i += concurrency) {
        const batch = enabledLists.slice(i, i + concurrency);
        await Promise.all(batch.map(key => this.updateList(key)));
      }

      await this.saveCache();
      // Save the update timestamp
      await this.settingsManager.set('filterListsLastUpdate', Date.now());
      this.notifyListeners('updateCompleted', { updatedLists: enabledLists });
      console.log('[FilterListManager] All filter lists updated');
    } catch (error) {
      console.error('[FilterListManager] Update failed:', error);
      this.notifyListeners('updateFailed', { error: error.message });
    } finally {
      this.updateInProgress = false;
    }
  }

  async updateList(key) {
    const list = this.lists[key];
    if (!list || !list.enabled) return;

    try {
      this.notifyListeners('listUpdateStarted', { key });

      const headers = {
        'User-Agent': 'AeroGuard/1.0 (Manifest V3; +https://github.com/aeroguard)'
      };
      if (list.etag) headers['If-None-Match'] = list.etag;
      if (list.lastModified) headers['If-Modified-Since'] = list.lastModified;

      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(list.url, { headers, signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.status === 304) {
        console.log(`[FilterListManager] ${list.name}: Not modified`);
        this.notifyListeners('listUpdateSkipped', { key, reason: 'not_modified' });
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      const rules = parseFilterList(text, {
        baseId: this.ruleIdCounters[key] || 100000,
        listKey: key,
        debug: await this.settingsManager.get('debugMode', false)
      });

      if (rules.length === 0) {
        console.warn(`[FilterListManager] ${list.name}: No rules parsed from filter list`);
      }

      list.rules = rules;
      list.ruleCount = rules.length;
      list.lastUpdated = Date.now();
      list.size = text.length;
      list.etag = response.headers.get('etag');
      list.lastModified = response.headers.get('last-modified');

      this.ruleIdCounters[key] = (this.ruleIdCounters[key] || 100000) + rules.length;

      console.log(`[FilterListManager] ${list.name}: ${rules.length} rules parsed (${(text.length / 1024).toFixed(1)} KB)`);
      this.notifyListeners('listUpdated', { key, ruleCount: rules.length });

      // Trigger rule refresh after each list update
      if (this.filterManager) {
        this.filterManager.refreshRules();
      }
    } catch (error) {
      console.error(`[FilterListManager] Failed to update ${list.name}:`, error);
      this.notifyListeners('listUpdateFailed', { key, error: error.message });
    }
  }

  // The following methods are now imported from abp-parser.js
  // parseFilterList, parseNetworkFilter, parseAbpFilter, parseOptions, convertToUrlFilter, getResourceTypes

  async getDynamicRules() {
    const allRules = [];
    for (const [key, list] of Object.entries(this.lists)) {
      if (list.enabled && list.rules && list.rules.length > 0) {
        allRules.push(...list.rules);
      }
    }
    return allRules;
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(event, data) {
    this.listeners.forEach(cb => cb(event, data));
  }

  async addCustomList(url, name) {
    const id = 'custom_' + Date.now();
    this.lists[id] = {
      id, name, description: 'Custom filter list', url, homepage: '',
      category: 'custom', enabled: true, rulesetId: 'ruleset_3', priority: 1,
      ruleCount: 0, lastUpdated: 0, size: 0, etag: null, lastModified: null
    };
    await this.updateList(id);
    this.notifyListeners('listAdded', { id });
    return id;
  }

  async removeCustomList(id) {
    if (!id.startsWith('custom_')) return false;
    delete this.lists[id];
    await this.saveCache();
    this.notifyListeners('listRemoved', { id });
    return true;
  }
}

const filterListManager = new FilterListManager(settingsManager);

// ============================================
// FILTER MANAGER (inline)
// ============================================
class FilterManager {
  constructor(settingsManager, filterListManager, statisticsManager) {
    this.settingsManager = settingsManager;
    this.filterListManager = filterListManager;
    this.statisticsManager = statisticsManager;
    this.customRules = [];
    this.allowlistRules = [];
    this.enabled = true;
    this.ruleCache = new Map();
  }

  async initialize() {
    const stored = await this.settingsManager.get('customRules', []);
    this.customRules = stored;
    this.allowlistRules = await this.settingsManager.get('allowlist', []);
    this.enabled = await this.settingsManager.get('enabled', true);

    try {
      chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(
        this.handleRuleMatched.bind(this)
      );
    } catch (e) {
      console.log('[FilterManager] onRuleMatchedDebug not available (requires unpacked extension)');
    }

    // Apply rules on initialization
    await this.refreshRules();

    console.log('[FilterManager] Initialized');
  }

  async refreshRules() {
    if (!this.enabled) {
      await this.disableAllRules();
      return;
    }

    console.log('[FilterManager] Refreshing rules...');

    try {
      const dynamicRules = await this.filterListManager.getDynamicRules();

      const customRules = this.customRules.map((rule, index) => ({
        id: 1000000 + index,
        priority: rule.priority || 1,
        action: rule.action || { type: 'block' },
        condition: rule.condition
      }));

      const allowlistRules = this.allowlistRules.map((rule, index) => ({
        id: 2000000 + index,
        priority: 2,
        action: { type: 'allow' },
        condition: rule.condition
      }));

      const allRules = [...dynamicRules, ...customRules, ...allowlistRules];
      await this.applyRulesInBatches(allRules);

      this.ruleCache.clear();
      for (const rule of allRules) {
        this.ruleCache.set(rule.id, rule);
      }

      console.log(`[FilterManager] Applied ${allRules.length} rules`);
    } catch (error) {
      console.error('[FilterManager] Failed to refresh rules:', error);
    }
  }

  async applyRulesInBatches(rules) {
    const batchSize = 1000; // Reduced from 5000 to prevent CPU spikes

    // Filter out invalid rules and ensure unique IDs
    const validRules = [];
    const seenIds = new Set();

    for (const rule of rules) {
      // Skip rules with invalid resourceTypes
      if (rule.condition && rule.condition.resourceTypes) {
        const validTypes = ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'stylesheet', 'font', 'object', 'media', 'websocket', 'other', 'ping', 'csp_report'];
        const validTypesSet = new Set(validTypes);
        rule.condition.resourceTypes = rule.condition.resourceTypes.filter(t => validTypesSet.has(t));
        if (rule.condition.resourceTypes.length === 0) {
          continue; // Skip rule with no valid resource types
        }
      }

      // Convert thirdParty to domainType (MV3 format)
      if (rule.condition && rule.condition.thirdParty !== undefined) {
        rule.condition.domainType = rule.condition.thirdParty ? 'thirdParty' : 'firstParty';
        delete rule.condition.thirdParty;
      }

      // Ensure unique IDs
      if (!seenIds.has(rule.id)) {
        seenIds.add(rule.id);
        validRules.push(rule);
      }
    }

    // Get existing rules to find which ones to keep vs replace
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = new Set(existingRules.map(r => r.id));
    const newIds = new Set(validRules.map(r => r.id));

    // Find rules to remove (existing but not in new set)
    const removeIds = existingRules
      .filter(r => !newIds.has(r.id))
      .map(r => r.id);

    // Check dynamic rule quota (Chrome limit: 5000 dynamic rules)
    // Reserve space for HTTPSUpgrade (~200 rules) and user custom rules
    const MAX_DYNAMIC_RULES = 4500;
    const existingDynamicCount = existingRules.length;
    const availableSlots = Math.max(0, MAX_DYNAMIC_RULES - existingDynamicCount);

    if (validRules.length > availableSlots) {
      console.warn(`[FilterManager] Dynamic rule quota exceeded: ${validRules.length} rules requested, ${availableSlots} slots available. Truncating.`);
      validRules.length = availableSlots;
    }

    // Remove and add in atomic operations
    for (let i = 0; i < validRules.length; i += batchSize) {
      const batch = validRules.slice(i, i + batchSize);
      const updateOptions = { addRules: batch };

      // Only remove the old rules on the very first batch
      if (i === 0 && removeIds.length > 0) {
        updateOptions.removeRuleIds = removeIds;
      }

      try {
        await chrome.declarativeNetRequest.updateDynamicRules(updateOptions);
      } catch (error) {
        console.error(`[FilterManager] Failed to apply batch ${i / batchSize}:`, error);
      }
    }

    // Verify rules were applied
    const verifyRules = await chrome.declarativeNetRequest.getDynamicRules();
    console.log(`[FilterManager] Verified ${verifyRules.length} dynamic rules active`);
  }

  async disableAllRules() {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(r => r.id);
    if (existingRuleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existingRuleIds });
    }
    this.ruleCache.clear();
    console.log('[FilterManager] All rules disabled');
  }

  async enableRules() {
    this.enabled = true;
    await this.settingsManager.set('enabled', true);
    await this.refreshRules();

    try {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: [
          'ruleset_1', 'ruleset_2', 'ruleset_3',
          'ruleset_easylist', 'ruleset_easyprivacy', 'ruleset_easylist_cookie',
          'ruleset_ublock_filters', 'ruleset_ublock_badware', 'ruleset_ublock_privacy',
          'ruleset_ublock_resource_abuse', 'ruleset_ublock_unbreak',
          'ruleset_fanboy_annoyances', 'ruleset_peterlowe', 'ruleset_oisd'
        ]
      });
    } catch (error) {
      console.error('[FilterManager] Failed to enable static rulesets:', error);
    }
    console.log('[FilterManager] Rules enabled');
  }

  async disableRules() {
    this.enabled = false;
    await this.settingsManager.set('enabled', false);

    try {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: [
          'ruleset_1', 'ruleset_2', 'ruleset_3',
          'ruleset_easylist', 'ruleset_easyprivacy', 'ruleset_easylist_cookie',
          'ruleset_ublock_filters', 'ruleset_ublock_badware', 'ruleset_ublock_privacy',
          'ruleset_ublock_resource_abuse', 'ruleset_ublock_unbreak',
          'ruleset_fanboy_annoyances', 'ruleset_peterlowe', 'ruleset_oisd'
        ]
      });
    } catch (error) {
      console.error('[FilterManager] Failed to disable static rulesets:', error);
    }

    await this.disableAllRules();
    console.log('[FilterManager] Rules disabled');
  }

  handleRuleMatched(request) {
    const { tabId, rule, request: requestDetails } = request;
    if (tabId < 0) return;

    this.statisticsManager.handleRuleMatched?.(request);

    chrome.tabs.sendMessage(tabId, {
      type: 'RULE_MATCHED', ruleId: rule.id, url: requestDetails.url, resourceType: requestDetails.type
    }).catch(() => {});
  }

  async addCustomRule(rule) {
    const newRule = { ...rule, id: Date.now(), created: Date.now() };
    this.customRules.push(newRule);
    await this.settingsManager.set('customRules', this.customRules);
    await this.refreshRules();
    return newRule;
  }

  async removeCustomRule(ruleId) {
    this.customRules = this.customRules.filter(r => r.id !== ruleId);
    await this.settingsManager.set('customRules', this.customRules);
    await this.refreshRules();
  }

  async updateCustomRule(ruleId, updates) {
    const index = this.customRules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.customRules[index] = { ...this.customRules[index], ...updates };
      await this.settingsManager.set('customRules', this.customRules);
      await this.refreshRules();
    }
  }

  getCustomRules() { return [...this.customRules]; }

  async addToAllowlist(urlPattern, domain = null) {
    const rule = { id: Date.now(), condition: { urlFilter: urlPattern } };
    if (domain) rule.condition.domains = [domain];
    this.allowlistRules.push(rule);
    await this.settingsManager.set('allowlist', this.allowlistRules);
    await this.refreshRules();
    return rule;
  }

  async removeFromAllowlist(ruleId) {
    this.allowlistRules = this.allowlistRules.filter(r => r.id !== ruleId);
    await this.settingsManager.set('allowlist', this.allowlistRules);
    await this.refreshRules();
  }

  getAllowlist() { return [...this.allowlistRules]; }

  async addCosmeticFilter(filter) {
    const filters = await this.settingsManager.get('cosmeticFilters', []);
    filters.push({ id: Date.now(), filter, enabled: true });
    await this.settingsManager.set('cosmeticFilters', filters);
    chrome.runtime.sendMessage({ type: 'COSMETIC_FILTERS_UPDATED', filters }).catch(() => {});
  }

  async removeCosmeticFilter(filterId) {
    const filters = await this.settingsManager.get('cosmeticFilters', []);
    const updated = filters.filter(f => f.id !== filterId);
    await this.settingsManager.set('cosmeticFilters', updated);
    chrome.runtime.sendMessage({ type: 'COSMETIC_FILTERS_UPDATED', filters: updated }).catch(() => {});
  }

  async getCosmeticFilters() { return await this.settingsManager.get('cosmeticFilters', []); }

  async setEnabled(enabled) {
    this.enabled = enabled;
    await this.settingsManager.set('enabled', enabled);
    if (enabled) await this.refreshRules(); else await this.disableAllRules();
    chrome.runtime.sendMessage({ type: 'EXTENSION_TOGGLED', enabled }).catch(() => {});
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'EXTENSION_TOGGLED', enabled }).catch(() => {}));
  }

  isEnabled() { return this.enabled; }

  async getMatchedRules(tabId) {
    try { return await chrome.declarativeNetRequest.getMatchedRules({ tabId }); }
    catch (error) { console.error('[FilterManager] Failed to get matched rules:', error); return []; }
  }

  async exportRules() {
    return {
      customRules: this.customRules, allowlist: this.allowlistRules,
      cosmeticFilters: await this.settingsManager.get('cosmeticFilters', []),
      exportDate: Date.now(), version: 1
    };
  }

  async importRules(data) {
    if (data.customRules) {
      this.customRules = data.customRules;
      await this.settingsManager.set('customRules', this.customRules);
    }
    if (data.allowlist) {
      this.allowlistRules = data.allowlist;
      await this.settingsManager.set('allowlist', this.allowlistRules);
    }
    if (data.cosmeticFilters) {
      await this.settingsManager.set('cosmeticFilters', data.cosmeticFilters);
    }
    await this.refreshRules();
  }

  getRuleStats() {
    return {
      dynamicRules: this.ruleCache.size,
      customRules: this.customRules.length,
      allowlistRules: this.allowlistRules.length,
      cosmeticFilters: 0 // async, handled elsewhere
    };
  }
}

const filterManager = new FilterManager(settingsManager, filterListManager, statisticsManager);
filterListManager.setFilterManager(filterManager);

// ============================================
// MESSAGE HANDLER (inline)
// ============================================
class MessageHandler {
  constructor(filterManager, statisticsManager, filterListManager, settingsManager) {
    this.filterManager = filterManager;
    this.statisticsManager = statisticsManager;
    this.filterListManager = filterListManager;
    this.settingsManager = settingsManager;
  }

  async handle(message, sender) {
    const { type, payload } = message;
    try {
      switch (type) {
        case 'GET_EXTENSION_STATE': return await this.getExtensionState();
        case 'TOGGLE_EXTENSION': return await this.toggleExtension(payload?.enabled);
        case 'TOGGLE_TAB': return await this.toggleTab(sender.tab?.id, payload?.enabled);
        case 'GET_SETTINGS': return await this.getSettings();
        case 'UPDATE_SETTING': return await this.updateSetting(payload?.key, payload?.value);
        case 'RESET_SETTINGS': return await this.resetSettings();
        case 'GET_STATS': return await this.getStats(sender.tab?.id);
        case 'GET_GLOBAL_STATS': return await this.getGlobalStats();
        case 'RESET_STATS': return await this.resetStats();
        case 'GET_FILTER_LISTS': return await this.getFilterLists();
        case 'TOGGLE_FILTER_LIST': return await this.toggleFilterList(payload?.key, payload?.enabled);
        case 'UPDATE_FILTER_LISTS': return await this.updateFilterLists();
        case 'GET_ALLOWLIST': return await this.getAllowlist();
        case 'ADD_TO_ALLOWLIST': return await this.addToAllowlist(payload?.url, payload?.domain);
        case 'REMOVE_FROM_ALLOWLIST': return await this.removeFromAllowlist(payload?.id);
        case 'GET_CUSTOM_RULES': return await this.getCustomRules();
        case 'ADD_CUSTOM_RULE': return await this.addCustomRule(payload);
        case 'REMOVE_CUSTOM_RULE': return await this.removeCustomRule(payload?.id);
        case 'UPDATE_CUSTOM_RULE': return await this.updateCustomRule(payload?.id, payload?.updates);
        case 'GET_COSMETIC_FILTERS': return await this.getCosmeticFilters();
        case 'ADD_COSMETIC_FILTER': return await this.addCosmeticFilter(payload?.filter);
        case 'REMOVE_COSMETIC_FILTER': return await this.removeCosmeticFilter(payload?.id);
        case 'UPDATE_COSMETIC_FILTER': return await this.updateCosmeticFilter(payload?.id, payload?.filter);
        case 'GET_TAB_STATS': return await this.getTabStats(sender.tab?.id);
        case 'OPEN_POPUP': return await this.openPopup();
        case 'ADD_CUSTOM_FILTER_LIST': return await this.addCustomFilterList(payload?.url, payload?.name);
        case 'GET_MATCHED_RULES': return await this.getMatchedRules(sender.tab?.id);
        case 'EXPORT_DATA': return await this.exportData();
        case 'IMPORT_DATA': return await this.importData(payload?.data);
        default: return { error: `Unknown message type: ${type}` };
      }
    } catch (error) {
      console.error('[MessageHandler] Error:', error);
      return { error: error.message };
    }
  }

  async getExtensionState() {
    const enabled = await this.settingsManager.get('enabled', true);
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    const tabEnabled = tabId ? await this.settingsManager.getTabEnabled(tabId) : true;
    return { enabled, tabEnabled, version: chrome.runtime.getManifest().version };
  }

  async toggleExtension(enabled) {
    const newState = enabled !== undefined ? enabled : !(await this.settingsManager.get('enabled', true));
    await this.settingsManager.set('enabled', newState);
    if (newState) await this.filterManager.enableRules?.() || this.filterManager.refreshRules();
    else await this.filterManager.disableRules?.() || this.filterManager.disableAllRules();
    return { enabled: newState };
  }

  async toggleTab(tabId, enabled) {
    if (!tabId) return { error: 'No tab ID' };
    const newState = enabled !== undefined ? enabled : !(await this.settingsManager.getTabEnabled(tabId));
    await this.settingsManager.setTabEnabled(tabId, newState);
    chrome.tabs.sendMessage(tabId, { type: 'TAB_TOGGLED', enabled: newState }).catch(() => {});
    return { tabEnabled: newState };
  }

  async getSettings() { return await this.settingsManager.getAll(); }
  async updateSetting(key, value) { await this.settingsManager.set(key, value); return { success: true }; }
  async resetSettings() { await this.settingsManager.reset(); await this.filterManager.refreshRules(); return { success: true }; }
  async getStats(tabId) { return tabId ? await this.statisticsManager.getTabStats(tabId) : await this.statisticsManager.getGlobalStats(); }
  async getGlobalStats() { return await this.statisticsManager.getGlobalStats(); }
  async resetStats() { await this.statisticsManager.resetGlobalStats(); return { success: true }; }
  async getFilterLists() { return await this.filterListManager.getListStatus(); }
  async toggleFilterList(key, enabled) { const result = await this.filterListManager.setListEnabled(key, enabled); if (result) await this.filterManager.refreshRules(); return { success: result }; }
  async updateFilterLists() { await this.filterListManager.updateAllLists(); await this.filterManager.refreshRules(); return { success: true }; }
  async getAllowlist() { return this.filterManager.getAllowlist(); }
  async addToAllowlist(url, domain) { const rule = await this.filterManager.addToAllowlist(url, domain); return { rule }; }
  async removeFromAllowlist(id) { await this.filterManager.removeFromAllowlist(id); return { success: true }; }
  async getCustomRules() { return this.filterManager.getCustomRules(); }
  async addCustomRule(rule) { const newRule = await this.filterManager.addCustomRule(rule); return { rule: newRule }; }
  async removeCustomRule(id) { await this.filterManager.removeCustomRule(id); return { success: true }; }
  async updateCustomRule(id, updates) { const rule = await this.filterManager.updateCustomRule(id, updates); return { rule }; }
  async getCosmeticFilters() { return await this.filterManager.getCosmeticFilters(); }
  async addCosmeticFilter(filter) { await this.filterManager.addCosmeticFilter(filter); return { success: true }; }
  async removeCosmeticFilter(id) { await this.filterManager.removeCosmeticFilter(id); return { success: true }; }
  async updateCosmeticFilter(id, filter) { const filterStr = filter?.filter || filter; await this.filterManager.removeCosmeticFilter(id); await this.filterManager.addCosmeticFilter(filterStr); return { success: true }; }
  async openPopup() { return { success: true }; }
  async addCustomFilterList(url, name) { const id = await this.filterListManager.addCustomList(url, name); return { id }; }
  async getTabStats(tabId) { return await this.statisticsManager.getTabStats(tabId); }
  async getMatchedRules(tabId) { return await this.filterManager.getMatchedRules(tabId); }
  async exportData() {
    const [rules, stats, settings] = await Promise.all([
      this.filterManager.exportRules(), this.statisticsManager.export(), this.settingsManager.export()
    ]);
    return { version: 1, timestamp: Date.now(), rules, stats, settings };
  }
  async importData(data) {
    if (!data || data.version !== 1) return { error: 'Invalid data format' };
    await Promise.all([this.filterManager.importRules(data.rules), this.settingsManager.import(data.settings)]);
    await this.filterManager.refreshRules();
    return { success: true };
  }
}

const messageHandler = new MessageHandler(filterManager, statisticsManager, filterListManager, settingsManager);

// ============================================
// PRIVACY MODULES INITIALIZATION
// ============================================
let cnameUncloaking = null;
let webrtcProtection = null;
let fingerprintingProtection = null;
let bounceTrackingProtection = null;
let cookieProtection = null;
let httpsUpgrade = null;

async function initializePrivacyModules() {
  // Helper to safely initialize a module with error boundary
  const safeInit = async (name, initFn) => {
    try {
      await initFn();
      console.log(`[AeroGuard] ${name} initialized`);
    } catch (error) {
      console.error(`[AeroGuard] Failed to initialize ${name}:`, error);
    }
  };

  // Initialize CNAME Uncloaking
  await safeInit('CNAME Uncloaking', async () => {
    cnameUncloaking = new CNAMEUncloaking();
    const cnameEnabled = await settingsManager.get('privacy.cnameUncloaking.enabled', true);
    cnameUncloaking.setEnabled(cnameEnabled);
  });

  // Initialize WebRTC Protection
  await safeInit('WebRTC Protection', async () => {
    webrtcProtection = new WebRTCProtection();
    const webrtcEnabled = await settingsManager.get('privacy.webrtcProtection.enabled', false);
    const webrtcBlockAll = await settingsManager.get('privacy.webrtcProtection.blockAll', false);
    webrtcProtection.setEnabled(webrtcEnabled);
    webrtcProtection.setBlockAllWebRTC(webrtcBlockAll);
  });

  // Initialize Fingerprinting Protection
  await safeInit('Fingerprinting Protection', async () => {
    fingerprintingProtection = new FingerprintingProtection();
    const fpEnabled = await settingsManager.get('privacy.fingerprintingProtection.enabled', true);
    fingerprintingProtection.setEnabled(fpEnabled);
    const fpSettings = await settingsManager.get('privacy.fingerprintingProtection', {});
    for (const [key, value] of Object.entries(fpSettings)) {
      if (key !== 'enabled' && fingerprintingProtection.protections.hasOwnProperty(key)) {
        fingerprintingProtection.setProtection(key, value);
      }
    }
  });

  // Initialize Bounce Tracking Protection
  await safeInit('Bounce Tracking Protection', async () => {
    bounceTrackingProtection = new BounceTrackingProtection();
    const btEnabled = await settingsManager.get('privacy.bounceTrackingProtection.enabled', true);
    bounceTrackingProtection.setEnabled(btEnabled);
  });

  // Initialize Cookie Protection
  await safeInit('Cookie Protection', async () => {
    cookieProtection = new CookieProtection();
    const cpEnabled = await settingsManager.get('privacy.cookieProtection.enabled', true);
    const cpBlockThirdParty = await settingsManager.get('privacy.cookieProtection.blockThirdParty', true);
    const cpPartitionCookies = await settingsManager.get('privacy.cookieProtection.partitionCookies', true);
    const cpAutoDelete = await settingsManager.get('privacy.cookieProtection.autoDeleteOnClose', false);
    cookieProtection.setEnabled(cpEnabled);
    cookieProtection.setBlockThirdParty(cpBlockThirdParty);
    cookieProtection.setPartitionCookies(cpPartitionCookies);
    cookieProtection.setAutoDeleteOnClose(cpAutoDelete);
  });

  // Initialize HTTPS Upgrade
  await safeInit('HTTPS Upgrade', async () => {
    httpsUpgrade = new HTTPSUpgrade();

    // Add null check to prevent TypeError
    if (!httpsUpgrade) {
      throw new Error("HTTPSUpgrade failed to instantiate");
    }

    const huEnabled = await settingsManager.get('privacy.httpsUpgrade.enabled', true);
    const huUpgradeNav = await settingsManager.get('privacy.httpsUpgrade.upgradeNavigations', true);
    const huUpgradeSub = await settingsManager.get('privacy.httpsUpgrade.upgradeSubresources', true);
    const huBlockMixed = await settingsManager.get('privacy.httpsUpgrade.blockMixedContent', true);

    // Check if methods exist before calling them
    if (typeof httpsUpgrade.setEnabled === 'function') {
      httpsUpgrade.setEnabled(huEnabled);
    } else {
      console.warn("HTTPSUpgrade.setEnabled is missing");
    }
    if (typeof httpsUpgrade.setUpgradeNavigations === 'function') {
      httpsUpgrade.setUpgradeNavigations(huUpgradeNav);
    } else {
      console.warn("HTTPSUpgrade.setUpgradeNavigations is missing");
    }
    if (typeof httpsUpgrade.setUpgradeSubresources === 'function') {
      httpsUpgrade.setUpgradeSubresources(huUpgradeSub);
    } else {
      console.warn("HTTPSUpgrade.setUpgradeSubresources is missing");
    }
    if (typeof httpsUpgrade.setBlockMixedContent === 'function') {
      httpsUpgrade.setBlockMixedContent(huBlockMixed);
    } else {
      console.warn("HTTPSUpgrade.setBlockMixedContent is missing");
    }
  });

  console.log('[AeroGuard] Privacy modules initialized');
}

// ============================================
// SERVICE WORKER ENTRY POINT
// ============================================
let extensionEnabled = true;

chrome.runtime.onStartup.addListener(initialize);
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onMessage.addListener(handleMessage);
chrome.action.onClicked.addListener(handleActionClick);
chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.tabs.onActivated.addListener(handleTabActivated);
chrome.alarms.onAlarm.addListener(handleAlarm);
chrome.tabs.onRemoved.addListener(handleTabRemoved);
chrome.webNavigation.onBeforeNavigate.addListener(handleWebNavigation);
chrome.cookies.onChanged.addListener(handleCookieChange);

async function initialize(details) {
    console.log('[AeroGuard] Initializing extension...', details?.reason || 'startup');
    try {
      await settingsManager.initialize();
      await settingsManager.migrate();

      extensionEnabled = await settingsManager.get('enabled', true);
      await statisticsManager.initialize();
      await filterListManager.initialize();
      await filterManager.initialize();
      await initializePrivacyModules();

      // Load and parse filter lists on startup - always refresh rules
      // First ensure filter lists are loaded (fetches if needed)
      console.log('[AeroGuard] Loading filter lists...');
      await filterListManager.updateAllLists();
      console.log('[AeroGuard] Filter lists loaded, applying rules...');

      // Now apply all rules
      await filterManager.refreshRules();

      await setupUpdateAlarm();
      await updateAllBadges();

      console.log('[AeroGuard] Initialization complete');

      if (details?.reason === 'install' || details?.reason === 'update') {
        scheduleFilterListUpdate();
      }
    } catch (error) {
      console.error('[AeroGuard] Initialization failed:', error);
    }
  }

async function handleMessage(message, sender, sendResponse) {
  try {
    const response = await messageHandler.handle(message, sender);
    sendResponse(response);
  } catch (error) {
    console.error('[AeroGuard] Message handling error:', error);
    sendResponse({ error: error.message });
  }
  return true;
}

async function handleActionClick(tab) {
  if (!extensionEnabled) { await toggleExtension(); return; }
  const tabEnabled = await settingsManager.getTabEnabled(tab.id);
  await settingsManager.setTabEnabled(tab.id, !tabEnabled);
  await updateTabBadge(tab.id);
  chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_TAB', enabled: !tabEnabled }).catch(() => {});
}

async function handleTabUpdate(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url) {
    await updateTabBadge(tabId);
    chrome.tabs.sendMessage(tabId, {
      type: 'TAB_UPDATED', url: tab.url,
      enabled: extensionEnabled && await settingsManager.getTabEnabled(tabId)
    }).catch(() => {});
  }
}

async function handleTabActivated(activeInfo) { await updateTabBadge(activeInfo.tabId); }

async function handleAlarm(alarm) {
  if (alarm.name === 'filter-list-update') {
    await filterListManager.updateAllLists();
    // updateAllLists already calls refreshRules internally
    scheduleFilterListUpdate();
  } else if (alarm.name === 'stats-update') {
    await updateAllBadges();
  }
}

function setupStatsUpdates() {
  // Removed setInterval in favor of chrome.alarms
}

async function setupUpdateAlarm() {
  const updateInterval = await settingsManager.get('updateInterval', 24);
  await chrome.alarms.create('filter-list-update', { periodInMinutes: updateInterval * 60 });
  await chrome.alarms.create('stats-update', { periodInMinutes: 5 });
}

function scheduleFilterListUpdate() {
  chrome.alarms.create('filter-list-update-once', { delayInMinutes: 5 });
}

// ============================================
// PRIVACY MODULE HANDLERS
// ============================================

async function handleTabRemoved(tabId, removeInfo) {
  // Clear cookies on tab close if enabled
  if (cookieProtection) {
    await cookieProtection.clearTabCookies(tabId);
  }
  // Clear redirect chain
  if (bounceTrackingProtection) {
    bounceTrackingProtection.clearChain(tabId);
  }
  // Clear tab stats
  statisticsManager.resetTabStats(tabId);
}

async function handleWebNavigation(details) {
  const { url, tabId, frameId } = details;
  const isMainFrame = frameId === 0;

  // HTTPS Upgrade
  if (httpsUpgrade && isMainFrame) {
    const result = httpsUpgrade.handleNavigation(details);
    if (result.upgrade) {
      // Redirect to HTTPS
      chrome.tabs.update(tabId, { url: result.upgradedUrl }).catch(() => {});
      return;
    }
  }

  // Bounce Tracking Protection - record redirect
  if (bounceTrackingProtection && isMainFrame) {
    // We'll track this in content script mainly
  }
}

async function handleCookieChange(change) {
  if (cookieProtection) {
    await cookieProtection.handleCookieChange(change);
  }
}

// ============================================
// MESSAGE HANDLER EXTENSIONS FOR PRIVACY
// ============================================

// Extend MessageHandler with privacy methods
const originalHandle = messageHandler.handle.bind(messageHandler);
messageHandler.handle = async function(message, sender) {
  const { type, payload } = message;

  // Privacy module message handlers
  switch (type) {
    case 'GET_CNAME_UNCLOAKING_STATUS':
      return cnameUncloaking ? {
        enabled: cnameUncloaking.enabled,
        trackingDomainsCount: cnameUncloaking.trackingDomains.size,
        cnameAliasesCount: cnameUncloaking.blockedCNAMEs.size
      } : { error: 'CNAME uncloaking not initialized' };

    case 'TOGGLE_CNAME_UNCLOAKING':
      if (cnameUncloaking) {
        const enabled = payload?.enabled !== undefined ? payload.enabled : !cnameUncloaking.enabled;
        cnameUncloaking.setEnabled(enabled);
        await settingsManager.set('privacy.cnameUncloaking.enabled', enabled);
        return { enabled };
      }
      return { error: 'CNAME uncloaking not initialized' };

    case 'GET_WEBRTC_PROTECTION_STATUS':
      return webrtcProtection ? {
        enabled: webrtcProtection.enabled,
        blockAll: webrtcProtection.blockAllWebRTC,
        allowedOrigins: Array.from(webrtcProtection.allowedOrigins),
        blockedAttempts: webrtcProtection.getBlockedAttempts()
      } : { error: 'WebRTC protection not initialized' };

    case 'TOGGLE_WEBRTC_PROTECTION':
      if (webrtcProtection) {
        const enabled = payload?.enabled !== undefined ? payload.enabled : !webrtcProtection.enabled;
        webrtcProtection.setEnabled(enabled);
        await settingsManager.set('privacy.webrtcProtection.enabled', enabled);
        // Update content scripts
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          await webrtcProtection.updatePageSettings(tab.id, webrtcProtection.blockAllWebRTC, enabled);
        }
        return { enabled };
      }
      return { error: 'WebRTC protection not initialized' };

    case 'SET_WEBRTC_BLOCK_ALL':
      if (webrtcProtection) {
        const blockAll = payload?.blockAll !== undefined ? payload.blockAll : !webrtcProtection.blockAllWebRTC;
        webrtcProtection.setBlockAllWebRTC(blockAll);
        await settingsManager.set('privacy.webrtcProtection.blockAll', blockAll);
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          await webrtcProtection.updatePageSettings(tab.id, blockAll, webrtcProtection.enabled);
        }
        return { blockAll };
      }
      return { error: 'WebRTC protection not initialized' };

    case 'GET_FINGERPRINTING_PROTECTION_STATUS':
      return fingerprintingProtection ? {
        enabled: fingerprintingProtection.enabled,
        protections: fingerprintingProtection.getProtectionStatus(),
        blockedAttempts: fingerprintingProtection.getBlockedAttempts()
      } : { error: 'Fingerprinting protection not initialized' };

    case 'TOGGLE_FINGERPRINTING_PROTECTION':
      if (fingerprintingProtection) {
        const enabled = payload?.enabled !== undefined ? payload.enabled : !fingerprintingProtection.enabled;
        fingerprintingProtection.setEnabled(enabled);
        await settingsManager.set('privacy.fingerprintingProtection.enabled', enabled);
        return { enabled };
      }
      return { error: 'Fingerprinting protection not initialized' };

    case 'SET_FINGERPRINTING_PROTECTION':
      if (fingerprintingProtection && payload?.type) {
        fingerprintingProtection.setProtection(payload.type, payload.enabled);
        await settingsManager.set(`privacy.fingerprintingProtection.${payload.type}`, payload.enabled);
        // Update content scripts
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          await fingerprintingProtection.updatePageSettings(tab.id, fingerprintingProtection.protections);
        }
        return { success: true };
      }
      return { error: 'Invalid parameters' };

    case 'GET_BOUNCE_TRACKING_PROTECTION_STATUS':
      return bounceTrackingProtection ? {
        enabled: bounceTrackingProtection.enabled,
        trackingDomains: Array.from(bounceTrackingProtection.trackingDomains),
        blockedRedirects: bounceTrackingProtection.getBlockedRedirects()
      } : { error: 'Bounce tracking protection not initialized' };

    case 'TOGGLE_BOUNCE_TRACKING_PROTECTION':
      if (bounceTrackingProtection) {
        const enabled = payload?.enabled !== undefined ? payload.enabled : !bounceTrackingProtection.enabled;
        bounceTrackingProtection.setEnabled(enabled);
        await settingsManager.set('privacy.bounceTrackingProtection.enabled', enabled);
        return { enabled };
      }
      return { error: 'Bounce tracking protection not initialized' };

    case 'GET_COOKIE_PROTECTION_STATUS':
      return cookieProtection ? {
        enabled: cookieProtection.enabled,
        blockThirdParty: cookieProtection.blockThirdParty,
        partitionCookies: cookieProtection.partitionCookies,
        autoDeleteOnClose: cookieProtection.autoDeleteOnClose,
        allowedDomains: Array.from(cookieProtection.allowedDomains),
        blockedCookies: cookieProtection.getBlockedCookies(),
        settings: cookieProtection.getSettings()
      } : { error: 'Cookie protection not initialized' };

    case 'TOGGLE_COOKIE_PROTECTION':
      if (cookieProtection) {
        const enabled = payload?.enabled !== undefined ? payload.enabled : !cookieProtection.enabled;
        cookieProtection.setEnabled(enabled);
        await settingsManager.set('privacy.cookieProtection.enabled', enabled);
        return { enabled };
      }
      return { error: 'Cookie protection not initialized' };

    case 'SET_COOKIE_PROTECTION_OPTION':
      if (cookieProtection && payload?.option !== undefined) {
        switch (payload.option) {
          case 'blockThirdParty':
            cookieProtection.setBlockThirdParty(payload.value);
            await settingsManager.set('privacy.cookieProtection.blockThirdParty', payload.value);
            break;
          case 'partitionCookies':
            cookieProtection.setPartitionCookies(payload.value);
            await settingsManager.set('privacy.cookieProtection.partitionCookies', payload.value);
            break;
          case 'autoDeleteOnClose':
            cookieProtection.setAutoDeleteOnClose(payload.value);
            await settingsManager.set('privacy.cookieProtection.autoDeleteOnClose', payload.value);
            break;
        }
        // Update content scripts
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          await cookieProtection.updateContentScriptConfig(tab.id, cookieProtection.getSettings());
        }
        return { success: true };
      }
      return { error: 'Invalid parameters' };

    case 'GET_HTTPS_UPGRADE_STATUS':
      return httpsUpgrade ? {
        enabled: httpsUpgrade.enabled,
        upgradeNavigations: httpsUpgrade.upgradeNavigations,
        upgradeSubresources: httpsUpgrade.upgradeSubresources,
        blockMixedContent: httpsUpgrade.blockMixedContent,
        hstsDomainsCount: httpsUpgrade.hstsPreloadList.size,
        customRulesCount: httpsUpgrade.customRules.size,
        upgradedRequests: httpsUpgrade.getUpgradedRequests(),
        failedUpgrades: httpsUpgrade.getFailedUpgrades(),
        settings: httpsUpgrade.getSettings()
      } : { error: 'HTTPS upgrade not initialized' };

    case 'TOGGLE_HTTPS_UPGRADE':
      if (httpsUpgrade) {
        const enabled = payload?.enabled !== undefined ? payload.enabled : !httpsUpgrade.enabled;
        httpsUpgrade.setEnabled(enabled);
        await settingsManager.set('privacy.httpsUpgrade.enabled', enabled);
        return { enabled };
      }
      return { error: 'HTTPS upgrade not initialized' };

    case 'SET_HTTPS_UPGRADE_OPTION':
      if (httpsUpgrade && payload?.option !== undefined) {
        switch (payload.option) {
          case 'upgradeNavigations':
            httpsUpgrade.setUpgradeNavigations(payload.value);
            await settingsManager.set('privacy.httpsUpgrade.upgradeNavigations', payload.value);
            break;
          case 'upgradeSubresources':
            httpsUpgrade.setUpgradeSubresources(payload.value);
            await settingsManager.set('privacy.httpsUpgrade.upgradeSubresources', payload.value);
            break;
          case 'blockMixedContent':
            httpsUpgrade.setBlockMixedContent(payload.value);
            await settingsManager.set('privacy.httpsUpgrade.blockMixedContent', payload.value);
            break;
        }
        // Update content scripts
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          await httpsUpgrade.updateContentScriptConfig(tab.id, httpsUpgrade.getSettings());
        }
        return { success: true };
      }
      return { error: 'Invalid parameters' };

    case 'WEB_RTC_BLOCKED':
      if (webrtcProtection && payload?.attempt) {
        webrtcProtection.handleAttempt(sender.tab?.id, payload.attempt);
      }
      return { success: true };

    case 'FINGERPRINTING_BLOCKED':
      if (fingerprintingProtection && payload?.attempt) {
        fingerprintingProtection.handleAttempt(sender.tab?.id, payload.attempt);
      }
      return { success: true };

    case 'BOUNCE_TRACKING_BLOCKED':
      if (bounceTrackingProtection && payload?.attempt) {
        bounceTrackingProtection.handleBlockedRedirect(
          sender.tab?.id,
          payload.attempt.details?.original || '',
          payload.attempt.details?.cleaned || '',
          payload.attempt.type
        );
      }
      return { success: true };

    case 'COOKIE_PROTECTION_BLOCKED':
      if (cookieProtection && payload?.attempt) {
        cookieProtection.blockCookieAttempt(
          sender.tab?.id,
          { name: payload.attempt.details?.key },
          sender.tab?.url ? new URL(sender.tab.url).hostname : '',
          payload.attempt.type
        );
      }
      return { success: true };

    case 'HTTPS_UPGRADE_EVENT':
      if (httpsUpgrade && payload?.attempt) {
        httpsUpgrade.recordUpgrade(
          payload.attempt.details?.original || '',
          payload.attempt.details?.upgraded || '',
          payload.attempt.type,
          sender.tab?.id,
          payload.attempt.details?.success !== false
        );
      }
      return { success: true };

    case 'ADD_COSMETIC_FILTER':
      // Add cosmetic filter from popup/element picker
      return await this.addCosmeticFilter(payload?.filter);

    case 'SAVE_COSMETIC_FILTER':
      // Save cosmetic filter from element picker
      return await this.addCosmeticFilter(payload?.filter);

    case 'INJECT_PRIVACY_SCRIPTS':
      // Inject all privacy content scripts into a tab
      if (payload?.tabId) {
        if (webrtcProtection) webrtcProtection.injectProtection(payload.tabId);
        if (fingerprintingProtection) fingerprintingProtection.injectProtection(payload.tabId);
        if (bounceTrackingProtection) bounceTrackingProtection.injectContentScript(payload.tabId);
        if (cookieProtection) cookieProtection.injectContentScript(payload.tabId);
        if (httpsUpgrade) httpsUpgrade.injectContentScript(payload.tabId);
        return { success: true };
      }
      return { error: 'Tab ID required' };

    default:
      return originalHandle(message, sender);
  }
};

async function updateAllBadges() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab => updateTabBadge(tab.id)));
}

async function updateTabBadge(tabId) {
  if (!extensionEnabled) {
    await chrome.action.setBadgeText({ text: 'OFF', tabId });
    await chrome.action.setBadgeBackgroundColor({ color: '#999', tabId });
    return;
  }
  const tabEnabled = await settingsManager.getTabEnabled(tabId);
  if (!tabEnabled) {
    await chrome.action.setBadgeText({ text: 'OFF', tabId });
    await chrome.action.setBadgeBackgroundColor({ color: '#999', tabId });
    return;
  }
  const stats = await statisticsManager.getTabStats(tabId);
  const count = stats?.blockedCount ?? 0;
  if (count > 0) {
    await chrome.action.setBadgeText({ text: count > 999 ? '999+' : count.toString(), tabId });
    await chrome.action.setBadgeBackgroundColor({ color: count > 50 ? '#e74c3c' : '#3498db', tabId });
  } else {
    await chrome.action.setBadgeText({ text: '', tabId });
  }
}

async function toggleExtension() {
  extensionEnabled = !extensionEnabled;
  await settingsManager.set('enabled', extensionEnabled);
  if (extensionEnabled) await filterManager.enableRules(); else await filterManager.disableRules();
  await updateAllBadges();
  const tabs = await chrome.tabs.query({});
  tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'EXTENSION_TOGGLED', enabled: extensionEnabled }).catch(() => {}));
  chrome.runtime.sendMessage({ type: 'EXTENSION_TOGGLED', enabled: extensionEnabled }).catch(() => {});
  return { enabled: extensionEnabled };
}

console.log('[AeroGuard] Service worker loaded');
