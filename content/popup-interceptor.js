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
})();