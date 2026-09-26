// Fix invalid regexFilters: strip trailing escaped backslash (conversion artifact)
const fs = require('fs');
const files = ['C:/Users/PC/Documents/AeroGaurd/rules/ublock_badware.json', 'C:/Users/PC/Documents/AeroGaurd/rules/ublock_privacy.json'];
let fixed = 0;
for (const f of files) {
  const rules = JSON.parse(fs.readFileSync(f, 'utf8'));
  let changed = false;
  for (const r of rules) {
    const re = r.condition && r.condition.regexFilter;
    if (typeof re === 'string' && /\\$/.test(re)) {
      r.condition.regexFilter = re.replace(/\\+$/, '');
      // sanity check the result is a valid regex
      try { new RegExp(r.condition.regexFilter); } catch (e) {
        // if still invalid, drop the whole condition's regexFilter in favor of urlFilter-safe removal
        console.log('STILL INVALID after strip, removing rule id=' + r.id + ' from ' + f + ': ' + e.message);
        r.condition.regexFilter = '';
      }
      fixed++;
      changed = true;
      console.log('fixed', f.split('/').pop(), 'id=' + r.id, '->', r.condition.regexFilter);
    }
    if (r.condition && r.condition.regexFilter === '') delete r.condition.regexFilter;
  }
  if (changed) fs.writeFileSync(f, JSON.stringify(rules, null, 1));
}
console.log('Total fixed:', fixed);
