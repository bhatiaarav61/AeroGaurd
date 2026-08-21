/**
 * Element Hider - Cosmetic Filtering Engine (Aggressive Mode)
 * Runs at document_start to hide elements matching cosmetic filters
 * Includes built-in comprehensive ad hiding rules + dynamic filters
 */

class ElementHider {
  constructor() {
    this.filters = [];
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
      
      // Class-based selectors
      "##[class^=\"ad-\"]", "##[class*=\"ad_\"]", "##[class*=\" banner\"]", "##[class*=\"sponsor\"]",
      "##[class*=\"google_ads\"]", "##[class*=\"adsense\"]", "##[class*=\"doubleclick\"]",
      "##[class*=\"advert\"]", "##[class*=\"sponsored\"]", "##[class*=\"partner\"]",
      "##[class*=\"affiliate\"]", "##[class*=\"promo\"]", "##[class*=\"banner\"]",
      "##[class*=\"leaderboard\"]", "##[class*=\"skyscraper\"]", "##[class*=\"rectangle\"]",
      "##[class*=\"popup\"]", "##[class*=\"overlay\"]", "##[class*=\"modal\"]",
      "##[class*=\"interstitial\"]", "##[class*=\"preroll\"]", "##[class*=\"midroll\"]",
      "##[class*=\"postroll\"]", "##[class*=\"sticky\"]", "##[class*=\"fixed-bottom\"]",
      "##[class*=\"fixed-top\"]", "##[class*=\"floating\"]", "##[class*=\"toast\"]",
      "##[class*=\"snackbar\"]", "##[class*=\"notification\"]", "##[class*=\"alert\"]",
      
      // Data attribute selectors
      "##[data-ad]", "##[data-advert]", "##[data-advertisement]", "##[data-sponsor]",
      "##[data-promo]", "##[data-affiliate]", "##[data-google-ad]", "##[data-ad-slot]",
      
      // Iframe ad selectors
      "##iframe[src*=\"ads\"]", "##iframe[src*=\"advert\"]", "##iframe[src*=\"doubleclick\"]",
      "##iframe[src*=\"googleads\"]", "##iframe[src*=\"adsense\"]", "##iframe[src*=\"googlesyndication\"]",
      "##iframe[src*=\"amazon-ads\"]", "##iframe[id^=\"google_ads\"]", "##iframe[id*=\"adsense\"]",
      
      // Cookie/GDPR/Consent banners
      "##.cookie-banner", "##.cookie-notice", "##.cookie-consent", "##.cookie-warning",
      "##.cookie-popup", "##.cookie-overlay", "##.gdpr-banner", "##.gdpr-notice",
      "##.gdpr-consent", "##.ccpa-banner", "##.consent-banner", "##.consent-notice",
      "##.consent-popup", "##[id*=\"cookie\"]", "##[class*=\"cookie\"]", "##[id*=\"gdpr\"]",
      "##[class*=\"gdpr\"]", "##[id*=\"consent\"]", "##[class*=\"consent\"]",
      
      // Newsletter/Signup popups
      "##.newsletter-popup", "##.newsletter-signup", "##.email-capture", "##.subscribe-popup",
      "##.mailchimp", "##.push-notification", "##.app-install-banner", "##.app-download-banner",
      
      // Social widgets
      "##.fb-like", "##.fb-share-button", "##.twitter-share-button", "##.linkedin-share",
      "##.pinterest-pin-it", "##.social-share", "##.share-buttons", "##.social-widget",
      
      // Outbrain/Taboola/MGID/Revcontent
      "##.outbrain", "##.taboola", "##.mgid", "##.revcontent", "##.content-recommendations",
      "##.recommended-links", "##.sponsored-links", "##.native-ads",
      
      // Specific ad networks
      "##.adsbygoogle", "##.google-auto-placed", "##.adsense", "##.adslot",
      "##.dfp-ad", "##.gpt-ad", "##.amazon-ads", "##.adnxs", "##.criteo",
      "##.rubicon", "##.pubmatic", "##.openx", "##.indexexchange", "##.smartadserver",
      
      // Video ad overlays
      "##.video-ad", "##.ad-overlay", "##.ad-companion", "##.vpaid-ad", "##.vast-ad",
      "##.ad-tag", "##.ad-marker", "##.ad-break", "##.ad-slot-video",
      
      // Mobile app banners
      "##.app-banner", "##.smart-banner", "##.ios-app-banner", "##.android-app-banner",
      
      // Anti-adblock walls
      "##.adblock-detected", "##.adblock-warning", "##.disable-adblock", "##.please-disable-adblock",
      "##.adblock-message", "##.ad-blocker-detected",
      
      // YouTube specific
      "##.ytd-display-ad-renderer", "##.ytd-promoted-sparkles-web-renderer",
      "##.ytd-ad-slot-renderer", "##.ytp-ad-module", "##.ytp-ad-player-overlay",
      "##.ytp-ad-preview-container", "##.ytp-ad-skip-button-container",
      "##.video-ads", "##.ad-showing",
    ];

    this.styleElement = null;
    this.observer = null;
    this.youtubeObserver = null;
    this.init();
  }

  async init() {
    await this.loadFilters();
    this.createStyleElement();
    this.applyFilters();
    this.startObserver();
    this.startYouTubeObserver();
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    console.log("[ElementHider] Initialized with " + (this.filters.length + this.builtInFilters.length) + " filters");
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

    const allFilters = [...this.builtInFilters, ...this.filters
      .filter(f => f.filter && f.filter.startsWith("##"))
      .map(f => f.filter.substring(2))];

    if (allFilters.length === 0) return;

    const cssRules = allFilters
      .map(selector => selector + " { display: none !important; visibility: hidden !important; opacity: 0 !important; height: 0 !important; width: 0 !important; position: absolute !important; left: -9999px !important; pointer-events: none !important; }")
      .join("\n");

    this.styleElement.textContent = cssRules;
  }

  startObserver() {
    this.observer = new MutationObserver((mutations) => {
      let shouldReapply = false;
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          shouldReapply = true;
          break;
        }
      }
      if (shouldReapply) this.applyFilters();
    });
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
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
      ".ytp-ad-module",
      ".ytp-ad-player-overlay",
      ".ytp-ad-preview-container",
      ".ytp-ad-skip-button-container",
      ".video-ads",
      ".ad-showing",
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
      const adShowing = document.querySelector(".ad-showing") || document.querySelector(".ytp-ad-module");
      if (adShowing) {
        video.muted = true;
        if (video.currentTime < video.duration - 1) {
          video.currentTime = video.duration;
        }
        const skipButtons = document.querySelectorAll(".ytp-ad-skip-button", ".ytp-ad-skip-button-modern", ".ytp-ad-skip-button-text");
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
