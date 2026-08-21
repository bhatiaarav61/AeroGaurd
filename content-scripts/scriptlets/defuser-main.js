// defuser-main.js (Injected into MAIN world at document_start)
(() => {
  'use strict';

  const noop = () => {};
  const emptyObj = {};
  const emptyArr = [];

  // 1. Stub tracking objects
  window.ga = window.ga || noop;
  window.gtag = window.gtag || noop;
  window.google_ad_client = undefined;
  window.dataLayer = window.dataLayer || [];
  window.googletag = window.googletag || {
    cmd: [],
    defineSlot: () => ({ addService: noop, setTargeting: noop }),
    display: noop,
    enableServices: noop
  };

  window.fbq = window.fbq || noop;
  window._fbq = window.fbq;

  window.mixpanel = { init: noop, track: noop, identify: noop, people: { set: noop } };
  window.amplitude = { init: noop, logEvent: noop, setUserId: noop };
  window.hj = window.hj || noop;
  window._hjSettings = {};

  window.ym = window.ym || noop;
  window.criteo_q = window.criteo_q || emptyArr;
  window.outbrain = window.outbrain || { enable: noop };

  // 2. Intercept navigator.sendBeacon
  if (navigator.sendBeacon) {
    const originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      if (typeof url === 'string' && (
        url.includes('google-analytics') ||
        url.includes('analytics') ||
        url.includes('telemetry') ||
        url.includes('clarity.ms') ||
        url.includes('hotjar') ||
        url.includes('facebook.com')
      )) {
        return true; // Fake success
      }
      return originalBeacon(url, data);
    };
  }

  // 3. Intercept Fetch and XHR for analytics endpoints
  const nativeFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (
      url.includes('google-analytics') ||
      url.includes('doubleclick') ||
      url.includes('clarity.ms') ||
      url.includes('hotjar') ||
      url.includes('sentry.io')
    ) {
      return new Response('{}', { status: 200, statusText: 'OK' });
    }
    return nativeFetch.apply(this, args);
  };
})();