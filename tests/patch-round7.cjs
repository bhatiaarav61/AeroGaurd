const fs = require('fs');
const root = 'C:/Users/PC/Documents/AeroGaurd/';
let failures = 0;

// ===== 1. scriptlets.js: set-constant must NOT create fake page objects =====
// Creating window.ytInitialPlayerResponse as an empty shell at document_start
// makes YouTube's own bootstrap see a truthy-but-empty player response and
// never populate real data (skeleton pages). uBO semantics: if the parent
// chain does not exist, the scriptlet is a no-op.
let p = root + 'content-scripts/scriptlets.js';
let s = fs.readFileSync(p, 'utf8');
let eol = s.includes('\r\n') ? '\r\n' : '\n';
const oldSetConstant = [
  '  function setConstant(objectPath, valueToken) {',
  '    try {',
  '      const holder = resolvePath(window, objectPath, true);',
  '      if (!holder) return false;'
].join(eol);
const newSetConstant = [
  '  function setConstant(objectPath, valueToken) {',
  '    try {',
  '      // Never create the parent chain: pre-seeding fake objects (e.g.',
  '      // window.ytInitialPlayerResponse) breaks the page\'s own bootstrap.',
  '      // Pin the constant only when the parent object already exists.',
  '      const holder = resolvePath(window, objectPath, false);',
  '      if (!holder) return false;'
].join(eol);
if (s.includes(oldSetConstant)) {
  s = s.replace(oldSetConstant, () => newSetConstant);
  console.log('set-constant: no-create semantics');
} else { console.log('NOT FOUND: setConstant create'); failures++; }

// ===== 2. scriptlets.js: drop the mixpanel thenable proxy =====
const mixStart = s.indexOf("    const noopProxy = () => new Proxy({}, {");
if (mixStart !== -1) {
  const mixEnd = s.indexOf("    defStub('mixpanel', noopProxy());", mixStart);
  if (mixEnd !== -1) {
    const end = mixEnd + ("    defStub('mixpanel', noopProxy());").length;
    s = s.slice(0, mixStart) + s.slice(end + 2); // drop trailing blank line
    console.log('mixpanel proxy removed (thenable hazard)');
  } else { console.log('mixpanel end NOT FOUND'); failures++; }
} else console.log('mixpanel proxy already absent');

// ===== 3. scriptlets-engine.js: remove the JSON.stringify patch =====
p = root + 'content-scripts/scriptlets-engine.js';
s = fs.readFileSync(p, 'utf8');
eol = s.includes('\r\n') ? '\r\n' : '\n';
const strStart = s.indexOf('      NativeJSON.stringify = function (value, replacer, space) {');
if (strStart !== -1) {
  // the block ends right before the Object.defineProperty(__agPatched) line
  const strEndAnchor = '      Object.defineProperty(NativeJSON, \'__agPatched\', { value: true, configurable: false });';
  const strEnd = s.indexOf(strEndAnchor, strStart);
  if (strEnd === -1) { console.log('stringify end NOT FOUND'); failures++; }
  else {
    s = s.slice(0, strStart) +
      '      // NOTE: JSON.stringify is deliberately NOT patched - a shallow clone\n' +
      '      // corrupts getter-based serialization (e.g. YouTube player configs).\n' +
      '      ' + s.slice(strEnd);
    console.log('JSON.stringify patch removed');
  }
} else console.log('stringify patch already absent');
fs.writeFileSync(p, s);

// ===== 4. service worker: privacy modules opt-in (default off) =====
p = root + 'background/service-worker.js';
s = fs.readFileSync(p, 'utf8');
eol = s.includes('\r\n') ? '\r\n' : '\n';
const advOld = "  advanced: { strictBlocking: false, blockWebRTC: false, blockRemoteFonts: false, blockThirdPartyFrames: false, httpsByDefault: true },";
const advNew = "  advanced: { strictBlocking: false, blockWebRTC: false, blockRemoteFonts: false, blockThirdPartyFrames: false, httpsByDefault: true, privacyModules: false },";
if (s.includes(advOld)) { s = s.replace(advOld, () => advNew); console.log('privacyModules default off'); }
else if (s.includes('privacyModules: false')) console.log('privacyModules already off');
else { console.log('advanced settings line NOT FOUND'); failures++; }

const injOld = [
  'async function injectPrivacyScripts(tabId) {',
  '  // Content scripts also run on the new-tab page; chrome.scripting can never',
  '  // access protected pages, so skip them silently instead of retrying.',
  '  try {',
  '    const tab = await chrome.tabs.get(tabId);',
  '    if (!tab?.url || !/^https?:/i.test(tab.url)) return;',
  '  } catch {',
  '    return;',
  '  }'
].join(eol);
const injNew = injOld + eol + [
  '  // The privacy modules are experimental hooks; they stay opt-in so an',
  '  // untested hook can never take down browsing on every site.',
  '  if (settings.advanced?.privacyModules !== true) return;'
].join(eol);
if (s.includes(injOld)) { s = s.replace(injOld, () => injNew); console.log('privacy injection gated'); }
else { console.log('injectPrivacyScripts head NOT FOUND'); failures++; }
fs.writeFileSync(p, s);

console.log(failures === 0 ? 'ROUND-7 PATCHES OK' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
