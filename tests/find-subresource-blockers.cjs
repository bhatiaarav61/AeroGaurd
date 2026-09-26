// Find rules that block images / videos / scripts / XHR on common legit hosts
const fs = require('fs');
const path = require('path');
const root = 'C:/Users/PC/Documents/AeroGaurd';
const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

// Realistic subresource URLs on hosts that must never be blocked
const TESTS = [
  ['image', 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png'],
  ['image', 'https://www.gstatic.com/youtube/img/promos/gtf/ytl_2026.png'],
  ['image', 'https://i.ytimg.com/vi/abc123/hqdefault.jpg'],
  ['image', 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png'],
  ['image', 'https://pbs.twimg.com/media/Gabc123?format=jpg&name=large'],
  ['image', 'https://img-prod-cms-rt-microsoft-com.akamaized.net/cms/api/am/imageFileData/RE123'],
  ['media', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'],
  ['media', 'https://rr3---sn-abc.googlevideo.com/videoplayback?id=o-test&mime=video/mp4'],
  ['script', 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js'],
  ['script', 'https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js'],
  ['script', 'https://cdnjs.cloudflare.com/ajax/libs/react/18/umd/react.production.min.js'],
  ['xmlhttprequest', 'https://www.wikipedia.org/portal/wikipedia.org/assets/img/Wikipedia-logo-v2.png'],
  ['image', 'https://cdn.pixabay.com/photo/2016/11/29/05/45/astronomy-1867616_960_720.jpg'],
  ['image', 'https://images.unsplash.com/photo-1506744038136-46273834b3fb'],
  ['font', 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2'],
  ['image', 'https://assets.amazon-adsystem.com/legit.png'],
  ['script', 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'],
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

function ruleMatches(rule, type, url) {
  const c = rule.condition || {};
  const rt = c.resourceTypes || [];
  if (rt.length > 0 && !rt.includes(type)) return false;
  if (c.requestDomains) {
    const host = new URL(url).hostname;
    if (!c.requestDomains.some(d => host === d || host.endsWith('.' + d))) return false;
  }
  if (c.initiatorDomains && c.initiatorDomains.length) return false; // unknown initiator for 3rd-party test
  if (c.domainType === 'firstParty') return false; // testing as third-party/no-initiator
  if (c.urlFilter !== undefined) {
    const re = urlFilterToRegex(c.urlFilter);
    if (!re || !re.test(url)) return false;
  }
  if (c.regexFilter !== undefined) {
    // report both interpretations separately
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
    for (const [type, url] of TESTS) {
      if (ruleMatches(rule, type, url)) {
        hits.push({ ruleset: rs.id, id: rule.id, type, url, condition: rule.condition });
        break;
      }
    }
  }
}
console.log(`subresource BLOCK hits: ${hits.length}`);
const byRuleset = {};
for (const h of hits) byRuleset[h.ruleset] = (byRuleset[h.ruleset] || 0) + 1;
for (const [k, v] of Object.entries(byRuleset).sort((a, b) => b[1] - a[1])) console.log(' ', k, v);
console.log('\n=== detail (first 25) ===');
for (const h of hits.slice(0, 25)) {
  console.log(`[${h.ruleset}] ${h.type} ${h.url}`);
  console.log('  ' + JSON.stringify(h.condition).slice(0, 260));
}
