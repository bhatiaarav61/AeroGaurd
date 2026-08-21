(() => {
  'use strict';

  // Inject instant display:none styles
  const style = document.createElement('style');
  style.id = 'aeroguard-aggressive-shield';
  style.textContent = `
    .adbox, .banner_ads, .adsbox, .textads, #ad-slot, #adbox,
    ins.adsbygoogle, [id*="google_ads"], [id*="taboola"], [id*="outbrain"],
    [class*="sponsored"], [class*="ad-container"], [class*="ad-wrapper"],
    iframe[src*="doubleclick.net"], iframe[src*="googlesyndication.com"],
    [aria-label="advertisement"], [data-ad-client] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      height: 0 !important;
      width: 0 !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  // Fast-purge DOM cleaner
  const purge = () => {
    const targets = document.querySelectorAll('.adbox, .banner_ads, .adsbox, .textads, #ad-slot, ins.adsbygoogle');
    for (let i = 0; i < targets.length; i++) {
      targets[i].remove();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', purge);
  } else {
    purge();
  }
})();