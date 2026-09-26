const fs = require('fs');
for (const [f, ids] of [['ublock_badware.json', [703714, 703715, 703794]], ['ublock_privacy.json', [800697, 800700, 800705]]]) {
  const rules = JSON.parse(fs.readFileSync('C:/Users/PC/Documents/AeroGaurd/rules/' + f, 'utf8'));
  for (const r of rules) {
    if (ids.includes(r.id)) console.log('---', f, '---\n' + JSON.stringify(r, null, 1));
  }
}
