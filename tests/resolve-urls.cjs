(async () => {
  const raw = await (await fetch('https://filters.adtidy.org/extension/ublock/filters.json')).json();
  for (const f of raw.filters) {
    if ([249, 243, 203, 236, 114, 110, 111].includes(f.filterId)) console.log(f.filterId, f.downloadUrl);
  }
})();
console.log('---shard fetch paths---');
const fs = require('fs');
for (const f of ['content-scripts/cosmetic-filter-engine.js', 'content-scripts/element-hider.js', 'utils/rule-update-queue.js']) {
  const s = fs.readFileSync('C:/Users/PC/Documents/AeroGaurd/' + f, 'utf8');
  const paths = [...new Set([...s.matchAll(/['"]([^'"]*(?:cosmetic|scriptlets|rules)[^'"]*)['"]/g)].map(m => m[1]))];
  console.log(f, '=>', paths.slice(0, 12).join(' | '));
}
