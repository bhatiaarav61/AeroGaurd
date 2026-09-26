// Scan all JS files for import/require statements and verify targets exist
const fs = require('fs');
const path = require('path');
const root = 'C:/Users/PC/Documents/AeroGaurd';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '_metadata') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(root);
let missingTotal = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(root, f);
  const imports = [];
  // static imports
  for (const m of src.matchAll(/import\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g)) imports.push(m[1]);
  // dynamic imports
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) imports.push(m[1]);
  const missing = [];
  for (const spec of imports) {
    if (!spec.startsWith('.')) continue; // bare specifier (none expected in SW)
    const target = path.resolve(path.dirname(f), spec);
    if (!fs.existsSync(target)) missing.push(spec);
  }
  if (missing.length) {
    missingTotal += missing.length;
    console.log(`\n${rel}:`);
    missing.forEach(s => console.log(`  MISSING: ${s}`));
  }
}
console.log(`\nScanned ${files.length} JS files. Total missing import targets: ${missingTotal}`);

// also check welcome.html and html-referenced files
for (const html of ['popup/popup.html', 'options/options.html']) {
  const src = fs.readFileSync(path.join(root, html), 'utf8');
  const refs = [];
  for (const m of src.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) refs.push(m[1]);
  const bad = refs.filter(r => !/^(https?:|#|data:|chrome-)/.test(r) && !fs.existsSync(path.resolve(path.dirname(path.join(root, html)), r.split('?')[0])));
  if (bad.length) console.log(`${html} missing refs:`, bad);
}
console.log('welcome.html exists:', fs.existsSync(path.join(root, 'welcome.html')));
