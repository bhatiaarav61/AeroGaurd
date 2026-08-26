// content/defuser-main.js — Main-world anti-adblock defuser (runs at document_start in MAIN world)
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

  // YouTube-specific anti-adblock defusers
  window.yt = window.yt || {};
  window.yt.config_ = window.yt.config_ || {};
  window.yt.config_.EXPERIMENT_FLAGS = window.yt.config_.EXPERIMENT_FLAGS || {};

  // Block YouTube ad detection
  if (window.yt && window.yt.config_) {
    window.yt.config_.AD_PREROLL = false;
    window.yt.config_.AD_MIDROLL = false;
    window.yt.config_.AD_POSTROLL = false;
    window.yt.config_.EXPERIMENT_FLAGS.ad_placements_on_player_controls = false;
  }
  window.ytInitialPlayerResponse = window.ytInitialPlayerResponse || {};
  if (window.ytInitialPlayerResponse) {
    window.ytInitialPlayerResponse.adPlacements = [];
  }
})();