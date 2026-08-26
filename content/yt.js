// content/yt.js — YouTube DOM hiding + player protection
(() => {
  'use strict';

  const PLAYER_ALLOW = [
    'video.html5-main-video', 'video#movie_player', '#movie_player',
    '.html5-video-player', '.html5-video-container', '.ytp-chrome-bottom',
    '.ytp-chrome-top', '.ytp-play-button', '.ytp-progress-bar',
    '.ytp-volume-panel', '.ytp-fullscreen-button', '.ytp-settings-button',
    '[data-layer="8"]', '[data-layer="4"]'
  ];

  const AD_SELECTORS = [
    '.ytp-ad-player-overlay', '.ytp-ad-overlay-container', '.ytp-ad-overlay-slot',
    '.ytp-ad-text-overlay', '.ytp-ad-image-overlay', '.ytp-ad-branding-overlay',
    '.ytp-ad-companion-slot', '.ytp-ad-banner-slot', '.ytp-ad-skip-button-container',
    '.ytp-ad-preview-container', '.ytp-ad-preview-slot', '.ytp-ad-progress-bar-container',
    '.ytp-ad-progress-bar', '.ytp-ad-duration-remaining', '.ytp-ad-button-container',
    '.ytp-ad-button', '.ytp-ad-cta-button', '.ytp-ad-visit-advertiser-button',
    '.ytp-ad-learn-more-button', '.ytp-ad-feedback-button', '.ytp-ad-info-button',
    '.ytp-ad-cancel-button', '.ytp-ce-covering-overlay', '.ytp-ce-element.ytp-ce-ad',
    '.ytp-ce-video.ytp-ce-ad', 'ytd-ad-slot-renderer', 'ytd-display-ad-renderer',
    'ytd-promoted-video-renderer', 'ytd-promoted-sparkles-web-renderer',
    'ytd-action-companion-ad-renderer', 'ytd-in-feed-ad-renderer', 'ytd-banner-ad-renderer',
    'ytd-companion-slot-renderer', 'ytd-mealbar-promo-renderer', 'ytd-merch-shelf-renderer',
    'ytd-shopping-renderer', 'ytd-masthead-ad-renderer', '#masthead-ad', '.masthead-ad'
  ];

  function isPlayer(el) {
    return PLAYER_ALLOW.some(s => el.matches(s) || el.closest(s)) ||
           (el.tagName === 'VIDEO' && el.src?.includes('googlevideo.com/videoplayback'));
  }

  function hide(el) {
    if (el._blocked) return;
    el._blocked = true;
    el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;contain:layout size style paint!important';
  }

  function hideAds() {
    let count = 0;
    for (const sel of AD_SELECTORS) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (!isPlayer(el) && !el._blocked) { hide(el); count++; }
        });
      } catch {}
    }
    // Promoted badges
    document.querySelectorAll('ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer').forEach(r => {
      if (r.querySelector('[badge-style="BADGE_STYLE_TYPE_PROMOTED"]') && !r._blocked && !isPlayer(r)) {
        hide(r); count++;
      }
    });
    if (count) console.log('[YT] Hidden', count, 'ads');
  }

  function emergencyUnblock() {
    PLAYER_ALLOW.forEach(s => document.querySelectorAll(s).forEach(el => {
      if (el._blocked) { el._blocked = false; el.style.cssText = ''; el.removeAttribute('data-adblocked'); el.style.display=''; el.style.visibility=''; el.style.opacity=''; el.style.pointerEvents=''; }
    }));
  }

  // Patch video element
  function patchVideo(v) {
    if (v._patched) return;
    v._patched = true;
    v._isAd = false;

    const oPlay = v.play;
    v.play = function(...a) { if (this._isAd) return Promise.resolve(); return oPlay.apply(this, a); };

    const srcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    Object.defineProperty(v, 'src', {
      set: function(val) {
        if (val && (val.includes('/api/manifest/') || val.includes('adformat=') || val.includes('ad_type='))) {
          this._isAd = true; return;
        }
        this._isAd = false;
        return srcDesc?.set?.call(this, val);
      },
      get: srcDesc?.get, configurable: true
    });
  }

  function findVideo() {
    const sels = ['video.html5-main-video', 'video#movie_player', 'video.ytp-video', 'video[src*="googlevideo.com"]'];
    for (const s of sels) { const v = document.querySelector(s); if (v && !v._patched) { patchVideo(v); break; } }
  }

  // IMA SDK block
  const oCreate = document.createElement;
  document.createElement = function(t, o) {
    const e = oCreate.call(this, t, o);
    if (t === 'script' && e.src && (e.src.includes('imasdk') || e.src.includes('googleads') || e.src.includes('doubleclick.net/imasdk'))) {
      console.log('[YT] Blocked IMA script:', e.src);
      return document.createComment('Blocked IMA');
    }
    return e;
  };

  if (!window._origGoogle) window._origGoogle = window.google;
  Object.defineProperty(window, 'google', {
    configurable: true,
    get: () => new Proxy(window._origGoogle || {}, {
      get: (t, p) => p === 'ima' ? (console.log('[YT] Blocked google.ima'), undefined) : t[p],
      has: (t, p) => p !== 'ima' && p in t,
      ownKeys: t => Object.keys(t).filter(k => k !== 'ima')
    }),
    set: v => { window._origGoogle = v; return true; }
  });

  // Init
  function init() {
    hideAds();
    emergencyUnblock();
    findVideo();

    const mo = new MutationObserver(muts => {
      let check = false;
      for (const m of muts) {
        if (m.type === 'childList' && m.addedNodes.length) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && (isAdElement(n) || n.querySelector?.(AD_SELECTORS.join(',')))) { check = true; break; }
          }
        }
      }
      if (check) {
        clearTimeout(mo._deb);
        mo._deb = setTimeout(() => { hideAds(); emergencyUnblock(); findVideo(); }, 100);
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'id', 'src', 'data-ad'] });

    setInterval(() => { emergencyUnblock(); hideAds(); findVideo(); }, 1000);
    console.log('[YT] Content script ready');
  }

  function isAdElement(el) {
    const cls = (el.className || '').toLowerCase(), id = (el.id || '').toLowerCase();
    const pats = ['ad-','-ad-','advert','sponsor','promo','doubleclick','googlesyndication','googleadservices','taboola','outbrain'];
    for (const p of pats) if (cls.includes(p) || id.includes(p)) { if (/adaptive|address|added|admin|advanced/.test(cls+id)) continue; return true; }
    return ['data-ad','data-ad-slot','data-ad-client','data-promoted','is-promoted'].some(a => el.hasAttribute(a));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'EMERGENCY_UNBLOCK' || msg.type === 'RULES_UPDATED') { emergencyUnblock(); hideAds(); findVideo(); sendResponse({ success: true }); }
  });
})();