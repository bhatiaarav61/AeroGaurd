(() => {
  'use strict';

  const AD_SELECTORS = `
    ins.adsbygoogle, [id*="google_ads"], [id*="taboola"], [id*="outbrain"],
    [class*="sponsored"], [class*="ad-container"], [class*="ad-wrapper"],
    iframe[src*="doubleclick.net"], iframe[src*="googlesyndication.com"],
    .ad-zone, .ad-space, .ad-box, #ad-slot, div[data-ad-unit]
  `;

  // Inject High-Priority Blocking Style Sheet
  const injectStyles = () => {
    const style = document.createElement('style');
    style.id = 'aeroguard-master-cosmetic';
    style.textContent = `
      ${AD_SELECTORS} {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        height: 0 !important;
        width: 0 !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };

  injectStyles();

  // Shadow DOM Traversal Engine
  const purgeShadowAds = (root = document) => {
    const adNodes = root.querySelectorAll(AD_SELECTORS);
    adNodes.forEach(node => node.remove());

    const allElements = root.querySelectorAll('*');
    allElements.forEach(el => {
      if (el.shadowRoot) {
        purgeShadowAds(el.shadowRoot);
      }
    });
  };

  // High-Speed MutationObserver
  const observer = new MutationObserver(() => {
    purgeShadowAds();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();