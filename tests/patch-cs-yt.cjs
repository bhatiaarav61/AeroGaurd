const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/content-scripts/content-script.js';
let s = fs.readFileSync(p, 'utf8');
const LF = '\n';

// 1. Throttle the YouTube sweep
const oldInterval = [
  '    this.youtubeAdInterval = setInterval(() => {',
  '      if (!this.enabled || !this.tabEnabled) return;',
  '      this.blockYouTubeAds();',
  '    }, 500);'
].join(LF);
const newInterval = [
  '    // Throttled: a 500ms sweep of dozens of selectors starved the main thread',
  '    this.youtubeAdInterval = setInterval(() => {',
  '      if (!this.enabled || !this.tabEnabled) return;',
  '      this.blockYouTubeAds();',
  '    }, 1500);'
].join(LF);
if (!s.includes(oldInterval)) { console.log('INTERVAL NOT FOUND'); process.exit(1); }
s = s.replace(oldInterval, newInterval);

// 2. Debounce the mutation-driven sweep
const oldObserver = [
  '    const ytObserver = new MutationObserver((mutations) => {',
  '      if (!this.enabled || !this.tabEnabled) return;',
  '      for (const mutation of mutations) {',
  '        for (const node of mutation.addedNodes) {',
  '          if (node.nodeType === Node.ELEMENT_NODE) {',
  '            this.blockYouTubeAdElements(node);',
  '          }',
  '        }',
  '      }',
  '    });'
].join(LF);
const newObserver = [
  '    let ytSweepPending = null;',
  '    const sweep = (root) => {',
  '      if (ytSweepPending) clearTimeout(ytSweepPending);',
  '      ytSweepPending = setTimeout(() => {',
  '        ytSweepPending = null;',
  '        if (this.enabled && this.tabEnabled) this.blockYouTubeAdElements(root || document);',
  '      }, 250);',
  '    };',
  '    const ytObserver = new MutationObserver(() => sweep(document));'
].join(LF);
if (!s.includes(oldObserver)) { console.log('OBSERVER NOT FOUND'); process.exit(1); }
s = s.replace(oldObserver, newObserver);

fs.writeFileSync(p, s);
console.log('content-script YouTube paths throttled + debounced');
