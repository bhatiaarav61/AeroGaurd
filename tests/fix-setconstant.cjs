const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/content-scripts/scriptlets.js';
let s = fs.readFileSync(p, 'utf8');
let failures = 0;

// uBO semantics: set-constant pins the value with a getter and a SWALLOWING
// setter. A non-writable data descriptor makes strict-mode page code THROW
// ("Cannot assign to read only property 'adSkipped'") and aborts the app.
const oldDef = [
  '      try { delete holder.obj[holder.key]; } catch { /* ignore */ }',
  '      Object.defineProperty(holder.obj, holder.key, {',
  '        configurable: false, writable: false, value,',
  '      });',
  '      return true;'
].join('\n');
const newDef = [
  '      try { delete holder.obj[holder.key]; } catch { /* ignore */ }',
  '      // uBO-style: getter pins the value, setter silently absorbs writes.',
  '      // A writable:false data descriptor would make strict-mode page code',
  '      // THROW on assignment and kill the whole application.',
  '      Object.defineProperty(holder.obj, holder.key, {',
  '        configurable: true,',
  '        get() { return value; },',
  '        set() { /* absorb */ },',
  '      });',
  '      return true;'
].join('\n');
if (!s.includes(oldDef)) { console.log('SETCONSTANT DEF NOT FOUND'); failures++; }
else { s = s.replace(oldDef, () => newDef); console.log('set-constant switched to swallowing-setter'); }

fs.writeFileSync(p, s);
process.exit(failures === 0 ? 0 : 1);
