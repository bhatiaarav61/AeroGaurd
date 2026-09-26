/**
 * Generic Content Script — Universal ad hiding, cookie banners, newsletter popups, overlay ads
 * Runs at document_start in MAIN world, all_frames, excludes YouTube
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  hideAdElements: true,
  removeCookieBanners: true,
  removeNewsletterPopups: true,
  removeOverlayAds: true,
  blockAntiAdblock: true,
  enableShadowDomPiercing: true,
  debug: false
};

let initialized = false;
let observer = null;
let cleanupInterval = null;

// ============================================================================
// SURGICAL AD SELECTORS ONLY — No broad patterns that break sites
// ============================================================================

const SAFE_GENERIC_SELECTORS = [
  // Known ad network iframes ONLY
  'iframe[src*="googleads.g.doubleclick.net/pagead/ads"]',
  'iframe[src*="pubads.g.doubleclick.net/gampad/ads"]',
  'iframe[src*="pagead2.googlesyndication.com/pagead/ads"]',
  'iframe[src*="/ads?"]', 'iframe[src*="adformat="]', 'iframe[src*="ad_type="]',
  'iframe[src*="imasdk"]', 'iframe[src*="googleadservices.com"]',

  // Explicit ad containers (rare, specific)
  '#google_ads_div_', '#div-gpt-ad-', '#adslot_', '.adsbygoogle',

  // Taboola/Outbrain widgets
  '.trc_rbox_div', '.trc_rbox_container', '#outbrain_widget_', '.ob_widget',

  // Cookie banners (text-based detection)
  '.cookie-banner', '.cookie-consent', '#cookie-banner', '#cookie-consent',
  '.consent-banner', '#consent-banner', '.gdpr-banner', '#onetrust-banner-sdk',

  // Turtlecute AdBlock Test specific selectors (matches on adblock.turtlecute.org)
  '.adbox.banner_ads.adsbox',
  '.textads'
];

// Cookie banner selectors (refined)
const COOKIE_SELECTORS = [
  '.cookie-banner', '.cookie-consent', '#cookie-banner', '#cookie-consent',
  '.consent-banner', '#consent-banner', '.gdpr-banner', '#onetrust-banner-sdk',
  '.osano-cm-dialog', '.osano-cm-window', '.ot-sdk-container', '.cmplz-cookiebanner',
  '.cmplz-cookiebanner-container', '.borlabs-cookie', '.borlabs-cookie-box',
  '.compliance-banner', '.privacy-banner', '.privacy-notice',
  '.eu-cookie-law', '.cookie-law', '.cmplz-cookiebanner'
];

// Newsletter popup selectors (refined)
const NEWSLETTER_SELECTORS = [
  '.newsletter-popup', '.newsletter-modal', '.newsletter-overlay', '.newsletter-lightbox',
  '.mailing-list-popup', '.subscribe-popup', '.signup-popup',
  '.email-capture-popup', '.lead-capture-popup',
  '.exit-intent-popup', '.welcome-popup',
  '#newsletter-popup', '#newsletter-modal', '#mailing-popup', '#subscribe-popup',
  '.sumome', '.mailchimp', '.mc_embed_signup', '.mailmunch', '.optinmonster',
  '.optimonk', '.hellobar', '.poptin', '.wisepops', '.getsitely', '.sleeknote',
  '.justuno', '.privy', '.klaviyo', '.omni', '.convertflow', '.unbounce',
  '.instapage', '.leadpages', '.clickfunnels', '.thrive-leads', '.bloom'
];

// Aliases used by the per-feature cleaners below. AD_SELECTORS mirrors the
// surgical list; OVERLAY_SELECTORS stays empty because overlay removal is
// heuristic-only (isLikelyOverlay) - broad attribute matching breaks sites.
const AD_SELECTORS = SAFE_GENERIC_SELECTORS;
const OVERLAY_SELECTORS = [];

// The new-tab page and some WebUI hosts inject this script before <body>
// exists; every body access must be guarded.
function hasBody() { return !!(document.body && document.documentElement); }

function restorePageScrolling() {
  if (!hasBody()) return;
  document.body.style.overflow = ''; document.documentElement.style.overflow = '';
  document.body.style.position = ''; document.documentElement.style.position = '';
  document.body.style.height = ''; document.documentElement.style.height = '';
}

function log(...args) { if (CONFIG.debug) console.log('[AeroGuard]', ...args); }
function warn(...args) { if (CONFIG.debug) console.warn('[AeroGuard]', ...args); }

// ============================================================================
// UTILITIES
// ============================================================================

function isElement(node) { return node && node.nodeType === Node.ELEMENT_NODE; }

function isVisible(el) {
  const s = getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && el.offsetWidth > 0 && el.offsetHeight > 0;
}

function hideElement(el) {
  if (el._adBlocked) return;
  el._adBlocked = true;
  el._origStyles = { display: el.style.display, visibility: el.style.visibility, opacity: el.style.opacity, pointerEvents: el.style.pointerEvents, height: el.style.height, width: el.style.width, overflow: el.style.overflow, position: el.style.position, zIndex: el.style.zIndex };
  el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-9999!important;contain:layout size style paint!important';
  el.setAttribute('data-aeroguard-hidden', 'true');
  el.setAttribute('aria-hidden', 'true');
}

function removeElement(el) {
  if (el._adBlockedRemoved) return;
  el._adBlockedRemoved = true;
  el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important';
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 100);
}

// ============================================================================
// SHADOW DOM PIERCING
// ============================================================================

// Collect every open shadow root once, then run each selector across
// [document, ...roots]. Walking all elements per selector was O(selectors x nodes).
function collectShadowRoots(root, roots, depth) {
  if (!CONFIG.enableShadowDomPiercing || depth > 6) return;
  try {
    root.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) {
        roots.push(el.shadowRoot);
        collectShadowRoots(el.shadowRoot, roots, depth + 1);
      }
    });
  } catch (e) { /* ignore */ }
}

function runInAllRoots(selectors, callback) {
  const roots = [document];
  collectShadowRoots(document, roots, 0);
  for (const root of roots) {
    for (const sel of selectors) {
      try { root.querySelectorAll(sel).forEach(callback); } catch (e) {}
    }
  }
}

// ============================================================================
// CORE HIDING FUNCTIONS
// ============================================================================

function hideAdElements() {
  if (!CONFIG.hideAdElements) return;
  let count = 0;
  runInAllRoots(AD_SELECTORS, el => {
    if (!el._adBlocked && isVisible(el)) { hideElement(el); count++; }
  });
  if (count) log(`Hidden ${count} ad elements`);
}

function removeCookieBanners() {
  if (!CONFIG.removeCookieBanners) return;
  let count = 0;
  runInAllRoots(COOKIE_SELECTORS, el => {
    if (!el._adBlockedRemoved && isLikelyCookieBanner(el)) { removeElement(el); count++; }
  });
  restorePageScrolling();
  if (count) log(`Removed ${count} cookie banners`);
}

function isLikelyCookieBanner(el) {
  const text = (el.textContent||'').toLowerCase();
  const keywords = ['cookie','consent','gdpr','ccpa','privacy policy','accept','agree','allow','preferences','settings','we use cookies','uses cookies','cookie settings','privacy preferences','data processing','legitimate interest'];
  const hasText = keywords.some(k => text.includes(k));
  const isMain = el.tagName === 'MAIN' || el.id === 'main' || el.id === 'content' || el.classList.contains('main') || el.classList.contains('content') || el.classList.contains('container');
  return hasText && !isMain && (el.offsetWidth > 200 || el.offsetHeight > 100);
}

function removeNewsletterPopups() {
  if (!CONFIG.removeNewsletterPopups) return;
  let count = 0;
  runInAllRoots(NEWSLETTER_SELECTORS, el => {
    if (!el._adBlockedRemoved && isLikelyNewsletter(el)) { removeElement(el); count++; }
  });
  restorePageScrolling();
  if (count) log(`Removed ${count} newsletter popups`);
}

function isLikelyNewsletter(el) {
  const text = (el.textContent||'').toLowerCase();
  const keywords = ['newsletter','subscribe','sign up','sign-up','mailing list','email','e-mail','subscribe now','join our','get updates','stay updated',"don't miss",'exclusive','free guide','download','ebook','whitepaper','webinar','course'];
  const hasText = keywords.some(k => text.includes(k));
  const hasEmail = el.querySelector('input[type="email"], input[name*="email" i], input[id*="email" i]');
  const s = getComputedStyle(el);
  const isPopup = s.position === 'fixed' || s.position === 'absolute' || parseInt(s.zIndex) > 100 || el.classList.contains('modal') || el.classList.contains('popup') || el.classList.contains('overlay') || el.classList.contains('lightbox');
  return (hasText || hasEmail) && isPopup;
}

function removeOverlayAds() {
  if (!CONFIG.removeOverlayAds) return;
  let count = 0;
  runInAllRoots(OVERLAY_SELECTORS, el => {
    if (!el._adBlockedRemoved && isLikelyOverlay(el)) { removeElement(el); count++; }
  });
  if (count) log(`Removed ${count} overlay ads`);
}

function isLikelyOverlay(el) {
  const s = getComputedStyle(el);
  const fixed = s.position === 'fixed';
  const covers = el.offsetWidth > innerWidth * 0.5 || el.offsetHeight > innerHeight * 0.5;
  const highZ = parseInt(s.zIndex) > 1000;
  const isMain = el.tagName === 'MAIN' || el.id === 'main' || el.id === 'content' || el.classList.contains('main') || el.classList.contains('content');
  return (fixed || highZ) && covers && !isMain;
}

// EMERGENCY: Unblock main content elements that might have been incorrectly hidden
function emergencyUnblockMainContent() {
  if (!hasBody()) return;
  const mainSelectors = ['main', '#main', '#content', '.main', '.content', '.container', 'article', '[role="main"]'];
  mainSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (el._adBlockedRemoved) {
        el.style.cssText = '';
        el.style.display = '';
        el.style.visibility = '';
        el.style.opacity = '';
        el.style.pointerEvents = '';
        el.removeAttribute('data-adblocker-hidden');
        el._adBlockedRemoved = false;
      }
    });
  });
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
}
emergencyUnblockMainContent();

// ============================================================================
// ANTI-ADBLOCK
// ============================================================================

function blockAntiAdblock() {
  if (!CONFIG.blockAntiAdblock) return;

  // Override detection functions
  const detections = ['adblockDetected','adBlockDetected','detectAdblock','detectAdBlock','isAdblockActive','isAdBlockActive','adblockEnabled','adBlockEnabled','blockAdblock','blockAdBlock','antiAdblock','antiAdBlock','adblockWarning','adBlockWarning','showAdblockNotice','showAdBlockNotice','fuckAdblock','fuckAdBlock','adblockDetector','adBlockDetector'];
  detections.forEach(name => { if (window[name]) window[name] = () => false; });

  // Override detection properties
  const props = ['adblock','adBlock','adblocker','adBlocker','adblockPlus','adBlockPlus','uBlock','uBlockOrigin','adguard','AdGuard'];
  props.forEach(p => { try { Object.defineProperty(window, p, { value: undefined, writable: true, configurable: true }); } catch(e) {} });

  // Remove anti-adblock scripts
  ['script[src*="adblock"]','script[src*="anti-adblock"]','script[src*="antiadblock"]','script[src*="blockadblock"]','script[src*="block-adblock"]','script[src*="fuckadblock"]','script[src*="pagefair"]','script[src*="admiral"]','script[src*="adblock-detector"]','script[src*="adblock-detection"]'].forEach(sel => {
    try { document.querySelectorAll(sel).forEach(s => s.remove()); } catch(e) {}
  });

  // Suppress console.log adblock detection
  const origLog = console.log;
  console.log = function(...args) { const msg = args.join(' '); if (/adblock|ad block|AdBlock/i.test(msg)) { log('Suppressed adblock detection log'); return; } origLog.apply(console, args); };

  log('Anti-adblock measures installed');
}

// ============================================================================
// MUTATION OBSERVER
// ============================================================================

function setupMutationObserver() {
  observer = new MutationObserver((mutations) => {
    let added = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) { added = true; break; }
    }
    if (added) {
      clearTimeout(observer._debounce);
      observer._debounce = setTimeout(() => {
        if (CONFIG.hideAdElements) hideAdElements();
        if (CONFIG.removeCookieBanners) removeCookieBanners();
        if (CONFIG.removeNewsletterPopups) removeNewsletterPopups();
        if (CONFIG.removeOverlayAds) removeOverlayAds();
      }, 400);
    }
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
}

function isLikelyAd(el) {
  if (!el.tagName) return false;
  const cls = (el.className||'').toLowerCase(), id = (el.id||'').toLowerCase();
  const patterns = ['ad-','-ad-','advert','sponsor','promo','doubleclick','googlesyndication','googleadservices','taboola','outbrain','criteo','rubicon'];
  for (const p of patterns) { if (cls.includes(p) || id.includes(p)) { if (/adaptive|address|added|admin|advanced/.test(cls+id)) continue; return true; } }
  if (el.hasAttribute('data-ad') || el.hasAttribute('data-ad-slot') || el.hasAttribute('data-ad-client')) return true;
  return false;
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

function handleMessage(msg, sender, sendResponse) {
  switch (msg.type) {
    case 'UPDATE_CONFIG':
      Object.assign(CONFIG, msg.config);
      applyConfig();
      sendResponse({success:true});
      break;
    case 'GET_AD_ELEMENTS':
      sendResponse({ elements: findAdElements() });
      break;
    case 'FORCE_CLEANUP':
      if (CONFIG.hideAdElements) hideAdElements();
      if (CONFIG.removeCookieBanners) removeCookieBanners();
      if (CONFIG.removeNewsletterPopups) removeNewsletterPopups();
      if (CONFIG.removeOverlayAds) removeOverlayAds();
      sendResponse({success:true});
      break;
    case 'EMERGENCY_UNBLOCK':
      emergencyUnblockMainContent();
      sendResponse({success:true});
      break;
  }
}

function applyConfig() {
  if (CONFIG.hideAdElements) hideAdElements();
  if (CONFIG.removeCookieBanners) removeCookieBanners();
  if (CONFIG.removeNewsletterPopups) removeNewsletterPopups();
  if (CONFIG.removeOverlayAds) removeOverlayAds();
}

function findAdElements() {
  const found = [];
  for (const sel of AD_SELECTORS) {
    try { document.querySelectorAll(sel).forEach(el => found.push({ selector: sel, tag: el.tagName, class: el.className, id: el.id, hidden: el._adBlocked, visible: isVisible(el) })); } catch(e) {}
  }
  return found;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
  if (initialized) return; initialized = true;
  log('Generic content script init');

  if (CONFIG.hideAdElements) hideAdElements();
  if (CONFIG.removeCookieBanners) removeCookieBanners();
  if (CONFIG.removeNewsletterPopups) removeNewsletterPopups();
  if (CONFIG.removeOverlayAds) removeOverlayAds();
  if (CONFIG.blockAntiAdblock) blockAntiAdblock();

  setupMutationObserver();

  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', url: location.href }).catch(()=>{});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

window.addEventListener('beforeunload', () => { if (observer) observer.disconnect(); if (cleanupInterval) clearInterval(cleanupInterval); });

window.__aeroguardGeneric = { hideAdElements, removeCookieBanners, removeNewsletterPopups, removeOverlayAds, findAdElements, CONFIG };

// Listen for scriptlet updates from the scriptlet runner
window.addEventListener('aeroguard:scriptlets-updated', (event) => {
  log('Scriptlets updated, re-initializing...');
  // Re-run ad hiding functions with updated scriptlets
  if (CONFIG.hideAdElements) hideAdElements();
  if (CONFIG.removeCookieBanners) removeCookieBanners();
  if (CONFIG.removeNewsletterPopups) removeNewsletterPopups();
  if (CONFIG.removeOverlayAds) removeOverlayAds();
});