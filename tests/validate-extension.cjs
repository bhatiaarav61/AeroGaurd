// AeroGaurd extension validator - mimics Chrome's load-time checks
const fs = require('fs');
const path = require('path');

const root = 'C:/Users/PC/Documents/AeroGaurd';
let errors = [];
let warnings = [];

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

// ---- 1. Manifest checks ----
let m;
try {
  m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
} catch (e) {
  err('manifest.json is not valid JSON: ' + e.message);
  console.log(report());
  process.exit(1);
}

if (m.default_locale) {
  const msgs = path.join(root, '_locales', m.default_locale, 'messages.json');
  if (!fs.existsSync(msgs)) err(`default_locale "${m.default_locale}" messages.json missing`);
  else {
    try {
      const parsed = JSON.parse(fs.readFileSync(msgs, 'utf8'));
      for (const [k, v] of Object.entries(parsed)) {
        if (!v || typeof v.message !== 'string') err(`_locales/en/messages.json: bad entry "${k}"`);
      }
      // check i18n keys used in manifest exist
      const raw = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
      const used = new Set();
      JSON.stringify(raw).replace(/__MSG_(\w+)__/g, (_, k) => { used.add(k); });
      for (const k of used) if (!parsed[k]) err(`manifest uses __MSG_${k}__ but key missing in messages.json`);
    } catch (e) { err('_locales/en/messages.json invalid JSON: ' + e.message); }
  }
}

// referenced files exist
const refs = [];
refs.push(m.background.service_worker);
for (const cs of m.content_scripts || []) refs.push(...cs.js, ...(cs.css || []));
for (const r of (m.declarative_net_request?.rule_resources || [])) refs.push(r.path);
refs.push(m.action.default_popup, ...(m.action.default_icon ? Object.values(m.action.default_icon) : []), ...Object.values(m.icons || {}));
if (m.options_page) refs.push(m.options_page);
for (const f of [...new Set(refs)]) {
  if (!fs.existsSync(path.join(root, f))) err(`manifest references missing file: ${f}`);
}

// ---- 2. DNR rules validation (approximates Chrome load-time validation) ----
const VALID_ACTION_TYPES = new Set(['block', 'redirect', 'allow', 'upgradeScheme', 'modifyHeaders', 'allowAllRequests']);
const VALID_RESOURCE_TYPES = new Set([
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
  'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'webtransport',
  'webbundle', 'other'
]);
const VALID_CONDITION_KEYS = new Set([
  'urlFilter', 'excludedUrlFilters', 'regexFilter', 'excludedRegexFilter',
  'initiatorDomains', 'excludedInitiatorDomains', 'requestDomains', 'excludedRequestDomains',
  'requestMethods', 'excludedRequestMethods', 'resourceTypes', 'excludedResourceTypes',
  'tabIds', 'excludedTabIds', 'domainType', 'excludedDomainTypes',
  'domains', 'excludedDomains', 'regexSubstitution', 'isUrlFilterCaseSensitive'
]);
const VALID_ACTION_KEYS = new Set(['type', 'redirect', 'requestHeaders', 'responseHeaders', 'extensionPathOptions']);

function checkRegex(re, ctx) {
  if (re.length > 1024) err(`${ctx}: regexFilter exceeds 1024 chars (${re.length})`);
  if (re.length > 0 && !re.startsWith('^?') && !/^\^/.test(re)) {
    // regexFilter is fully anchored unless ^? specified - not an error, just info
  }
  // RE2 does not support: lookaheads, lookbehinds, backreferences, \1..\9
  if (/\(\?<?[=!]/.test(re)) err(`${ctx}: regexFilter uses lookahead/lookbehind (unsupported by RE2): "${re.slice(0, 80)}"`);
  if (/\\[1-9]/.test(re)) err(`${ctx}: regexFilter uses backreference (unsupported by RE2): "${re.slice(0, 80)}"`);
  try { new RegExp(re); } catch (e) { err(`${ctx}: regexFilter not a valid regex: "${re.slice(0, 80)}" (${e.message})`); }
}

function checkRule(rule, ctx) {
  if (typeof rule.id !== 'number' || rule.id < 1) err(`${ctx} id=${rule.id}: invalid id`);
  if (typeof rule.priority !== 'number' || rule.priority < 1) err(`${ctx} id=${rule.id}: invalid priority (${rule.priority})`);
  if (!rule.action) { err(`${ctx} id=${rule.id}: missing action`); return; }
  if (!VALID_ACTION_TYPES.has(rule.action.type)) err(`${ctx} id=${rule.id}: invalid action.type "${rule.action.type}"`);
  for (const k of Object.keys(rule.action)) if (!VALID_ACTION_KEYS.has(k)) warn(`${ctx} id=${rule.id}: unknown action key "${k}"`);

  const c = rule.condition || {};
  for (const k of Object.keys(c)) if (!VALID_CONDITION_KEYS.has(k)) warn(`${ctx} id=${rule.id}: unknown condition key "${k}"`);

  if (rule.action.type === 'modifyHeaders') {
    for (const key of ['requestHeaders', 'responseHeaders']) {
      for (const h of rule.action[key] || []) {
        if (!h.header) err(`${ctx} id=${rule.id}: modifyHeaders entry missing header`);
        if (h.operation && !['append', 'set', 'remove'].includes(h.operation)) err(`${ctx} id=${rule.id}: invalid operation ${h.operation}`);
      }
    }
  }
  if (rule.action.type === 'redirect') {
    const rd = rule.action.redirect || {};
    if (!rd.url && !rd.extensionPath && !rd.transform && !rd.regexSubstitution) {
      err(`${ctx} id=${rule.id}: redirect action with no destination`);
    }
  }

  const uf = c.urlFilter;
  if (uf !== undefined) {
    if (typeof uf !== 'string') err(`${ctx} id=${rule.id}: urlFilter not a string`);
    else if (uf.length > 1024) err(`${ctx} id=${rule.id}: urlFilter exceeds 1024 chars (${uf.length})`);
  }
  if (c.regexFilter) checkRegex(c.regexFilter, `${ctx} id=${rule.id}`);

  const rt = c.resourceTypes || c.excludedResourceTypes || [];
  for (const t of rt) if (!VALID_RESOURCE_TYPES.has(t)) err(`${ctx} id=${rule.id}: invalid resourceType "${t}"`);

  if (rule.action.type === 'allowAllRequests') {
    if (c.resourceTypes && !c.resourceTypes.includes('main_frame')) {
      // allowed but discouraged
    }
  }
  if (rule.action.type === 'redirect' && rd_none) { /* handled above */ }
}
const rd_none = false;

let totalRules = 0;
const rsEntries = m.declarative_net_request?.rule_resources || [];
for (const rs of rsEntries) {
  const p = path.join(root, rs.path);
  if (!fs.existsSync(p)) continue;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    err(`ruleset "${rs.id}" (${rs.path}): invalid JSON - ${e.message}`);
    continue;
  }
  const rules = Array.isArray(data) ? data : (Array.isArray(data.rules) ? data.rules : null);
  if (!rules) { err(`ruleset "${rs.id}" (${rs.path}): not an array of rules`); continue; }
  totalRules += rules.length;
  const ids = new Set();
  let dup = 0;
  for (const r of rules) {
    if (ids.has(r.id)) { dup++; if (dup <= 3) err(`ruleset "${rs.id}": duplicate rule id ${r.id}`); }
    ids.add(r.id);
    checkRule(r, `ruleset "${rs.id}"`);
  }
  if (rules.length > 30000) warn(`ruleset "${rs.id}" has ${rules.length} rules (>30k)`);
  console.log(`  ${rs.enabled ? '[ON ]' : '[off]'} ${rs.id}: ${rules.length} rules`);
}
console.log(`\nTotal static rules across all rulesets: ${totalRules}`);

// ---- 2b. Validate rules/*.json files NOT yet in the manifest (candidates for wiring in) ----
const inManifest = new Set(rsEntries.map(r => r.path.replace(/^rules\//, '')));
const rulesDir = path.join(root, 'rules');
const META_FILES = new Set(['ruleset-index.json', 'static-index.json']);
const extraFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json') && !inManifest.has(f) && !META_FILES.has(f));
console.log(`\nValidating ${extraFiles.length} rules files not currently in manifest:`);
let extraErrorsBefore = errors.length;
for (const f of extraFiles) {
  const p = path.join(rulesDir, f);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    err(`candidate ruleset "${f}": invalid JSON - ${e.message}`);
    continue;
  }
  const rules = Array.isArray(data) ? data : (Array.isArray(data.rules) ? data.rules : null);
  if (!rules) { err(`candidate ruleset "${f}": not an array of rules`); continue; }
  const before = errors.length;
  const ids = new Set();
  for (const r of rules) {
    if (ids.has(r.id)) err(`candidate ruleset "${f}": duplicate rule id ${r.id}`);
    ids.add(r.id);
    checkRule(r, `candidate "${f}"`);
  }
  console.log(`  ${f}: ${rules.length} rules, ${errors.length - before} errors`);
}
console.log(`Candidate files with errors: ${errors.length - extraErrorsBefore}`);

function report() {
  console.log(`\n===== ERRORS (${errors.length}) =====`);
  errors.slice(0, 60).forEach(e => console.log('ERROR: ' + e));
  if (errors.length > 60) console.log(`...and ${errors.length - 60} more`);
  console.log(`\n===== WARNINGS (${warnings.length}) =====`);
  warnings.slice(0, 40).forEach(w => console.log('WARN:  ' + w));
  if (warnings.length > 40) console.log(`...and ${warnings.length - 40} more`);
  return 'DONE';
}

report();
console.log('\nRESULT: ' + (errors.length === 0 ? 'PASS - extension should load' : `FAIL - ${errors.length} blocking errors`));
