const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/rules/tracking-params.json';
const rules = JSON.parse(fs.readFileSync(p, 'utf8'));
let patched = 0;
for (const r of rules) {
  if (r.condition && !r.condition.urlFilter && !r.condition.regexFilter) {
    r.condition.urlFilter = '*';
    patched++;
  }
}
fs.writeFileSync(p, JSON.stringify(rules));
console.log('patched', patched, 'of', rules.length, 'rules');
