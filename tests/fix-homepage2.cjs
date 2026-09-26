const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/content/youtube-content.js';
let s = fs.readFileSync(p, 'utf8');
let failures = 0;

function rep1(uniqueOld, newLine, label) {
  if (!s.includes(uniqueOld)) { console.log('NOT FOUND:', label); failures++; return; }
  if (newLine === null) { console.log('skipped (already applied):', label); return; }
  s = s.split(uniqueOld).join(newLine);
  console.log('patched:', label);
}

// 1. Disable the ytInitialData proxy (shredder + global defineProperty override)
rep1(
  'if (!CONFIG.patchYtInitialData) return;',
  'if (!CONFIG.patchYtInitialData) return;\n    return; // DISABLED: the /ad/i shredder destroyed real YouTube keys ("badges",\n    // "loadMore") and the global Object.defineProperty override aborted Polymer\'s\n    // boot (empty skeleton homepage). Ad renderers are hidden in the DOM instead.',
  'ytInitialData proxy disabled'
);

// 2. Anchor the data shredder regex (in case anything still calls it)
if (/adRendererPatterns = \[\/ad\/i,/.test(s)) {
  s = s.replace(
    /const adRendererPatterns = \[[^\]]*\];/,
    'const adRendererPatterns = [/^(ad(?!\\w{0,2}[a-z])|ads|ad[A-Z_]|promo|sponsor|shopping|mealbar|merch)/i];'
  );
  console.log('patched: shredder regex anchored');
} else console.log('shredder regex: already anchored or absent');

// 3. Fetch interceptor: capture original text, rebuild only when changed
rep1(
  'const data = await clone.json();',
  'const originalText = await clone.text();\n          const data = JSON.parse(originalText);',
  'interceptor: capture original text'
);
rep1(
  'return new Response(JSON.stringify(data), {',
  'const out = JSON.stringify(data);\n          if (out === originalText) { log("player response unchanged - passthrough"); return resp; }\n          return new Response(out, {',
  'interceptor: change-only rebuild'
);

fs.writeFileSync(p, s);
console.log(failures === 0 ? 'YOUTUBE-CONTENT PATCHED' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
