// Audit generic cosmetic selectors for site-breaking attribute matching
const fs = require('fs');
const g = JSON.parse(fs.readFileSync('C:/Users/PC/Documents/AeroGaurd/rules/cosmetic/generic.json', 'utf8'));
const selectors = g.generic || [];
console.log('generic selectors:', selectors.length);

// Words that MUST never be hidden if a selector matches them
const canaryWords = ['loading', 'header', 'shadow', 'gradient', 'download', 'address',
  'avatar', 'player', 'reader', 'leader', 'upload', 'badge', 'carousel', 'advance',
  'welcome', 'eaders', 'advisory'];

function selectorCanHideWord(sel) {
  // find all [class*="v"] / [id*="v"] / [class^=...] etc, and test contains-match
  const re = /\[\s*(?:class|id|data-[a-z-]+)\s*(\*=|\^=|\$=|=|~=)\s*["']?([^\]"']+)["']?\s*\]/gi;
  let m;
  while ((m = re.exec(sel))) {
    const op = m[1];
    const val = m[2].toLowerCase();
    if (op === '*=') {
      if (canaryWords.some(w => w.includes(val) && val.length >= 2)) return { dangerous: true, val, op };
    }
  }
  return { dangerous: false };
}

const attrSel = selectors.filter(s => /\[\s*(?:class|id)/i.test(s));
console.log('selectors with attribute matching:', attrSel.length);
const byOp = {};
for (const s of attrSel) {
  const re = /\[\s*(?:class|id|data-[a-z-]+)\s*(\*=|\^=|\$=|=|~=)/gi;
  let m;
  while ((m = re.exec(s))) byOp[m[1]] = (byOp[m[1]] || 0) + 1;
}
console.log('operators:', JSON.stringify(byOp));

const dangerous = [];
for (const s of selectors) {
  const r = selectorCanHideWord(s);
  if (r.dangerous) dangerous.push({ sel: s, val: r.val });
}
console.log('\nDANGEROUS (can match canary words):', dangerous.length);
const byVal = {};
for (const d of dangerous) byVal[d.val] = (byVal[d.val] || 0) + 1;
console.log('by matched value:', JSON.stringify(byVal));
console.log('samples:');
for (const d of dangerous.slice(0, 15)) console.log('  ', d.sel.slice(0, 110));

// also count very short *=
let shortContains = 0;
for (const s of attrSel) {
  const re = /\[\s*(?:class|id|data-[a-z-]+)\s*\*=\s*["']?([^\]"']+)["']?\s*\]/gi;
  let m;
  while ((m = re.exec(s))) if (m[1].length < 6) shortContains++;
}
console.log('\ncontains-attribute selectors with value <6 chars:', shortContains);
