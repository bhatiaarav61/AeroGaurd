const fs = require('fs');
const root = 'C:/Users/PC/Documents/AeroGaurd/';

// Remove the player-container selectors from the per-element hide lists.
// Hiding .ad-showing/.ytp-ad-module/.video-ads/.ytp-ad-player-overlay blanks
// the whole player (they wrap the video element itself).
for (const f of ['content-scripts/content-script.js', 'content-scripts/element-hider.js']) {
  let s = fs.readFileSync(root + f, 'utf8');
  const before = s;
  for (const line of [
    '      ".ytp-ad-module",\n',
    '      ".ytp-ad-player-overlay",\n',
    '      ".video-ads",\n',
    '      ".ad-showing",\n'
  ]) {
    s = s.split(line).join('');
  }
  if (s !== before) { fs.writeFileSync(root + f, s); console.log('patched hide list:', f); }
  else console.log('no change:', f);
}
