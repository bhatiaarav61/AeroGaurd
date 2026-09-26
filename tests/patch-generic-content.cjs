const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/content/generic-content.js';
let s = fs.readFileSync(p, 'utf8');
const LF = s.includes('\r\n') ? '\r\n' : '\n';
const J = (arr) => arr.join(LF);
let failures = 0;

function replaceOnce(oldText, newText, label) {
  if (!s.includes(oldText)) { console.log('NOT FOUND:', label); failures++; return; }
  s = s.replace(oldText, newText);
  console.log('patched:', label);
}

// 1. Single-pass shadow-root collection instead of per-selector full walks.
replaceOnce(J([
  'function pierceShadowDOM(root, selector, callback) {',
  '  if (!CONFIG.enableShadowDomPiercing) return;',
  '  try {',
  '    root.querySelectorAll(selector).forEach(callback);',
  '    root.querySelectorAll(\'*\').forEach(el => {',
  '      if (el.shadowRoot) pierceShadowDOM(el.shadowRoot, selector, callback);',
  '    });',
  '  } catch (e) { /* ignore */ }',
  '}'
]), J([
  '// Collect every open shadow root once, then run each selector across',
  '// [document, ...roots]. Walking all elements per selector was O(selectors x nodes).',
  'function collectShadowRoots(root, roots, depth) {',
  '  if (!CONFIG.enableShadowDomPiercing || depth > 6) return;',
  '  try {',
  '    root.querySelectorAll(\'*\').forEach(el => {',
  '      if (el.shadowRoot) {',
  '        roots.push(el.shadowRoot);',
  '        collectShadowRoots(el.shadowRoot, roots, depth + 1);',
  '      }',
  '    });',
  '  } catch (e) { /* ignore */ }',
  '}',
  '',
  'function runInAllRoots(selectors, callback) {',
  '  const roots = [document];',
  '  collectShadowRoots(document, roots, 0);',
  '  for (const root of roots) {',
  '    for (const sel of selectors) {',
  '      try { root.querySelectorAll(sel).forEach(callback); } catch (e) {}',
  '    }',
  '  }',
  '}'
]), 'shadow piercing');

// 2. hideAdElements: replace per-selector loops (plain + shadow) with runInAllRoots
replaceOnce(J([
  'function hideAdElements() {',
  '  if (!CONFIG.hideAdElements) return;',
  '  let count = 0;',
  '  for (const sel of AD_SELECTORS) {',
  '    try {',
  '      document.querySelectorAll(sel).forEach(el => {',
  '        if (!el._adBlocked && isVisible(el)) { hideElement(el); count++; }',
  '      });',
  '    } catch(e) {}',
  '  }',
  '  // Shadow DOM',
  '  if (CONFIG.enableShadowDomPiercing) {',
  '    for (const sel of AD_SELECTORS) {',
  '      pierceShadowDOM(document, sel, el => {',
  '        if (!el._adBlocked && isVisible(el)) { hideElement(el); count++; }',
  '      });',
  '    }',
  '  }',
  '  if (count) log(`Hidden ${count} ad elements`);',
  '}'
]), J([
  'function hideAdElements() {',
  '  if (!CONFIG.hideAdElements) return;',
  '  let count = 0;',
  '  runInAllRoots(AD_SELECTORS, el => {',
  '    if (!el._adBlocked && isVisible(el)) { hideElement(el); count++; }',
  '  });',
  '  if (count) log(`Hidden ${count} ad elements`);',
  '}'
]), 'hideAdElements');

// 3. removeCookieBanners
replaceOnce(J([
  '  let count = 0;',
  '  for (const sel of COOKIE_SELECTORS) {',
  '    try {',
  '      document.querySelectorAll(sel).forEach(el => {',
  '        if (!el._adBlockedRemoved && isLikelyCookieBanner(el)) { removeElement(el); count++; }',
  '      });',
  '    } catch(e) {}',
  '  }',
  '  // Shadow DOM',
  '  if (CONFIG.enableShadowDomPiercing) {',
  '    for (const sel of COOKIE_SELECTORS) {',
  '      pierceShadowDOM(document, sel, el => {',
  '        if (!el._adBlockedRemoved && isLikelyCookieBanner(el)) { removeElement(el); count++; }',
  '      });',
  '    }',
  '  }',
  '  restorePageScrolling();'
]), J([
  '  let count = 0;',
  '  runInAllRoots(COOKIE_SELECTORS, el => {',
  '    if (!el._adBlockedRemoved && isLikelyCookieBanner(el)) { removeElement(el); count++; }',
  '  });',
  '  restorePageScrolling();'
]), 'removeCookieBanners');

// 4. removeNewsletterPopups
replaceOnce(J([
  '  let count = 0;',
  '  for (const sel of NEWSLETTER_SELECTORS) {',
  '    try {',
  '      document.querySelectorAll(sel).forEach(el => {',
  '        if (!el._adBlockedRemoved && isLikelyNewsletter(el)) { removeElement(el); count++; }',
  '      });',
  '    } catch(e) {}',
  '  }',
  '  // Shadow DOM',
  '  if (CONFIG.enableShadowDomPiercing) {',
  '    for (const sel of NEWSLETTER_SELECTORS) {',
  '      pierceShadowDOM(document, sel, el => {',
  '        if (!el._adBlockedRemoved && isLikelyNewsletter(el)) { removeElement(el); count++; }',
  '      });',
  '    }',
  '  }',
  '  restorePageScrolling();'
]), J([
  '  let count = 0;',
  '  runInAllRoots(NEWSLETTER_SELECTORS, el => {',
  '    if (!el._adBlockedRemoved && isLikelyNewsletter(el)) { removeElement(el); count++; }',
  '  });',
  '  restorePageScrolling();'
]), 'removeNewsletterPopups');

// 5. removeOverlayAds (OVERLAY_SELECTORS is empty; keep the loop shape)
replaceOnce(J([
  '  let count = 0;',
  '  for (const sel of OVERLAY_SELECTORS) {',
  '    try {',
  '      document.querySelectorAll(sel).forEach(el => {',
  '        if (!el._adBlockedRemoved && isLikelyOverlay(el)) { removeElement(el); count++; }',
  '      });',
  '    } catch(e) {}',
  '  }',
  '  if (CONFIG.enableShadowDomPiercing) {',
  '    for (const sel of OVERLAY_SELECTORS) {',
  '      pierceShadowDOM(document, sel, el => {',
  '        if (!el._adBlockedRemoved && isLikelyOverlay(el)) { removeElement(el); count++; }',
  '      });',
  '    }',
  '  }',
  '  if (count) log(`Removed ${count} overlay ads`);'
]), J([
  '  let count = 0;',
  '  runInAllRoots(OVERLAY_SELECTORS, el => {',
  '    if (!el._adBlockedRemoved && isLikelyOverlay(el)) { removeElement(el); count++; }',
  '  });',
  '  if (count) log(`Removed ${count} overlay ads`);'
]), 'removeOverlayAds');

// 6. Kill the 500ms emergency loop
replaceOnce(J([
  'emergencyUnblockMainContent();',
  'setInterval(emergencyUnblockMainContent, 500);'
]), J([
  'emergencyUnblockMainContent();'
]), '500ms emergency loop');

// 7. MutationObserver: childList only, drop per-node text scans
replaceOnce(J([
  '  const ALL_SELECTORS = [...SAFE_GENERIC_SELECTORS, ...COOKIE_SELECTORS, ...NEWSLETTER_SELECTORS, ...OVERLAY_SELECTORS];',
  '  observer = new MutationObserver(mutations => {',
  '    let check = false;',
  '    for (const m of mutations) {',
  '      if (m.type === \'childList\' && m.addedNodes.length) {',
  '        for (const n of m.addedNodes) {',
  '          if (n.nodeType === 1 && (isLikelyAd(n) || n.querySelector?.(ALL_SELECTORS.join(\',\')) || isLikelyCookieBanner(n) || isLikelyNewsletter(n) || isLikelyOverlay(n))) { check = true; break; }',
  '        }',
  '      }',
  '    }',
  '    if (check) {',
  '      clearTimeout(observer._debounce);',
  '      observer._debounce = setTimeout(() => {',
  '        if (CONFIG.hideAdElements) hideAdElements();',
  '        if (CONFIG.removeCookieBanners) removeCookieBanners();',
  '        if (CONFIG.removeNewsletterPopups) removeNewsletterPopups();',
  '        if (CONFIG.removeOverlayAds) removeOverlayAds();',
  '      }, 200);',
  '    }',
  '  });',
  '  observer.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: [\'class\',\'id\',\'style\',\'src\',\'data-ad\'] });'
]), J([
  '  observer = new MutationObserver((mutations) => {',
  '    let added = false;',
  '    for (const m of mutations) {',
  '      if (m.addedNodes.length > 0) { added = true; break; }',
  '    }',
  '    if (added) {',
  '      clearTimeout(observer._debounce);',
  '      observer._debounce = setTimeout(() => {',
  '        if (CONFIG.hideAdElements) hideAdElements();',
  '        if (CONFIG.removeCookieBanners) removeCookieBanners();',
  '        if (CONFIG.removeNewsletterPopups) removeNewsletterPopups();',
  '        if (CONFIG.removeOverlayAds) removeOverlayAds();',
  '      }, 400);',
  '    }',
  '  });',
  '  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });'
]), 'mutation observer');

// 8. Kill the 2s full-scan interval
replaceOnce(J([
  '  setupMutationObserver();',
  '  cleanupInterval = setInterval(() => {',
  '    if (CONFIG.hideAdElements) hideAdElements();',
  '    if (CONFIG.removeCookieBanners) removeCookieBanners();',
  '    if (CONFIG.removeNewsletterPopups) removeNewsletterPopups();',
  '    if (CONFIG.removeOverlayAds) removeOverlayAds();',
  '  }, 2000);'
]), J([
  '  setupMutationObserver();'
]), '2s full-scan interval');

fs.writeFileSync(p, s);
console.log(failures === 0 ? 'generic-content fully patched' : failures + ' PATCHES FAILED');
process.exit(failures === 0 ? 0 : 1);
