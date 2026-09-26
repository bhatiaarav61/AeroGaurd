/**
 * Cosmetic Filter Engine - Advanced cosmetic filtering with selector parsing
 * Handles complex selectors, domain restrictions, and exception filters
 */

class CosmeticFilterEngine {
  constructor() {
    this.filters = [];
    this.exceptionFilters = [];
    this.styleElement = null;
    this.compiledSelectors = new Map();
    this.init();
  }

  async init() {
    await this.loadFilters();
    this.createStyleElement();
    this.compileFilters();
    this.applyFilters();
    this.startObserver();
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    console.log("[CosmeticFilterEngine] Initialized");
  }

  // uBO-style selectors arrive as bare CSS ("#ad", ".ads"); legacy UI entries
  // arrive as ABP text ("##...", "domain##..."). Both are accepted.
  normalizeFilter(raw) {
    if (typeof raw !== 'string') return null;
    let text = raw.trim();
    if (!text) return null;
    if (text.startsWith('#@#')) return { kind: 'except', selector: text.slice(3).trim(), domains: [] };
    if (text.startsWith('##')) return { kind: 'hide', selector: text.slice(2).trim(), domains: [] };
    const idx = text.indexOf('##');
    if (idx > 0) {
      const domains = text.slice(0, idx).split(',').map(d => d.trim().replace(/^~?www\./, '')).filter(Boolean);
      const selector = text.slice(idx + 2).trim();
      if (!selector) return null;
      return { kind: 'hide', selector, domains };
    }
    if (text.startsWith('#') || text.startsWith('.') || text.startsWith('[')) {
      return { kind: 'hide', selector: text, domains: [] };
    }
    return null;
  }

  async loadFilters() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_COSMETIC_FILTERS" });
      if (response && response.filters) {
        const parsed = response.filters
          .filter(f => f && f.enabled !== false)
          .map(f => this.normalizeFilter(f.filter))
          .filter(Boolean);
        this.filters = parsed
          .filter(f => f.kind === 'hide')
          .map(f => ({ filter: '##' + f.selector, domains: f.domains }));
        this.exceptionFilters = parsed
          .filter(f => f.kind === 'except')
          .map(f => ({ filter: '#@#' + f.selector, domains: f.domains }));
      }
    } catch (error) {
      console.error("[CosmeticFilterEngine] Failed to load filters:", error);
    }
  }

  createStyleElement() {
    this.styleElement = document.createElement("style");
    this.styleElement.id = "adblocker-cosmetic-engine-styles";
    this.styleElement.setAttribute("data-adblocker", "true");
    (document.head || document.documentElement).appendChild(this.styleElement);
  }

  compileFilters() {
    this.compiledSelectors.clear();
    for (const filter of this.filters) {
      const selector = filter.filter.substring(2);
      const domains = filter.domains || [];
      const key = domains.length > 0 ? domains.join(",") : "*";
      if (!this.compiledSelectors.has(key)) this.compiledSelectors.set(key, []);
      this.compiledSelectors.get(key).push(selector);
    }
  }

  applyFilters() {
    if (!this.styleElement) return;
    const currentDomain = window.location.hostname.replace(/^www\./, "");
    let cssRules = [];
    for (const [domainKey, selectors] of this.compiledSelectors) {
      if (domainKey === "*" || this.matchesDomain(currentDomain, domainKey)) {
        const filteredSelectors = selectors.filter(sel => {
          return !this.exceptionFilters.some(exc => {
            const excSelector = exc.filter.substring(3);
            const excDomains = exc.domains || [];
            const excKey = excDomains.length > 0 ? excDomains.join(",") : "*";
            return (excKey === "*" || this.matchesDomain(currentDomain, excKey)) && this.selectorMatches(excSelector, sel);
          });
        });
        if (filteredSelectors.length > 0) {
          cssRules.push(filteredSelectors.join(", ") + " { display: none !important; visibility: hidden !important; opacity: 0 !important; height: 0 !important; width: 0 !important; position: absolute !important; left: -9999px !important; }");
        }
      }
    }
    this.styleElement.textContent = cssRules.join("\n");
  }

  matchesDomain(currentDomain, filterDomainKey) {
    const domains = filterDomainKey.split(",");
    for (const domain of domains) {
      if (domain.startsWith("~")) {
        if (this.domainMatches(currentDomain, domain.substring(1))) return false;
      } else if (this.domainMatches(currentDomain, domain)) {
        return true;
      }
    }
    return domains.length === 0 || domains[0].startsWith("~");
  }

  domainMatches(currentDomain, filterDomain) {
    if (filterDomain === currentDomain) return true;
    if (currentDomain.endsWith("." + filterDomain)) return true;
    return false;
  }

  selectorMatches(selectorA, selectorB) { return selectorA === selectorB; }

  startObserver() {
    // Stylesheet is live in the browser; re-applying on every mutation
    // forces full-page style recalculation. Filters update via messages.
  }

  applyMessageFilters(filters) {
    const parsed = (filters || [])
      .filter(f => f && f.enabled !== false)
      .map(f => this.normalizeFilter(f.filter))
      .filter(Boolean);
    this.filters = parsed
      .filter(f => f.kind === 'hide')
      .map(f => ({ filter: '##' + f.selector, domains: f.domains }));
    this.exceptionFilters = parsed
      .filter(f => f.kind === 'except')
      .map(f => ({ filter: '#@#' + f.selector, domains: f.domains }));
    this.compileFilters();
    this.applyFilters();
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case "COSMETIC_FILTERS_UPDATED":
        if (message.filters) this.applyMessageFilters(message.filters);
        break;
      case "EXTENSION_TOGGLED":
        if (!message.enabled) this.styleElement.textContent = "";
        else this.applyFilters();
        break;
    }
  }

  destroy() {
    if (this.styleElement) this.styleElement.remove();
    chrome.runtime.onMessage.removeListener(this.handleMessage.bind(this));
  }
}

if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", () => { window.cosmeticFilterEngine = new CosmeticFilterEngine(); }); } else { window.cosmeticFilterEngine = new CosmeticFilterEngine(); }
