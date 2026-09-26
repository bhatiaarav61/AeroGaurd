const fs = require('fs');
const path = require('path');
const root = 'C:/Users/PC/Documents/AeroGaurd';
const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

const URLS = [
  'https://rr1---sn-gwpa-5bger.googlevideo.com/videoplayback?expire=1790438145&ei=o-abc&id=o-abc&itag=137&source=youtube&requiressl=yes&mime=video%2Fmp4',
  'https://www.youtube.com/s/player/7460dd14/player_es6.vflset/en_US/endscreen.js'
];
const initHost = 'youtube.com';

function uf2re(p) {
  let re = ''; let i = 0;
  if (p.startsWith('||')) { re += '^[a-z-]+:\\/\\/(?:[^\\/?#]*\\.)?'; i = 2; }
  else if (p.startsWith('|')) { re += '^'; i = 1; }
  const endA = p.endsWith('|') && !p.endsWith('||');
  const body = p.slice(i, endA ? p.length - 1 : p.length);
  let out = '';
  for (const ch of body) {
    if (ch === '*') out += '.*';
    else if (ch === '^') out += '(?:[^a-z0-9_.\\-%]|$)';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  re += out;
  if (endA) re += '$';
  try { return new RegExp(re, 'i'); } catch { return null; }
}

let found = 0;
for (const rs of m.declarative_net_request.rule_resources) {
  const p = path.join(root, rs.path);
  let rules;
  try { rules = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
  if (!Array.isArray(rules)) continue;
  for (const r of rules) {
    const c = r.condition || {};
    const rt = c.resourceTypes || [];
    const typeOk = URLS.some((_, idx) => true); // test both script and media
    // test each url with its type
    for (let i = 0; i < URLS.length; i++) {
      const url = URLS[i];
      const type = i === 0 ? 'xmlhttprequest' : 'xmlhttprequest';
      if (rt.length && !rt.includes(type)) continue;
      if (c.requestDomains) {
        const h = 'rr1---sn-gwpa-5bger.googlevideo.com';
        if (!c.requestDomains.some(d => h === d || h.endsWith('.' + d))) continue;
      }
      if (c.initiatorDomains) {
        if (!c.initiatorDomains.some(d => initHost === d || initHost.endsWith('.' + d))) continue;
      }
      if (c.domainType === 'firstParty') continue;
      if (c.urlFilter !== undefined) {
        const re = uf2re(c.urlFilter);
        if (!re || !re.test(url)) continue;
      }
      if (c.regexFilter !== undefined) {
        try { if (!new RegExp('^(?:' + c.regexFilter + ')$').test(url)) continue; } catch { continue; }
      }
      if (r.action && r.action.type === 'block') {
        found++;
        console.log(`[${rs.id}] id=${r.id} prio=${r.priority} :: ${JSON.stringify(c).slice(0, 220)}`);
      }
      break;
    }
  }
}
console.log('total:', found);
