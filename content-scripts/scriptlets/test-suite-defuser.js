// test-suite-defuser.js - Inject into MAIN world at document_start
(() => {
  'use strict';

  // Embedded domain list for beacon blocking (no external dependencies)
  const TRACKER_DOMAINS = [
    'pagead2.googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
    'google-analytics.com', 'analytics.google.com', 'googletagmanager.com',
    'googletagservices.com', 'doubleclick.net', 'ad.doubleclick.net',
    'static.doubleclick.net', 'stats.g.doubleclick.net', 'googleoptimize.com',
    'connect.facebook.net', 'pixel.facebook.com', 'an.facebook.com',
    'graph.facebook.com', 'tr.facebook.com',
    'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'amazon-adsystem.com',
    'media.net', 'rubiconproject.com', 'pubmatic.com', 'openx.net', 'appnexus.com',
    'adnxs.com', 'bidswitch.net', 'casalemedia.com', 'indexww.com', 'adroll.com',
    'smartadserver.com', 'yieldlab.net', 'exponential.com', 'popads.net', 'popcash.net',
    'adsterra.com', 'propellerads.com', 'exoclick.com', 'juicyads.com', 'adform.net',
    'revcontent.com', 'infolinks.com', 'zedo.com', 'adbringer.com', 'tribalfusion.com',
    'quantserve.com', 'quantcount.com', 'scorecardresearch.com', 'statcounter.com',
    'hotjar.com', 'hotjar.io', 'clarity.ms', 'sentry.io', 'bugsnag.com',
    'mixpanel.com', 'amplitude.com', 'segment.io', 'segment.com', 'logrocket.com',
    'mouseflow.com', 'fullstory.com', 'crazyegg.com', 'heap.io', 'inspectlet.com',
    'chartbeat.com', 'chartbeat.net', 'rollbar.com', 'raygun.io', 'trackjs.com',
    'alexa.com', 'omtrdc.net', 'demdex.net', 'bluekai.com', 'krxd.net', 'moatads.com',
    'mc.yandex.ru', 'mc.yandex.md', 'yastatic.net', 'an.yandex.ru',
    'top-fwz1.mail.ru', 'counter.yadro.ru', 'rambler.ru',
    'ads-twitter.com', 'analytics.twitter.com', 'platform.twitter.com',
    'snap.licdn.com', 'licdn.com', 'analytics.tiktok.com', 'ct.pinterest.com',
    'widgets.pinterest.com', 'redditstatic.com', 'pixel.wp.com',
    'onesignal.com', 'pushwoosh.com', 'appsflyer.com', 'adjust.com', 'branch.io',
    'flurry.com', 'urbanairship.com', 'tapjoy.com', 'applovin.com', 'unity3d.com',
    'ads.unity3d.com', 'ironctr.com', 'mbridge.io', 'vungle.com', 'chartboost.com',
    'adcolony.com', 'fyber.com', 'inmobi.com', 'mobfox.com',
    'telemetry.microsoft.com', 'v10.events.data.microsoft.com', 'data.microsoft.com',
    'metrics.icloud.com', 'metrics.apple.com', 'tracking.miui.com', 'api.ad.xiaomi.com',
    'metrics.data.hicloud.com', 'diagnostics.meizu.com', 'telemetry.sdk.samsung.com',
    'samsungads.com', 'geolocation.onetrust.com', 'cdn.cookielaw.org'
  ];

  const emptyFn = () => {};
  const emptyArr = [];

  // Stub Google Analytics & Tag Manager
  window.ga = emptyFn;
  window.gtag = emptyFn;
  window.google_ad_client = undefined;
  window.dataLayer = window.dataLayer || [];
  window.googletag = window.googletag || { cmd: [], defineSlot: () => ({ addService: emptyFn }), display: emptyFn, enableServices: emptyFn };

  // Stub Meta / Facebook Pixel
  window.fbq = emptyFn;
  window._fbq = emptyFn;

  // Stub Analytics platforms
  window.mixpanel = { init: emptyFn, track: emptyFn, identify: emptyFn, people: { set: emptyFn } };
  window.amplitude = { init: emptyFn, logEvent: emptyFn, setUserId: emptyFn };
  window.hj = emptyFn;
  window._hjSettings = {};

  // Stub Yandex & Criteo
  window.ym = emptyFn;
  window.criteo_q = emptyArr;

  // Block beacon transmission calls to trackers
  if (navigator.sendBeacon) {
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      if (typeof url === 'string' && TRACKER_DOMAINS.some(d => url.includes(d))) {
        return true; // Simulate successful receipt without sending data
      }
      return nativeBeacon(url, data);
    };
  }
})();