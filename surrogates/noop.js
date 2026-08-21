/**
 * Universal No-Op Surrogate
 * Provides fake implementations for commonly blocked tracking/analytics scripts
 * Prevents site breakage when scripts are blocked by DNR rules
 */

// Google Analytics (ga.js / analytics.js)
window.ga = window.ga || function () {
  (window.ga.q = window.ga.q || []).push(arguments);
};
window.ga.l = +new Date();

// Google Tag Manager / gtag.js
window.gtag = window.gtag || function () {
  (window.gtag.q = window.gtag.q || []).push(arguments);
};
window.gtag.l = +new Date();

// Google Ads Conversion Tracking
window.google_trackConversion = window.google_trackConversion || function () {};
window.google_ads_conversion = window.google_ads_conversion || function () {};

// Facebook Pixel
window.fbq = window.fbq || function () {
  (window.fbq.q = window.fbq.q || []).push(arguments);
};
window._fbq = window._fbq || window.fbq;

// Google Ads / DoubleClick
window.googletag = window.googletag || {
  cmd: { push: (fn) => { try { fn(); } catch (e) {} } },
  pubads: () => ({
    setTargeting: () => {},
    enableSingleRequest: () => {},
    collapseEmptyDivs: () => {},
    refresh: () => {},
    addEventListener: () => {},
    setPrivacySettings: () => {},
    setCentering: () => {},
    setForceSafeFrame: () => {}
  }),
  defineSlot: () => ({
    addService: () => {},
    setTargeting: () => {},
    setCollapseEmptyDiv: () => {},
    defineSizeMapping: () => ({ build: () => ({ get: () => [] }) })
  }),
  enableServices: () => {},
  sizeMapping: () => ({ addSize: () => {}, build: () => ({ get: () => [] }) }),
  pubadsReady: false,
  version: '20240101'
};

// Amazon A9
window.amazon_ads = window.amazon_ads || { push: () => {} };
window.aax_getad_mpb = window.aax_getad_mpb || (() => {});

// Prebid.js
window.pbjs = window.pbjs || {
  addAdUnits: () => {},
  requestBids: () => {},
  setTargetingForGPTAsync: () => {},
  enableAnalytics: () => {},
  bidderSettings: {},
  adUnits: [],
  getBidResponses: () => ({}),
  getHighestCpmBids: () => [],
  getAllWinningBids: () => []
};

// Common ad network stubs
window._adblockDetected = false;
window._adBlockerDetected = false;
window.adBlockDetected = false;
window.adblock = { detected: false };
window.adBlocker = { detected: false };
window.isAdBlockEnabled = false;
window.hasAdBlock = false;
window.canRunAds = true;
window.isAdBlocked = false;

// Anti-adblock library stubs
window.BlockAdBlock = function () {
  this.check = () => {};
  this.onDetected = () => this;
  this.onNotDetected = (cb) => { try { cb(); } catch (e) {}; return this; };
  this.setOption = () => this;
};
window.FuckAdBlock = function () {
  this.check = () => {};
  this.onDetected = () => this;
  this.onNotDetected = (cb) => { try { cb(); } catch (e) {}; return this; };
  this.setOption = () => this;
};

// Adobe Analytics
window.s = window.s || {
  t: () => {}, tl: () => {}, track: () => {}, trackLink: () => {},
  getQueryParam: () => '', getPercentPageViewed: () => 0
};

// Mixpanel
window.mixpanel = window.mixpanel || {
  track: () => {}, identify: () => {}, alias: () => {},
  register: () => {}, people: { set: () => {}, track_charge: () => {} }
};

// Segment / Analytics.js
window.analytics = window.analytics || {
  track: () => {}, page: () => {}, identify: () => {},
  group: () => {}, alias: () => {}, ready: (fn) => fn()
};

// Hotjar
window.hj = window.hj || function () {
  (window.hj.q = window.hj.q || []).push(arguments);
};
window._hjSettings = window._hjSettings || {};

// Crazy Egg
window.CE2 = window.CE2 || { track: () => {} };

// Matomo / Piwik
window._paq = window._paq || [];
window.Piwik = window.Piwik || { getTracker: () => ({ trackPageView: () => {} }) };

// Chartbeat
window._cbq = window._cbq || [];
window.CHARTBEAT = window.CHARTBEAT || {};

// Quantcast
window._qevents = window._qevents || [];

// ScorecardResearch
window._comscore = window._comscore || [];

// Twitter Universal Website Tag
window.twq = window.twq || function () {
  (window.twq.q = window.twq.q || []).push(arguments);
};

// Pinterest Tag
window.pintrk = window.pintrk || function () {
  (window.pintrk.q = window.pintrk.q || []).push(arguments);
};

// Snapchat Pixel
window.snaptr = window.snaptr || function () {
  (window.snaptr.q = window.snaptr.q || []).push(arguments);
};

// TikTok Pixel
window.ttq = window.ttq || {
  track: () => {}, page: () => {}, identify: () => {}
};

// Reddit Pixel
window.rdt = window.rdt || function () {
  (window.rdt.q = window.rdt.q || []).push(arguments);
};

// LinkedIn Insight Tag
window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
window.lintrk = window.lintrk || function () {
  (window.lintrk.q = window.lintrk.q || []).push(arguments);
};

// Microsoft Clarity
window.clarity = window.clarity || function () {
  (window.clarity.q = window.clarity.q || []).push(arguments);
};

// Yandex Metrica
window.ym = window.ym || function () {
  (window.ym.q = window.ym.q || []).push(arguments);
};

// Baidu Analytics
window._hmt = window._hmt || [];

console.log('[AeroGuard] Universal no-op surrogate loaded');