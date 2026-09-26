const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/background/service-worker.js';
let s = fs.readFileSync(p, 'utf8');
const lines = s.split(/\r?\n/);

// The proper file ends with the export statement; everything after the LAST
// export line is orphan duplication from the $' expansion bug.
let lastExport = -1;
lines.forEach((l, i) => {
  if (l.startsWith('export { initialize, settings as currentSettings')) lastExport = i;
});
if (lastExport === -1) { console.log('EXPORT LINE NOT FOUND'); process.exit(1); }
console.log('truncating after line', lastExport + 1, '(was', lines.length, 'lines)');
s = lines.slice(0, lastExport + 1).join('\r\n') + '\r\n';
fs.writeFileSync(p, s);

// Coherence checks
const names = ['async function applyDynamicRules()', 'async function clearDynamicRules()',
  'async function initialize()', 'chrome.runtime.onMessage.addListener',
  'chrome.webNavigation.onCommitted.addListener', 'chrome.runtime.onInstalled.addListener',
  "initialize().catch", 'enforceBlockSafety'];
for (const n of names) {
  const count = s.split(n).length - 1;
  console.log((count === 1 ? 'OK  ' : 'BAD ') + count + 'x ' + n);
}
