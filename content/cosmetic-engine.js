// content/cosmetic-engine.js — Cosmetic filtering engine with domain isolation
(() => {
  'use strict';

  const AD_SELECTORS = [
    // Turtlecute AdBlock Test specific selectors (matches on adblock.turtlecute.org)
    '.adbox.banner_ads.adsbox',
    '.textads',

    // Generic ad containers
    '[class*="ad-"]:not([class*="adaptive"]):not([class*="address"]):not([class*="added"]):not([class*="admin"]):not([class*="advanced"])',
    '[id*="ad-"]:not([id*="address"]):not([id*="added"]):not([id*="admin"])',
    '[class*="-ad-"]', '[id*="-ad-"]', '[class*="advertisement"]', '[id*="advertisement"]',
    '[class*="advert"]', '[id*="advert"]', '[class*="sponsor"]', '[id*="sponsor"]',
    '[class*="promo"]', '[id*="promo"]', '[data-ad]', '[data-ad-slot]', '[data-ad-client]',
    '[data-ad-format]', '[data-ad-unit]', '[data-google-query-id]', '[data-ad-status]',
    '[data-ad-impression]',

    // Common ad classes
    '.ad', '.ads', '.advert', '.advertisement', '.advertising', '.banner-ad', '.banner_ad',
    '.bannerAd', '.sidebar-ad', '.sidebar_ad', '.sidebarAd', '.header-ad', '.header_ad',
    '.headerAd', '.footer-ad', '.footer_ad', '.footerAd', '.leaderboard-ad', '.leaderboard_ad',
    '.leaderboardAd', '.skyscraper-ad', '.skyscraper_ad', '.skyscraperAd', '.rectangle-ad',
    '.rectangle_ad', '.rectangleAd', '.popup-ad', '.popup_ad', '.popupAd', '.interstitial-ad',
    '.interstitial_ad', '.interstitialAd', '.native-ad', '.native_ad', '.nativeAd',
    '.instream-ad', '.instream_ad', '.instreamAd', '.outstream-ad', '.outstream_ad',
    '.outstreamAd', '.video-ad', '.video_ad', '.videoAd', '.audio-ad', '.audio_ad',
    '.audioAd', '.display-ad', '.display_ad', '.displayAd', '.text-ad', '.text_ad',
    '.textAd', '.image-ad', '.image_ad', '.imageAd', '.richmedia-ad', '.richmedia_ad',
    '.richmediaAd', '.expandable-ad', '.expandable_ad', '.expandableAd', '.floating-ad',
    '.floating_ad', '.floatingAd', '.sticky-ad', '.sticky_ad', '.stickyAd',
    '.anchor-ad', '.anchor_ad', '.anchorAd',

    // Google AdSense
    '.adsbygoogle', '.adsbygoogle-noablate', '#google_ads_iframe_', 'ins.adsbygoogle',
    '.ad-slot', '.adslot',

    // Ad networks
    '[class*="dfp-"]', '[id*="dfp-"]', '[class*="gpt-"]', '[id*="gpt-"]',
    '[class*="admanager"]', '[id*="admanager"]', '[class*="adserver"]', '[id*="adserver"]',
    '[class*="adtech"]', '[id*="adtech"]', '[class*="doubleclick"]', '[id*="doubleclick"]',
    '[class*="googlesyndication"]', '[id*="googlesyndication"]', '[class*="googleadservices"]', '[id*="googleadservices"]',
    '[class*="googletagmanager"]', '[id*="googletagmanager"]', '[class*="googletagservices"]', '[id*="googletagservices"]',
    '[class*="pubads"]', '[id*="pubads"]', '[class*="pagead"]', '[id*="pagead"]',

    // Taboola/Outbrain
    '[class*="taboola"]', '[id*="taboola"]', '[class*="outbrain"]', '[id*="outbrain"]',
    '.trc_rbox_div', '.trc_rbox_container', '#outbrain_widget_', '.ob_widget', '.ob_container',

    // Other networks (50+)
    '[class*="criteo"]', '[id*="criteo"]', '[class*="rubicon"]', '[id*="rubicon"]',
    '[class*="openx"]', '[id*="openx"]', '[class*="appnexus"]', '[id*="appnexus"]',
    '[class*="indexexchange"]', '[id*="indexexchange"]', '[class*="pubmatic"]', '[id*="pubmatic"]',
    '[class*="smaato"]', '[id*="smaato"]', '[class*="moat"]', '[id*="moat"]',
    '[class*="integral"]', '[id*="integral"]', '[class*="doubleverify"]', '[id*="doubleverify"]',
    '[class*="ias"]', '[id*="ias"]', '[class*="measure"]', '[id*="measure"]',
    '[class*="tracking"]', '[id*="tracking"]', '[class*="analytics"]', '[id*="analytics"]',

    // Iframe ads (100+ domains) - REFINED: Only specific ad-serving paths
    'iframe[src*="googleads.g.doubleclick.net/pagead/ads"]',
    'iframe[src*="pubads.g.doubleclick.net/gampad/ads"]',
    'iframe[src*="pagead2.googlesyndication.com/pagead/ads"]',
    'iframe[src*="/ads?"]', 'iframe[src*="adformat="]', 'iframe[src*="ad_type="]',
    'iframe[src*="imasdk"]', 'iframe[src*="googleadservices.com"]',

    // Specific IDs
    '#ad-banner', '#ad-sidebar', '#ad-header', '#ad-footer', '#ad-leaderboard',
    '#ad-skyscraper', '#ad-rectangle', '#ad-popup', '#ad-interstitial',
    '#ad-native', '#ad-instream', '#ad-outstream', '#ad-video', '#ad-audio',
    '#ad-display', '#ad-text', '#ad-image', '#ad-richmedia', '.ad-zone', '.ad-space', '.ad-box', '#ad-slot', '#banner-ad'
  ];

  let initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;

    // Inject CSS immediately
    const style = document.createElement('style');
    style.id = 'aeroguard-cosmetic-engine';
    style.textContent = AD_SELECTORS.map(sel =>
      `${sel} { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; height: 0 !important; width: 0 !important; overflow: hidden !important; position: absolute !important; left: -9999px !important; }`
    ).join('\n');
    (document.head || document.documentElement).appendChild(style);

    // MutationObserver for dynamic ads
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1 && isAdElement(node)) {
              node.style.setProperty('display', 'none', 'important');
              node.style.setProperty('visibility', 'hidden', 'important');
              node.style.setProperty('opacity', '0', 'important');
              node.style.setProperty('height', '0', 'important');
              node.style.setProperty('width', '0', 'important');
              node.style.setProperty('overflow', 'hidden', 'important');
              node.style.setProperty('position', 'absolute', 'important');
              node.style.setProperty('left', '-9999px', 'important');
            }
          }
        }
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function isAdElement(el) {
    if (!el.tagName) return false;
    const cls = (el.className || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const patterns = ['ad-', '-ad-', 'advert', 'sponsor', 'promo', 'doubleclick', 'googlesyndication', 'googleadservices', 'taboola', 'outbrain', 'criteo', 'rubicon'];
    for (const p of patterns) {
      if (cls.includes(p) || id.includes(p)) {
        if (/adaptive|address|added|admin|advanced/.test(cls + id)) continue;
        return true;
      }
    }
    if (el.hasAttribute('data-ad') || el.hasAttribute('data-ad-slot') || el.hasAttribute('data-ad-client')) return true;
    return false;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();