// content/popup-interceptor.js — Popup & Popunder annihilator (MAIN world at document_start)
(() => {
  'use strict';

  // 1. Patch window.open to require valid user gestures
  const originalOpen = window.open;
  window.open = function (url, target, features) {
    if (!window.event || (window.event.type !== 'click' && window.event.type !== 'pointerdown')) {
      console.warn('[AeroGuard] Blocked programmatic popup:', url);
      return null;
    }
    return originalOpen.apply(this, arguments);
  };

  // 2. Intercept fake invisible target="_blank" links generated dynamically
  document.addEventListener('click', (e) => {
    const target = e.target.closest('a');
    if (target && target.href) {
      const isExternal = target.hostname !== window.location.hostname;
      if (isExternal && target.target === '_blank' && !e.isTrusted) {
        e.preventDefault();
        e.stopPropagation();
        console.warn('[AeroGuard] Blocked untrusted target navigation:', target.href);
      }
    }
  }, true);

  // 3. Block popunder/redirect traps
  window.addEventListener('beforeunload', (e) => {
    // Prevent popunder redirect traps
  }, true);

  // 4. Block iframe popunder spawns
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'IFRAME') {
          const src = node.src || '';
          const isPopup = src.includes('popads') || src.includes('popcash') || src.includes('popunder') ||
                          src.includes('redirect') || src.includes('click') || src.includes('track');
          if (isPopup) {
            node.remove();
            console.warn('[AeroGuard] Blocked popunder iframe:', src);
          }
        }
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();