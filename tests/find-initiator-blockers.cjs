// Initiator-aware subresource blocker finder: tests real third-party and
// first-party subresources WITH the initiator the browser would send.
const fs = require('fs');
const path = require('path');
const root = 'C:/Users/PC/Documents/AeroGaurd';
const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

// [resourceType, url, initiator]
const TESTS = [
  ['image', 'https://www.gstatic.com/youtube/img/promos/gtf/yt_logo.png', 'https://www.youtube.com/'],
  ['image', 'https://i.ytimg.com/vi/abc/hqdefault.jpg', 'https://www.youtube.com/'],
  ['media', 'https://rr3---sn-nx57ynsk.googlevideo.com/videoplayback?expire=123&id=o-abc&mime=video%2Fmp4', 'https://www.youtube.com/'],
  ['xmlhttprequest', 'https://www.youtube.com/youtubei/v1/player?key=AIzaSy', 'https://www.youtube.com/'],
  ['xmlhttprequest', 'https://www.youtube.com/youtubei/v1/browse?key=AIzaSy', 'https://www.youtube.com/'],
  ['script', 'https://www.youtube.com/s/desktop/abc/jsbin/desktop_polymer.vlset.js', 'https://www.youtube.com/'],
  ['image', 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png', 'https://www.google.com/'],
  ['script', 'https://www.google.com/xjs/_/js/k=foobyard.js', 'https://www.google.com/'],
  ['xmlhttprequest', 'https://www.google.com/complete/search?client=firefox&q=te', 'https://www.google.com/'],
  ['image', 'https://lh3.googleusercontent.com/a/ACg8ocK==s96-c', 'https://www.google.com/'],
  ['script', 'https://apis.google.com/_/scs/abc/_/js/k=boq_search.js', 'https://www.google.com/'],
  ['font', 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2', 'https://www.google.com/'],
  ['image', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:abc', 'https://www.google.com/'],
  ['image', 'https://static.xx.fbcdn.net/rsrc.php/v3/yA/r/abc.png', 'https://www.facebook.com/'],
  ['xmlhttprequest', 'https://www.facebook.com/ajax/bz?__a=1', 'https://www.facebook.com/'],
  ['image', 'https://m.media-amazon.com/images/I/abc.jpg', 'https://www.amazon.com/'],
  ['script', 'https://images-na.ssl-images-amazon.com/images/G/01/x.js', 'https://www.amazon.com/'],
  ['image', 'https://upload.wikimedia.org/wikipedia/commons/4/47/X.png', 'https://en.wikipedia.org/'],
  ['script', 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js', 'https://example.com/'],
];

function urlFilterToRegex(p) {
  let re = '';
  let i = 0;
  if (p.startsWith('||')) { re += '^https?:\\/\\/(?:[^\\/?#]*\\.)?'; i = 2; }
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

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }

function ruleMatches(rule, type, url, initiator) {
  const c = rule.condition || {};
  const rt = c.resourceTypes || [];
  if (rt.length > 0 && !rt.includes(type)) return false;
  const reqHost = hostOf(url);
  const initHost = hostOf(initiator);

  if (c.requestDomains) {
    if (!c.requestDomains.some(d => reqHost === d || reqHost.endsWith('.' + d))) return false;
  }
  if (c.excludedRequestDomains) {
    if (c.excludedRequestDomains.some(d => reqHost === d || reqHost.endsWith('.' + d))) return false;
  }
  if (c.initiatorDomains) {
    if (!c.initiatorDomains.some(d => initHost === d || initHost.endsWith('.' + d))) return false;
  }
  if (c.excludedInitiatorDomains) {
    if (c.excludedInitiatorDomains.some(d => initHost === d || initHost.endsWith('.' + d))) return false;
  }
  // domainType: request host vs initiator host
  if (c.domainType) {
    const isThird = reqHost !== initHost && !initHost.endsWith('.' + reqHost) && !reqHost.endsWith('.' + initHost);
    if (c.domainType === 'thirdParty' && !isThird) return false;
    if (c.domainType === 'firstParty' && isThird) return false;
  }
  if (c.urlFilter !== undefined) {
    const re = urlFilterToRegex(c.urlFilter);
    if (!re || !re.test(url)) return false;
  }
  if (c.regexFilter !== undefined) {
    try { if (!new RegExp('^(?:' + c.regexFilter + ')$').test(url)) return false; } catch { return false; }
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
    if (!rule || rule.action?.type !== 'block') continue;
    for (const [type, url, initiator] of TESTS) {
      if (ruleMatches(rule, type, url, initiator)) {
        hits.push({ ruleset: rs.id, id: rule.id, type, url, initiator, condition: rule.condition });
        break;
      }
    }
  }
}
console.log(`initiator-aware subresource BLOCK hits: ${hits.length}`);
const byRuleset = {};
for (const h of hits) byRuleset[h.ruleset] = (byRuleset[h.ruleset] || 0) + 1;
for (const [k, v] of Object.entries(byRuleset).sort((a, b) => b[1] - a[1])) console.log(' ', k, v);
console.log('=== detail (first 25) ===');
for (const h of hits.slice(0, 25)) {
  console.log(`[${h.ruleset}] id=${h.id} ${h.type} ${h.url.slice(0, 70)} (init ${hostOf(h.initiator)})`);
  console.log('  ' + JSON.stringify(h.condition).slice(0, 240));
}
