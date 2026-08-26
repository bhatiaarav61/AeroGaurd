// content/yt.js — YouTube DOM hiding + player protection
(() => {
  'use strict';

  const PLAYER_ALLOW = [
    'video.html5-main-video', 'video#movie_player', '#movie_player',
    '.html5-video-player', '.html5-video-container', '.ytp-chrome-bottom',
    '.ytp-chrome-top', '.ytp-play-button', '.ytp-progress-bar',
    '.ytp-volume-panel', '.ytp-fullscreen-button', '.ytp-settings-button',
    '[data-layer="8"]', '[data-layer="4"]',
    // ─── Additional Player Elements ───
    '.ytp-large-play-button', '.ytp-large-play-button-bg', '.ytp-large-play-button-icon',
    '.ytp-cued-thumbnail-overlay', '.ytp-cued-thumbnail-overlay-image',
    '.ytp-gradient-bottom', '.ytp-gradient-top', '.ytp-videowall-still',
    '.ytp-cards-teaser', '.ytp-next-button', '.ytp-endscreen-element',
    '.ytp-autonav-toggle-button', '.ytp-autonav-mode', '.ytp-miniplayer-expand-button',
    '.ytp-popup', '.ytp-popup-container', '.ytp-popup-body', '.ytp-popup-footer',
    '.ytp-tooltip', '.ytp-tooltip-text', '.ytp-rich-tooltip', '.ytp-rich-tooltip-content',
    '#related', '#secondary', '#meta', '#primary', '#content', '#player',
    'ytd-watch-flexy', 'ytd-watch-next-secondary-results-renderer',
    'ytd-item-section-renderer', 'ytd-video-secondary-info-renderer',
    'ytd-video-primary-info-renderer', 'ytd-engagement-panel-section-list-renderer',
    'ytd-comments', 'ytd-comment-thread-renderer', 'ytd-comment-renderer'
  ];

  const AD_SELECTORS = [
    // ─── NUCLEAR: Catch ALL ad-like elements ───
    '[class*="Ad"]', '[class*="Advertisement"]', '[class*="Sponsored"]', '[class*="Promoted"]',
    '[id*="Ad"]', '[id*="Advertisement"]', '[id*="Sponsored"]', '[id*="Promoted"]',
    '[data-ad]', '[data-ad-slot]', '[data-ad-client]', '[data-ad-creative]', '[data-ad-type]',
    '[data-ad-network]', '[data-ad-unit]', '[data-ad-format]', '[data-ad-zone]',
    '[aria-label*="Ad" i]', '[aria-label*="Sponsored" i]', '[aria-label*="Promoted" i]',
    '[aria-label*="Advertisement" i]', '[data-advertisement]', '[data-sponsored]',
    '[data-promoted]', '[data-advert]', '[data-ad]', '[data-adslot]',

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

  function isPlayerElement(el) {
    return PLAYER_ALLOW.some(s => el.matches(s) || el.closest(s)) ||
           (el.tagName === 'VIDEO' && el.src?.includes('googlevideo.com/videoplayback'));
  }

  function hide(el) {
    if (el._adBlocked) return;
    el._adBlocked = true;
    el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;contain:layout size style paint!important';
  }

  function hideAds() {
    let count = 0;
    for (const sel of AD_SELECTORS) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (!isPlayerElement(el) && !el._adBlocked) { hide(el); count++; }
        });
      } catch {}
    }
    // Promoted badges
    document.querySelectorAll('ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer').forEach(r => {
      if (r.querySelector('[badge-style="BADGE_STYLE_TYPE_PROMOTED"]') && !r._adBlocked && !isPlayerElement(r)) {
        hide(r); count++;
      }
    });
    if (count) console.log('[YT] Hidden', count, 'ads');
  }

  function emergencyUnblockPlayer() {
    PLAYER_ALLOW.forEach(s => document.querySelectorAll(s).forEach(el => {
      if (el._adBlocked) { el._adBlocked = false; el.style.cssText = ''; el.removeAttribute('data-adblocked'); el.style.display=''; el.style.visibility=''; el.style.opacity=''; el.style.pointerEvents=''; }
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

  // ─── NUCLEAR AD CLEANUP ───
  function nuclearAdCleanup() {
    let count = 0;

    // 1. Remove ALL elements with ad-like classes/ids
    const nuclearSelectors = [
      '[class*="Ad"]', '[class*="Advertisement"]', '[class*="Sponsored"]', '[class*="Promoted"]',
      '[id*="Ad"]', '[id*="Advertisement"]', '[id*="Sponsored"]', '[id*="Promoted"]',
      '[data-ad]', '[data-ad-slot]', '[data-ad-client]', '[data-ad-creative]', '[data-ad-type]',
      '[data-ad-network]', '[data-ad-unit]', '[data-ad-format]', '[data-ad-zone]',
      '[aria-label*="Ad" i]', '[aria-label*="Sponsored" i]', '[aria-label*="Promoted" i]',
      '[aria-label*="Advertisement" i]', '[data-advertisement]', '[data-sponsored]',
      '[data-promoted]', '[data-advert]', '[data-ad]', '[data-adslot]', '[data-promoted]',
      'ytd-ad-slot-renderer', 'ytd-display-ad-renderer', 'ytd-promoted-video-renderer',
      'ytd-promoted-sparkles-web-renderer', 'ytd-action-companion-ad-renderer',
      'ytd-in-feed-ad-renderer', 'ytd-banner-ad-renderer', 'ytd-companion-slot-renderer',
      'ytd-mealbar-promo-renderer', 'ytd-merch-shelf-renderer', 'ytd-shopping-renderer',
      'ytd-masthead-ad-renderer', 'ytd-promoted-sparkles-text-search-renderer',
      'ytd-promoted-video-renderer[is-promoted]', 'ytd-rich-item-renderer[is-promoted]',
      'ytd-video-renderer[is-promoted]', 'ytd-grid-video-renderer[is-promoted]',
      'ytd-compact-video-renderer[is-promoted]', 'ytd-reel-video-renderer[is-promoted]',
      'ytd-shorts-lockup-view-model[is-promoted]', 'ytd-ad-creative-renderer',
      'ytd-ad-creative-slot-renderer', 'ytd-ad-banner-renderer', 'ytd-ad-overlay-renderer',
      'ytd-ad-player-overlay-renderer', 'ytd-ad-companion-renderer',
      'ytd-ad-feedback-renderer', 'ytd-ad-info-renderer', 'ytd-ad-visit-advertiser-renderer',
      'ytd-ad-learn-more-renderer', 'ytd-ad-skip-button-renderer',
      'ytd-engagement-panel-ad-renderer', '#masthead-ad', '.masthead-ad',
      'ytd-masthead-ad-renderer', 'ytd-promoted-sparkles-video-renderer'
    ];

    nuclearSelectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (!el._adBlocked && !isPlayerElement(el)) {
            el._adBlocked = true;
            el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;contain:layout size style paint!important';
            count++;
          }
        });
      } catch(e) {}
    });

    // 2. Shadow DOM nuclear cleanup
    if (window.CONFIG?.enableShadowDomPiercing) {
      nuclearSelectors.forEach(sel => {
        pierceShadowDOM(document, sel, el => {
          if (!el._adBlocked && !isPlayerElement(el)) {
            el._adBlocked = true;
            el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;contain:layout size style paint!important';
            count++;
          }
        });
      });
    }

    // 3. Iframe ad removal
    const adIframeSelectors = [
      'iframe[src*="doubleclick.net"]', 'iframe[src*="googlesyndication.com"]',
      'iframe[src*="googleadservices.com"]', 'iframe[src*="googletagmanager.com"]',
      'iframe[src*="googletagservices.com"]', 'iframe[src*="pubads.g.doubleclick.net"]',
      'iframe[src*="pagead2.googlesyndication.com"]', 'iframe[src*="adservice.google"]',
      'iframe[src*="imasdk"]', 'iframe[src*="googleads"]', 'iframe[src*="ads.youtube.com"]',
      'iframe[src*="advertising.youtube.com"]', 'iframe[src*="partneradvertising.youtube.com"]',
      'iframe[src*="googleads.g.doubleclick.net"]', 'iframe[src*="pagead2"]',
      'iframe[src*="pubads"]', 'iframe[src*="gampad"]', 'iframe[src*="imasdk"]'
    ];

    adIframeSelectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (!el._adBlocked) {
            el._adBlocked = true;
            el.remove();
            count++;
          }
        });
      } catch(e) {}
    });

    // 4. Remove promoted content in feed
    count += hidePromotedContent();

    // 5. Clean video ad state
    document.querySelectorAll('video').forEach(v => {
      if (v._isAd) { v._isAd = false; v._adSegment = null; }
    });

    return count;
  }

  function hidePromotedContent() {
    let count = 0;
    document.querySelectorAll('ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer').forEach(r => {
      if (r.querySelector('[badge-style="BADGE_STYLE_TYPE_PROMOTED"]') && !r._adBlocked && !isPlayerElement(r)) {
        hide(r); count++;
      }
    });

    // Shadow DOM
    if (window.CONFIG?.enableShadowDomPiercing) {
      pierceShadowDOM(document, 'ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer', renderer => {
        const badge = renderer.querySelector('[badge-style="BADGE_STYLE_TYPE_PROMOTED"]');
        if (badge && !renderer._adBlocked && !isPlayerElement(renderer)) {
          hide(renderer); count++;
        }
      });
    }
    return count;
  }

  function emergencyUnblockPlayer() {
    PLAYER_ALLOW.forEach(s => document.querySelectorAll(s).forEach(el => {
      if (el._adBlocked) { el._adBlocked = false; el.style.cssText = ''; el.removeAttribute('data-adblocked'); el.style.display=''; el.style.visibility=''; el.style.opacity=''; el.style.pointerEvents=''; }
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

  // ─── SHADOW DOM PIERCING ───
  function pierceShadowDOM(root, selector, callback) {
    if (!window.CONFIG?.enableShadowDomPiercing) return;
    try {
      root.querySelectorAll(selector).forEach(callback);
      root.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) pierceShadowDOM(el.shadowRoot, selector, callback);
      });
    } catch (e) { /* ignore */ }
  }

  // Init
  function init() {
    hideAds();
    emergencyUnblockPlayer();
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
        mo._deb = setTimeout(() => { hideAds(); emergencyUnblockPlayer(); findVideo(); }, 100);
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'id', 'src', 'data-ad'] });

    setInterval(() => { emergencyUnblockPlayer(); nuclearAdCleanup(); findVideo(); }, 1000);
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
    if (msg.type === 'EMERGENCY_UNBLOCK' || msg.type === 'RULES_UPDATED') { emergencyUnblockPlayer(); nuclearAdCleanup(); findVideo(); sendResponse({ success: true }); }
  });

  // Export for scriptlet access
  window.__aeroguardYT = {
    hideAds,
    emergencyUnblockPlayer,
    nuclearAdCleanup,
    findVideo,
    patchVideo,
    isPlayerElement
  };
})();