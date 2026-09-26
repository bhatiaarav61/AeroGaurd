const fs = require('fs');
const root = 'C:/Users/PC/Documents/AeroGaurd/rules/';
const params = new Map();
for (const f of ['annoyances_plus.json', 'ublock_privacy.json', 'tracking-params.json']) {
  const rules = JSON.parse(fs.readFileSync(root + f, 'utf8'));
  for (const r of rules) {
    const rp = r.action && r.action.redirect && r.action.redirect.transform &&
      r.action.redirect.transform.queryTransform && r.action.redirect.transform.queryTransform.removeParams;
    if (!rp) continue;
    const rt = (r.condition.resourceTypes || []).join(',');
    for (const p of rp) {
      const k = p + '  [' + rt + ']  ' + f.replace('.json', '');
      params.set(k, (params.get(k) || 0) + 1);
    }
  }
}
console.log('distinct stripped param entries:', params.size);
console.log([...params.keys()].sort().join('\n'));
