// Find rules that block main_frame requests (the "every site blocked" culprit)
const fs = require('fs');
const path = require('path');
const root = 'C:/Users/PC/Documents/AeroGaurd';
const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

const TESTS = [
  'https://www.google.com/',
  'https://www.google.com/search?q=hello+world',
  'https://github.com/',
  'https://en.wikipedia.org/wiki/Main_Page',
  'https://news.ycombinator.com/',
];

function urlFilterToRegex(p) {
  let re = '';
  let i = 0;
  if (p.startsWith('||')) { re += '^https?:\\/\\/(?:[^\\/?#]*\\.)?'; i = 2; }
  else if (p.startsWith('|')) { re += '^'; i = 1; }
  const endAnchor = p.endsWith('|') && !p.endsWith('||');
  let body = p.slice(i, endAnchor ? p.length - 1 : p.length);
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

function hostOf(url) { return new URL(url).hostname; }

function ruleMatchesMainFrame(rule, url) {
  const c = rule.condition || {};
  const rt = c.resourceTypes || [];
  if (rt.length > 0 && !rt.includes('main_frame')) return false;
  const host = hostOf(url);

  // requestDomains: host must equal or be subdomain of one of them
  if (c.requestDomains) {
    const ok = c.requestDomains.some(d => host === d || host.endsWith('.' + d));
    if (!ok) return false;
  }
  if (c.excludedRequestDomains) {
    if (c.excludedRequestDomains.some(d => host === d || host.endsWith('.' + d))) return false;
  }
  // initiatorDomains: address-bar main_frame navigation has no initiator
  if (c.initiatorDomains && c.initiatorDomains.length) return false;
  if (c.domains && c.domains.length) return false;
  // domainType: main frame of a direct navigation is first-party
  if (c.domainType === 'thirdParty') return false;

  if (c.urlFilter !== undefined) {
    const re = urlFilterToRegex(c.urlFilter);
    if (!re) return false;
    if (!re.test(url)) return false;
  }
  if (c.regexFilter !== undefined) {
    // Chrome uses FULL match; report both interpretations
    let full = false, partial = false;
    try { full = new RegExp('^(?:' + c.regexFilter + ')$').test(url); } catch {}
    try { partial = new RegExp(c.regexFilter).test(url); } catch {}
    if (!full) return false; // only full matches can block in Chrome
  }
  return true;
}

const hits = [];
for (const rs of m.declarative_net_request.rule_resources) {
  const p = path.join(root, rs.path);
  if (!fs.existsSync(p)) continue;
  let rules;
  try { rules = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
  if (!Array.isArray(rules)) continue;
  for (const rule of rules) {
    if (!rule || rule.action?.type !== 'block' && rule.action?.type !== 'redirect' && rule.action?.type !== 'upgradeScheme') continue;
    for (const url of TESTS) {
      if (ruleMatchesMainFrame(rule, url)) {
        hits.push({ ruleset: rs.id, id: rule.id, action: rule.action.type, url, condition: rule.condition });
        break;
      }
    }
  }
}
console.log(`main_frame affecting rules found: ${hits.length}`);
const byAction = {};
for (const h of hits) {
  const k = h.action + ' | ' + h.ruleset;
  (byAction[k] = byAction[k] || []).push(h);
}
for (const [k, list] of Object.entries(byAction)) console.log(' ', k.padEnd(50), list.length);
const blocks = hits.filter(h => h.action === 'block');
console.log('\n=== BLOCK rules detail (first 30) ===');
for (const h of blocks.slice(0, 30)) {
  console.log(`[${h.ruleset}] id=${h.id} on ${h.url}`);
  console.log('  ' + JSON.stringify(h.condition).slice(0, 300));
}
