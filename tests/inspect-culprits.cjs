const fs = require('fs');
const root = 'C:/Users/PC/Documents/AeroGaurd/rules/';

const badware = JSON.parse(fs.readFileSync(root + 'ublock_badware.json', 'utf8'));
for (const r of badware) {
  if ([600214, 600217].includes(r.id) || (r.condition?.urlFilter === '*' ) || (r.action?.type === 'block' && (r.condition?.urlFilter || '').startsWith('||com'))) {
    console.log('badware:', JSON.stringify(r));
  }
}
const privacy = JSON.parse(fs.readFileSync(root + 'ublock_privacy.json', 'utf8'));
for (const r of privacy) {
  if (r.action?.type === 'block' && (r.condition?.urlFilter === '*')) console.log('privacy block *:', JSON.stringify(r));
}
// count redirect shapes in annoyances_plus
const ann = JSON.parse(fs.readFileSync(root + 'annoyances_plus.json', 'utf8'));
const redirects = ann.filter(r => r.action?.type === 'redirect' && !(r.action.redirect || {}).transform);
console.log('annoyances_plus redirects (non-transform):', redirects.length);
const byTarget = {};
for (const r of redirects) {
  const rd = r.action.redirect || {};
  const k = rd.url ? 'remote-url' : rd.extensionPath ? 'extensionPath' : rd.regexSubstitution ? 'regexSub' : Object.keys(rd).join('+');
  byTarget[k] = (byTarget[k] || 0) + 1;
}
console.log('redirect target shapes:', JSON.stringify(byTarget));
const withMain = redirects.filter(r => (r.condition.resourceTypes || []).includes('main_frame'));
console.log('with main_frame:', withMain.length);
console.log('sample:', JSON.stringify(withMain[0]));
console.log('sample2:', JSON.stringify(withMain[1]));
// how many block rules have urlFilter '*' or single-label || across ALL rulesets
const files = fs.readdirSync(root).filter(f => f.endsWith('.json') && !f.includes('index'));
let star = 0, tld = 0;
for (const f of files) {
  let rules; try { rules = JSON.parse(fs.readFileSync(root + f, 'utf8')); } catch { continue; }
  if (!Array.isArray(rules)) continue;
  for (const r of rules) {
    const uf = r.condition?.urlFilter;
    if (r.action?.type === 'block' && uf === '*') star++;
    if (r.action?.type === 'block' && typeof uf === 'string' && uf.startsWith('||') && !uf.includes('.', 2)) tld++;
  }
}
console.log('block rules with urlFilter "*":', star, '| with single-label ||host:', tld);
