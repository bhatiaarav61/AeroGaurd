/**
 * Unbreak Engine - Site Compatibility & Structural Fallback System
 * Handles exception rules, structural fallbacks, and prevents page breakage
 * Based on uBlock Origin's unbreak rules and Brave's compatibility engine
 */

class UnbreakEngine {
  constructor() {
    this.exceptionRules = [];
    this.structuralFixes = [];
    this.breakageReports = new Map();
    this.enabled = true;
    this.observer = null;
    this.fixApplied = new WeakSet();
  }

  async initialize() {
    await this.loadExceptionRules();
    await this.loadStructuralFixes();
    this.startObserver();
    console.log('[UnbreakEngine] Initialized with', this.exceptionRules.length, 'exception rules and', this.structuralFixes.length, 'structural fixes');
  }

  async loadExceptionRules() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_UNBREAK_RULES' });
      if (response && response.rules) {
        this.exceptionRules = response.rules.filter(r => r.enabled);
      }
    } catch (error) {
      console.error('[UnbreakEngine] Failed to load exception rules:', error);
    }
  }

  async loadStructuralFixes() {
    // Built-in structural fixes for common breakage patterns
    this.structuralFixes = [
      // Video player fixes
      {
        name: 'video-player-container-collapse',
        match: (el) => el.tagName === 'DIV' && el.querySelector('video'),
        condition: (el) => {
          const style = window.getComputedStyle(el);
          return style.display === 'none' && el.offsetHeight === 0 && el.offsetWidth === 0;
        },
        fix: (el) => {
          el.style.setProperty('display', 'block', 'important');
          el.style.setProperty('height', 'auto', 'important');
          el.style.setProperty('width', 'auto', 'important');
          el.style.setProperty('position', 'static', 'important');
          el.style.setProperty('overflow', 'visible', 'important');
          console.log('[UnbreakEngine] Fixed collapsed video container');
        }
      },

      // Iframe ad container collapse
      {
        name: 'iframe-ad-container-collapse',
        match: (el) => el.tagName === 'IFRAME' && (el.src.includes('ads') || el.src.includes('doubleclick') || el.src.includes('googlesyndication')),
        condition: (el) => {
          const style = window.getComputedStyle(el);
          return style.display === 'none' && el.offsetHeight === 0 && el.offsetWidth === 0;
        },
        fix: (el) => {
          // Don't restore ad iframes, but fix parent container
          const parent = el.parentElement;
          if (parent) {
            parent.style.setProperty('display', 'block', 'important');
            parent.style.setProperty('height', 'auto', 'important');
            parent.style.setProperty('min-height', '0', 'important');
          }
          console.log('[UnbreakEngine] Fixed collapsed ad iframe parent');
        }
      },

      // Sidebar/widget collapse
      {
        name: 'sidebar-widget-collapse',
        match: (el) => {
          const className = (el.className || '').toLowerCase();
          const id = (el.id || '').toLowerCase();
          return /sidebar|widget|aside|rail|column/.test(className + ' ' + id);
        },
        condition: (el) => {
          const style = window.getComputedStyle(el);
          return style.display === 'none' && el.children.length > 0;
        },
        fix: (el) => {
          // Check if it has non-ad content
          const hasContent = Array.from(el.children).some(child => {
            const childStyle = window.getComputedStyle(child);
            return childStyle.display !== 'none' && child.offsetHeight > 0;
          });
          if (hasContent) {
            el.style.setProperty('display', 'block', 'important');
            el.style.setProperty('height', 'auto', 'important');
            console.log('[UnbreakEngine] Fixed collapsed sidebar/widget');
          }
        }
      },

      // Navigation/header collapse
      {
        name: 'header-nav-collapse',
        match: (el) => {
          const tagName = el.tagName.toLowerCase();
          const className = (el.className || '').toLowerCase();
          const id = (el.id || '').toLowerCase();
          return tagName === 'header' || tagName === 'nav' || /header|nav|navbar|menu|top-bar/.test(className + ' ' + id);
        },
        condition: (el) => {
          const style = window.getComputedStyle(el);
          return style.display === 'none' && el.offsetHeight === 0;
        },
        fix: (el) => {
          el.style.setProperty('display', 'flex', 'important');
          el.style.setProperty('height', 'auto', 'important');
          el.style.setProperty('position', 'static', 'important');
          console.log('[UnbreakEngine] Fixed collapsed header/nav');
        }
      },

      // Article content collapse
      {
        name: 'article-content-collapse',
        match: (el) => {
          const tagName = el.tagName.toLowerCase();
          const className = (el.className || '').toLowerCase();
          const id = (el.id || '').toLowerCase();
          return tagName === 'article' || tagName === 'main' || /article|content|post|entry|story/.test(className + ' ' + id);
        },
        condition: (el) => {
          const style = window.getComputedStyle(el);
          return style.display === 'none' && el.textContent.trim().length > 100;
        },
        fix: (el) => {
          el.style.setProperty('display', 'block', 'important');
          el.style.setProperty('height', 'auto', 'important');
          el.style.setProperty('visibility', 'visible', 'important');
          el.style.setProperty('opacity', '1', 'important');
          console.log('[UnbreakEngine] Fixed collapsed article content');
        }
      },

      // Comment section collapse
      {
        name: 'comments-collapse',
        match: (el) => {
          const className = (el.className || '').toLowerCase();
          const id = (el.id || '').toLowerCase();
          return /comment|discussion|disqus|fb-comments/.test(className + ' ' + id);
        },
        condition: (el) => {
          const style = window.getComputedStyle(el);
          return style.display === 'none' && el.children.length > 0;
        },
        fix: (el) => {
          el.style.setProperty('display', 'block', 'important');
          el.style.setProperty('height', 'auto', 'important');
          console.log('[UnbreakEngine] Fixed collapsed comments section');
        }
      },

      // Cookie consent banner removal (not hiding)
      {
        name: 'cookie-consent-restore-scroll',
        match: (el) => {
          const className = (el.className || '').toLowerCase();
          const id = (el.id || '').toLowerCase();
          return /cookie|consent|gdpr|ccpa/.test(className + ' ' + id);
        },
        condition: (el) => {
          const style = window.getComputedStyle(el);
          return style.position === 'fixed' && (style.bottom === '0px' || style.top === '0px');
        },
        fix: (el) => {
          // Remove the element entirely instead of hiding
          el.remove();
          // Restore body scroll
          document.body.style.overflow = 'auto';
          document.documentElement.style.overflow = 'auto';
          console.log('[UnbreakEngine] Removed cookie consent banner and restored scroll');
        }
      },

      // Paywall overlay removal
      {
        name: 'paywall-overlay-removal',
        match: (el) => {
          const className = (el.className || '').toLowerCase();
          const id = (el.id || '').toLowerCase();
          return /paywall|metered|subscription|premium-overlay|article-lock/.test(className + ' ' + id);
        },
        condition: (el) => {
          const style = window.getComputedStyle(el);
          return style.position === 'fixed' && parseInt(style.zIndex || '0') > 100;
        },
        fix: (el) => {
          el.remove();
          document.body.style.overflow = 'auto';
          document.documentElement.style.overflow = 'auto';
          console.log('[UnbreakEngine] Removed paywall overlay');
        }
      },

      // Anti-adblock wall removal
      {
        name: 'anti-adblock-wall-removal',
        match: (el) => {
          const className = (el.className || '').toLowerCase();
          const id = (el.id || '').toLowerCase();
          return /adblock|disable-adblock|please-disable|adblock-detected/.test(className + ' ' + id);
        },
        condition: (el) => {
          const style = window.getComputedStyle(el);
          return style.position === 'fixed' || (style.display === 'flex' && style.justifyContent === 'center' && style.alignItems === 'center');
        },
        fix: (el) => {
          el.remove();
          document.body.style.overflow = 'auto';
          document.documentElement.style.overflow = 'auto';
          console.log('[UnbreakEngine] Removed anti-adblock wall');
        }
      },

      // Modal/overlay cleanup
      {
        name: 'modal-overlay-cleanup',
        match: (el) => {
          const className = (el.className || '').toLowerCase();
          return /modal|overlay|backdrop|popup|dialog/.test(className);
        },
        condition: (el) => {
          const style = window.getComputedStyle(el);
          return style.display === 'none' && style.position === 'fixed';
        },
        fix: (el) => {
          // Clean up hidden modals that might interfere
          if (el.parentNode) el.parentNode.removeChild(el);
          console.log('[UnbreakEngine] Cleaned up hidden modal');
        }
      }
    ];
  }

  startObserver() {
    this.observer = new MutationObserver((mutations) => {
      if (!this.enabled) return;

      let shouldCheck = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          shouldCheck = true;
          break;
        }
        if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
          shouldCheck = true;
          break;
        }
      }

      if (shouldCheck) {
        this.checkAndFix();
      }
    });

    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }

  checkAndFix() {
    // Apply structural fixes
    for (const fix of this.structuralFixes) {
      try {
        const elements = document.querySelectorAll('*');
        for (const el of elements) {
          if (fix.match(el) && fix.condition(el)) {
            if (!this.fixApplied.has(el)) {
              fix.fix(el);
              this.fixApplied.add(el);
            }
          }
        }
      } catch (e) {
        console.warn('[UnbreakEngine] Fix failed:', fix.name, e);
      }
    }
  }

  // Exception rule handling (generichide, genericblock, etc.)
  applyExceptionRules() {
    for (const rule of this.exceptionRules) {
      try {
        if (rule.filter.startsWith('#@#')) {
          // Exception filter - remove hiding
          const selector = rule.filter.substring(3);
          this.removeHidingForSelector(selector, rule.domains);
        } else if (rule.filter.startsWith('@@')) {
          // Network exception
          this.applyNetworkException(rule);
        }
      } catch (e) {
        console.warn('[UnbreakEngine] Exception rule failed:', rule.filter, e);
      }
    }
  }

  removeHidingForSelector(selector, domains) {
    const currentDomain = window.location.hostname.replace(/^www\./, '');
    const domainMatch = !domains || domains.length === 0 || domains.some(d => this.domainMatches(currentDomain, d));

    if (!domainMatch) return;

    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        // Remove inline styles that hide the element
        el.style.removeProperty('display');
        el.style.removeProperty('visibility');
        el.style.removeProperty('opacity');
        el.style.removeProperty('height');
        el.style.removeProperty('width');
        el.style.removeProperty('position');
        el.style.removeProperty('left');
        el.style.removeProperty('pointer-events');

        // Remove any adblocker-specific classes
        el.classList.remove('adblocker-hidden', 'adblocker-collapsed');
      });
    } catch (e) {
      // Invalid selector, ignore
    }
  }

  applyNetworkException(rule) {
    // Network exceptions are handled by DNR allow rules
    // This is a placeholder for any client-side logic needed
  }

  domainMatches(currentDomain, pattern) {
    if (pattern.startsWith('~')) {
      return !this.domainMatches(currentDomain, pattern.substring(1));
    }
    if (pattern.startsWith('*.')) {
      return currentDomain === pattern.slice(2) || currentDomain.endsWith('.' + pattern.slice(2));
    }
    return currentDomain === pattern || currentDomain.endsWith('.' + pattern);
  }

  // Report breakage for analysis
  reportBreakage(url, details) {
    const key = url + ':' + (details.selector || 'unknown');
    const report = this.breakageReports.get(key) || { count: 0, details: [] };
    report.count++;
    report.details.push({ ...details, timestamp: Date.now() });
    this.breakageReports.set(key, report);

    // Auto-generate exception rule if breakage is frequent
    if (report.count >= 3 && details.selector) {
      this.suggestExceptionRule(details.selector, url);
    }
  }

  suggestExceptionRule(selector, url) {
    const domain = new URL(url).hostname.replace(/^www\./, '');
    const exceptionFilter = `#@#${domain}##${selector}`;

    chrome.runtime.sendMessage({
      type: 'SUGGEST_EXCEPTION_RULE',
      filter: exceptionFilter,
      domain: domain,
      reason: 'Auto-generated from breakage report'
    }).catch(() => {});
  }

  // Get stats
  getStats() {
    return {
      enabled: this.enabled,
      exceptionRules: this.exceptionRules.length,
      structuralFixes: this.structuralFixes.length,
      fixesApplied: this.fixApplied.size,
      breakageReports: this.breakageReports.size
    };
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  destroy() {
    if (this.observer) this.observer.disconnect();
  }
}

// Initialize unbreak engine
let unbreakEngine;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    unbreakEngine = new UnbreakEngine();
    unbreakEngine.initialize();
  });
} else {
  unbreakEngine = new UnbreakEngine();
  unbreakEngine.initialize();
}

window.unbreakEngine = unbreakEngine;

export { UnbreakEngine };