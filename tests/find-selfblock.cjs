// Find rules that match the extension's own chrome-extension:// pages
const fs = require('fs');
const path = require('path');
const root = 'C:/Users/PC/Documents/AeroGaurd';
const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

const URLS = [
  'chrome-extension://nbllhgpinghdmkhokdokgkiajihebekn/options/options.html',
  'chrome-extension://nbllhgpinghdmkhokdokgkiajihebekn/background/service-worker.js'
];

function urlFilterToRegex(p) {
  let re = '';
  let i = 0;
  if (p.startsWith('||')) { re += '^[a-z-]+:\\/\\/(?:[^\\/?#]*\\.)?'; i = 2; } // || anchors at host for ANY scheme
  else if (p.startsWith('|')) { re += '^'; i = 1; }
  const endAnchor = p.endsWith('|') && !p.endsWith('||');
  const body = p.slice(i, endAnchor ? p.length - 1 : p.length);
  let out = '';
  for (const ch of body) {
    if (ch === '*') out += '.*';
    else if (ch === '^') out += '(?:[^a-z0-9_.\\-%]|$)';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  re += out;
  if (endAnchor) re += '$';
  try { return new RegExp(re, 'i'); } catch { return null; }
}

function ruleMatches(rule, url) {
  const c = rule.condition || {};
  const rt = c.resourceTypes || [];
  if (rt.length > 0 && !rt.includes('main_frame') && !rt.includes('other') && !rt.includes('script')) return false;
  if (c.urlFilter !== undefined) {
    const re = urlFilterToRegex(c.urlFilter);
    if (!re || !re.test(url)) return false;
  }
  if (c.regexFilter !== undefined) {
    try { if (!new RegExp('^(?:' + c.regexFilter + ')$').test(url)) return false; } catch { return false; }
  }
  return true;
}

for (const url of URLS) {
  console.log('\n=== ' + url + ' ===');
  for (const rs of m.declarative_net_request.rule_resources) {
    const p = path.join(root, rs.path);
    if (!fs.existsSync(p)) continue;
    let rules;
    try { rules = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    if (!Array.isArray(rules)) continue;
    for (const rule of rules) {
      if (!rule || !['block', 'redirect'].includes(rule.action?.type)) continue;
      for (const url of URLS) {
        if (ruleMatches(rule, url)) {
          console.log(`[${rs.id}] id=${rule.id} ${rule.action.type} :: ${JSON.stringify(rule.condition).slice(0, 200)}`);
          break;
        }
      }
    }
  }
}
