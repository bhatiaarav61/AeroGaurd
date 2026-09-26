const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/content/youtube-content.js';
let s = fs.readFileSync(p, 'utf8');
const lines = s.split(/\r?\n/);

const start = lines.findIndex(l => l.includes('function removeAdsFromInitialData(data)'));
// end: the line '  }' that closes it — first line after start that is exactly '  }'
let end = -1;
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i] === '  }') { end = i; break; }
}
if (start === -1 || end === -1) { console.log('BOUNDS NOT FOUND', start, end); process.exit(1); }
console.log('function spans lines', start + 1, 'to', end + 1);

const clean = [
  '  function removeAdsFromInitialData(data) {',
  '    // Disabled: the old /ad/i key shredder destroyed legitimate YouTube keys',
  '    // ("badges", "loadMore"). The proxy that called this is disabled; kept as',
  '    // a safe anchored walker in case anything re-enables it.',
  '    if (!data || typeof data !== \'object\') return;',
  '    const isAdKey = (key) => /^(ad(?![a-z])|ads|ad[A-Z_]|promo|sponsor|shopping|mealbar|merch)/i.test(key);',
  '    const processNode = (node) => {',
  '      if (!node || typeof node !== \'object\') return;',
  '      if (node.renderer) {',
  '        for (const k of Object.keys(node.renderer)) {',
  '          if (isAdKey(k)) delete node.renderer[k];',
  '        }',
  '      }',
  '      for (const k of Object.keys(node)) {',
  '        const val = node[k];',
  '        if (Array.isArray(val)) {',
  '          const filtered = val.filter(item => {',
  '            if (item?.renderer) {',
  '              const rk = Object.keys(item.renderer);',
  '              return !rk.some(isAdKey);',
  '            }',
  '            return true;',
  '          });',
  '          if (filtered.length !== val.length) {',
  '            log(\'Filtered\', val.length - filtered.length, \'ad items from array:\', k);',
  '            node[k] = filtered;',
  '          }',
  '          filtered.forEach(item => processNode(item));',
  '        } else if (val && typeof val === \'object\') {',
  '          processNode(val);',
  '        }',
  '      }',
  '    };',
  '    processNode(data);',
  '  }'
];
lines.splice(start, end - start + 1, ...clean);
fs.writeFileSync(p, lines.join('\n'));
console.log('removeAdsFromInitialData rebuilt');
