const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/background/service-worker.js';
let s = fs.readFileSync(p, 'utf8');
const lines = s.split(/\r?\n/);
let firstExport = -1;
lines.forEach((l, i) => {
  if (l.startsWith('export { initialize, settings as currentSettings') && firstExport === -1) firstExport = i;
});
if (firstExport === -1) { console.log('EXPORT NOT FOUND'); process.exit(1); }
console.log('first export at line', firstExport + 1, 'of', lines.length);
s = lines.slice(0, firstExport + 1).join('\r\n') + '\r\n';
fs.writeFileSync(p, s);
const names = ['async function applyDynamicRules()', 'async function clearDynamicRules()',
  'async function initialize()', 'chrome.runtime.onMessage.addListener',
  'chrome.webNavigation.onCommitted.addListener', 'chrome.alarms.onAlarm.addListener',
  'initialize().catch', 'import '];
let bad = 0;
for (const n of names) {
  const c = s.split(n).length - 1;
  if (c !== 1) bad++;
  console.log((c === 1 ? 'OK  ' : 'BAD ') + c + 'x ' + n);
}
console.log('lines now:', s.split(/\r?\n/).length);
process.exit(bad === 0 ? 0 : 1);
