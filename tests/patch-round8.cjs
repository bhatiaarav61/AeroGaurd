const fs = require('fs');
const root = 'C:/Users/PC/Documents/AeroGaurd/';
let failures = 0;

// ===== 1. abp-parser: response-rewriting options must SKIP, never block =====
const pp = root + 'background/abp-parser.js';
let s = fs.readFileSync(pp, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const J = (arr) => arr.join(EOL);

const anchor = J([
  "      // $removeparam=... -> redirect with a query transform",
  "      case 'removeparam':"
]);
if (!s.includes(anchor)) { console.log('PARSER ANCHOR NOT FOUND'); failures++; }
else {
  const insert = J([
    "      // Response-rewriting / non-DNR-expressible options: dropping the",
    "      // option INVERTS the filter's meaning (e.g. $replace rewrites ad",
    "      // placeholders inside a response - converting it to a block rule",
    "      // takes down the whole endpoint, like YouTube's /youtubei API).",
    "      case 'replace':",
    "      case 'uritransform':",
    "      case 'uritransition':",
    "      case 'jsonprune':",
    "      case 'permissions':",
    "      case 'deduplicate':",
    "      case 'redirect-rule':",
    "      case 'noop':",
    "        options.unsupported = true;",
    "        break;",
    "",
    "      // $removeparam=... -> redirect with a query transform",
    "      case 'removeparam':"
  ]);
  s = s.replace(anchor, () => insert);
  fs.writeFileSync(pp, s);
  console.log('parser: unsupported-option guard added');
}

// ===== 2. youtube_ads.json: player/next/browse must be ALLOWs, not blocks =====
const yp = root + 'rules/youtube_ads.json';
const rules = JSON.parse(fs.readFileSync(yp, 'utf8'));
let fixed = 0;
for (const r of rules) {
  const uf = r.condition?.urlFilter || '';
  if (r.action.type === 'block' && /youtubei\/v1\/(player|next|browse)/.test(uf)) {
    r.action = { type: 'allow' };
    r.priority = 2;
    fixed++;
    console.log('youtube_ads id ' + r.id + ': block -> allow (' + uf.slice(0, 50) + ')');
  }
}
fs.writeFileSync(yp, JSON.stringify(rules));
if (fixed !== 3) { console.log('expected 3 youtubei blocks, fixed ' + fixed); failures++; }

console.log(failures === 0 ? 'ROUND-8 PATCHES OK' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
