const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/options/options.html';
let s = fs.readFileSync(p, 'utf8');
const anchor = [
  '          <div class="setting-item">',
  '            <div class="setting-info">',
  '              <label for="blockWebRTC">Block WebRTC</label>'
].join('\r\n');
const altAnchor = anchor.replace(/\r\n/g, '\n');
const use = s.includes(anchor) ? anchor : altAnchor;
if (!s.includes(use)) { console.log('ANCHOR NOT FOUND'); process.exit(1); }
const insert = [
  '          <div class="setting-item">',
  '            <div class="setting-info">',
  '              <label for="httpsByDefault">HTTPS by Default</label>',
  '              <p class="setting-description">Upgrade insecure http:// connections to https:// automatically (Brave-style). Per-site shields override this.</p>',
  '            </div>',
  '            <button class="toggle-switch" id="httpsByDefault" role="switch" aria-checked="true">',
  '              <span class="toggle-thumb"></span>',
  '            </button>',
  '          </div>',
  ''
].join(use.includes('\r\n') ? '\r\n' : '\n') + use;
s = s.replace(use, insert);
fs.writeFileSync(p, s);
console.log('toggle inserted');
