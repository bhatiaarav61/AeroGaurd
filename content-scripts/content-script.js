/**
 * Content Script - Handles page-level ad blocking, privacy protections, YouTube ad blocking, and element picking
 * Cosmetic filtering is handled by element-hider.js which runs at document_start
 */

class ContentScript {
  constructor() {
    this.enabled = true;
    this.tabEnabled = true;
    this.observer = null;
    this.privacyInjected = false;
    this.youtubeAdInterval = null;
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.startObserver();
    await this.injectPrivacyProtections();
    this.startYouTubeAdBlocker();
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY", url: window.location.href })
      .catch(() => {});
    console.log("[ContentScript] Initialized");
  }

  async injectPrivacyProtections() {
    if (this.privacyInjected) return;
    this.privacyInjected = true;
    try {
      await chrome.runtime.sendMessage({ type: "INJECT_PRIVACY_SCRIPTS", tabId: null });
    } catch (error) {
      console.warn("[ContentScript] Privacy script injection request failed:", error);
    }
  }

  async loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_EXTENSION_STATE" });
      if (response) {
        this.enabled = response.enabled;
        this.tabEnabled = response.tabEnabled !== false;
      }
    } catch (error) {
      console.error("[ContentScript] Failed to load settings:", error);
    }
  }

  startObserver() {
    this.observer = new MutationObserver((mutations) => {
      if (!this.enabled || !this.tabEnabled) return;
      let shouldReapply = false;
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          shouldReapply = true;
          break;
        }
      }
      if (shouldReapply) {}
    });
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  startYouTubeAdBlocker() {
    // Only run on YouTube
    if (!window.location.hostname.includes("youtube.com") && !window.location.hostname.includes("youtu.be")) {
      return;
    }

    console.log("[ContentScript] YouTube ad blocker activated");

    // Aggressive YouTube ad blocking interval
    // Throttled: a 500ms sweep of dozens of selectors starved the main thread
    this.youtubeAdInterval = setInterval(() => {
      if (!this.enabled || !this.tabEnabled) return;
      this.blockYouTubeAds();
    }, 1500);

    // Also observe for dynamic ad elements
    let ytSweepPending = null;
    const sweep = (root) => {
      if (ytSweepPending) clearTimeout(ytSweepPending);
      ytSweepPending = setTimeout(() => {
        ytSweepPending = null;
        if (this.enabled && this.tabEnabled) this.blockYouTubeAdElements(root || document);
      }, 250);
    };
    const ytObserver = new MutationObserver(() => sweep(document));

    ytObserver.observe(document.documentElement, { childList: true, subtree: true });

    // Initial block
    this.blockYouTubeAds();
  }

  blockYouTubeAds() {
    // Block video ad overlay elements
    const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
    // .ytp-ad-module is a PERSISTENT container (exists without ads) - using it as
    // the ad signal seeked the REAL video to its end. Only .ad-showing on the
    // player root is a true "ad playing" state.
    const adShowing = document.querySelector(".html5-video-player.ad-showing");
    
    if (adShowing && video) {
      // Mute the ad
      if (!video.muted) {
        video.muted = true;
        console.log("[ContentScript] YouTube ad muted");
      }
      
      // Fast-forward ad to end
      if (video.currentTime < video.duration - 1) {
        video.currentTime = video.duration;
        console.log("[ContentScript] YouTube ad fast-forwarded to end");
      }
    }

    // Click skip buttons
    const skipButtons = document.querySelectorAll(
      ".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-text, " +
      ".ytp-ad-skip-button-container button, button[aria-label*=Skip], " +
      ".videoAdUiSkipButton, .ytp-ad-overlay-close-button"
    );
    
    skipButtons.forEach(btn => {
      if (btn.offsetParent !== null && !btn.disabled) { // visible and enabled
        btn.click();
        console.log("[ContentScript] YouTube skip button clicked");
      }
    });

    // Remove ad overlay elements
    this.blockYouTubeAdElements(document);
  }

  blockYouTubeAdElements(root) {
    const youtubeAdSelectors = [
      // Video ad overlays
      "ytd-display-ad-renderer",
      "ytd-promoted-sparkles-web-renderer", 
      "ytd-ad-slot-renderer",
      "ytd-rich-ad-slot-renderer",
      "ytd-action-companion-ad-renderer",
      "ytd-companion-slot-renderer",
      "ytd-promoted-video-renderer",
      
      // Player overlays
      ".ytp-ad-player-overlay-instream",
      ".ytp-ad-preview-container",
      ".ytp-ad-skip-button-container",
      ".ytp-ad-text",
      ".ytp-ad-preview-thumbnail",
      ".ytp-ad-branding",
      ".ytp-ad-avatar",
      ".ytp-ad-visit-advertiser",
      ".ytp-cvd-overlay",
      "#player-ads",
      ".ytp-ad-image-overlay",
      ".ytp-ad-progress-bar-container",
      ".ytp-ad-progress-bar",
      ".ytp-ad-overlay-close-button",
      ".ytp-ad-player-overlay-layout",
      
      // Companion ads
      ".ytp-ad-companion-slot",
      ".ytp-ad-companion-ad",
      
      // Masthead ads
      "ytd-rich-grid-ad-renderer",
      ".ytd-display-ad-renderer",
      
      // Overlay ads
      ".videoAdUi",
      ".ad-container",
      ".ad-banner",
      
      // Pre-roll/mid-roll/post-roll
      ".ytp-ad-preroll",
      ".ytp-ad-midroll",
      ".ytp-ad-postroll",
    ];

    for (const selector of youtubeAdSelectors) {
      const elements = root.querySelectorAll ? root.querySelectorAll(selector) : [];
      elements.forEach(el => {
        if (el.style.display !== "none") {
          el.style.setProperty("display", "none", "important");
          el.style.setProperty("visibility", "hidden", "important");
          el.style.setProperty("opacity", "0", "important");
          el.style.setProperty("height", "0", "important");
          el.style.setProperty("width", "0", "important");
          el.style.setProperty("position", "absolute", "important");
          el.style.setProperty("left", "-9999px", "important");
          el.style.setProperty("pointer-events", "none", "important");
        }
      });
    }

    // Remove ad-related attributes from video element
    const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
    if (video) {
      video.removeAttribute("data-ad");
      video.removeAttribute("data-ad-start");
      video.removeAttribute("data-ad-end");
    }
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case "EXTENSION_TOGGLED": this.enabled = message.enabled; break;
      case "TAB_TOGGLED": this.tabEnabled = message.enabled; break;
      case "COSMETIC_FILTERS_UPDATED": break;
      case "TAB_UPDATED": this.enabled = message.enabled; this.tabEnabled = message.enabled; break;
      case "GET_PAGE_INFO": sendResponse(this.getPageInfo()); break;
      case "ELEMENT_PICKER_START": this.startElementPicker(sendResponse); return true;
      case "ELEMENT_PICKER_CANCEL": this.cancelElementPicker(); break;
    }
  }

  getPageInfo() {
    return { url: window.location.href, domain: window.location.hostname, title: document.title, enabled: this.enabled && this.tabEnabled, filtersApplied: 0 };
  }

  startElementPicker(sendResponse) {
    this.pickerActive = true;
    this.pickerOverlay = this.createPickerOverlay();
    this.pickerTooltip = this.createPickerTooltip();
    document.body.appendChild(this.pickerOverlay);
    document.body.appendChild(this.pickerTooltip);
    const handleMouseMove = (e) => this.updatePicker(e);
    const handleClick = (e) => this.pickElement(e, sendResponse);
    const handleKeyDown = (e) => { if (e.key === "Escape") this.cancelElementPicker(sendResponse); };
    this.pickerOverlay.addEventListener("mousemove", handleMouseMove);
    this.pickerOverlay.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    this.pickerCleanup = () => { this.pickerOverlay.removeEventListener("mousemove", handleMouseMove); this.pickerOverlay.removeEventListener("click", handleClick); document.removeEventListener("keydown", handleKeyDown); };
  }

  createPickerOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "adblocker-picker-overlay";
    overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 2147483647; pointer-events: none; background: transparent;";
    return overlay;
  }

  createPickerTooltip() {
    const tooltip = document.createElement("div");
    tooltip.id = "adblocker-picker-tooltip";
    tooltip.style.cssText = "position: fixed; z-index: 2147483648; pointer-events: none; background: #333; color: white; padding: 8px 12px; border-radius: 4px; font: 12px system-ui; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: none;";
    return tooltip;
  }

  updatePicker(event) {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || target.id.startsWith("adblocker-picker-")) return;
    document.querySelectorAll(".adblocker-picker-highlight").forEach(el => el.classList.remove("adblocker-picker-highlight"));
    target.classList.add("adblocker-picker-highlight");
    const selector = this.generateSelector(target);
    this.pickerTooltip.textContent = selector;
    this.pickerTooltip.style.display = "block";
    this.pickerTooltip.style.left = event.clientX + 15 + "px";
    this.pickerTooltip.style.top = event.clientY + 15 + "px";
  }

  pickElement(event, sendResponse) {
    event.preventDefault(); event.stopPropagation();
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || target.id.startsWith("adblocker-picker-")) { this.cancelElementPicker(sendResponse); return; }
    const selector = this.generateSelector(target);
    this.cancelElementPicker();
    sendResponse({ selector, element: target.outerHTML.substring(0, 500) });
  }

  cancelElementPicker(sendResponse) {
    this.pickerActive = false;
    if (this.pickerOverlay) this.pickerOverlay.remove();
    if (this.pickerTooltip) this.pickerTooltip.remove();
    if (this.pickerCleanup) this.pickerCleanup();
    document.querySelectorAll(".adblocker-picker-highlight").forEach(el => el.classList.remove("adblocker-picker-highlight"));
    if (sendResponse) sendResponse({ cancelled: true });
  }

  generateSelector(element) {
    if (element.id) return "#" + element.id;
    const path = []; let current = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.className && typeof current.className === "string") {
        const classes = current.className.trim().split(/\s+/);
        if (classes.length > 0) selector += "." + classes[0];
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(el => el.tagName === current.tagName);
        if (siblings.length > 1) { const index = siblings.indexOf(current) + 1; selector += ":nth-of-type(" + index + ")"; }
      }
      path.unshift(selector); current = parent;
    }
    return path.join(" > ");
  }

  blockElement(selector) {
    const domains = [window.location.hostname.replace(/^www\./, "")];
    chrome.runtime.sendMessage({ type: "ADD_COSMETIC_FILTER", payload: { filter: domains.join(",") + "##" + selector, enabled: true } }).catch(() => {});
  }

  destroy() { 
    if (this.observer) this.observer.disconnect();
    if (this.youtubeAdInterval) clearInterval(this.youtubeAdInterval);
    chrome.runtime.onMessage.removeListener(this.handleMessage.bind(this)); 
  }
}

let contentScript;
if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", () => { contentScript = new ContentScript(); }); } else { contentScript = new ContentScript(); }
window.adBlockerContentScript = contentScript;
