// cosmetic-shield.js (Injected at document_start)
(() => {
  'use strict';

  const adSelectors = `
    ins.adsbygoogle,
    [id*="google_ads"],
    [id*="taboola"],
    [id*="outbrain"],
    [id*="criteo"],
    [class*="sponsored-post"],
    [class*="ad-container"],
    [class*="ad-wrapper"],
    [class*="ad-slot"],
    [aria-label="advertisement"],
    iframe[src*="doubleclick.net"],
    iframe[src*="googlesyndication.com"],
    .ad-zone, .ad-space, .ad-box, #ad-slot, #banner-ad
  `;

  // Inject CSS style
  const style = document.createElement('style');
  style.id = 'aeroguard-cosmetic-shield';
  style.textContent = `
    ${adSelectors} {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      height: 0 !important;
      width: 0 !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  // Dynamic Removal
  const observer = new MutationObserver(() => {
    const adElements = document.querySelectorAll(adSelectors);
    for (let i = 0; i < adElements.length; i++) {
      adElements[i].remove();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();