// Injected into MAIN world at document_start
(() => {
  'use strict';

  // Anti-Adblock Detection Bypasses
  window.canRunAds = true;
  window.isAdBlockActive = false;
  window.BlockAdBlock = undefined;
  window.google_ad_client = true;

  // Stub Analytics & Tracking APIs so scripts fail silently without errors
  const noop = () => {};
  const noopReturn = () => noop;

  window.ga = window.ga || noop;
  window.gtag = window.gtag || noop;
  window.fbq = window.fbq || noop;
  window.twq = window.twq || noop;
  window.pintrk = window.pintrk || noop;
  window.hj = window.hj || noop;

  window.amplitude = window.amplitude || { init: noop, logEvent: noop };
  window.mixpanel = window.mixpanel || { init: noop, track: noop };
  window.Sentry = window.Sentry || { init: noop, captureException: noop };
})();