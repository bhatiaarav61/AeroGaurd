const fs = require('fs');
const root = 'C:/Users/PC/Documents/AeroGaurd/';
let failures = 0;

function patchFile(path, replacements) {
  let s = fs.readFileSync(path, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  for (const [oldText, newText, label] of replacements) {
    const o = oldText.split('\n').join(eol);
    if (!s.includes(o)) { console.log('NOT FOUND [' + label + '] in ' + path.split('/').pop()); failures++; continue; }
    // function-based replacement: immune to $ patterns in the new text
    s = s.replace(o, () => newText.split('\n').join(eol));
    console.log('patched:', label);
  }
  fs.writeFileSync(path, s);
  return s;
}

// ============ 1. youtube-adblocker.js ============
const ytp = root + 'background/youtube-adblocker.js';
const ytReps = [];

// a. invalid rule 80001 (was reverted by the parallel session)
ytReps.push([
  "{ url: '||*.googlevideo.com/*', types: ['media'] },",
  "// \"||*...\" is invalid in DNR (wildcard cannot follow ||); ||googlevideo.com\n          // already matches the host and every subdomain.\n          { url: '||googlevideo.com', types: ['media'] },",
  'rule 80001 googlevideo'
]);

// b. catastrophically broad ad-key regex: /ad/i matches "badge", "badges",
//    "loadMore" -> YouTube's own UI data was being shredded (skeleton pages)
ytReps.push([
  "const keys = Object.keys(node.renderer);",
  "const keys = Object.keys(node.renderer);",
  'anchor-keys' // no-op keep; replaced below via regex swap
]);
const broadRe = /\/ad\|promo\|sponsor\|shopping\|mealbar\|merch\/i/g;
let yt = fs.readFileSync(ytp, 'utf8');
const broadCount = (yt.match(broadRe) || []).length;
yt = yt.replace(broadRe, () => '/^(ad(?![a-z])|ads|ad[A-Z_]|promo|sponsor|shopping|mealbar|merch)/i');
console.log('broad ad-key regexes fixed:', broadCount);
if (broadCount === 0) failures++;

// c. null-body observers inside MAIN-world scriptlets
const bodyObsCount = (yt.match(/observe\(document\.body,/g) || []).length;
yt = yt.split('observe(document.body,').join('observe(document.body || document.documentElement,');
console.log('scriptlet body observers guarded:', bodyObsCount);

// d. fetch-response rebuild: only rewrite when something was actually removed,
//    and never drop adaptiveFormats (HLS paths) - both could kill playback
const oldFetch = [
  "            if (typeof url === 'string' && url.includes('/youtubei/v1/player')) {",
  "              const clone = resp.clone();",
  "              try {",
  "                const data = await clone.json();",
  "                if (data?.playabilityStatus) {",
  "                  delete data.playabilityStatus.adSignalsInfo;",
  "                  delete data.playabilityStatus.adsPresentation;",
  "                }",
  "                if (data?.playerConfig) { delete data.playerConfig.adConfig; delete data.playerConfig.adPlacements; }",
  "                if (data?.videoDetails) { delete data.videoDetails.allowAds; delete data.videoDetails.adTagUrl; delete data.videoDetails.adTagUrlSet; }",
  "                if (data?.streamingData?.adaptiveFormats) {",
  "                  data.streamingData.adaptiveFormats = data.streamingData.adaptiveFormats.filter(f =>",
  "                    !f.url?.includes('/api/manifest/') && !f.mimeType?.includes('application/vnd.apple.mpegurl')",
  "                  );",
  "                }",
  "                return new Response(JSON.stringify(data), { status: resp.status, statusText: resp.statusText, headers: resp.headers });",
  "              } catch { return resp; }"
].join('\r\n');
const newFetch = [
  "            if (typeof url === 'string' && url.includes('/youtubei/v1/player')) {",
  "              try {",
  "                const text = await resp.clone().text();",
  "                const data = JSON.parse(text);",
  "                if (data?.playabilityStatus) {",
  "                  delete data.playabilityStatus.adSignalsInfo;",
  "                  delete data.playabilityStatus.adsPresentation;",
  "                }",
  "                if (data?.playerConfig) { delete data.playerConfig.adConfig; delete data.playerConfig.adPlacements; }",
  "                if (data?.videoDetails) { delete data.videoDetails.allowAds; delete data.videoDetails.adTagUrl; delete data.videoDetails.adTagUrlSet; }",
  "                // Never touch streamingData/adaptiveFormats: stripping formats",
  "                // or rebuilding the body when nothing changed breaks playback.",
  "                const out = JSON.stringify(data);",
  "                return out === text ? resp : new Response(out, { status: resp.status, statusText: resp.statusText, headers: resp.headers });",
  "              } catch { return resp; }"
].join('\r\n');
if (!yt.includes(oldFetch)) { console.log('NOT FOUND: fetch rebuild block'); failures++; }
else { yt = yt.replace(oldFetch, () => newFetch); console.log('patched: fetch rebuild made change-only'); }

fs.writeFileSync(ytp, yt);
// apply the two list-based replacements through the same file
let s2 = fs.readFileSync(ytp, 'utf8');
for (const [o, n, label] of ytReps) {
  if (label === 'anchor-keys') continue;
  if (!s2.includes(o)) { console.log('NOT FOUND [' + label + ']'); failures++; continue; }
  s2 = s2.replace(o, () => n);
  console.log('patched:', label);
}
fs.writeFileSync(ytp, s2);

// ============ 2. youtube-content.js: define the missing hideAdElements ============
const ycp = root + 'content/youtube-content.js';
let yc = fs.readFileSync(ycp, 'utf8');
if (!/function hideAdElements\s*\(/.test(yc)) {
  yc += '\r\n// Defined: pages reference hideAdElements() but the sweep lives in\r\n' +
        '// hidePromotedContent(); function declarations hoist, so this maps it.\r\n' +
        'function hideAdElements() { try { hidePromotedContent(); } catch (e) {} }\r\n';
  fs.writeFileSync(ycp, yc);
  console.log('patched: hideAdElements mapped to hidePromotedContent');
} else {
  console.log('hideAdElements already defined');
}

// ============ 3. element-hider.js: stray observe on null observer ============
const ehp = root + 'content-scripts/element-hider.js';
let eh = fs.readFileSync(ehp, 'utf8');
const stray = '    this.observer = null;\r\n    this.observer.observe(document.documentElement, { childList: true, subtree: true });';
const strayLf = '    this.observer = null;\n    this.observer.observe(document.documentElement, { childList: true, subtree: true });';
if (eh.includes(stray)) { eh = eh.replace(stray, '    this.observer = null;'); console.log('patched: element-hider stray observe removed'); }
else if (eh.includes(strayLf)) { eh = eh.replace(strayLf, '    this.observer = null;'); console.log('patched: element-hider stray observe removed (lf)'); }
else { console.log('NOT FOUND: element-hider stray observe'); failures++; }
fs.writeFileSync(ehp, eh);

// ============ 4. privacy modules: strip export lines (classic-script injection) ============
for (const f of ['fingerprinting-protection', 'cookie-protection', 'cname-uncloaking', 'bounce-tracking-protection', 'webrtc-protection']) {
  const pm = root + 'privacy-modules/' + f + '.js';
  let ps = fs.readFileSync(pm, 'utf8');
  const before = ps;
  ps = ps.replace(/^export\s*\{[^}]*\};\s*$/gm, '');
  ps = ps.replace(/^export\s+default\s+.*$/gm, '');
  ps = ps.replace(/^export\s+(const|let|var|class|function)\s+/gm, '$1 ');
  if (ps !== before) { fs.writeFileSync(pm, ps); console.log('patched: exports stripped from ' + f); }
  else console.log('no exports left in ' + f);
}

console.log(failures === 0 ? 'ALL ROUND-6 PATCHES OK' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
