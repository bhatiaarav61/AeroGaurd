/**
 * Consent Automator — 20+ CMP handlers
 * Auto-accept/reject cookie banners, GDPR, CCPA consent dialogs
 */

// ============================================================================
// CMP (Consent Management Platform) Definitions
// ============================================================================

export const CMP_TYPE = {
  ONETRUST: 'onetrust',
  TRUSTARC: 'trustarc',
  QUANTCAST: 'quantcast',
  USERCENTRICS: 'usercentrics',
  COOKIEBOT: 'cookiebot',
  DIDOMI: 'didomi',
  OSANO: 'osano',
  CMPLY: 'cmplz',
  BORLABS: 'borlabs',
  TERMAGGEDON: 'termageddon',
  IUBENDA: 'iubenda',
  SECURITI: 'securiti',
  ONETRUST_LEGACY: 'onetrust_legacy',
  GOOGLE_FCP: 'google_fcp',
  COOKIEFIRST: 'cookiefirst',
  COOKIEYES: 'cookieyes',
  COOKIEHINT: 'cookiehint',
  COOKIENOTICE: 'cookienotice',
  CIVICUK: 'civicuk',
  TRUSTCOMMANDER: 'trustcommander',
  COOKIESCRIPT: 'cookiescript',
  PANDECTES: 'pandectes',
  COOKIEHUB: 'cookiehub',
  KUBO: 'kubo',
  CLEARTRUST: 'cleartrust',
  CUSTOM: 'custom'
};

const CMP_HANDLERS = {
  [CMP_TYPE.ONETRUST]: {
    detect: () => document.querySelector('#onetrust-banner-sdk, #onetrust-consent-sdk, .ot-sdk-container'),
    accept: () => {
      const btn = document.querySelector('#onetrust-accept-btn-handler, .ot-sdk-btn-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('#onetrust-reject-all-handler, .ot-sdk-btn-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    },
    close: () => {
      const btn = document.querySelector('.ot-close-icon, .ot-sdk-close, [aria-label="Close"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.TRUSTARC]: {
    detect: () => document.querySelector('.trustarc-banner, #trustarc-consent, .consent-trustarc'),
    accept: () => {
      const btn = document.querySelector('.trustarc-accept, .trustarc-btn-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.trustarc-reject, .trustarc-btn-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.QUANTCAST]: {
    detect: () => document.querySelector('.qc-cmp2-ui, #qc-cmp2-ui, .quantcast-consent'),
    accept: () => {
      const btn = document.querySelector('.qc-cmp2-accept-all, .qc-cmp2-button-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.qc-cmp2-reject-all, .qc-cmp2-button-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.USERCENTRICS]: {
    detect: () => document.querySelector('[data-usercentrics], .uc-consent-banner, #usercentrics-cmp'),
    accept: () => {
      const btn = document.querySelector('[data-testid="accept-all"], .uc-btn-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('[data-testid="reject-all"], .uc-btn-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.COOKIEBOT]: {
    detect: () => document.querySelector('#cookiebot, .CookieConsent, #CybotCookiebotDialog'),
    accept: () => {
      const btn = document.querySelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll, .CookieConsentAccept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll, .CookieConsentDecline, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.DIDOMI]: {
    detect: () => document.querySelector('#didomi-notice, .didomi-popup, [data-didomi]'),
    accept: () => {
      const btn = document.querySelector('#didomi-notice-agree-button, .didomi-button-agree, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('#didomi-notice-disagree-button, .didomi-button-disagree, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.OSANO]: {
    detect: () => document.querySelector('.osano-cm-dialog, .osano-cm-window, #onetrust-banner-sdk'),
    accept: () => {
      const btn = document.querySelector('.osano-cm-accept, .osano-cm-button-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.osano-cm-reject, .osano-cm-button-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.CMPLY]: {
    detect: () => document.querySelector('.cmplz-cookiebanner, .cmplz-cookiebanner-container, #cmplz-cookiebanner'),
    accept: () => {
      const btn = document.querySelector('.cmplz-accept, .cmplz-btn-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.cmplz-reject, .cmplz-btn-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.BORLABS]: {
    detect: () => document.querySelector('.borlabs-cookie, .borlabs-cookie-box, #borlabs-cookie'),
    accept: () => {
      const btn = document.querySelector('.borlabs-cookie-accept, .borlabs-cookie-btn-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.borlabs-cookie-reject, .borlabs-cookie-btn-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.GOOGLE_FCP]: {
    detect: () => document.querySelector('.fc-consent-root, .fc-dialog-container, [aria-label*="Google"]'),
    accept: () => {
      const btn = document.querySelector('.fc-button.fc-cta-consent, .fc-cta-consent, button[aria-label*="Consent"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.fc-button.fc-secondary-button, .fc-secondary-button, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.IUBENDA]: {
    detect: () => document.querySelector('.iubenda-cs-banner, .iubenda-consent, #iubenda-cs'),
    accept: () => {
      const btn = document.querySelector('.iubenda-cs-accept-btn, .iubenda-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.iubenda-cs-reject-btn, .iubenda-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.TERMAGGEDON]: {
    detect: () => document.querySelector('.termageddon-banner, #termageddon, [data-termageddon]'),
    accept: () => {
      const btn = document.querySelector('.termageddon-accept, .termageddon-btn-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.termageddon-reject, .termageddon-btn-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.SECURITI]: {
    detect: () => document.querySelector('.securiti-banner, #securiti-consent, [data-securiti]'),
    accept: () => {
      const btn = document.querySelector('.securiti-accept, .securiti-btn-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.securiti-reject, .securiti-btn-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.ONETRUST_LEGACY]: {
    detect: () => document.querySelector('.ot-banner, #ot-sdk-container, .ot-sdk-row'),
    accept: () => {
      const btn = document.querySelector('.ot-accept-btn, .ot-sdk-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.ot-reject-btn, .ot-sdk-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.COOKIEFIRST]: {
    detect: () => document.querySelector('.cookie-first, #cookiefirst, [data-cookiefirst]'),
    accept: () => {
      const btn = document.querySelector('.cookie-first-accept, #cookiefirst-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.cookie-first-reject, #cookiefirst-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.COOKIEYES]: {
    detect: () => document.querySelector('.cookieyes-banner, #cookieyes, .cky-consent-bar'),
    accept: () => {
      const btn = document.querySelector('.cookieyes-accept, .cky-btn-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.cookieyes-reject, .cky-btn-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.COOKIEHINT]: {
    detect: () => document.querySelector('.cookie-hint, #cookiehint, [data-cookiehint]'),
    accept: () => {
      const btn = document.querySelector('.cookie-hint-accept, #cookiehint-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.cookie-hint-reject, #cookiehint-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.COOKIENOTICE]: {
    detect: () => document.querySelector('.cookie-notice, #cookienotice, [data-cookie-notice]'),
    accept: () => {
      const btn = document.querySelector('.cookie-notice-accept, #cookienotice-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.cookie-notice-reject, #cookienotice-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.CIVICUK]: {
    detect: () => document.querySelector('.cc-window, .cc-banner, #cookie-control'),
    accept: () => {
      const btn = document.querySelector('.cc-accept, .cc-btn-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.cc-reject, .cc-btn-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.TRUSTCOMMANDER]: {
    detect: () => document.querySelector('.tarteaucitron, #tarteaucitron, [data-tarteaucitron]'),
    accept: () => {
      const btn = document.querySelector('.tarteaucitronAllow, .tarteaucitron-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.tarteaucitronDeny, .tarteaucitron-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.COOKIESCRIPT]: {
    detect: () => document.querySelector('.cookiescript, #cookiescript, [data-cookiescript]'),
    accept: () => {
      const btn = document.querySelector('.cookiescript-accept, #cookiescript-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.cookiescript-reject, #cookiescript-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.PANDECTES]: {
    detect: () => document.querySelector('.pandectes-banner, #pandectes, [data-pandectes]'),
    accept: () => {
      const btn = document.querySelector('.pandectes-accept, .pandectes-btn-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.pandectes-reject, .pandectes-btn-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.COOKIEHUB]: {
    detect: () => document.querySelector('.cookiehub, #cookiehub, [data-cookiehub]'),
    accept: () => {
      const btn = document.querySelector('.cookiehub-accept, #cookiehub-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.cookiehub-reject, #cookiehub-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.KUBO]: {
    detect: () => document.querySelector('.kubo-banner, #kubo-consent, [data-kubo]'),
    accept: () => {
      const btn = document.querySelector('.kubo-accept, .kubo-btn-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.kubo-reject, .kubo-btn-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  },

  [CMP_TYPE.CLEARTRUST]: {
    detect: () => document.querySelector('.cleartrust-banner, #cleartrust, [data-cleartrust]'),
    accept: () => {
      const btn = document.querySelector('.cleartrust-accept, .cleartrust-btn-accept, button[aria-label*="Accept"]');
      if (btn) btn.click();
    },
    reject: () => {
      const btn = document.querySelector('.cleartrust-reject, .cleartrust-btn-reject, button[aria-label*="Reject"]');
      if (btn) btn.click();
    }
  }
};

// ============================================================================
// Generic Consent Handler (for unknown CMPs)
// ============================================================================

function genericConsentHandler(action) {
  const keywords = {
    accept: ['accept', 'agree', 'allow', 'consent', 'ok', 'yes', 'confirm', 'enable'],
    reject: ['reject', 'decline', 'deny', 'refuse', 'disagree', 'no', 'disable'],
    close: ['close', 'dismiss', 'skip', 'later', 'maybe', 'x']
  };

  const actionKeywords = keywords[action] || [];
  const buttons = document.querySelectorAll('button, [role="button"], a.btn, .btn, input[type="button"], input[type="submit"]');

  for (const btn of buttons) {
    const text = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').toLowerCase();
    for (const kw of actionKeywords) {
      if (text.includes(kw)) {
        // Check if it's in a consent banner context
        const banner = btn.closest('[class*="cookie"], [class*="consent"], [class*="gdpr"], [class*="banner"], [id*="cookie"], [id*="consent"], [id*="gdpr"]');
        if (banner || document.body.contains(btn)) {
          btn.click();
          return true;
        }
      }
    }
  }
  return false;
}

// ============================================================================
// Consent Automator
// ============================================================================

export class ConsentAutomator {
  constructor(context = window) {
    this.context = context;
    this.document = context.document;
    this.config = {
      enabled: true,
      mode: 'reject', // 'accept' | 'reject' | 'close' | 'none'
      debugMode: false,
      autoDetect: true,
      whitelist: [] // Domains to skip
    };
    this.detectedCMP = null;
    this.observer = null;
    this.metrics = {
      handled: 0,
      byCMP: {},
      byAction: { accept: 0, reject: 0, close: 0 }
    };
  }

  configure(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Initialize consent automation
   */
  initialize() {
    if (!this.config.enabled) return;

    // Check whitelist
    if (this.config.whitelist.some(d => this.context.location.hostname.includes(d))) {
      console.log('[ConsentAutomator] Domain whitelisted, skipping');
      return;
    }

    // Immediate scan
    this._scanAndHandle();

    // Observe for dynamic banners
    this._setupMutationObserver();

    // Periodic scan
    this._startPeriodicScan();

    console.log('[ConsentAutomator] Initialized in', this.config.mode, 'mode');
  }

  _scanAndHandle() {
    if (this.config.mode === 'none') return;

    // Detect CMP
    this.detectedCMP = this._detectCMP();

    if (this.detectedCMP) {
      this._handleCMP(this.detectedCMP);
    } else {
      // Fallback to generic handler
      this._handleGeneric();
    }
  }

  _detectCMP() {
    for (const [type, handler] of Object.entries(CMP_HANDLERS)) {
      if (handler.detect()) {
        return type;
      }
    }
    return null;
  }

  _handleCMP(cmpType) {
    const handler = CMP_HANDLERS[cmpType];
    if (!handler) return;

    let handled = false;
    switch (this.config.mode) {
      case 'accept':
        handled = this._tryAction(handler.accept);
        break;
      case 'reject':
        handled = this._tryAction(handler.reject);
        break;
      case 'close':
        handled = this._tryAction(handler.close) || this._tryAction(handler.reject);
        break;
    }

    if (handled) {
      this.metrics.handled++;
      this.metrics.byCMP[cmpType] = (this.metrics.byCMP[cmpType] || 0) + 1;
      this.metrics.byAction[this.config.mode]++;
      if (this.config.debugMode) console.log('[ConsentAutomator] Handled', cmpType, 'with', this.config.mode);
    }
  }

  _handleGeneric() {
    const handled = genericConsentHandler(this.config.mode);
    if (handled) {
      this.metrics.handled++;
      this.metrics.byCMP[CMP_TYPE.CUSTOM] = (this.metrics.byCMP[CMP_TYPE.CUSTOM] || 0) + 1;
      this.metrics.byAction[this.config.mode]++;
    }
  }

  _tryAction(actionFn) {
    try {
      if (actionFn) {
        actionFn();
        return true;
      }
    } catch (e) {
      if (this.config.debugMode) console.warn('[ConsentAutomator] Action failed:', e);
    }
    return false;
  }

  _setupMutationObserver() {
    this.observer = new this.context.MutationObserver(mutations => {
      let shouldScan = false;
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length) {
          for (const n of m.addedNodes) {
            if (n.nodeType === this.context.Node.ELEMENT_NODE) {
              if (this._isPotentialConsentBanner(n)) {
                shouldScan = true;
                break;
              }
            }
          }
        }
      }
      if (shouldScan) {
        clearTimeout(this.observer._debounce);
        this.observer._debounce = setTimeout(() => this._scanAndHandle(), 500);
      }
    });

    this.observer.observe(this.document.body, {
      childList: true,
      subtree: true
    });
  }

  _isPotentialConsentBanner(element) {
    const className = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const text = (element.textContent || '').toLowerCase().substring(0, 200);

    const consentIndicators = [
      'cookie', 'consent', 'gdpr', 'ccpa', 'privacy',
      'accept', 'agree', 'allow', 'reject', 'decline'
    ];

    return consentIndicators.some(k => className.includes(k) || id.includes(k) || text.includes(k));
  }

  _startPeriodicScan() {
    setInterval(() => {
      if (!this.detectedCMP) {
        this._scanAndHandle();
      }
    }, 5000);
  }

  /**
   * Manually trigger consent handling
   */
  handle() {
    this._scanAndHandle();
  }

  /**
   * Set mode
   */
  setMode(mode) {
    if (['accept', 'reject', 'close', 'none'].includes(mode)) {
      this.config.mode = mode;
    }
  }

  /**
   * Add domain to whitelist
   */
  addToWhitelist(domain) {
    this.config.whitelist.push(domain);
  }

  getMetrics() {
    return { ...this.metrics };
  }

  cleanup() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let consentAutomatorInstance = null;

export function getConsentAutomator(context = window) {
  if (!consentAutomatorInstance) {
    consentAutomatorInstance = new ConsentAutomator(context);
  }
  return consentAutomatorInstance;
}

export function resetConsentAutomator() {
  if (consentAutomatorInstance) {
    consentAutomatorInstance.cleanup();
  }
  consentAutomatorInstance = null;
}

// Export CMP types
export { CMP_TYPE, CMP_HANDLERS };