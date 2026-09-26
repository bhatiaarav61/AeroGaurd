const fs = require('fs');
const root = 'C:/Users/PC/Documents/AeroGaurd/';
const EOL = (s) => s.includes('\r\n') ? '\r\n' : '\n';
let failures = 0;

// ===== 1. Analytics stubs in the MAIN-world shim (scriptlets.js, part 1) =====
// Network rules block GA/GTM/Mixpanel/etc. Sites whose own scripts call those
// libraries unconditionally then throw ReferenceErrors. Writable stubs (uBO's
// google-analytics_analytics.js pattern) keep page JS alive; a real library
// overwrite them if it loads.
let p = root + 'content-scripts/scriptlets.js';
let s = fs.readFileSync(p, 'utf8');
let eol = EOL(s);
const stubs = [
  '',
  '  // ---- Analytics neutering (network rules block the requests; these stubs',
  '  // ---- keep page scripts that call the libraries from throwing).',
  '  // ---- Stubs are writable+configurable so real libraries can take over.',
  '  try {',
  '    const defStub = (key, value) => {',
  '      try {',
  '        if (window[key] === undefined) {',
  '          Object.defineProperty(window, key, { value, writable: true, configurable: true });',
  '        }',
  '      } catch { /* sealed globals */ }',
  '    };',
  '    defStub(\'dataLayer\', []);',
  '    defStub(\'ga\', function () { (window.ga.q = window.ga.q || []).push(arguments); });',
  '    if (typeof window.ga === \'function\' && !window.ga.l) window.ga.l = Date.now();',
  '    defStub(\'gtag\', function () { (window.dataLayer = window.dataLayer || []).push(arguments); });',
  '    defStub(\'_gaq\', { push: function () {} });',
  '    defStub(\'hj\', function () { (window.hj.q = window.hj.q || []).push(arguments); });',
  '    defStub(\'clarity\', function () {});',
  '    const noopProxy = () => new Proxy({}, {',
  '      get: (target, prop) => {',
  '        if (prop === Symbol.toPrimitive) return () => \'\';',
  '        return noopProxy();',
  '      },',
  '      apply: () => noopProxy()',
  '    });',
  '    defStub(\'mixpanel\', noopProxy());',
  '  } catch { /* never let stubbing break a page */ }'
].join(eol);
if (s.includes("defStub('mixpanel'")) {
  console.log('analytics stubs already present');
} else if (!s.includes('window.__aeroguardScriptlets = {')) {
  console.log('SHIM ANCHOR NOT FOUND'); failures++;
} else {
  s = s.replace('window.__aeroguardScriptlets = {', stubs + eol + eol + '  window.__aeroguardScriptlets = {');
  fs.writeFileSync(p, s);
  console.log('analytics stubs added to scriptlets.js');
}

// ===== 2. Curated blocking for Microsoft Clarity (the one gap) =====
p = root + 'rules/block-rules.json';
const rules = JSON.parse(fs.readFileSync(p, 'utf8'));
const hasClarity = rules.some(r => (r.condition?.urlFilter || '').includes('clarity.ms'));
if (!hasClarity) {
  const maxId = Math.max(...rules.map(r => r.id));
  rules.push({
    id: maxId + 1,
    priority: 1,
    action: { type: 'block' },
    condition: { urlFilter: '||clarity.ms^', resourceTypes: ['script', 'image', 'xmlhttprequest', 'ping', 'websocket'] }
  });
  fs.writeFileSync(p, JSON.stringify(rules));
  console.log('clarity.ms rule added, id ' + (maxId + 1) + ', total ' + rules.length);
} else {
  console.log('clarity.ms already covered');
}

// ===== 3. High-confidence anchored cosmetic selectors in element-hider =====
// Prefix-anchored (^=) and hyphen-suffixed (-ads) only: they cannot match
// "loading"/"address"/"download" the way unanchored [class*="ad"] does.
p = root + 'content-scripts/element-hider.js';
s = fs.readFileSync(p, 'utf8');
eol = EOL(s);
const anchors = [
  '      // Anchored structural ad containers (prefix matches only)',
  '      "##[id^=\\"google_ads_iframe\\"]", "##[id^=\\"div-gpt-ad\\"]",',
  '      "##[id^=\\"taboola-\\"]", "##[id^=\\"outbrain\\"]", "##[id^=\\"advert-\\"]",',
  '      "##[class^=\\"advert-\\"]", "##div[class^=\\"ad-slot\\"]", "##div[class^=\\"ad-banner\\"]",',
  '      "##[id$=\\"-ads\\"]", "##[class$=\\"-ads\\"]",'
].join(eol);
const ytAnchor = '      // YouTube feed ad renderers';
if (s.includes('google_ads_iframe')) {
  console.log('element-hider anchors already present');
} else if (!s.includes(ytAnchor)) {
  console.log('EH ANCHOR NOT FOUND'); failures++;
} else {
  s = s.replace(ytAnchor, anchors + eol + ytAnchor);
  fs.writeFileSync(p, s);
  console.log('element-hider anchors added');
}

process.exit(failures === 0 ? 0 : 1);
