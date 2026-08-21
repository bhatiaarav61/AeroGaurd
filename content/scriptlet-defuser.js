// Injected into MAIN World at document_start
(() => {
  'use strict';

  const noop = () => {};
  const noopTrue = () => true;

  // Anti-Adblock Defusers (BlockAdBlock / FuckAdBlock Bypass)
  window.BlockAdBlock = noop;
  window.FuckAdBlock = noop;
  window.sniff = noop;
  window.canRunAds = true;
  window.isAdBlockActive = false;

  // Stubs for Web Analytics Frameworks
  window.ga = window.ga || noop;
  window.gtag = window.gtag || noop;
  window.google_ad_client = undefined;
  window.dataLayer = window.dataLayer || [];
  window.googletag = {
    cmd: [],
    defineSlot: () => ({ addService: () => ({ setTargeting: noop }), setTargeting: noop }),
    display: noop,
    enableServices: noop,
    pubads: () => ({ addEventListener: noop, setTargeting: noop, refresh: noop })
  };

  window.fbq = noop;
  window._fbq = noop;
  window.mixpanel = { init: noop, track: noop, identify: noop, people: { set: noop } };
  window.amplitude = { init: noop, logEvent: noop };
  window.hj = noop;
  window.ym = noop;

  // Disable Notification Prompts Abuse
  if (window.Notification) {
    window.Notification.requestPermission = () => Promise.resolve('denied');
  }

  // Intercept Telemetry Beacons
  if (navigator.sendBeacon) {
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      if (typeof url === 'string' && (
        url.includes('analytics') || url.includes('telemetry') ||
        url.includes('clarity.ms') || url.includes('facebook')
      )) {
        return true;
      }
      return nativeBeacon(url, data);
    };
  }
})();