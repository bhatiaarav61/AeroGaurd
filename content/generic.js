// content/generic.js — Generic site protection
(() => {
  'use strict';

  const SAFE_SELECTORS = [
    // Ad iframes only
    'iframe[src*="googleads.g.doubleclick.net/pagead/ads"]',
    'iframe[src*="pubads.g.doubleclick.net/gampad/ads"]',
    'iframe[src*="pagead2.googlesyndication.com/pagead/ads"]',
    'iframe[src*="/ads?"]', 'iframe[src*="adformat="]', 'iframe[src*="ad_type="]',
    'iframe[src*="imasdk"]', 'iframe[src*="googleadservices.com"]',

    // Explicit containers
    '#google_ads_div_', '#div-gpt-ad-', '#adslot_', '.adsbygoogle',

    // Taboola/Outbrain
    '.trc_rbox_div', '.trc_rbox_container', '#outbrain_widget_', '.ob_widget',

    // Cookie banners
    '.cookie-banner', '.cookie-consent', '#cookie-banner', '#cookie-consent',
    '.consent-banner', '#consent-banner', '.gdpr-banner', '#onetrust-banner-sdk',
    '.osano-cm-dialog', '.ot-sdk-container', '.cmplz-cookiebanner', '.borlabs-cookie-box'
  ];

  function isVisible(el) {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && el.offsetWidth > 0 && el.offsetHeight > 0;
  }

  function hide(el) {
    if (el._blocked) return;
    el._blocked = true;
    el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;contain:layout size style paint!important';
  }

  function hideAds() {
    let count = 0;
    for (const sel of SAFE_SELECTORS) {
      try {
        document.querySelectorAll(sel).forEach(el => { if (!el._blocked && isVisible(el)) { hide(el); count++; } });
      } catch {}
    }
    if (count) console.log('[AG] Hidden', count, 'ads');
  }

  // Anti-adblock
  function antiAdblock() {
    ['adblockDetected','adBlockDetected','detectAdblock','detectAdBlock','isAdblockActive','isAdBlockActive','adblockEnabled','adBlockEnabled'].forEach(n => { if (window[n]) window[n] = () => false; });
    ['adblock','adBlock','adblocker','adBlocker','uBlock','uBlockOrigin','adguard','AdGuard'].forEach(p => { try { Object.defineProperty(window, p, { value: undefined, writable: true, configurable: true }); } catch {} });
    ['script[src*="adblock"]','script[src*="anti-adblock"]','script[src*="pagefair"]','script[src*="admiral"]'].forEach(s => document.querySelectorAll(s).forEach(el => el.remove()));
  }

  function emergencyUnblock() {
    ['main','#main','#content','.main','.content','article','[role="main"]'].forEach(s =>
      document.querySelectorAll(s).forEach(el => { if (el._blocked) { el._blocked = false; el.style.cssText = ''; } })
    );
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  function init() {
    hideAds();
    antiAdblock();
    emergencyUnblock();

    const mo = new MutationObserver(muts => {
      let check = false;
      for (const m of muts) if (m.type === 'childList' && m.addedNodes.length) {
        for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.(SAFE_SELECTORS.join(',')) || n.querySelector?.(SAFE_SELECTORS.join(',')))) { check = true; break; }
      }
      if (check) { clearTimeout(mo._deb); mo._deb = setTimeout(() => { hideAds(); emergencyUnblock(); }, 200); }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    setInterval(() => { hideAds(); emergencyUnblock(); }, 2000);
    console.log('[AG] Generic ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'EMERGENCY_UNBLOCK' || msg.type === 'RULES_UPDATED') { emergencyUnblock(); hideAds(); sendResponse({ success: true }); }
  });
})();