const fs = require('fs');
const root = 'C:/Users/PC/Documents/AeroGaurd/';
let ok = true;

// ============ element-hider.js: CSS is live — never rebuild on mutations ============
let p = root + 'content-scripts/element-hider.js';
let s = fs.readFileSync(p, 'utf8');
const eol = s.includes('\r\n') ? '\r\n' : '\n';
const J = (arr) => arr.join(eol);

const oldObserver = J([
  '  startObserver() {',
  '    this.observer = new MutationObserver((mutations) => {',
  '      let shouldReapply = false;',
  '      for (const mutation of mutations) {',
  '        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {',
  '          shouldReapply = true;',
  '          break;',
  '        }',
  '      }',
  '      if (shouldReapply) this.applyFilters();',
  '    });'
]);
const newObserver = J([
  '  startObserver() {',
  '    // CSS selectors are matched live by the browser - re-setting the',
  '    // stylesheet on every mutation forces a full style recalc and makes',
  '    // pages unresponsive. The stylesheet is applied once and updated only',
  '    // via explicit messages (COSMETIC_FILTERS_UPDATED / EXTENSION_TOGGLED).',
  '    this.observer = null;'
]);
if (!s.includes(oldObserver)) { console.log('EH observer block NOT FOUND'); ok = false; }
else s = s.replace(oldObserver, newObserver);
fs.writeFileSync(p, s);
console.log('element-hider observer neutralized');

// ============ cosmetic-filter-engine.js: same live-CSS fix ============
p = root + 'content-scripts/cosmetic-filter-engine.js';
s = fs.readFileSync(p, 'utf8');
const oldCE = J([
  '  startObserver() {',
  '    const observer = new MutationObserver(() => { this.applyFilters(); });',
  '    observer.observe(document.documentElement, { childList: true, subtree: true });',
  '  }'
]);
const newCE = J([
  '  startObserver() {',
  '    // Stylesheet is live in the browser; re-applying on every mutation',
  '    // forces full-page style recalculation. Filters update via messages.',
  '  }'
]);
if (!s.includes(oldCE)) { console.log('CE observer block NOT FOUND'); ok = false; }
else s = s.replace(oldCE, newCE);
fs.writeFileSync(p, s);
console.log('cosmetic-filter-engine observer neutralized');

// ============ content-script.js: debounce the YouTube sweeps ============
p = root + 'content-scripts/content-script.js';
s = fs.readFileSync(p, 'utf8');
const oldYtInterval = J([
  '    // Aggressive YouTube ad blocking interval',
  '    this.youtubeAdInterval = setInterval(() => {',
  '      if (!this.enabled || !this.tabEnabled) return;',
  '      this.blockYouTubeAds();',
  '    }, 500);'
]);
const newYtInterval = J([
  '    // YouTube ad sweep - throttled; a 500ms full sweep of dozens of',
  '    // selectors starved the main thread on busy pages',
  '    this.youtubeAdInterval = setInterval(() => {',
  '      if (!this.enabled || !this.tabEnabled) return;',
  '      this.blockYouTubeAds();',
  '    }, 1500);'
]);
if (!s.includes(oldYtInterval)) { console.log('CS yt interval NOT FOUND'); ok = false; }
else s = s.replace(oldYtInterval, newYtInterval);
fs.writeFileSync(p, s);
console.log('content-script YouTube sweep throttled');

if (!ok) process.exit(1);
console.log('ALL PERF PATCHES APPLIED');
