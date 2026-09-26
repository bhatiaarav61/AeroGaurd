const fs = require('fs');
const root = 'C:/Users/PC/Documents/AeroGaurd/';

let sw = fs.readFileSync(root + 'background/service-worker.js', 'utf8');
const anchor = "      // ---- misc ----\n      case 'INJECT_PRIVACY_SCRIPTS': {";
const insert = [
  "      // ---- scriptlets ----",
  "      case 'GET_SCRIPTLETS': {",
  "        const url = arg('url') || sender.url || sender.tab?.url || '';",
  "        return { calls: settings.enabled ? scriptletCallsForUrl(url) : [] };",
  "      }",
  "      case 'REPORT_SCRIPTLETS':",
  "        return { ok: true };",
  "",
  "      // ---- misc ----",
  "      case 'INJECT_PRIVACY_SCRIPTS': {"
].join('\n');
if (!sw.includes(anchor)) { console.log('SW ANCHOR NOT FOUND'); process.exit(1); }
sw = sw.split(anchor).join(insert);
fs.writeFileSync(root + 'background/service-worker.js', sw);
console.log('GET_SCRIPTLETS added:', sw.includes('GET_SCRIPTLETS'));

let fm = fs.readFileSync(root + 'background/filter-list-manager.js', 'utf8');
fm = fm.split("'adguard_base', 'adguard_tracking', 'adguard_annoyances',").join("'adguard_base', 'adguard_tracking', 'adguard_annoyances', 'annoyances_plus',");
fm = fm.split("'fanboy_social', 'easylist_cookie', 'peterlowe'").join("'fanboy_social', 'peterlowe'");
fs.writeFileSync(root + 'background/filter-list-manager.js', fm);
console.log('defaults updated:', fm.includes('annoyances_plus'), '| cookie removed:', !fm.includes('easylist_cookie'));
