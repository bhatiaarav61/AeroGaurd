const fs = require('fs');
const root = 'C:/Users/PC/Documents/AeroGaurd/';
let failures = 0;

const p = root + 'content/youtube-content.js';
let s = fs.readFileSync(p, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const J = (arr) => arr.join(EOL);

function replaceOnce(oldText, newText, label) {
  const o = oldText.split('\n').join(EOL);
  if (!s.includes(o)) { console.log('NOT FOUND:', label); failures++; return; }
  s = s.replace(o, () => newText.split('\n').join(EOL));
  console.log('patched:', label);
}

// 1. Disable the ytInitialData proxy entirely: it shredded YouTube's browse
//    data (/ad/i matches "badge", "loadMore"...) and the global
//    Object.defineProperty override broke Polymer's boot.
replaceOnce(J([
  '  function installYtInitialDataProxy() {',
  '    if (!CONFIG.patchYtInitialData) return;'
]), J([
  '  function installYtInitialDataProxy() {',
  '    // DISABLED: the /ad/i data shredder destroyed legitimate YouTube keys',
  '    // ("badges", "loadMore") and the global Object.defineProperty override',
  '    // silently aborted Polymer\'s boot (empty skeleton homepage). Ad renderers',
  '    // are hidden safely in the DOM by patchCustomElements/element-hider.',
  '    return;'
]), 'disable ytInitialData proxy');

// 2. Fetch interceptor: rebuild the response ONLY when ad fields were removed
replaceOnce(J([
  "              log('Sanitized player response');",
  "              return new Response(JSON.stringify(data), {"
]), J([
  "              const out = JSON.stringify(data);",
  "              if (out === originalText) { log('player response unchanged - passthrough'); return resp; }",
  "              log('Sanitized player response');",
  "              return new Response(out, {"
]), 'fetch interceptor change-only');

// capture the original text at the start of the try block
replaceOnce(J([
  "          const clone = resp.clone();",
  "          try {",
  "            const data = await clone.json();"
]), J([
  "          try {",
  "            const originalText = await resp.clone().text();",
  "            const data = JSON.parse(originalText);"
]), 'interceptor text capture');

// 3. Fix the data shredder regex for safety (even though the proxy is disabled)
const adPat = s.indexOf('const adRendererPatterns = [');
if (adPat !== -1) {
  const end = s.indexOf('];', adPat);
  s = s.slice(0, adPat) +
    'const adRendererPatterns = [\n      /^(ad(?!\\w{0,2}[a-z])|ads|ad[A-Z_]|promo|sponsor|shopping|mealbar|merch)/i' +
    s.slice(end + 1);
  console.log('patched: removeAdsFromInitialData regex anchored');
} else { console.log('NOT FOUND: adRendererPatterns'); failures++; }

fs.writeFileSync(p, s);
console.log(failures === 0 ? 'YOUTUBE-CONTENT PATCHED' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
