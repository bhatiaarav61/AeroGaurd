/**
 * Popup Eliminator — Newsletter/Overlay/Interstitial/Sticky/Anchor elimination
 * Smart detection and removal of annoying popups
 */

// ============================================================================
// Popup Types
// ============================================================================

export const PopupType = {
  NEWSLETTER: 'newsletter',
  COOKIE_CONSENT: 'cookie_consent',
  OVERLAY_AD: 'overlay_ad',
  INTERSTITIAL: 'interstitial',
  STICKY_BAR: 'sticky_bar',
  ANCHOR_AD: 'anchor_ad',
  MODAL: 'modal',
  LIGHTBOX: 'lightbox',
  EXIT_INTENT: 'exit_intent',
  WELCOME_MAT: 'welcome_mat',
  GAMIFIED: 'gamified',
  SURVEY: 'survey',
  CHAT_WIDGET: 'chat_widget',
  PUSH_NOTIFICATION: 'push_notification',
  AGE_GATE: 'age_gate',
  PAYWALL: 'paywall',
  LOGIN_WALL: 'login_wall',
  UNKNOWN: 'unknown'
};

// ============================================================================
// Popup Detector
// ============================================================================

export class PopupDetector {
  constructor(context = window) {
    this.context = context;
    this.document = context.document;

    // Keywords for each popup type
    this.typeKeywords = {
      [PopupType.NEWSLETTER]: ['newsletter', 'subscribe', 'sign up', 'mailing list', 'email', 'e-mail', 'join our', 'get updates', 'stay updated', 'exclusive', 'free guide', 'download', 'ebook'],
      [PopupType.COOKIE_CONSENT]: ['cookie', 'consent', 'gdpr', 'ccpa', 'privacy policy', 'accept', 'agree', 'allow', 'preferences', 'settings', 'we use cookies', 'uses cookies'],
      [PopupType.OVERLAY_AD]: ['advertisement', 'sponsored', 'promotion', 'offer', 'deal', 'discount', 'sale', 'limited time'],
      [PopupType.INTERSTITIAL]: ['interstitial', 'continue to site', 'skip ad', 'wait', 'seconds', 'redirecting'],
      [PopupType.STICKY_BAR]: ['sticky', 'fixed-bottom', 'fixed-top', 'banner', 'announcement', 'notification bar'],
      [PopupType.ANCHOR_AD]: ['anchor', 'bottom-ad', 'top-ad', 'mobile-ad', 'adhesive'],
      [PopupType.EXIT_INTENT]: ['exit', 'leaving', 'wait', 'don\'t go', 'before you go', 'one more thing'],
      [PopupType.WELCOME_MAT]: ['welcome', 'new here', 'first time', 'get started'],
      [PopupType.GAMIFIED]: ['spin', 'wheel', 'win', 'prize', 'lucky', 'congratulations', 'claim'],
      [PopupType.SURVEY]: ['survey', 'feedback', 'opinion', 'question', 'rate us', 'how was'],
      [PopupType.CHAT_WIDGET]: ['chat', 'support', 'help', 'messages', 'talk to us', 'live chat'],
      [PopupType.PUSH_NOTIFICATION]: ['notification', 'subscribe', 'allow notifications', 'stay notified'],
      [PopupType.AGE_GATE]: ['age', '18+', '21+', 'verify age', 'are you over'],
      [PopupType.PAYWALL]: ['subscribe', 'premium', 'paywall', 'unlock', 'member', 'subscription'],
      [PopupType.LOGIN_WALL]: ['login', 'sign in', 'register', 'account', 'continue reading']
    };

    // Visual characteristics
    this.visualPatterns = {
      fixedPosition: ['fixed', 'sticky'],
      highZIndex: (el) => parseInt(context.getComputedStyle(el).zIndex) > 100,
      coversContent: (el) => el.offsetWidth > context.innerWidth * 0.5 || el.offsetHeight > context.innerHeight * 0.5,
      centered: (el) => {
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return Math.abs(centerX - context.innerWidth / 2) < 50 && Math.abs(centerY - context.innerHeight / 2) < 50;
      },
      modalBackdrop: (el) => {
        const style = context.getComputedStyle(el);
        return style.backgroundColor.includes('rgba') && parseFloat(style.backgroundColor.split(',')[3] || '1') > 0.3;
      }
    };
  }

  /**
   * Detect popup type for element
   * @param {Element} element - Element to analyze
   * @returns {string} Popup type
   */
  detectType(element) {
    const text = (element.textContent || '').toLowerCase();
    const className = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const allText = text + ' ' + className + ' ' + id;

    // Check keywords for each type
    for (const [type, keywords] of Object.entries(this.typeKeywords)) {
      for (const keyword of keywords) {
        if (allText.includes(keyword.toLowerCase())) {
          return type;
        }
      }
    }

    // Visual heuristics
    const style = this.context.getComputedStyle(element);
    const isFixed = this.visualPatterns.fixedPosition.includes(style.position);
    const isHighZ = this.visualPatterns.highZIndex(element);
    const covers = this.visualPatterns.coversContent(element);
    const centered = this.visualPatterns.centered(element);
    const hasBackdrop = this.visualPatterns.modalBackdrop(element);

    if (isFixed && isHighZ && covers && centered && hasBackdrop) return PopupType.MODAL;
    if (isFixed && isHighZ && covers) return PopupType.OVERLAY_AD;
    if (isFixed && style.bottom === '0' && style.width === '100%') return PopupType.STICKY_BAR;
    if (isFixed && style.top === '0' && style.width === '100%') return PopupType.STICKY_BAR;

    return PopupType.UNKNOWN;
  }

  /**
   * Check if element is likely a popup
   * @param {Element} element - Element to check
   * @returns {boolean}
   */
  isPopup(element) {
    const type = this.detectType(element);
    return type !== PopupType.UNKNOWN;
  }
}

// ============================================================================
// Popup Eliminator
// ============================================================================

export class PopupEliminator {
  constructor(context = window) {
    this.context = context;
    this.document = context.document;
    this.detector = new PopupDetector(context);
    this.removedPopups = new WeakSet();
    this.observer = null;
    this.config = {
      enabled: true,
      aggressiveMode: false,
      debugMode: false,
      autoRemove: true,
      whitelist: [] // Selectors to never remove
    };
    this.metrics = {
      removed: 0,
      byType: {},
      prevented: 0
    };
  }

  configure(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Initialize popup elimination
   */
  initialize() {
    if (this.config.autoRemove) {
      this._setupMutationObserver();
      this._initialScan();
    }
    console.log('[PopupEliminator] Initialized');
  }

  _setupMutationObserver() {
    this.observer = new this.context.MutationObserver(mutations => {
      let shouldScan = false;
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length) {
          for (const n of m.addedNodes) {
            if (n.nodeType === this.context.Node.ELEMENT_NODE) {
              if (this._isPotentialPopup(n) || n.querySelector?.('[class*="popup"], [class*="modal"], [class*="overlay"], [id*="popup"], [id*="modal"], [id*="overlay"]')) {
                shouldScan = true;
                break;
              }
            }
          }
        }
      }
      if (shouldScan) {
        clearTimeout(this.observer._debounce);
        this.observer._debounce = setTimeout(() => this.scan(), 300);
      }
    });

    this.observer.observe(this.document.body, {
      childList: true,
      subtree: true
    });
  }

  _isPotentialPopup(element) {
    const style = this.context.getComputedStyle(element);
    return (style.position === 'fixed' || style.position === 'absolute') &&
           (parseInt(style.zIndex) > 100 || element.classList.contains('modal') ||
            element.classList.contains('popup') || element.classList.contains('overlay') ||
            element.classList.contains('lightbox') || element.id?.includes('popup') ||
            element.id?.includes('modal') || element.id?.includes('overlay'));
  }

  _initialScan() {
    if (this.document.readyState === 'loading') {
      this.document.addEventListener('DOMContentLoaded', () => this.scan());
    } else {
      this.scan();
    }
  }

  /**
   * Scan and remove popups
   */
  scan() {
    if (!this.config.enabled) return;

    const candidates = this._findPopupCandidates();
    for (const candidate of candidates) {
      this._processCandidate(candidate);
    }
  }

  _findPopupCandidates() {
    const candidates = [];

    // Find elements with popup-like characteristics
    const selectors = [
      '[class*="popup"]', '[id*="popup"]', '[class*="modal"]', '[id*="modal"]',
      '[class*="overlay"]', '[id*="overlay"]', '[class*="lightbox"]', '[id*="lightbox"]',
      '[class*="interstitial"]', '[id*="interstitial"]', '[class*="lightbox"]',
      '.popup', '.modal', '.overlay', '.lightbox', '.interstitial',
      '[role="dialog"]', '[role="alertdialog"]',
      '.newsletter-popup', '.newsletter-modal', '.signup-popup', '.subscribe-popup',
      '.cookie-banner', '.cookie-consent', '.gdpr-banner', '.consent-banner',
      '.exit-intent', '.welcome-mat', '.sticky-bar', '.anchor-ad'
    ];

    for (const selector of selectors) {
      try {
        this.document.querySelectorAll(selector).forEach(el => candidates.push(el));
      } catch (e) {}
    }

    // Also check fixed/sticky elements with high z-index
    this.document.querySelectorAll('*').forEach(el => {
      if (el === this.document.body || el === this.document.documentElement) return;
      const style = this.context.getComputedStyle(el);
      if ((style.position === 'fixed' || style.position === 'sticky') &&
          parseInt(style.zIndex) > 100 &&
          (el.offsetWidth > this.context.innerWidth * 0.3 || el.offsetHeight > this.context.innerHeight * 0.3)) {
        candidates.push(el);
      }
    });

    return [...new Set(candidates)]; // Deduplicate
  }

  _processCandidate(candidate) {
    if (this.removedPopups.has(candidate)) return;
    if (this._isWhitelisted(candidate)) return;
    if (!this.document.body.contains(candidate)) return;

    const type = this.detector.detectType(candidate);
    if (type === PopupType.UNKNOWN && !this.config.aggressiveMode) return;

    // Additional checks
    if (this._isMainContent(candidate)) return;
    if (this._isNavigation(candidate)) return;
    if (this._isVideoPlayer(candidate)) return;

    // Remove it
    this._removePopup(candidate, type);
  }

  _isWhitelisted(element) {
    for (const selector of this.config.whitelist) {
      try {
        if (element.matches(selector)) return true;
        if (element.closest(selector)) return true;
      } catch (e) {}
    }
    return false;
  }

  _isMainContent(element) {
    const tag = element.tagName.toLowerCase();
    return ['main', 'article', 'section', 'content', 'container', 'wrapper'].includes(tag) ||
           element.id === 'main' || element.id === 'content' || element.id === 'app' ||
           element.classList.contains('main') || element.classList.contains('content');
  }

  _isNavigation(element) {
    return element.tagName === 'NAV' ||
           element.classList.contains('nav') ||
           element.classList.contains('menu') ||
           element.classList.contains('header') ||
           element.id === 'header' || element.id === 'nav';
  }

  _isVideoPlayer(element) {
    return element.querySelector('video') !== null ||
           element.classList.contains('video-player') ||
           element.classList.contains('html5-video-player') ||
           element.id === 'movie_player';
  }

  _removePopup(element, type) {
    // Store for potential restore
    this.removedPopups.add(element);
    element.dataset.aeroguardPopupRemoved = 'true';
    element.dataset.aeroguardPopupType = type;
    element.dataset.aeroguardRemovedAt = Date.now().toString();

    // Hide with animation prevention
    element.style.transition = 'none';
    element.style.display = 'none';
    element.style.visibility = 'hidden';
    element.style.opacity = '0';
    element.style.pointerEvents = 'none';
    element.setAttribute('aria-hidden', 'true');

    // Remove from DOM after brief delay
    setTimeout(() => {
      if (element.parentNode && element.dataset.aeroguardPopupRemoved === 'true') {
        element.parentNode.removeChild(element);
      }
    }, 500);

    // Update metrics
    this.metrics.removed++;
    this.metrics.byType[type] = (this.metrics.byType[type] || 0) + 1;

    if (this.config.debugMode) {
      console.log('[PopupEliminator] Removed:', type, element);
    }
  }

  /**
   * Add selector to whitelist
   */
  addToWhitelist(selector) {
    this.config.whitelist.push(selector);
  }

  /**
   * Remove selector from whitelist
   */
  removeFromWhitelist(selector) {
    const index = this.config.whitelist.indexOf(selector);
    if (index !== -1) this.config.whitelist.splice(index, 1);
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  cleanup() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.removedPopups = new WeakSet();
    this.metrics = { removed: 0, byType: {}, prevented: 0 };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let popupEliminatorInstance = null;

export function getPopupEliminator(context = window) {
  if (!popupEliminatorInstance) {
    popupEliminatorInstance = new PopupEliminator(context);
  }
  return popupEliminatorInstance;
}

export function resetPopupEliminator() {
  if (popupEliminatorInstance) {
    popupEliminatorInstance.cleanup();
  }
  popupEliminatorInstance = null;
}

// Re-export PopupType for external use
export { PopupType };