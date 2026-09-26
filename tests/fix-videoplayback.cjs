const fs = require('fs');
const root = 'C:/Users/PC/Documents/AeroGaurd/';

// 1. DELETE the videoplayback block from curated core rules
const bp = root + 'rules/block-rules.json';
const rules = JSON.parse(fs.readFileSync(bp, 'utf8'));
const before = rules.length;
const filtered = rules.filter(r => !(r.condition?.urlFilter || '').includes('googlevideo.com/videoplayback'));
fs.writeFileSync(bp, JSON.stringify(filtered));
console.log('block-rules:', before, '->', filtered.length, '(removed videoplayback block id=93)');

// 2. Dynamic allows: cover MSE video segments fetched via XHR
const yp = root + 'background/youtube-adblocker.js';
let s = fs.readFileSync(yp, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';
s = s.replace(
  "{ url: '||googlevideo.com/videoplayback*', types: ['media'] },",
  "{ url: '||googlevideo.com/videoplayback*', types: ['media', 'xmlhttprequest'] },"
);
s = s.replace(
  "{ url: '||googlevideo.com', types: ['media'] },",
  "{ url: '||googlevideo.com', types: ['media', 'xmlhttprequest'] },"
);

// 3. Ad-manifest blocks must beat the broad priority-2 allow
s = s.replace(
  "    for (const b of blocks) {",
  "    for (const b of blocks) {"
);
s = s.replace(
  /    for \(const b of blocks\) \{\r?\n      rules\.push\(\{\r?\n        id: id\+\+,\r?\n        priority: 1,/,
  (match) => match // keep; we adjust inside the push via url check below
);
// precise: change the push to use higher priority for ad-manifest rules
const oldPush = s.match(/    for \(const b of blocks\) \{[\s\S]*?return rules;/);
if (!oldPush) { console.log('BLOCKS LOOP NOT FOUND'); process.exit(1); }
const newPush = oldPush[0].replace(
  "      rules.push({\n        id: id++,\n        priority: 1,",
  "      rules.push({\n        id: id++,\n        priority: b.includes('manifest.googlevideo.com') ? 3 : 1,"
).replace(
  "      rules.push({\r\n        id: id++,\r\n        priority: 1,",
  "      rules.push({\r\n        id: id++,\r\n        priority: b.includes('manifest.googlevideo.com') ? 3 : 1,"
);
s = s.replace(oldPush[0], () => newPush);
fs.writeFileSync(yp, s);
console.log('dynamic allows widened to xmlhttprequest; ad-manifest blocks raised to priority 3');
