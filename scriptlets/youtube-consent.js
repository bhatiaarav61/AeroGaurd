(function () {
    'use strict';

    const CONSENT_SELECTORS = [
        'ytd-consent-bump-v2-lightbox',
        'ytd-consent-bump-v2-dialog',
        'ytd-popup-container',
        'iron-overlay-backdrop'
    ];

    const CONSENT_KEYWORDS = ['consent', 'promo', 'cookie'];

    function hideConsentElements() {
        CONSENT_SELECTORS.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                el.style.display = 'none';
                el.style.visibility = 'hidden';
                el.setAttribute('hidden', '');
            });
        });

        CONSENT_KEYWORDS.forEach(keyword => {
            const selector = `[id*="${keyword}" i], [class*="${keyword}" i]`;
            document.querySelectorAll(selector).forEach(el => {
                if (el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') {
                    el.style.display = 'none';
                    el.style.visibility = 'hidden';
                    el.setAttribute('hidden', '');
                }
            });
        });
    }

    const originalObserve = MutationObserver.prototype.observe;
    MutationObserver.prototype.observe = function (target, options) {
        const wrappedCallback = function (mutations) {
            hideConsentElements();
            if (this._originalCallback) {
                this._originalCallback(mutations);
            }
        };
        if (arguments.length >= 1 && typeof arguments[0] === 'function') {
            this._originalCallback = arguments[0];
            arguments[0] = wrappedCallback;
        } else if (this.callback) {
            this._originalCallback = this.callback;
            this.callback = wrappedCallback;
        }
        return originalObserve.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = function (url, options) {
        if (typeof url === 'string' && url.includes('consent.youtube.com')) {
            return Promise.reject(new Error('Blocked consent API call'));
        }
        return originalFetch.apply(this, arguments);
    };

    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        if (typeof url === 'string' && url.includes('consent.youtube.com')) {
            this.abort();
            return;
        }
        return originalXHROpen.apply(this, arguments);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hideConsentElements);
    } else {
        hideConsentElements();
    }

    const observer = new MutationObserver(hideConsentElements);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();