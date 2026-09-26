const fs = require('fs');
const path = require('path');
const root = 'C:/Users/PC/Documents/AeroGaurd/';
const m = JSON.parse(fs.readFileSync(root + 'manifest.json', 'utf8'));
let total = 0, files = 0;
for (const rs of m.declarative_net_request.rule_resources) {
  const p = path.join(root, rs.path);
  if (!fs.existsSync(p)) continue;
  let rules;
  try { rules = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
  if (!Array.isArray(rules)) continue;
  let n = 0;
  for (const r of rules) {
    const c = r.condition || {};
    const pairs = [
      ['resourceTypes', 'excludedResourceTypes'],
      ['requestDomains', 'excludedRequestDomains'],
      ['initiatorDomains', 'excludedInitiatorDomains'],
      ['requestMethods', 'excludedRequestMethods'],
      ['tabIds', 'excludedTabIds']
    ];
    for (const [inc, exc] of pairs) {
      if (Array.isArray(c[inc]) && Array.isArray(c[exc])) {
        const overlap = c[inc].filter(v => c[exc].includes(v));
        if (overlap.length) {
          n++;
          if (n <= 2) console.log(rs.id, 'id=' + r.id, inc + '∩' + exc, JSON.stringify(overlap));
        }
      }
    }
  }
  if (n) { files++; total += n; console.log('  ->', rs.id, n, 'overlapping rules'); }
}
console.log('TOTAL overlap rules:', total, 'across', files, 'files');
