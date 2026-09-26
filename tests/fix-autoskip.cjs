const fs = require('fs');
const root = 'C:/Users/PC/Documents/AeroGaurd/';
let failures = 0;

function patch(p, pairs) {
  let s = fs.readFileSync(p, 'utf8');
  for (const [oldText, newText, label] of pairs) {
    if (!s.includes(oldText)) { console.log('NOT FOUND [' + label + '] ' + p.split('/').pop()); failures++; continue; }
    s = s.split(oldText).join(newText);
    console.log('patched:', label);
  }
  fs.writeFileSync(p, s);
}

// ===== 1. content-script.js: precise ad state + stop hiding containers =====
patch(root + 'content-scripts/content-script.js', [
  [
    'const adShowing = document.querySelector(".ad-showing") || document.querySelector(".ytp-ad-module");',
    '// .ytp-ad-module is a PERSISTENT container (exists without ads) - using it as\n' +
    '    // the ad signal seeked the REAL video to its end. Only .ad-showing on the\n' +
    '    // player root is a true "ad playing" state.\n' +
    '    const adShowing = document.querySelector(".html5-video-player.ad-showing");',
    'precise ad detection'
  ],
  [
    '      ".ytp-ad-module",\n      ".ytp-ad-player-overlay",\n      ".ytp-ad-preview-container",\n      ".ytp-ad-skip-button-container",\n      ".video-ads",\n      ".ad-showing",',
    '      ".ytp-ad-preview-container",',
    'remove container hiding (content-script)'
  ]
]);

// ===== 2. element-hider.js: same two fixes =====
patch(root + 'content-scripts/element-hider.js', [
  [
    'const adShowing = document.querySelector(".ad-showing") || document.querySelector(".ytp-ad-module");',
    '// Only the player-root ad-showing class is a true "ad playing" state.\n' +
    '    const adShowing = document.querySelector(".html5-video-player.ad-showing");',
    'precise ad detection (element-hider)'
  ],
  [
    '      ".ytp-ad-module",\n      ".ytp-ad-player-overlay",\n      ".ytp-ad-preview-container",\n      ".ytp-ad-skip-button-container",\n      ".video-ads",\n      ".ad-showing",',
    '      ".ytp-ad-preview-container",',
    'remove container hiding (element-hider)'
  ]
]);

// ===== 3. youtube-adblocker.js scriptlet: precise condition before seeking =====
patch(root + 'background/youtube-adblocker.js', [
  [
    "if (document.querySelector('.ad-interrupting, .html5-ad-space, .ytp-ad-player-overlay, .ytp-ad-module')) {",
    "if (document.querySelector('.html5-video-player.ad-showing, .ytp-ad-player-overlay-layout')) {",
    'precise skip condition (scriptlet)'
  ]
]);

console.log(failures === 0 ? 'AUTO-SKIP FIXES OK' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
