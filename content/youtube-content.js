// content/youtube-content.js — YouTube-specific DOM hiding & ad blocking (MAIN world, document_start, all_frames, match_about_blank)
// FIXES: White video player bug via surgical selectors + player allow-list
(() => {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  const CONFIG = {
    hideAdElements: true,
    skipVideoAds: true,
    blockIMA: true,
    removeConsent: true,
    patchPlayer: true,
    blockFetchAds: true,
    patchYtInitialData: true,
    enableShadowDomPiercing: true,
    handleSpaNavigation: true,
    debug: false,
    periodicCleanupInterval: 1000,
    mutationDebounceMs: 100,
    spaNavigationDebounceMs: 50
  };

  // ============================================================================
  // STATE
  // ============================================================================
  let initialized = false;
  let observers = [];
  let videoObserver = null;
  let cleanupInterval = null;
  let lastUrl = location.href;
  let spaNavigationTimer = null;
  let ytInitialDataProxy = null;
  let fetchInterceptorInstalled = false;

  // ============================================================================
  // SURGICAL AD SELECTORS (80+ for promoted content) — Only target actual ad elements
  // REMOVED: .video-ads, .ytp-ad-module, .ytp-ad-player-overlay, iframe[src*="doubleclick"] - These matched the REAL player!
  // ============================================================================
  const SAFE_AD_SELECTORS = [
    // Video overlay ads — SPECIFIC to ad UI, NOT the player container
    '.ytp-ad-player-overlay', '.ytp-ad-overlay-container', '.ytp-ad-overlay-slot',
    '.ytp-ad-text-overlay', '.ytp-ad-image-overlay', '.ytp-ad-branding-overlay',
    '.ytp-ad-companion-slot', '.ytp-ad-banner-slot', '.ytp-ad-skip-button-container',
    '.ytp-ad-preview-container', '.ytp-ad-preview-slot', '.ytp-ad-progress-bar-container',
    '.ytp-ad-progress-bar', '.ytp-ad-duration-remaining', '.ytp-ad-button-container',
    '.ytp-ad-button', '.ytp-ad-cta-button', '.ytp-ad-visit-advertiser-button',
    '.ytp-ad-learn-more-button', '.ytp-ad-feedback-button', '.ytp-ad-info-button',
    '.ytp-ad-cancel-button', '.ytp-ce-covering-overlay', '.ytp-ce-element.ytp-ce-ad',
    '.ytp-ce-video.ytp-ce-ad', '.ytp-ad-overlay-close-button', '.ytp-ad-overlay-close-container',
    '.ytp-ad-companion-slot-container', '.ytp-ad-companion-slot-image', '.ytp-ad-companion-slot-text',
    '.ytp-ad-companion-slot-button', '.ytp-ad-companion-slot-visit', '.ytp-ad-player-overlay-layout',
    '.ytp-ad-player-overlay-slot', '.ytp-ad-player-overlay-close', '.ytp-ad-player-overlay-info',
    '.ytp-ad-player-overlay-learn-more', '.ytp-ad-player-overlay-visit', '.ytp-ad-player-overlay-feedback',
    '.ytp-ad-skip-button', '.ytp-ad-skip-button-icon', '.ytp-ad-skip-button-text',
    '.ytp-ad-skip-button-container-hidden', '.ytp-ad-preview-thumbnail', '.ytp-ad-preview-title',
    '.ytp-ad-preview-description', '.ytp-ad-preview-advertiser', '.ytp-ad-preview-visit',

    // Feed/component ads — YouTube-specific renderers ONLY
    'ytd-ad-slot-renderer', 'ytd-display-ad-renderer', 'ytd-promoted-video-renderer',
    'ytd-promoted-sparkles-web-renderer', 'ytd-action-companion-ad-renderer',
    'ytd-in-feed-ad-renderer', 'ytd-banner-ad-renderer', 'ytd-companion-slot-renderer',
    'ytd-mealbar-promo-renderer', 'ytd-merch-shelf-renderer', 'ytd-shopping-renderer',
    'ytd-masthead-ad-renderer', '#masthead-ad', '.masthead-ad',
    'ytd-promoted-sparkles-text-search-renderer', 'ytd-promoted-video-renderer[is-promoted]',
    'ytd-rich-item-renderer[is-promoted]', 'ytd-video-renderer[is-promoted]',
    'ytd-grid-video-renderer[is-promoted]', 'ytd-compact-video-renderer[is-promoted]',
    'ytd-reel-video-renderer[is-promoted]', 'ytd-shorts-lockup-view-model[is-promoted]',
    'ytd-promoted-sparkles-text-search-renderer', 'ytd-promoted-sparkles-video-renderer',
    'ytd-ad-creative-renderer', 'ytd-ad-creative-slot-renderer', 'ytd-ad-banner-renderer',
    'ytd-ad-overlay-renderer', 'ytd-ad-player-overlay-renderer', 'ytd-ad-companion-renderer',
    'ytd-ad-feedback-renderer', 'ytd-ad-info-renderer', 'ytd-ad-visit-advertiser-renderer',
    'ytd-ad-learn-more-renderer', 'ytd-ad-skip-button-renderer', '.ytd-ad-renderer',
    'ytd-engagement-panel-ad-renderer', 'ytd-watch-flexy[has-ad]', 'ytd-app[has-ad]',

    // Promoted badges & labels
    '[badge-style="BADGE_STYLE_TYPE_PROMOTED"]', '[badge-style-type="PROMOTED"]',
    'ytd-badge-supported-renderer[badge-style="BADGE_STYLE_TYPE_PROMOTED"]',
    '.ytd-badge-supported-renderer[badge-style="BADGE_STYLE_TYPE_PROMOTED"]',
    '.metadata-badge-renderer[badge-style="BADGE_STYLE_TYPE_PROMOTED"]',
    '#badge[badge-style="BADGE_STYLE_TYPE_PROMOTED"]', '.badge-style-promoted',
    '[aria-label*="Sponsored"]', '[aria-label*="Promoted"]', '[aria-label*="Advertisement"]',
    '[data-promoted]', '[data-is-promoted]', '[data-ad-creative]', '[data-ad-slot]',

    // Generic ad patterns — REFINED to avoid false positives on player
    // REMOVED: Overly broad [class*="ad-"], [id*="ad-"] that matched player internals
    // Kept only specific data attributes that indicate ads
    '[data-ad]', '[data-ad-slot]', '[data-ad-client]',
    '[data-ad-format]', '[data-ad-unit]', '[data-google-query-id]', '[data-ad-status]',
    '[data-ad-impression]', '[data-ad-creative]', '[data-ad-type]', '[data-ad-network]',

    // Common ad classes — exhaustive list
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
    '.anchor-ad', '.anchor_ad', '.anchorAd', '.preroll-ad', '.midroll-ad', '.postroll-ad',

    // Google AdSense / Ad Manager
    '.adsbygoogle', '.adsbygoogle-noablate', '#google_ads_iframe_', 'ins.adsbygoogle',
    '.ad-slot', '.adslot', '.google-ad', '.google_ads', '.goog-ad', '.goog_ads',
    '.dfp-ad', '.dfp_slot', '.gpt-ad', '.gpt_slot', '.admanager', '.ad-manager',

    // Ad networks — Google ecosystem
    '[class*="dfp-"]', '[id*="dfp-"]', '[class*="gpt-"]', '[id*="gpt-"]',
    '[class*="admanager"]', '[id*="admanager"]', '[class*="adserver"]', '[id*="adserver"]',
    '[class*="adtech"]', '[id*="adtech"]', '[class*="doubleclick"]', '[id*="doubleclick"]',
    '[class*="googlesyndication"]', '[id*="googlesyndication"]', '[class*="googleadservices"]', '[id*="googleadservices"]',
    '[class*="googletagmanager"]', '[id*="googletagmanager"]', '[class*="googletagservices"]', '[id*="googletagservices"]',
    '[class*="pubads"]', '[id*="pubads"]', '[class*="pagead"]', '[id*="pagead"]',
    '[class*="imasdk"]', '[id*="imasdk"]', '[class*="ima-"]', '[id*="ima-"]',

    // Taboola / Outbrain
    '[class*="taboola"]', '[id*="taboola"]', '[class*="outbrain"]', '[id*="outbrain"]',
    '.trc_rbox_div', '.trc_rbox_container', '#outbrain_widget_', '.ob_widget', '.ob_container',
    '.trc_related_container', '.trc_content_recommendations', '.trc_native_unit',

    // Major ad networks (50+)
    '[class*="criteo"]', '[id*="criteo"]', '[class*="rubicon"]', '[id*="rubicon"]',
    '[class*="openx"]', '[id*="openx"]', '[class*="appnexus"]', '[id*="appnexus"]',
    '[class*="indexexchange"]', '[id*="indexexchange"]', '[class*="pubmatic"]', '[id*="pubmatic"]',
    '[class*="smaato"]', '[id*="smaato"]', '[class*="moat"]', '[id*="moat"]',
    '[class*="integral"]', '[id*="integral"]', '[class*="doubleverify"]', '[id*="doubleverify"]',
    '[class*="ias"]', '[id*="ias"]', '[class*="measure"]', '[id*="measure"]',
    '[class*="tracking"]', '[id*="tracking"]', '[class*="analytics"]', '[id*="analytics"]',
    '[class*="adform"]', '[id*="adform"]', '[class*="adformnet"]', '[id*="adformnet"]',
    '[class*="adnxs"]', '[id*="adnxs"]', '[class*="adform"]', '[id*="adform"]',
    '[class*="smartadserver"]', '[id*="smartadserver"]', '[class*="advertising.com"]', '[id*="advertising.com"]',
    '[class*="amazon-adsystem"]', '[id*="amazon-adsystem"]', '[class*="amazon-ads"]', '[id*="amazon-ads"]',
    '[class*="casalemedia"]', '[id*="casalemedia"]', '[class*="contextweb"]', '[id*="contextweb"]',
    '[class*="crwdcntrl"]', '[id*="crwdcntrl"]', '[class*="demdex"]', '[id*="demdex"]',
    '[class*="everesttech"]', '[id*="everesttech"]', '[class*="exelator"]', '[id*="exelator"]',
    '[class*="eyeview"]', '[id*="eyeview"]', '[class*="flashtalking"]', '[id*="flashtalking"]',
    '[class*="freewheel"]', '[id*="freewheel"]', '[class*="googleads"]', '[id*="googleads"]',
    '[class*="ib.adnxs"]', '[id*="ib.adnxs"]', '[class*="idsync"]', '[id*="idsync"]',
    '[class*="imrworldwide"]', '[id*="imrworldwide"]', '[class*="intentiq"]', '[id*="intentiq"]',
    '[class*="inneractive"]', '[id*="inneractive"]', '[class*="innity"]', '[id*="innity"]',
    '[class*="ipredictive"]', '[id*="ipredictive"]', '[class*="krxd"]', '[id*="krxd"]',
    '[class*="lijit"]', '[id*="lijit"]', '[class*="linksynergy"]', '[id*="linksynergy"]',
    '[class*="mathtag"]', '[id*="mathtag"]', '[class*="media.net"]', '[id*="media.net"]',
    '[class*="media6degrees"]', '[id*="media6degrees"]', '[class*="mediamath"]', '[id*="mediamath"]',
    '[class*="moatads"]', '[id*="moatads"]', '[class*="mookie1"]', '[id*="mookie1"]',
    '[class*="nexac"]', '[id*="nexac"]', '[class*="optimizely"]', '[id*="optimizely"]',
    '[class*="owneriq"]', '[id*="owneriq"]', '[class*="parsely"]', '[id*="parsely"]',
    '[class*="pixel"]', '[id*="pixel"]', '[class*="quantserve"]', '[id*="quantserve"]',
    '[class*="rbidr"]', '[id*="rbidr"]', '[class*="rlcdn"]', '[id*="rlcdn"]',
    '[class*="rubiconproject"]', '[id*="rubiconproject"]', '[class*="scorecardresearch"]', '[id*="scorecardresearch"]',
    '[class*="segment"]', '[id*="segment"]', '[class*="serving-sys"]', '[id*="serving-sys"]',
    '[class*="sharethrough"]', '[id*="sharethrough"]', '[class*="simpli.fi"]', '[id*="simpli.fi"]',
    '[class*="sonobi"]', '[id*="sonobi"]', '[class*="specificmedia"]', '[id*="specificmedia"]',
    '[class*="spotxchange"]', '[id*="spotxchange"]', '[class*="stickyadstv"]', '[id*="stickyadstv"]',
    '[class*="tapad"]', '[id*="tapad"]', '[class*="teads"]', '[id*="teads"]',
    '[class*="thebrighttag"]', '[id*="thebrighttag"]', '[class*="tidaltv"]', '[id*="tidaltv"]',
    '[class*="tribalfusion"]', '[id*="tribalfusion"]', '[class*="turn"]', '[id*="turn"]',
    '[class*="tynt"]', '[id*="tynt"]', '[class*="visualdna"]', '[id*="visualdna"]',
    '[class*="w55c"]', '[id*="w55c"]', '[class*="webtrends"]', '[id*="webtrends"]',
    '[class*="widiun"]', '[id*="widiun"]', '[class*="wishabi"]', '[id*="wishabi"]',
    '[class*="xiti"]', '[id*="xiti"]', '[class*="yieldlab"]', '[id*="yieldlab"]',
    '[class*="yieldmanager"]', '[id*="yieldmanager"]', '[class*="yieldmo"]', '[id*="yieldmo"]',
    '[class*="zedo"]', '[id*="zedo"]',

    // Iframe ads — REFINED: Only specific ad-serving paths, not full domains
    // YouTube player may load via doubleclick/googlesyndication — MUST NOT match those
    'iframe[src*="googleads.g.doubleclick.net/pagead/ads"]',
    'iframe[src*="pubads.g.doubleclick.net/gampad/ads"]',
    'iframe[src*="pagead2.googlesyndication.com/pagead/ads"]',
    'iframe[src*="pagead2.googlesyndication.com/pagead/html"]',
    'iframe[src*="googleads.g.doubleclick.net/pagead/html"]',
    'iframe[src*="adservice.google.com/adsid"]',
    'iframe[src*="imasdk.googleapis.com"]',
    'iframe[src*="imasdk.s3.amazonaws.com"]',
    'iframe[src*="taboola.com"]',
    'iframe[src*="outbrain.com"]',
    'iframe[src*="criteo.com"]',
    'iframe[src*="rubiconproject.com"]',
    'iframe[src*="openx.net"]',
    'iframe[src*="appnexus.com"]',
    'iframe[src*="indexexchange.com"]',
    'iframe[src*="pubmatic.com"]',
    'iframe[src*="smaato.net"]',
    'iframe[src*="moatads.com"]',
    'iframe[src*="adnxs.com"]',
    'iframe[src*="adform.net"]',
    'iframe[src*="adtech.de"]',
    'iframe[src*="advertising.com"]',
    'iframe[src*="amazon-adsystem.com"]',
    'iframe[src*="amazonaws.com/ads"]',
    'iframe[src*="casalemedia.com"]',
    'iframe[src*="contextweb.com"]',
    'iframe[src*="crwdcntrl.net"]',
    'iframe[src*="demdex.net"]',
    'iframe[src*="everesttech.net"]',
    'iframe[src*="exelator.com"]',
    'iframe[src*="eyeviewads.com"]',
    'iframe[src*="flashtalking.com"]',
    'iframe[src*="freewheel.com"]',
    'iframe[src*="googleads.g.doubleclick.net"]',
    'iframe[src*="ib.adnxs.com"]',
    'iframe[src*="idsync.rlcdn.com"]',
    'iframe[src*="imrworldwide.com"]',
    'iframe[src*="intentiq.com"]',
    'iframe[src*="inner-active.com"]',
    'iframe[src*="innity.net"]',
    'iframe[src*="ipredictive.com"]',
    'iframe[src*="krxd.net"]',
    'iframe[src*="lijit.com"]',
    'iframe[src*="linksynergy.com"]',
    'iframe[src*="mathtag.com"]',
    'iframe[src*="media.net"]',
    'iframe[src*="media6degrees.com"]',
    'iframe[src*="mediamath.com"]',
    'iframe[src*="mookie1.com"]',
    'iframe[src*="nexac.com"]',
    'iframe[src*="optimizely.com"]',
    'iframe[src*="outbrain.com"]',
    'iframe[src*="owneriq.net"]',
    'iframe[src*="parsely.com"]',
    'iframe[src*="pixel.ad"]',
    'iframe[src*="pixel.parsely.com"]',
    'iframe[src*="quantserve.com"]',
    'iframe[src*="r.msn.com"]',
    'iframe[src*="rbidr.io"]',
    'iframe[src*="rlcdn.com"]',
    'iframe[src*="rubiconproject.com"]',
    'iframe[src*="scorecardresearch.com"]',
    'iframe[src*="segment.io"]',
    'iframe[src*="serving-sys.com"]',
    'iframe[src*="sharethrough.com"]',
    'iframe[src*="simpli.fi"]',
    'iframe[src*="smaato.net"]',
    'iframe[src*="sonobi.com"]',
    'iframe[src*="specificmedia.com"]',
    'iframe[src*="spotxchange.com"]',
    'iframe[src*="stickyadstv.com"]',
    'iframe[src*="taboola.com"]',
    'iframe[src*="tapad.com"]',
    'iframe[src*="teads.tv"]',
    'iframe[src*="thebrighttag.com"]',
    'iframe[src*="tidaltv.com"]',
    'iframe[src*="tribalfusion.com"]',
    'iframe[src*="turn.com"]',
    'iframe[src*="tynt.com"]',
    'iframe[src*="visualdna.com"]',
    'iframe[src*="w55c.net"]',
    'iframe[src*="webtrends.com"]',
    'iframe[src*="widiun.com"]',
    'iframe[src*="wishabi.com"]',
    'iframe[src*="xiti.com"]',
    'iframe[src*="yieldlab.net"]',
    'iframe[src*="yieldmanager.com"]',
    'iframe[src*="yieldmo.com"]',
    'iframe[src*="zedo.com"]',

    // Specific IDs
    '#ad-banner', '#ad-sidebar', '#ad-header', '#ad-footer', '#ad-leaderboard',
    '#ad-skyscraper', '#ad-rectangle', '#ad-popup', '#ad-interstitial',
    '#ad-native', '#ad-instream', '#ad-outstream', '#ad-video', '#ad-audio',
    '#ad-display', '#ad-text', '#ad-image', '#ad-richmedia', '.ad-zone', '.ad-space', '.ad-box', '#ad-slot', '#banner-ad',
    '#ad-container', '#ad-wrapper', '#ad-inner', '#ad-content', '#ad-frame',
    '#ad-iframe', '#ad-script', '#ad-div', '#ad-span', '#ad-section',

    // YouTube-specific promoted content
    'ytd-promoted-video-renderer', 'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-sparkles-text-search-renderer', 'ytd-promoted-sparkles-video-renderer',
    'ytd-ad-slot-renderer', 'ytd-display-ad-renderer', 'ytd-action-companion-ad-renderer',
    'ytd-in-feed-ad-renderer', 'ytd-banner-ad-renderer', 'ytd-companion-slot-renderer',
    'ytd-mealbar-promo-renderer', 'ytd-merch-shelf-renderer', 'ytd-shopping-renderer',
    'ytd-masthead-ad-renderer', 'ytd-rich-item-renderer[is-promoted]',
    'ytd-video-renderer[is-promoted]', 'ytd-grid-video-renderer[is-promoted]',
    'ytd-compact-video-renderer[is-promoted]', 'ytd-reel-video-renderer[is-promoted]',
    'ytd-shorts-lockup-view-model[is-promoted]', 'ytd-ad-creative-renderer',
    'ytd-ad-creative-slot-renderer', 'ytd-ad-banner-renderer', 'ytd-ad-overlay-renderer',
    'ytd-ad-player-overlay-renderer', 'ytd-ad-companion-renderer', 'ytd-ad-feedback-renderer',
    'ytd-ad-info-renderer', 'ytd-ad-visit-advertiser-renderer', 'ytd-ad-learn-more-renderer',
    'ytd-ad-skip-button-renderer', 'ytd-engagement-panel-ad-renderer'
  ];

  // ============================================================================
  // PLAYER ALLOW-LIST — CRITICAL: NEVER hide these elements
  // ============================================================================
  const PLAYER_ALLOW_LIST = [
    // Video elements
    'video.html5-main-video',
    'video#movie_player',
    '#movie_player',
    'video.html5-video-player',
    'video.ytp-video',
    'video[src*="googlevideo.com"]',
    'video[src*="googlevideo.com/videoplayback"]',

    // Player containers
    '#movie_player',
    '.html5-video-player',
    '.html5-video-container',
    '.html5-video-player',

    // Player UI components
    '.ytp-chrome-bottom',
    '.ytp-chrome-top',
    '.ytp-chrome-controls',
    '.ytp-play-button',
    '.ytp-pause-button',
    '.ytp-progress-bar',
    '.ytp-progress-bar-container',
    '.ytp-progress-list',
    '.ytp-volume-panel',
    '.ytp-volume-slider',
    '.ytp-mute-button',
    '.ytp-fullscreen-button',
    '.ytp-settings-button',
    '.ytp-time-display',
    '.ytp-time-current',
    '.ytp-time-duration',
    '.ytp-chapter-container',
    '.ytp-chapter',
    '.ytp-chapter-title',
    '.ytp-chapter-time',
    '.ytp-heat-map-container',
    '.ytp-heat-map',
    '.ytp-tooltip',
    '.ytp-tooltip-text',
    '.ytp-large-tooltip',
    '.ytp-tooltip-follows-cursor',

    // Player layers
    '[data-layer="8"]',  // Video layer
    '[data-layer="4"]',  // UI layer
    '[data-layer="2"]',  // Overlay layer

    // Fullscreen and theater mode
    '.ytp-fullscreen',
    '.ytp-theater-mode',

    // Miniplayer
    '.ytp-miniplayer',
    '.ytp-miniplayer-video',
    '.ytp-miniplayer-title',
    '.ytp-miniplayer-channel',

    // Live chat and comments
    '#chatframe',
    '#comments',

    // Picture-in-picture
    '.ytp-pip-button'
  ];

  function isPlayerElement(el) {
    if (!el || el._adBlockerHidden) return false;

    // Direct match against allow list
    for (const allowed of PLAYER_ALLOW_LIST) {
      if (el.matches(allowed)) return true;
      if (el.closest(allowed)) return true;
    }

    // Video element with actual video content
    if (el.tagName === 'VIDEO') {
      return el.src && el.src.includes('googlevideo.com/videoplayback');
    }

    // Player container with video child
    if (el.querySelector('video.html5-main-video, video#movie_player')) {
      return true;
    }

    return false;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================
  function log(...args) { if (CONFIG.debug) console.log('[AeroGuard YT]', ...args); }
  function warn(...args) { if (CONFIG.debug) console.warn('[AeroGuard YT]', ...args); }
  function error(...args) { if (CONFIG.debug) console.error('[AeroGuard YT]', ...args); }

  function isElement(node) { return node && node.nodeType === Node.ELEMENT_NODE; }
  function isShadowRoot(node) { return node && node.toString() === '[object ShadowRoot]'; }

  // ============================================================================
  // SHADOW DOM PIERCING
  // ============================================================================
  function pierceShadowDOM(root, selector, callback) {
    if (!CONFIG.enableShadowDomPiercing) return;
    try {
      root.querySelectorAll(selector).forEach(callback);
      root.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) pierceShadowDOM(el.shadowRoot, selector, callback);
      });
    } catch (e) { /* ignore */ }
  }

  function pierceAllShadowRoots(root, callback) {
    if (!CONFIG.enableShadowDomPiercing) return;
    try {
      callback(root);
      root.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) pierceAllShadowRoots(el.shadowRoot, callback);
      });
    } catch (e) { /* ignore */ }
  }

  // ============================================================================
  // ELEMENT HIDING — ZERO LAYOUT SHIFT
  // ============================================================================
  function hideElement(el) {
    if (!el || el._adBlocked) return;
    el._adBlocked = true;
    el._origStyles = {
      display: el.style.display, visibility: el.style.visibility,
      opacity: el.style.opacity, pointerEvents: el.style.pointerEvents,
      height: el.style.height, width: el.style.width,
      overflow: el.style.overflow, position: el.style.position,
      zIndex: el.style.zIndex, transform: el.style.transform
    };
    el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;z-index:-2147483647!important;transform:scale(0)!important;contain:layout size style paint!important';
    el.setAttribute('data-aeroguard-hidden', 'true');
    el.setAttribute('aria-hidden', 'true');
    log('Hidden:', el.tagName, el.className || el.id);
  }

  function restoreElement(el) {
    if (!el || !el._adBlocked) return;
    const s = el._origStyles || {};
    el.style.display = s.display || '';
    el.style.visibility = s.visibility || '';
    el.style.opacity = s.opacity || '';
    el.style.pointerEvents = s.pointerEvents || '';
    el.style.height = s.height || '';
    el.style.width = s.width || '';
    el.style.overflow = s.overflow || '';
    el.style.position = s.position || '';
    el.style.zIndex = s.zIndex || '';
    el.style.transform = s.transform || '';
    el.removeAttribute('data-aeroguard-hidden');
    el._adBlocked = false;
    delete el._origStyles;
  }

  function hidePromotedContent(root = document) {
    let count = 0;
    const promotedSelectors = [
      'ytd-video-renderer', 'ytd-rich-item-renderer', 'ytd-grid-video-renderer',
      'ytd-compact-video-renderer', 'ytd-reel-video-renderer',
      'ytd-shorts-lockup-view-model', 'ytd-channel-renderer',
      'ytd-playlist-renderer', 'ytd-movie-renderer', 'ytd-show-renderer'
    ];

    promotedSelectors.forEach(sel => {
      root.querySelectorAll(sel).forEach(renderer => {
        const badge = renderer.querySelector('[badge-style="BADGE_STYLE_TYPE_PROMOTED"], [badge-style-type="PROMOTED"], ytd-badge-supported-renderer[badge-style="BADGE_STYLE_TYPE_PROMOTED"]');
        if (badge && !renderer._adBlocked) { hideElement(renderer); count++; }
      });
    });

    // Shadow DOM
    if (CONFIG.enableShadowDomPiercing) {
      promotedSelectors.forEach(sel => {
        pierceShadowDOM(root, sel, renderer => {
          const badge = renderer.querySelector('[badge-style="BADGE_STYLE_TYPE_PROMOTED"], [badge-style-type="PROMOTED"], ytd-badge-supported-renderer[badge-style="BADGE_STYLE_TYPE_PROMOTED"]');
          if (badge && !renderer._adBlocked) { hideElement(renderer); count++; }
        });
      });
    }
    return count;
  }

  function findAdElements(root = document) {
    const found = [];
    for (const sel of SAFE_AD_SELECTORS) {
      try {
        root.querySelectorAll(sel).forEach(el => found.push({
          selector: sel, tag: el.tagName, class: el.className, id: el.id, hidden: el._adBlocked
        }));
      } catch (e) {}
    }
    return found;
  }

  // ============================================================================
  // CONSENT BANNERS
  // ============================================================================
  function removeConsentBanners(root = document) {
    if (!CONFIG.removeConsent) return;
    const consentSelectors = [
      'ytd-consent-bump-v2-lightbox', 'tp-yt-paper-dialog[ytd-consent-bump-v2-lightbox]',
      '#consent-bump', '.ytd-consent-bump-v2-lightbox', 'yt-button-renderer[consent]',
      'ytd-button-renderer[consent]', 'ytd-consent-bump-v2-lightbox',
      'tp-yt-iron-overlay-backdrop[opened]', '.yt-consent-dialog',
      'ytd-popup-container[consent]', '#consent-bump-lightbox'
    ];

    consentSelectors.forEach(sel => {
      root.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; el.remove(); });
    });

    if (CONFIG.enableShadowDomPiercing) {
      consentSelectors.forEach(sel => {
        pierceShadowDOM(root, sel, el => { el.style.display = 'none'; el.remove(); });
      });
    }

    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  // ============================================================================
  // VIDEO ELEMENT PATCHING (src, play, currentTime interception)
  // ============================================================================
  function patchVideoElement(video) {
    if (!CONFIG.patchPlayer) return;
    if (!video || video._aeroguardPatched) return;
    video._aeroguardPatched = true;
    log('Patching video element:', video.tagName, video.id || video.className);

    // Track ad state
    video._isAd = false;
    video._adSegment = null;
    video._originalSrc = video.src;

    // Intercept play()
    const origPlay = video.play;
    video.play = function(...args) {
      if (this._isAd && CONFIG.skipVideoAds) {
        log('Blocked ad video play');
        this._isAd = false;
        return Promise.resolve();
      }
      return origPlay.apply(this, args);
    };

    // Intercept src setter
    const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    const origSrcSet = srcDescriptor?.set;
    const origSrcGet = srcDescriptor?.get;

    Object.defineProperty(video, 'src', {
      set: function(val) {
        if (val && typeof val === 'string') {
          const isAdUrl = val.includes('/api/manifest/') ||
                         val.includes('adformat=') ||
                         val.includes('ad_type=') ||
                         val.includes('/ad_') ||
                         (val.includes('googlevideo.com/videoplayback') && val.includes('adformat'));
          if (isAdUrl) {
            log('Blocked ad src:', val.substring(0, 100));
            this._isAd = true;
            return;
          }
        }
        this._isAd = false;
        return origSrcSet?.call(this, val);
      },
      get: origSrcGet,
      configurable: true
    });

    // Intercept currentTime setter (skip ad segments)
    const ctDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    const origCtSet = ctDescriptor?.set;
    const origCtGet = ctDescriptor?.get;

    Object.defineProperty(video, 'currentTime', {
      set: function(val) {
        if (this._adSegment && val >= this._adSegment.start && val <= this._adSegment.end) {
          log('Skipping ad segment:', this._adSegment.start, '->', this._adSegment.end);
          return origCtSet?.call(this, this._adSegment.end + 0.1);
        }
        return origCtSet?.call(this, val);
      },
      get: origCtGet,
      configurable: true
    });

    // Listen for ad-related events
    video.addEventListener('loadstart', () => { video._isAd = false; });
    video.addEventListener('timeupdate', () => {
      if (video._adSegment && video.currentTime >= video._adSegment.start && video.currentTime <= video._adSegment.end) {
        video.currentTime = video._adSegment.end + 0.1;
        video._adSegment = null;
      }
    });

    // Intercept srcObject for MSE
    const srcObjDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
    if (srcObjDescriptor) {
      Object.defineProperty(video, 'srcObject', {
        set: function(val) {
          // Could inspect MediaSource for ad streams
          return srcObjDescriptor.set?.call(this, val);
        },
        get: srcObjDescriptor.get,
        configurable: true
      });
    }
  }

  function setupVideoObserver() {
    const findAndPatchVideo = () => {
      const selectors = [
        'video.html5-main-video', 'video#movie_player', 'video.ytp-video',
        'video[src*="googlevideo.com"]', 'video.html5-video-player',
        '#movie_player video', '.html5-video-container video'
      ];

      for (const sel of selectors) {
        const v = document.querySelector(sel);
        if (v && !v._aeroguardPatched) {
          patchVideoElement(v);
          break;
        }
      }
    };

    // Initial patch
    findAndPatchVideo();

    // Observer for dynamic video elements
    videoObserver = new MutationObserver((mutations) => {
      let shouldCheck = false;
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length) {
          for (const n of m.addedNodes) {
            if (isElement(n) && (n.tagName === 'VIDEO' || n.querySelector?.('video'))) {
              shouldCheck = true;
              break;
            }
          }
        }
      }
      if (shouldCheck) {
        clearTimeout(videoObserver._debounce);
        videoObserver._debounce = setTimeout(findAndPatchVideo, 50);
      }
    });

    videoObserver.observe(document.body || document.documentElement, {
      childList: true, subtree: true
    });
    observers.push(videoObserver);
  }

  // ============================================================================
  // CUSTOM ELEMENTS PATCHING (ad renderers)
  // ============================================================================
  function patchCustomElements() {
    const adTags = [
      'ytd-ad-slot-renderer', 'ytd-display-ad-renderer',
      'ytd-promoted-video-renderer', 'ytd-promoted-sparkles-web-renderer',
      'ytd-action-companion-ad-renderer', 'ytd-in-feed-ad-renderer',
      'ytd-banner-ad-renderer', 'ytd-companion-slot-renderer',
      'ytd-mealbar-promo-renderer', 'ytd-merch-shelf-renderer',
      'ytd-shopping-renderer', 'ytd-masthead-ad-renderer',
      'ytd-promoted-sparkles-text-search-renderer',
      'ytd-promoted-sparkles-video-renderer',
      'ytd-ad-creative-renderer', 'ytd-ad-creative-slot-renderer',
      'ytd-ad-banner-renderer', 'ytd-ad-overlay-renderer',
      'ytd-ad-player-overlay-renderer', 'ytd-ad-companion-renderer',
      'ytd-ad-feedback-renderer', 'ytd-ad-info-renderer',
      'ytd-ad-visit-advertiser-renderer', 'ytd-ad-learn-more-renderer',
      'ytd-ad-skip-button-renderer', 'ytd-engagement-panel-ad-renderer'
    ];

    adTags.forEach(tag => {
      try {
        const ctor = customElements.get(tag);
        if (ctor && !ctor._aeroguardPatched) {
          ctor._aeroguardPatched = true;
          const proto = ctor.prototype;
          const origConnected = proto.connectedCallback;
          const origDisconnected = proto.disconnectedCallback;

          proto.connectedCallback = function() {
            if (origConnected) origConnected.call(this);
            this.style.display = 'none';
            this.innerHTML = '';
            this.setAttribute('data-aeroguard-ad-blocked', 'true');
            this.setAttribute('aria-hidden', 'true');
            log('Blocked custom element:', tag);
          };

          proto.disconnectedCallback = function() {
            if (origDisconnected) origDisconnected.call(this);
          };

          // Also patch attributeChangedCallback if exists
          if (proto.attributeChangedCallback) {
            const origAttr = proto.attributeChangedCallback;
            proto.attributeChangedCallback = function(name, oldVal, newVal) {
              if (name === 'is-promoted' && newVal !== null) {
                this.style.display = 'none';
                this.innerHTML = '';
              }
              return origAttr.call(this, name, oldVal, newVal);
            };
          }
        }
      } catch (e) { /* ignore */ }
    });

    // Observe for new custom element definitions
    if (!window._aeroguardCustomElementsObserver) {
      window._aeroguardCustomElementsObserver = new MutationObserver(() => {
        patchCustomElements();
      });
      window._aeroguardCustomElementsObserver.observe(document.documentElement, {
        childList: true, subtree: true
      });
      observers.push(window._aeroguardCustomElementsObserver);
    }
  }

  // ============================================================================
  // MUTATION OBSERVER WITH 100MS DEBOUNCING
  // ============================================================================
  function setupMutationObserver() {
    const mo = new MutationObserver((mutations) => {
      let check = false;
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length) {
          for (const n of m.addedNodes) {
            if (isElement(n) && (isAdElement(n) || n.querySelector?.(SAFE_AD_SELECTORS.join(',')))) {
              check = true;
              break;
            }
          }
        } else if (m.type === 'attributes' && isElement(m.target)) {
          const el = m.target;
          if (m.attributeName === 'class' || m.attributeName === 'id' ||
              m.attributeName === 'style' || m.attributeName === 'src' ||
              m.attributeName?.startsWith('data-ad')) {
            if (isAdElement(el)) { check = true; break; }
          }
        }
      }
      if (check) {
        clearTimeout(mo._debounce);
        mo._debounce = setTimeout(() => {
          hideAdElements();
          removeConsentBanners();
        }, CONFIG.mutationDebounceMs);
      }
    });

    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'id', 'style', 'src', 'data-ad', 'data-ad-slot', 'data-ad-client', 'data-promoted', 'is-promoted']
    });
    observers.push(mo);
  }

  function isAdElement(el) {
    if (!isElement(el)) return false;
    const cls = (el.className || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const tag = el.tagName.toLowerCase();

    // YouTube-specific ad tags
    if (tag.startsWith('ytd-') && /ad|promo|sponsor|shopping|mealbar|merch|masthead|companion|sparkles/i.test(tag)) return true;

    const patterns = [
      'ad-', '-ad-', 'advert', 'sponsor', 'promo', 'doubleclick',
      'googlesyndication', 'googleadservices', 'taboola', 'outbrain',
      'criteo', 'rubicon', 'appnexus', 'indexexchange', 'pubmatic',
      'smaato', 'moat', 'integral', 'doubleverify', 'ias-', 'adform',
      'adnxs', 'smartadserver', 'amazon-ads', 'casalemedia', 'contextweb',
      'crwdcntrl', 'demdex', 'everesttech', 'exelator', 'eyeview',
      'flashtalking', 'freewheel', 'googleads', 'ib.adnxs', 'idsync',
      'imrworldwide', 'intentiq', 'inneractive', 'innity', 'ipredictive',
      'krxd', 'lijit', 'linksynergy', 'mathtag', 'media.net', 'media6degrees',
      'mediamath', 'moatads', 'mookie1', 'nexac', 'optimizely', 'owneriq',
      'parsely', 'pixel', 'quantserve', 'rbidr', 'rlcdn', 'rubiconproject',
      'scorecardresearch', 'segment', 'serving-sys', 'sharethrough',
      'simpli.fi', 'sonobi', 'specificmedia', 'spotxchange', 'stickyadstv',
      'tapad', 'teads', 'thebrighttag', 'tidaltv', 'tribalfusion', 'turn',
      'tynt', 'visualdna', 'w55c', 'webtrends', 'widiun', 'wishabi', 'xiti',
      'yieldlab', 'yieldmanager', 'yieldmo', 'zedo'
    ];

    for (const p of patterns) {
      if (cls.includes(p) || id.includes(p)) {
        // False positive filters
        if (/adaptive|address|added|admin|advanced|adam|adam|admi|ado/.test(cls + id)) continue;
        return true;
      }
    }

    if (el.hasAttribute('data-ad') || el.hasAttribute('data-ad-slot') ||
        el.hasAttribute('data-ad-client') || el.hasAttribute('data-promoted') ||
        el.hasAttribute('is-promoted') || el.hasAttribute('data-ad-creative')) {
      return true;
    }

    return false;
  }

  // ============================================================================
  // IMA SDK BLOCKING
  // ============================================================================
  function blockImaSdk() {
    if (!CONFIG.blockIMA) return;

    // Block script creation for IMA
    const origCreateElement = document.createElement;
    document.createElement = function(tag, options) {
      const el = origCreateElement.call(this, tag, options);
      if (tag.toLowerCase() === 'script' && el.src) {
        const src = el.src.toLowerCase();
        if (src.includes('imasdk') || src.includes('googleads') ||
            src.includes('doubleclick.net/imasdk') || src.includes('pubads.g.doubleclick.net/imasdk')) {
          log('Blocked IMA SDK script:', el.src);
          return document.createComment('Blocked IMA SDK: ' + el.src);
        }
      }
      return el;
    };

    // Block google.ima namespace
    if (!window._origGoogle) window._origGoogle = window.google;
    Object.defineProperty(window, 'google', {
      configurable: true,
      get: () => new Proxy(window._origGoogle || {}, {
        get: (target, prop) => {
          if (prop === 'ima') {
            log('Blocked access to google.ima');
            return undefined;
          }
          return target[prop];
        },
        has: (target, prop) => prop !== 'ima' && prop in target,
        ownKeys: (target) => Object.keys(target).filter(k => k !== 'ima')
      }),
      set: (v) => { window._origGoogle = v; return true; }
    });

    // Block googletag.pubads
    if (!window._origGoogletag) window._origGoogletag = window.googletag;
    Object.defineProperty(window, 'googletag', {
      configurable: true,
      get: () => new Proxy(window._origGoogletag || {}, {
        get: (target, prop) => {
          if (prop === 'pubads' || prop === 'defineSlot' || prop === 'enableServices' ||
              prop === 'display' || prop === 'cmd') {
            log('Blocked googletag.' + prop);
            return () => {}; // noop
          }
          return target[prop];
        }
      }),
      set: (v) => { window._origGoogletag = v; return true; }
    });
  }

  // ============================================================================
  // FETCH INTERCEPTION FOR /player ENDPOINTS
  // ============================================================================
  function installFetchInterceptor() {
    if (fetchInterceptorInstalled) return;
    fetchInterceptorInstalled = true;

    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      const url = args[0];
      const resp = await origFetch.apply(this, args);

      if (CONFIG.blockFetchAds && typeof url === 'string') {
        const urlLower = url.toLowerCase();
        // Intercept player response
        if (urlLower.includes('/youtubei/v1/player') || urlLower.includes('/player?') ||
            urlLower.includes('/player/') || urlLower.includes('get_video_info')) {
          const clone = resp.clone();
          try {
            const originalText = await clone.text();
          const data = JSON.parse(originalText);
            if (data) {
              // Remove ad signals
              if (data.playabilityStatus) {
                delete data.playabilityStatus.adSignalsInfo;
                delete data.playabilityStatus.adsPresentation;
                delete data.playabilityStatus.adPlacements;
                delete data.playabilityStatus.adBreaks;
                data.playabilityStatus.status = data.playabilityStatus.status || 'OK';
              }
              // Remove player config ads
              if (data.playerConfig) {
                delete data.playerConfig.adConfig;
                delete data.playerConfig.adPlacements;
                delete data.playerConfig.adBreakConfig;
              }
              // Remove video details ads
              if (data.videoDetails) {
                delete data.videoDetails.allowAds;
                delete data.videoDetails.adTagUrl;
                delete data.videoDetails.adTagUrlSet;
                delete data.videoDetails.adBreakSlots;
                delete data.videoDetails.adSlots;
              }
              // Filter adaptive formats
              if (data.streamingData?.adaptiveFormats) {
                data.streamingData.adaptiveFormats = data.streamingData.adaptiveFormats.filter(f =>
                  !f.url?.includes('/api/manifest/') &&
                  !f.mimeType?.includes('application/vnd.apple.mpegurl') &&
                  !f.url?.includes('adformat=') &&
                  !f.url?.includes('ad_type=')
                );
              }
              // Filter HLS manifests
              if (data.streamingData?.hlsManifestUrl) {
                if (data.streamingData.hlsManifestUrl.includes('adformat=')) {
                  delete data.streamingData.hlsManifestUrl;
                }
              }
              // Filter DASH manifest
              if (data.streamingData?.dashManifestUrl) {
                if (data.streamingData.dashManifestUrl.includes('adformat=')) {
                  delete data.streamingData.dashManifestUrl;
                }
              }

              log('Sanitized player response');
              const out = JSON.stringify(data);
          if (out === originalText) { log("player response unchanged - passthrough"); return resp; }
          return new Response(out, {
                status: resp.status,
                statusText: resp.statusText,
                headers: resp.headers
              });
            }
          } catch (e) { /* not JSON, return original */ }
        }

        // Intercept ad-specific endpoints
        if (urlLower.includes('/pagead/') || urlLower.includes('/ads?') ||
            urlLower.includes('/ads/') || urlLower.includes('/ad?') ||
            urlLower.includes('googleads') || urlLower.includes('doubleclick.net') ||
            urlLower.includes('googlesyndication') || urlLower.includes('imasdk')) {
          log('Blocked ad fetch:', url.substring(0, 100));
          return new Response('', { status: 204, statusText: 'No Content' });
        }
      }

      return resp;
    };
  }

  // ============================================================================
  // YTINITIALDATA PROXY
  // ============================================================================
  function installYtInitialDataProxy() {
    if (!CONFIG.patchYtInitialData) return;
    return; // DISABLED: the /ad/i shredder destroyed real YouTube keys ("badges",
    // "loadMore") and the global Object.defineProperty override aborted Polymer's
    // boot (empty skeleton homepage). Ad renderers are hidden in the DOM instead.

    // Sanitize existing data
    if (window.ytInitialData) {
      removeAdsFromInitialData(window.ytInitialData);
    }

    // Proxy setter/getter
    let internalData = window.ytInitialData;
    Object.defineProperty(window, 'ytInitialData', {
      configurable: true,
      get: () => internalData,
      set: (v) => {
        internalData = v;
        if (v) removeAdsFromInitialData(v);
      }
    });

    // Also patch ytInitialData on window if reassigned
    const origDefineProperty = Object.defineProperty;
    Object.defineProperty = function(obj, prop, desc) {
      if (obj === window && prop === 'ytInitialData' && desc?.set) {
        const origSet = desc.set;
        desc.set = function(v) {
          internalData = v;
          if (v) removeAdsFromInitialData(v);
          return origSet?.call(this, v);
        };
      }
      return origDefineProperty.call(this, obj, prop, desc);
    };
  }

  function removeAdsFromInitialData(data) {
    // Disabled: the old /ad/i key shredder destroyed legitimate YouTube keys
    // ("badges", "loadMore"). The proxy that called this is disabled; kept as
    // a safe anchored walker in case anything re-enables it.
    if (!data || typeof data !== 'object') return;
    const isAdKey = (key) => /^(ad(?![a-z])|ads|ad[A-Z_]|promo|sponsor|shopping|mealbar|merch)/i.test(key);
    const processNode = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.renderer) {
        for (const k of Object.keys(node.renderer)) {
          if (isAdKey(k)) delete node.renderer[k];
        }
      }
      for (const k of Object.keys(node)) {
        const val = node[k];
        if (Array.isArray(val)) {
          const filtered = val.filter(item => {
            if (item?.renderer) {
              const rk = Object.keys(item.renderer);
              return !rk.some(isAdKey);
            }
            return true;
          });
          if (filtered.length !== val.length) {
            log('Filtered', val.length - filtered.length, 'ad items from array:', k);
            node[k] = filtered;
          }
          filtered.forEach(item => processNode(item));
        } else if (val && typeof val === 'object') {
          processNode(val);
        }
      }
    };
    processNode(data);
  }

  // ============================================================================
  // SPA NAVIGATION HANDLING (yt-navigate-finish)
  // ============================================================================
  function handleSpaNavigation() {
    if (!CONFIG.handleSpaNavigation) return;

    // Listen for YouTube's SPA navigation events
    window.addEventListener('yt-navigate-finish', () => {
      log('SPA navigation detected: yt-navigate-finish');
      scheduleSpaCleanup();
    });

    window.addEventListener('yt-navigate-start', () => {
      log('SPA navigation start');
    });

    // Also listen for pushState/replaceState
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;

    history.pushState = function(...args) {
      const ret = origPushState.apply(this, args);
      log('pushState navigation');
      scheduleSpaCleanup();
      return ret;
    };

    history.replaceState = function(...args) {
      const ret = origReplaceState.apply(this, args);
      log('replaceState navigation');
      scheduleSpaCleanup();
      return ret;
    };

    window.addEventListener('popstate', () => {
      log('popstate navigation');
      scheduleSpaCleanup();
    });

    // Periodic URL check as fallback
    setInterval(() => {
      if (location.href !== lastUrl) {
        log('URL changed:', lastUrl, '->', location.href);
        lastUrl = location.href;
        scheduleSpaCleanup();
      }
    }, 500);
  }

  function scheduleSpaCleanup() {
    clearTimeout(spaNavigationTimer);
    spaNavigationTimer = setTimeout(() => {
      log('Running SPA cleanup');
      hideAdElements();
      removeConsentBanners();
      patchCustomElements();
      setupVideoObserver(); // Re-patch video if needed
    }, CONFIG.spaNavigationDebounceMs);
  }

  // ============================================================================
  // PERIODIC CLEANUP (1s interval)
  // ============================================================================
  function startPeriodicCleanup() {
    if (cleanupInterval) clearInterval(cleanupInterval);
    cleanupInterval = setInterval(() => {
      emergencyUnblockPlayer(); // Emergency unblock first
      const count = hideAdElements();
      removeConsentBanners();
      if (count > 0) log('Periodic cleanup: hidden', count, 'elements');
    }, CONFIG.periodicCleanupInterval);
  }

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================
  function handleMessage(msg, sender, sendResponse) {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'UPDATE_CONFIG':
        Object.assign(CONFIG, msg.config);
        applyConfig();
        sendResponse({ success: true });
        break;
      case 'GET_AD_ELEMENTS':
        sendResponse({ elements: findAdElements() });
        break;
      case 'FORCE_CLEANUP':
        hideAdElements();
        removeConsentBanners();
        sendResponse({ success: true });
        break;
      case 'GET_STATS':
        sendResponse({
          hiddenCount: document.querySelectorAll('[data-aeroguard-hidden="true"]').length,
          config: CONFIG,
          url: location.href
        });
        break;
      case 'TOGGLE_DEBUG':
        CONFIG.debug = msg.enabled;
        sendResponse({ success: true });
        break;
      case 'EMERGENCY_UNBLOCK':
        emergencyUnblockPlayer();
        sendResponse({ success: true });
        break;
    }
  }

  function applyConfig() {
    if (CONFIG.hideAdElements) hideAdElements();
    if (CONFIG.removeConsent) removeConsentBanners();
    if (CONFIG.patchPlayer) setupVideoObserver();
    if (CONFIG.blockIMA) blockImaSdk();
    if (CONFIG.blockFetchAds) installFetchInterceptor();
    if (CONFIG.patchYtInitialData) installYtInitialDataProxy();
    if (CONFIG.handleSpaNavigation) handleSpaNavigation();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  function init() {
    if (initialized) return;
    initialized = true;
    log('YouTube content script initializing...', location.href);

    // EMERGENCY: Unblock player immediately
    emergencyUnblockPlayer();

    // Immediate synchronous patches (document_start)
    blockImaSdk();
    installFetchInterceptor();
    installYtInitialDataProxy();
    patchCustomElements();

    // Wait for DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        hideAdElements();
        removeConsentBanners();
        setupVideoObserver();
        setupMutationObserver();
        handleSpaNavigation();
        startPeriodicCleanup();
        notifyReady();
      });
    } else {
      hideAdElements();
      removeConsentBanners();
      setupVideoObserver();
      setupMutationObserver();
      handleSpaNavigation();
      startPeriodicCleanup();
      notifyReady();
    }
  }

  function notifyReady() {
    try {
      chrome.runtime.sendMessage({
        type: 'CONTENT_SCRIPT_READY',
        url: location.href,
        timestamp: Date.now()
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  }

  // EMERGENCY PLAYER UNBLOCK - runs immediately and periodically
  function emergencyUnblockPlayer() {
    const selectors = [
      'video.html5-main-video',
      'video#movie_player',
      '#movie_player',
      '.html5-video-player',
      '.html5-video-container',
      'video.html5-video-player',
      'video.ytp-video',
      'video[src*="googlevideo.com/videoplayback"]'
    ];

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (el._adBlockerHidden) {
          el._adBlocked = false;
          el.style.cssText = '';
          el.removeAttribute('style');
          el.removeAttribute('data-aeroguard-hidden');
          el.style.display = '';
          el.style.visibility = '';
          el.style.opacity = '';
          el.style.pointerEvents = '';
          el.style.transform = '';
          el.style.height = '';
          el.style.width = '';
          el.style.overflow = '';
          el.style.position = '';
          el.style.zIndex = '';
          el.style.contain = '';
          el.removeAttribute('data-aeroguard-hidden');
          log('Emergency unblocked player element:', sel, el);
        }
      });
    });
  }

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    observers.forEach(o => { try { o.disconnect(); } catch (e) {} });
    if (videoObserver) { try { videoObserver.disconnect(); } catch (e) {} }
    if (cleanupInterval) clearInterval(cleanupInterval);
    if (spaNavigationTimer) clearTimeout(spaNavigationTimer);
    if (window._aeroguardCustomElementsObserver) {
      try { window._aeroguardCustomElementsObserver.disconnect(); } catch (e) {}
    }
  });

  // Handle pagehide for bfcache
  window.addEventListener('pagehide', () => {
    observers.forEach(o => { try { o.disconnect(); } catch (e) {} });
  });

  // Re-init on pageshow (bfcache restore)
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      log('Page restored from bfcache, re-initializing');
      initialized = false;
      observers = [];
      videoObserver = null;
      cleanupInterval = null;
      spaNavigationTimer = null;
      init();
    }
  });

  // Debug export
  window.__aeroguardYT = {
    hideAdElements,
    removeConsentBanners,
    findAdElements,
    patchVideoElement,
    patchCustomElements,
    installFetchInterceptor,
    installYtInitialDataProxy,
    CONFIG,
    getStats: () => ({
      hiddenCount: document.querySelectorAll('[data-aeroguard-hidden="true"]').length,
      observers: observers.length,
      videoPatched: !!document.querySelector('video._aeroguardPatched'),
      url: location.href
    })
  };

  // Listen for scriptlet updates from the scriptlet runner
window.addEventListener('aeroguard:scriptlets-updated', (event) => {
  log('Scriptlets updated, re-initializing...');
  // Re-run key functions
  hideAdElements();
  removeConsentBanners();
  patchCustomElements();
  setupVideoObserver();
});

// Start
  init();
})();
// Defined: pages reference hideAdElements() but the sweep lives in
// hidePromotedContent(); function declarations hoist, so this maps it.
function hideAdElements() { try { hidePromotedContent(); } catch (e) {} }
