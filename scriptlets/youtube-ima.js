(function() {
    'use strict';

    // Block IMA SDK scripts via document.createElement override
    const originalCreateElement = document.createElement.bind(document);
    document.createElement = function(tagName, options) {
        try {
            const tag = String(tagName).toLowerCase();
            if (tag === 'script') {
                const src = options?.src || (arguments[1] && arguments[1].src) || '';
                if (typeof src === 'string' && /imasdk\.google\.com|googleads\.g\.doubleclick\.net\/pagead\/instream_ads|googleads\.g\.doubleclick\.net\/pagead\/adsbygoogle|securepubads\.g\.doubleclick\.net\/tag\/js\/gpt\.js/.test(src)) {
                    return document.createComment('blocked ima sdk script: ' + src);
                }
            }
        } catch (e) {}
        return originalCreateElement(tagName, options);
    };

    // Block IMA SDK via appendChild/insertBefore override
    const originalAppendChild = Node.prototype.appendChild;
    const originalInsertBefore = Node.prototype.insertBefore;

    function isImaScript(node) {
        try {
            if (node.nodeType !== Node.ELEMENT_NODE) return false;
            if (node.tagName !== 'SCRIPT') return false;
            const src = node.src || '';
            return /imasdk\.google\.com|googleads\.g\.doubleclick\.net\/pagead\/instream_ads|googleads\.g\.doubleclick\.net\/pagead\/adsbygoogle|securepubads\.g\.doubleclick\.net\/tag\/js\/gpt\.js/.test(src);
        } catch (e) {
            return false;
        }
    }

    Node.prototype.appendChild = function(node) {
        try {
            if (isImaScript(node)) {
                return node;
            }
        } catch (e) {}
        return originalAppendChild.call(this, node);
    };

    Node.prototype.insertBefore = function(node, referenceNode) {
        try {
            if (isImaScript(node)) {
                return node;
            }
        } catch (e) {}
        return originalInsertBefore.call(this, node, referenceNode);
    };

    // Proxy window.google to block google.ima access
    try {
        const originalGoogle = window.google;
        window.google = new Proxy(originalGoogle || {}, {
            get(target, prop, receiver) {
                try {
                    if (prop === 'ima') {
                        return undefined;
                    }
                    if (prop === 'ads' || prop === 'gpt') {
                        return undefined;
                    }
                    return Reflect.get(target, prop, receiver);
                } catch (e) {
                    return Reflect.get(target, prop, receiver);
                }
            },
            set(target, prop, value, receiver) {
                try {
                    if (prop === 'ima' || prop === 'ads' || prop === 'gpt') {
                        return true;
                    }
                    return Reflect.set(target, prop, value, receiver);
                } catch (e) {
                    return Reflect.set(target, prop, value, receiver);
                }
            },
            has(target, prop) {
                try {
                    if (prop === 'ima' || prop === 'ads' || prop === 'gpt') {
                        return false;
                    }
                    return Reflect.has(target, prop);
                } catch (e) {
                    return Reflect.has(target, prop);
                }
            }
        });
    } catch (e) {}

    // Proxy window.googletag to block GPT methods
    try {
        const originalGoogletag = window.googletag;
        const blockedMethods = new Set([
            'defineSlot',
            'defineOutOfPageSlot',
            'display',
            'pubads',
            'enableServices',
            'disableInitialLoad',
            'refresh',
            'destroySlots',
            'getSlots',
            'openConsole'
        ]);

        window.googletag = new Proxy(originalGoogletag || {}, {
            get(target, prop, receiver) {
                try {
                    if (blockedMethods.has(prop)) {
                        return function() {
                            return originalGoogletag?.[prop]?.apply(originalGoogletag, arguments) ?? null;
                        };
                    }
                    if (prop === 'cmd' && Array.isArray(target?.cmd)) {
                        return target.cmd.filter(item => {
                            try {
                                if (typeof item === 'function') return true;
                                if (item && typeof item === 'object' && item.fn) return true;
                                return false;
                            } catch (e) {
                                return true;
                            }
                        });
                    }
                    return Reflect.get(target, prop, receiver);
                } catch (e) {
                    return Reflect.get(target, prop, receiver);
                }
            },
            set(target, prop, value, receiver) {
                try {
                    if (blockedMethods.has(prop)) {
                        return true;
                    }
                    return Reflect.set(target, prop, value, receiver);
                } catch (e) {
                    return Reflect.set(target, prop, value, receiver);
                }
            },
            has(target, prop) {
                try {
                    if (blockedMethods.has(prop)) {
                        return false;
                    }
                    return Reflect.has(target, prop);
                } catch (e) {
                    return Reflect.has(target, prop);
                }
            }
        });
    } catch (e) {}

    // Block IMA SDK initialization attempts
    try {
        Object.defineProperty(window, 'google_ima_loaded', {
            get() { return false; },
            set() { return true; },
            configurable: true
        });
    } catch (e) {}

    // Block common IMA event listeners
    try {
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function(type, listener, options) {
            try {
                if (type && /ima|adsmanager|adsloader|googleads|googletag/i.test(String(type))) {
                    return;
                }
            } catch (e) {}
            return originalAddEventListener.call(this, type, listener, options);
        };
    } catch (e) {}

})();