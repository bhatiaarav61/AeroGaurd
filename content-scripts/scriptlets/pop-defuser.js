/**
 * Clickjack & Popunder Shield
 * Blocks unauthorized window.open calls from ad networks
 * Hooks window.open to prevent popunder windows unless user-initiated
 * Runs in MAIN world at document_start
 */
(function () {
  'use strict';

  // ============================================
  // Configuration
  // ============================================

  // Known ad network URL patterns that indicate popunders
  const POPUNDER_URL_PATTERNS = [
    // Generic popunder/redirect patterns
    /popunder/i,
    /clickthrough/i,
    /redirect/i,
    /goto/i,
    /outbound/i,
    /trackclick/i,
    /clicktrack/i,
    /adclick/i,
    /advertising\.com.*click/i,
    /doubleclick\.net.*click/i,
    /googlesyndication.*click/i,

    // Specific ad networks known for popunders
    /adsterra/i,
    /propellerads/i,
    /popads/i,
    /popcash/i,
    /adcash/i,
    /hilltopads/i,
    /revenuehits/i,
    /admixer/i,
    /advertise\.com/i,
    /buysellads/i,
    /chitika/i,
    /infolinks/i,
    /adbrite/i,
    /adengage/i,
    /adknowledge/i,
    /admob/i,
    /applovin/i,
    /chartboost/i,
    /unityads/i,
    /vungle/i,
    /tapjoy/i,
    /flurry/i,
    /kochava/i,
    /adjust/i,
    /appsflyer/i,
    /branch\.io/i,
    /singular\.net/i,
    /tenjin/i,
    /fyber/i,
    /smaato/i,
    /inneractive/i,
    /mopub/i,
    /moat/i,
    /integralads/i,
    /adcolony/i,
    /heyzap/i,
    /leadbolt/i,
    /startapp/i,
    /adbuddiz/i,
    /mobilecore/i,
    /yeahmobi/i,
    /adwo/i,
    /adx/i,
    /rubiconproject.*click/i,
    /pubmatic.*click/i,
    /openx.*click/i,
    /criteo.*click/i,
    /adnxs.*click/i,
    /smartadserver.*click/i,
    /teads.*click/i,
    /outbrain.*click/i,
    /taboola.*click/i,
    /revcontent.*click/i,
    /mgid.*click/i,
    /contentad.*click/i,
    /adblade.*click/i,
    /yieldmo.*click/i,
    /gumgum.*click/i,
    /triplelift.*click/i,
    /sharethrough.*click/i,
    /nativo.*click/i,
    /earnify/i,
    /spoutable/i,
    /zemanta/i,
    /disqus.*click/i,
    /vibrant.*click/i,
    /sovrn.*click/i,
    /indexexchange.*click/i,
    /sonobi.*click/i,
    /districtm.*click/i,
    /yieldlab.*click/i,
    /adform.*click/i,
    /adscale.*click/i,
    /adswizz.*click/i,
    /advertising.*click/i,
    /atdmt.*click/i,
    /bluekai.*click/i,
    /casalemedia.*click/i,
    /cxense.*click/i,
    /demdex.*click/i,
    /dotomi.*click/i,
    /everesttech.*click/i,
    /exelator.*click/i,
    /eyeota.*click/i,
    /flashtalking.*click/i,
    /gemius.*click/i,
    /imrworldwide.*click/i,
    /ixnp.*click/i,
    /klaviyo.*click/i,
    /krux.*click/i,
    /lijit.*click/i,
    /lotame.*click/i,
    /mathtag.*click/i,
    /medianet.*click/i,
    /mediamath.*click/i,
    /moatads.*click/i,
    /nanigans.*click/i,
    /neodatagroup.*click/i,
    /nielsen.*click/i,
    /parsely.*click/i,
    /pixel.*click/i,
    /quantcast.*click/i,
    /radiumone.*click/i,
    /rfihub.*click/i,
    /rlcdn.*click/i,
    /rubiconproject.*click/i,
    /semasio.*click/i,
    /serverbid.*click/i,
    /sharethrough.*click/i,
    /simplifi.*click/i,
    /smaato.*click/i,
    /smartadserver.*click/i,
    /sovrn.*click/i,
    /specificmedia.*click/i,
    /stickyadstv.*click/i,
    /tapad.*click/i,
    /thetradedesk.*click/i,
    /turn.*click/i,
    /veruta.*click/i,
    /vidible.*click/i,
    /visualdna.*click/i,
    /w55c.*click/i,
    /yieldoptimizer.*click/i,
    /adzerk.*click/i,
    /adblade.*click/i,
    /adskeeper.*click/i,
    /adsupply.*click/i,
    /adup-tech.*click/i,
    /bidtheatre.*click/i,
    /bidswitch.*click/i,
    /bidtellect.*click/i,
    /conversantmedia.*click/i,
    /dataxu.*click/i,
    /districtm.*click/i,
    /dyntrk.*click/i,
    /eyeviewads.*click/i,
    /freewheel.*click/i,
    /hb-api.*click/i,
    /indexexchange.*click/i,
    /inner-active.*click/i,
    /innity.*click/i,
    /ipredictive.*click/i,
    /krxd.*click/i,
    /loopme.*click/i,
    /magnite.*click/i,
    /netmng.*click/i,
    /nexage.*click/i,
    /platform\.io.*click/i,
    /prebid.*click/i,
    /pulsepoint.*click/i,
    /quantcast.*click/i,
    /realytics.*click/i,
    /rhythmone.*click/i,
    /rockerbox.*click/i,
    /rokt.*click/i,
    /rtbhouse.*click/i,
    /rtk\.io.*click/i,
    /spotx.*click/i,
    /stackadapt.*click/i,
    /teads.*click/i,
    /tremorvideo.*click/i,
    /triplelift.*click/i,
    /unruly.*click/i,
    /verizonmedia.*click/i,
    /videoamp.*click/i,
    /videoplaza.*click/i,
    /wunderkind.*click/i,
    /yieldlab.*click/i,
    /yieldmo.*click/i,
    /zergnet.*click/i,
    /zvelo.*click/i,

    // Betting/gambling redirect patterns
    /bet\d+/i,
    /betting/i,
    /casino/i,
    /poker/i,
    /slots/i,
    /gambling/i,

    // URL shortener abuse
    /bit\.ly.*ad/i,
    /tinyurl.*ad/i,
    /t\.co.*ad/i,
    /goo\.gl.*ad/i,
    /ow\.ly.*ad/i,
    /is\.gd.*ad/i,
    /buff\.ly.*ad/i,
    /rebrand\.ly.*ad/i
  ];

  // Legitimate domains that should be allowed to open popups
  const ALLOWED_POPUP_DOMAINS = [
    // Auth providers
    'accounts.google.com',
    'accounts.youtube.com',
    'login.microsoftonline.com',
    'login.live.com',
    'appleid.apple.com',
    'github.com/login',
    'gitlab.com/users/sign_in',
    'bitbucket.org/account/signin',
    'auth.atlassian.com',
    'login.salesforce.com',
    'signin.aws.amazon.com',
    'login.okta.com',
    'auth0.com',
    'accounts.spotify.com',
    'accounts.slack.com',
    'discord.com/oauth2',
    'telegram.org/auth',
    'web.telegram.org/auth',

    // Payment providers
    'paypal.com',
    'stripe.com',
    'checkout.stripe.com',
    'pay.google.com',
    'pay.apple.com',
    'amazon.com/ap/signin',

    // OAuth providers
    'oauth.net',
    'openid.net'
  ];

  // Trusted target values
  const TRUSTED_TARGETS = ['_self', '_parent', '_top'];

  // ============================================
  // State Tracking
  // ============================================

  let lastUserInteraction = 0;
  let userInteractionTypes = new Set(['click', 'mouseup', 'keydown', 'keyup', 'touchstart', 'touchend']);
  const blockedPopups = [];
  const allowedPopups = [];

  const nativeOpen = window.open;
  const nativeAlert = window.alert;
  const nativeConfirm = window.confirm;
  const nativePrompt = window.prompt;

  // ============================================
  // User Interaction Tracking
  // ============================================

  function trackUserInteraction(event) {
    if (userInteractionTypes.has(event.type)) {
      lastUserInteraction = Date.now();
    }
  }

  // Track user interactions globally
  ['click', 'mouseup', 'keydown', 'keyup', 'touchstart', 'touchend'].forEach(type => {
    document.addEventListener(type, trackUserInteraction, { passive: true, capture: true });
    window.addEventListener(type, trackUserInteraction, { passive: true, capture: true });
  });

  // ============================================
  // Helper Functions
  // ============================================

  function isUserInitiated() {
    // Consider user-initiated if interaction was within last 500ms
    return (Date.now() - lastUserInteraction) < 500;
  }

  function isTrustedTarget(target) {
    return TRUSTED_TARGETS.includes(target) || !target || target === '';
  }

  function isAllowedDomain(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      return ALLOWED_POPUP_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
    } catch {
      return false;
    }
  }

  function isPopunderUrl(url) {
    if (!url) return false;
    const urlString = String(url).toLowerCase();
    return POPUNDER_URL_PATTERNS.some(pattern => pattern.test(urlString));
  }

  function isSuspiciousFeatures(features) {
    if (!features) return false;
    const featString = String(features).toLowerCase();
    // Suspicious: no toolbar, no location bar, no status, small size, off-screen
    return featString.includes('toolbar=no') ||
           featString.includes('location=no') ||
           featString.includes('status=no') ||
           featString.includes('menubar=no') ||
           featString.includes('width=1') ||
           featString.includes('height=1') ||
           featString.includes('left=-') ||
           featString.includes('top=-') ||
           featString.includes('left=9999') ||
           featString.includes('top=9999');
  }

  function logBlockedPopup(url, target, features, reason) {
    const entry = {
      url: String(url),
      target,
      features: String(features),
      reason,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      referrer: document.referrer
    };
    blockedPopups.push(entry);
    console.warn('[AeroGuard] Blocked popunder:', entry);

    // Keep only last 100 entries
    if (blockedPopups.length > 100) blockedPopups.shift();
  }

  function logAllowedPopup(url, target, features, reason) {
    const entry = {
      url: String(url),
      target,
      features: String(features),
      reason,
      timestamp: Date.now()
    };
    allowedPopups.push(entry);
    if (allowedPopups.length > 50) allowedPopups.shift();
  }

  // ============================================
  // window.open Hook
  // ============================================

  window.open = function (url, target, features) {
    const urlString = String(url || '');
    const targetString = String(target || '_blank');
    const featuresString = String(features || '');

    // Allow empty URLs (about:blank) for legitimate use
    if (!urlString || urlString === 'about:blank' || urlString === '') {
      // Still check if it's user-initiated for _blank
      if (targetString === '_blank' && !isUserInitiated()) {
        logBlockedPopup(urlString, targetString, featuresString, 'empty_url_non_user_initiated');
        return null;
      }
      logAllowedPopup(urlString, targetString, featuresString, 'empty_url_allowed');
      return nativeOpen.apply(this, arguments);
    }

    // Check if it's a known popunder/ad network URL
    if (isPopunderUrl(urlString)) {
      logBlockedPopup(urlString, targetString, featuresString, 'popunder_url_pattern');
      return null;
    }

    // Check for suspicious window features
    if (isSuspiciousFeatures(featuresString)) {
      logBlockedPopup(urlString, targetString, featuresString, 'suspicious_features');
      return null;
    }

    // Check if target is _blank (new window/tab)
    if (targetString === '_blank' || targetString === 'new' || targetString === 'popup') {
      // Must be user-initiated
      if (!isUserInitiated()) {
        logBlockedPopup(urlString, targetString, featuresString, 'non_user_initiated_blank_target');
        return null;
      }

      // Allow if it's a trusted domain
      if (isAllowedDomain(urlString)) {
        logAllowedPopup(urlString, targetString, featuresString, 'trusted_domain');
        return nativeOpen.apply(this, arguments);
      }

      // Allow if it's same origin
      try {
        const urlObj = new URL(urlString);
        if (urlObj.origin === window.location.origin) {
          logAllowedPopup(urlString, targetString, featuresString, 'same_origin');
          return nativeOpen.apply(this, arguments);
        }
      } catch {
        // Invalid URL, allow if user-initiated
      }

      // For cross-origin _blank, require explicit user gesture
      if (isUserInitiated()) {
        logAllowedPopup(urlString, targetString, featuresString, 'user_initiated_cross_origin');
        return nativeOpen.apply(this, arguments);
      }

      logBlockedPopup(urlString, targetString, featuresString, 'cross_origin_no_gesture');
      return null;
    }

    // For non-_blank targets, check if trusted
    if (!isTrustedTarget(targetString)) {
      if (!isUserInitiated()) {
        logBlockedPopup(urlString, targetString, featuresString, 'untrusted_target_no_gesture');
        return null;
      }
    }

    // Allow by default for trusted targets
    logAllowedPopup(urlString, targetString, featuresString, 'trusted_target');
    return nativeOpen.apply(this, arguments);
  };

  // Preserve native properties
  window.open.toString = () => 'function open() { [native code] }';

  // ============================================
  // Additional Protections
  // ============================================

  // Block document.write that might inject popunder scripts
  const nativeWrite = document.write;
  const nativeWriteLn = document.writeln;

  document.write = function (markup) {
    if (markup && typeof markup === 'string') {
      const lower = markup.toLowerCase();
      if (lower.includes('window.open') && POPUNDER_URL_PATTERNS.some(p => p.test(lower))) {
        console.warn('[AeroGuard] Blocked document.write with popunder script');
        return;
      }
    }
    return nativeWrite.apply(this, arguments);
  };

  document.writeln = function (markup) {
    if (markup && typeof markup === 'string') {
      const lower = markup.toLowerCase();
      if (lower.includes('window.open') && POPUNDER_URL_PATTERNS.some(p => p.test(lower))) {
        console.warn('[AeroGuard] Blocked document.writeln with popunder script');
        return;
      }
    }
    return nativeWriteLn.apply(this, arguments);
  };

  // Block <a target="_blank"> without rel="noopener noreferrer" on suspicious links
  const linkObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const links = node.tagName === 'A' ? [node] : Array.from(node.querySelectorAll('a[target="_blank"]'));
            links.forEach(link => {
              const href = link.href || '';
              if (href && isPopunderUrl(href)) {
                link.removeAttribute('target');
                link.setAttribute('rel', 'noopener noreferrer');
                console.warn('[AeroGuard] Neutralized suspicious target="_blank" link:', href);
              }
            });
          }
        }
      }
    }
  });

  // ============================================
  // Initialize
  // ============================================

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        linkObserver.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true
        });
      });
    } else {
      linkObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    // Cleanup
    window.addEventListener('beforeunload', () => {
      linkObserver.disconnect();
    });

    console.log('[AeroGuard] Popunder shield active');
  }

  // Expose API
  window.AeroGuardPopunderShield = {
    getBlockedPopups: () => [...blockedPopups],
    getAllowedPopups: () => [...allowedPopups],
    getStats: () => ({
      blockedCount: blockedPopups.length,
      allowedCount: allowedPopups.length,
      lastInteraction: lastUserInteraction,
      isUserActive: isUserInitiated()
    }),
    addAllowedDomain: (domain) => {
      if (!ALLOWED_POPUP_DOMAINS.includes(domain)) {
        ALLOWED_POPUP_DOMAINS.push(domain);
      }
    },
    addPopunderPattern: (pattern) => {
      if (pattern instanceof RegExp) {
        POPUNDER_URL_PATTERNS.push(pattern);
      }
    },
    setInteractionWindow: (ms) => {
      // Could modify the 500ms threshold if needed
    }
  };

  init();
})();