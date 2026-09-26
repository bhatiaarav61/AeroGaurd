const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/background/service-worker.js';
let s = fs.readFileSync(p, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';

const oldBlock = [
  "  // HTTPS by Default (Brave parity): upgrade cleartext requests on named hosts.",
  "  // IP-literal hosts (routers, LAN gear) never match; per-site shields",
  "  // (allowAllRequests, priority 3) and custom allow rules (priority 2) win.",
  "  if (settings.advanced?.httpsByDefault !== false) {",
  "    rules.push({",
  "      id: ID.httpsUpgrade,",
  "      priority: 1,",
  "      action: { type: 'upgradeScheme' },",
  "      condition: {",
  "        regexFilter: '^http://[a-z]',",
  "        excludedRequestDomains: ['localhost'],",
  "        resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',",
  "          'xmlhttprequest', 'media', 'websocket', 'object', 'ping']",
  "      }",
  "    });",
  "  }"
].join(EOL);

const newBlock = [
  "  // HTTPS by Default (Brave parity): upgrade top-level navigations only.",
  "  // Chrome natively autoupgrades mixed-content subresources; forcing",
  "  // subresource upgrades here breaks images/videos on http-only hosts.",
  "  // The regex works under both full-match and partial-match semantics.",
  "  if (settings.advanced?.httpsByDefault !== false) {",
  "    rules.push({",
  "      id: ID.httpsUpgrade,",
  "      priority: 1,",
  "      action: { type: 'upgradeScheme' },",
  "      condition: {",
  "        regexFilter: '^http://[a-z].*\$',",
  "        excludedRequestDomains: ['localhost'],",
  "        resourceTypes: ['main_frame']",
  "      }",
  "    });",
  "  }"
].join(EOL);

if (!s.includes(oldBlock)) { console.log('UPGRADE BLOCK NOT FOUND'); process.exit(1); }
s = s.replace(oldBlock, newBlock);
fs.writeFileSync(p, s);
console.log('httpsUpgrade hardened: main_frame only, semantic-proof regex');
