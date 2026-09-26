const fs = require('fs');
const root = 'C:/Users/PC/Documents/AeroGaurd/';
let failures = 0;

const PRUNE_PATHS = 'playerResponse.adPlacements playerResponse.playerAds playerResponse.adSlots adPlacements playerAds adSlots';

// ===== 1. shard: add the www json-prune call (deduped) =====
const sp = root + 'rules/scriptlets/all.json';
const shard = JSON.parse(fs.readFileSync(sp, 'utf8'));
for (const d of ['www.youtube.com', 'youtube.com']) {
  shard.domains[d] = shard.domains[d] || [];
  const entry = ['json-prune', [PRUNE_PATHS]];
  if (!shard.domains[d].some(c => JSON.stringify(c) === JSON.stringify(entry))) {
    shard.domains[d].push(entry);
    console.log('shard: added playerResponse json-prune to', d);
  } else console.log('shard:', d, 'already present');
}
fs.writeFileSync(sp, JSON.stringify(shard));

// ===== 2. build-rules.js: keep it across rebuilds (curated scriptlets) =====
const bp = root + 'build-rules.js';
let s = fs.readFileSync(bp, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const J = (arr) => arr.join(EOL);

if (s.includes('CURATED_SCRIPTLETS')) {
  console.log('build: curated scriptlets already present');
} else {
  const anchor = J([
    '  fs.rmSync(COSMETIC_DIR, { recursive: true, force: true });',
    '  fs.rmSync(SCRIPTLET_DIR, { recursive: true, force: true });'
  ]);
  if (!s.includes(anchor)) { console.log('BUILD ANCHOR NOT FOUND'); failures++; }
  else {
    const insert = J([
      '  // Curated scriptlets that filter lists ship as set-constant (unsafe to',
      '  // compile) - expressed as the safe uBOL-style json-prune instead. Without',
      '  // this, YouTube serves in-player ads inside the allowed player response.',
      "  const CURATED_SCRIPTLETS = {",
      "    'youtube.com': [['json-prune', ['" + PRUNE_PATHS + "']]],",
      "    'www.youtube.com': [['json-prune', ['" + PRUNE_PATHS + "']]]",
      '  };',
      '  for (const [domain, calls] of Object.entries(CURATED_SCRIPTLETS)) {',
      '    scriptlets.domains[domain] = scriptlets.domains[domain] || [];',
      '    for (const call of calls) {',
      '      if (!scriptlets.domains[domain].some((e) => JSON.stringify(e) === JSON.stringify(call))) {',
      '        scriptlets.domains[domain].push(call);',
      '      }',
      '    }',
      '  }',
      '',
      '  fs.rmSync(COSMETIC_DIR, { recursive: true, force: true });',
      '  fs.rmSync(SCRIPTLET_DIR, { recursive: true, force: true });'
    ]);
    s = s.replace(anchor, () => insert);
    fs.writeFileSync(bp, s);
    console.log('build: curated scriptlets merged into buildShards');
  }
}

console.log(failures === 0 ? 'JSON-PRUNE ADDITIONS OK' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
