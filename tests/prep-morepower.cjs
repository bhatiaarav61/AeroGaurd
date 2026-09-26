(async () => {
  const fs = require('fs');
  // 1. scriptlet shard structure
  const st = fs.statSync('C:/Users/PC/Documents/AeroGaurd/rules/scriptlets/all.json');
  const j = JSON.parse(fs.readFileSync('C:/Users/PC/Documents/AeroGaurd/rules/scriptlets/all.json', 'utf8'));
  const domainCount = Object.keys(j.domains || {}).length;
  const callCount = Object.values(j.domains || {}).reduce((n, v) => n + v.length, 0);
  console.log(`scriptlets/all.json: ${(st.size / 1024).toFixed(0)}KB, ${domainCount} domains, ${callCount} domain calls, ${j.generic.length} generic`);
  const sample = Object.entries(j.domains).slice(0, 3);
  for (const [d, calls] of sample) console.log('  e.g.', d, '->', JSON.stringify(calls.slice(0, 2)));
  // 2. exact registry URLs for the sources we want to merge
  const raw = await (await fetch('https://filters.adtidy.org/extension/ublock/filters.json')).json();
  const want = [18, 19, 20, 21, 22, 201, 250, 208, 255, 259];
  for (const f of raw.filters) {
    if (want.includes(f.filterId)) console.log(f.filterId, f.downloadUrl);
  }
  // 3. verify each URL responds
  for (const f of raw.filters) {
    if (!want.includes(f.filterId)) continue;
    try {
      const r = await fetch(f.downloadUrl, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
      console.log('  check', f.filterId, r.status);
    } catch (e) { console.log('  check', f.filterId, 'FAIL', e.message.slice(0, 40)); }
  }
})();
