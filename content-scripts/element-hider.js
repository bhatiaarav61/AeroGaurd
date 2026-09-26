/**
 * Element Hider - Cosmetic Filtering Engine (Aggressive Mode)
 * Runs at document_start to hide elements matching cosmetic filters
 * Includes built-in comprehensive ad hiding rules + dynamic filters
 */

class ElementHider {
  constructor() {
    this.filters = [];
    this.genericSelectors = [];
    this.builtInFilters = [
      // Generic ad containers
      "##.ad-banner", "##.adsbox", "##.advertisement", "##.sponsor", "##.ad-unit",
      "##.ad-slot", "##.ad-wrapper", "##.ad-container", "##.ad-inner", "##.advert",
      "##.advertisment", "##.advertizing", "##.adspace", "##.ad-place", "##.ad-position",
      "##.ad-location", "##.ad-area", "##.ad-zone", "##.ad-block", "##.ad-module",
      "##.ad-widget", "##.ad-component", "##.ad-element", "##.ad-item",
      "##.native-ad", "##.promoted-content", "##.recommended-by", "##.sponsored-content",
      "##.content-ad", "##.feed-ad", "##.in-feed-ad", "##.advertorial",
      
      // ID-based selectors
      "##[id^=\"ad-\"]", "##[id*=\"ad_\"]", "##[id*=\"google_ads\"]", "##[id*=\"adsense\"]",
      "##[id*=\"doubleclick\"]", "##[id*=\"advert\"]", "##[id*=\"sponsor\"]",
      
      // Class-based selectors (ad-industry slot names only - broad matches like
      // [class*="overlay"] / [class*="popup"] hide legit modals and break pages)
      "##[id^=\"ad-\"]", "##[id*=\"ad_\"]", "##[id*=\"google_ads\"]", "##[id*=\"adsense\"]",
      "##[id*=\"doubleclick\"]", "##[id*=\"advert\"]", "##[id*=\"sponsor\"]",

      "##[class^=\"ad-\"]", "##[class*=\"ad_\"]", "##[class*=\"google_ads\"]", "##[class*=\"adsense\"]",
      "##[class*=\"doubleclick\"]", "##[class*=\"sponsored\"]",
      "##[class*=\"leaderboard\"]", "##[class*=\"skyscraper\"]", "##[class*=\"rectangle\"]",
      "##[class*=\"preroll\"]", "##[class*=\"midroll\"]", "##[class*=\"postroll\"]",
      
      // Data attribute selectors
      "##[data-ad]", "##[data-advert]", "##[data-advertisement]", "##[data-sponsor]",
      "##[data-promo]", "##[data-affiliate]", "##[data-google-ad]", "##[data-ad-slot]",

      // Iframe ad selectors
      "##iframe[src*=\"doubleclick\"]", "##iframe[src*=\"googlesyndication\"]",
      "##iframe[src*=\"amazon-ads\"]", "##iframe[id^=\"google_ads\"]", "##iframe[id*=\"adsense\"]",

      // Cookie/GDPR/Consent banners (exact classes only - broad attribute
      // matches like [class*="overlay"] break logins, modals and page layout)
      "##.cookie-banner", "##.cookie-notice", "##.cookie-consent", "##.cookie-warning",
      "##.cookie-popup", "##.gdpr-banner", "##.gdpr-notice", "##.gdpr-consent",
      "##.consent-banner", "##.consent-popup", "##.ccpa-banner",

      // Newsletter/Signup popups
      "##.newsletter-popup", "##.newsletter-signup", "##.subscribe-popup",

      // Social widgets
      "##.fb-like", "##.fb-share-button", "##.twitter-share-button", "##.social-share",

      // Outbrain/Taboola/MGID/Revcontent
      "##.outbrain", "##.taboola", "##.mgid", "##.revcontent", "##.sponsored-links",

      // Specific ad networks
      "##.adsbygoogle", "##.google-auto-placed", "##.adslot",
      "##.dfp-ad", "##.gpt-ad", "##.adnxs", "##.criteo",
      "##.rubicon", "##.pubmatic", "##.openx", "##.smartadserver",

      // Video ad overlays
      "##.video-ad", "##.vpaid-ad", "##.vast-ad",

      // Anti-adblock walls
      "##.adblock-detected", "##.adblock-warning", "##.disable-adblock", "##.please-disable-adblock",
      "##.adblock-message", "##.ad-blocker-detected",

      // Anchored structural ad containers (prefix matches only)
      "##[id^=\"google_ads_iframe\"]", "##[id^=\"div-gpt-ad\"]",
      "##[id^=\"taboola-\"]", "##[id^=\"outbrain\"]", "##[id^=\"advert-\"]",
      "##[class^=\"advert-\"]", "##div[class^=\"ad-slot\"]", "##div[class^=\"ad-banner\"]",
      "##[id$=\"-ads\"]", "##[class$=\"-ads\"]",
      // YouTube feed ad renderers (never hide the player containers themselves:
      // .video-ads/.ad-showing/.ytp-ad-module wrap the player and hide the video)
      "##ytd-display-ad-renderer", "##ytd-promoted-sparkles-web-renderer",
      "##ytd-ad-slot-renderer", "##ytd-rich-ad-slot-renderer",
      "##ytd-action-companion-ad-renderer", "##ytd-companion-slot-renderer",
      "##ytd-promoted-video-renderer", "##ytd-in-feed-ad-renderer",
      "##ytd-banner-ad-renderer", "##ytd-mealbar-promo-renderer", "##ytd-merch-shelf-renderer",
      "##ytd-shopping-renderer", "##masthead-ad", "##ytd-masthead-ad-renderer",
    ];

    this.styleElement = null;
    this.observer = null;
    this.youtubeObserver = null;
    this.init();
  }

  async init() {
    await this.loadFilters();
    await this.loadGenericShard();
    this.createStyleElement();
    this.applyFilters();
    this.startObserver();
    this.startYouTubeObserver();
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    console.log("[ElementHider] Initialized with " + this.allSelectorCount() + " filters");
  }

  // Generic EasyList/AdGuard cosmetic selectors, compiled by build-rules.js into
  // rules/cosmetic/generic.json. Fetched directly (not via the service worker)
  // so every page gets full generic coverage without a giant message round-trip.
  async loadGenericShard() {
    this.genericSelectors = [];
    try {
      const url = chrome.runtime.getURL("rules/cosmetic/generic.json");
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const host = location.hostname.replace(/^www\./, "");
      const matches = (d) => host === d || host.endsWith("." + d);
      const excluded = (entry) => (entry[1] || []).some(matches);
      const excepted = new Set();
      for (const [domain, selectors] of Object.entries(data.genericExcept || {})) {
        if (matches(domain)) for (const sel of selectors) excepted.add(sel);
      }
      this.genericSelectors = (data.generic || [])
        .filter(sel => !excepted.has(sel))
        .filter(sel => !(data.genericNeg || []).some(entry => entry[0] === sel && excluded(entry)));
    } catch (error) {
      console.warn("[ElementHider] Generic shard unavailable:", error);
    }
  }

  allSelectorCount() {
    return this.builtInFilters.length + this.genericSelectors.length + this.filters.length;
  }

  async loadFilters() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_COSMETIC_FILTERS" });
      if (response && response.filters) {
        this.filters = response.filters.filter(f => f.enabled);
      }
    } catch (error) {
      console.error("[ElementHider] Failed to load filters:", error);
    }
  }

  createStyleElement() {
    this.styleElement = document.createElement("style");
    this.styleElement.id = "adblocker-cosmetic-styles";
    this.styleElement.setAttribute("data-adblocker", "true");
    (document.head || document.documentElement).appendChild(this.styleElement);
  }

  applyFilters() {
    if (!this.styleElement) return;

    const toSelector = (raw) => {
      if (typeof raw !== 'string') return null;
      const text = raw.trim();
      if (!text) return null;
      if (text.startsWith('#@#')) return null;
      if (text.startsWith('##')) return text.slice(2).trim();
      const idx = text.indexOf('##');
      if (idx > 0) return text.slice(idx + 2).trim();
      if (/^[#.[]/.test(text)) return text; // uBO-style bare selector
      return null;
    };
    const allFilters = [...this.builtInFilters, ...this.genericSelectors.map(sel => "##" + sel), ...this.filters
      .map(f => toSelector(f.filter))
      .filter(Boolean)];

    if (allFilters.length === 0) return;

    const cssRules = allFilters
      .map(selector => selector + " { display: none !important; visibility: hidden !important; opacity: 0 !important; height: 0 !important; width: 0 !important; position: absolute !important; left: -9999px !important; pointer-events: none !important; }")
      .join("\n");

    this.styleElement.textContent = cssRules;
  }

  startObserver() {
    // CSS selectors are matched live by the browser - re-setting the
    // stylesheet on every mutation forces a full style recalc and makes
    // pages unresponsive. The stylesheet is applied once and updated only
    // via explicit messages (COSMETIC_FILTERS_UPDATED / EXTENSION_TOGGLED).
    this.observer = null;
  }

  startYouTubeObserver() {
    if (!window.location.hostname.includes("youtube.com") && !window.location.hostname.includes("youtu.be")) {
      return;
    }

    this.youtubeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.handleYouTubeAdElements(node);
          }
        }
      }
    });

    this.youtubeObserver.observe(document.documentElement, { childList: true, subtree: true });

    this.handleYouTubeAdElements(document);
  }

  handleYouTubeAdElements(root) {
    const youtubeAdSelectors = [
      "ytd-display-ad-renderer",
      "ytd-promoted-sparkles-web-renderer", 
      "ytd-ad-slot-renderer",
      "ytd-rich-ad-slot-renderer",
      ".ytp-ad-preview-container",
      ".ytp-ad-skip-button-container",
      ".ytp-ad-text",
      ".ytp-ad-preview-thumbnail",
      ".ytp-ad-branding",
      ".ytp-ad-avatar",
      ".ytp-ad-visit-advertiser",
      "ytd-action-companion-ad-renderer",
      "ytd-companion-slot-renderer",
      ".ytp-cvd-overlay",
      "#player-ads",
      ".ytp-ad-image-overlay",
      ".ytp-ad-progress-bar-container",
      ".ytp-ad-progress-bar",
      ".ytp-ad-player-overlay-instream",
    ];

    for (const selector of youtubeAdSelectors) {
      const elements = root.querySelectorAll ? root.querySelectorAll(selector) : [];
      elements.forEach(el => {
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("opacity", "0", "important");
        el.style.setProperty("height", "0", "important");
        el.style.setProperty("width", "0", "important");
        el.style.setProperty("position", "absolute", "important");
        el.style.setProperty("left", "-9999px", "important");
      });
    }

    this.autoSkipYouTubeAds();
  }

  autoSkipYouTubeAds() {
    const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
    if (video) {
      // Only the player-root ad-showing class is a true "ad playing" state.
    const adShowing = document.querySelector(".html5-video-player.ad-showing");
      if (adShowing) {
        video.muted = true;
        if (video.currentTime < video.duration - 1) {
          video.currentTime = video.duration;
        }
        const skipButtons = document.querySelectorAll(".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-text");
        skipButtons.forEach(btn => {
          if (btn.offsetParent !== null) {
            btn.click();
          }
        });
      }
    }
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case "COSMETIC_FILTERS_UPDATED":
        if (message.filters) {
          this.filters = message.filters.filter(f => f.enabled);
          this.applyFilters();
        }
        break;
      case "EXTENSION_TOGGLED":
        if (!message.enabled) this.styleElement.textContent = "";
        else this.applyFilters();
        break;
    }
  }

  destroy() {
    if (this.observer) this.observer.disconnect();
    if (this.youtubeObserver) this.youtubeObserver.disconnect();
    if (this.styleElement) this.styleElement.remove();
    chrome.runtime.onMessage.removeListener(this.handleMessage.bind(this));
  }
}

if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", () => { window.elementHider = new ElementHider(); }); } else { window.elementHider = new ElementHider(); }
