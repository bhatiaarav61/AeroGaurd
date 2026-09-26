/**
 * AeroGuard build script.
 *
 * Compiles filter lists into Chrome declarativeNetRequest static rulesets,
 * cosmetic-filter shards and scriptlet shards - the data behind Brave-like
 * blocking. Everything is sanitized with background/rule-optimizer.js so the
 * generated rules always pass `python validate-dnr.py`.
 *
 * Usage:
 *   node build-rules.js                 # fetch + compile everything, rewrite manifest
 *   node build-rules.js --only=peterlowe,adguard_base
 *   node build-rules.js --cosmetic      # only cosmetic + scriptlet shards
 *   node build-rules.js --index         # rebuild ruleset-index.json from rules/
 *   node build-rules.js --manifest      # only rewrite manifest rule_resources
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseAbpFilter, createDnrRule, collectBadFilters } from './background/abp-parser.js';
import { sanitizeRule } from './background/rule-optimizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_DIR = path.join(__dirname, 'rules');
const COSMETIC_DIR = path.join(RULES_DIR, 'cosmetic');
const SCRIPTLET_DIR = path.join(RULES_DIR, 'scriptlets');
const STATIC_INDEX = path.join(RULES_DIR, 'static-index.json');
const INDEX_FILE = path.join(RULES_DIR, 'ruleset-index.json');
const MANIFEST_PATH = path.join(__dirname, 'manifest.json');

const RULESET_SLOT = 100000;      // rule id slot per ruleset
// uBO-power coverage: fill each static ruleset up to ~30k rules so the full
// 50-ruleset budget (~330k total) can actually be used. EasyList, EasyPrivacy
// and uBO's own lists need the headroom — capping every list at 20k silently
// drops >60k useful rules from the largest lists.
const MAX_RULES_PER_LIST = 30000; // 20 core lists x 30k still fits 330k budget
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AeroGuard/3.0';

// Curated rulesets maintained by hand: never downloaded/overwritten.
const CURATED_FILES = ['block-rules.json', 'custom.json', 'youtube_ads.json', 'tracking-params.json'];

/**
 * Filter lists. `rulesetId` is both the manifest ruleset id and the file name
 * (rules/<rulesetId>.json).
 */
export const FILTER_LISTS = [
  { rulesetId: 'easylist', name: 'EasyList', category: 'ads', enabled: true, homepage: 'https://easylist.to/', description: 'The primary ad-blocking list used by every blocker.', url: 'https://easylist.to/easylist/easylist.txt' },
  { rulesetId: 'easyprivacy', name: 'EasyPrivacy', category: 'trackers', enabled: true, homepage: 'https://easylist.to/', description: 'Tracking scripts, pixels and analytics beacons.', url: 'https://easylist.to/easylist/easyprivacy.txt' },
  { rulesetId: 'fanboy_annoyances', name: 'Fanboy Annoyances', category: 'annoyances', enabled: true, homepage: 'https://easylist.to/', description: 'Newsletter popups, chat widgets and other annoyances.', url: 'https://easylist.to/easylist/fanboy-annoyance.txt' },
  { rulesetId: 'fanboy_social', name: 'Fanboy Social', category: 'social', enabled: true, homepage: 'https://easylist.to/', description: 'Social tracking widgets and share buttons.', url: 'https://easylist.to/easylist/fanboy-social.txt' },
  { rulesetId: 'ublock_filters', name: 'uBlock Origin Filters', category: 'ads', enabled: true, homepage: 'https://github.com/uBlockOrigin/uAssets', description: 'uBlock main list, including anti-adblock fixes.', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt' },
  { rulesetId: 'ublock_badware', name: 'uBlock Badware + Malware + Phishing', category: 'malware', enabled: true, homepage: 'https://github.com/uBlockOrigin/uAssets', description: 'Malware, scams, phishing domains and malicious URLs.', sources: [
    'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt',
    'https://filters.adtidy.org/extension/ublock/filters/208.txt',
    'https://filters.adtidy.org/extension/ublock/filters/255.txt',
    'https://filters.adtidy.org/extension/ublock/filters/259.txt'
  ] },
  { rulesetId: 'ublock_privacy', name: 'uBlock Privacy', category: 'trackers', enabled: true, homepage: 'https://github.com/uBlockOrigin/uAssets', description: 'Link decoration and CNAME tracker filters.', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt' },
  { rulesetId: 'ublock_resource_abuse', name: 'uBlock Resource Abuse', category: 'malware', enabled: true, homepage: 'https://github.com/uBlockOrigin/uAssets', description: 'Crypto-miners and resource abuse.', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/resource-abuse.txt' },
  { rulesetId: 'ublock_unbreak', name: 'uBlock Unbreak', category: 'annoyances', enabled: true, homepage: 'https://github.com/uBlockOrigin/uAssets', description: 'Exception rules that keep sites working.', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt' }
];

FILTER_LISTS.push(
  { rulesetId: 'peterlowe', name: "Peter Lowe's List", category: 'malware', enabled: true, homepage: 'https://pgl.yoyo.org/adservers/', description: 'Known ad and tracking servers.', url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext' },
  { rulesetId: 'adguard_dns', name: 'AdGuard DNS Filter', category: 'ads', enabled: true, homepage: 'https://github.com/AdguardTeam/AdguardSDNSFilter', description: 'Large DNS-level ad and tracker filter.', url: 'https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt' },
  { rulesetId: 'adguard_base', name: 'AdGuard Base', category: 'ads', enabled: true, homepage: 'https://github.com/AdguardTeam/AdguardFilters', description: 'AdGuard base ad-blocking list (6 MB).', url: 'https://filters.adtidy.org/extension/ublock/filters/2.txt' },
  { rulesetId: 'adguard_tracking', name: 'AdGuard Tracking', category: 'trackers', enabled: true, homepage: 'https://github.com/AdguardTeam/AdguardFilters', description: 'AdGuard tracking protection list.', url: 'https://filters.adtidy.org/extension/ublock/filters/3.txt' },
  { rulesetId: 'adguard_annoyances', name: 'AdGuard Annoyances', category: 'annoyances', enabled: true, homepage: 'https://github.com/AdguardTeam/AdguardFilters', description: 'Popups, banners and other annoyances.', url: 'https://filters.adtidy.org/extension/ublock/filters/14.txt' },
  { rulesetId: 'adguard_social', name: 'AdGuard Social', category: 'social', enabled: true, homepage: 'https://github.com/AdguardTeam/AdguardFilters', description: 'Social widget filter.', url: 'https://filters.adtidy.org/extension/ublock/filters/4.txt' },
  { rulesetId: 'adguard_mobile', name: 'AdGuard Mobile Ads', category: 'ads', enabled: true, homepage: 'https://github.com/AdguardTeam/AdguardFilters', description: 'Mobile-specific ad servers.', url: 'https://filters.adtidy.org/extension/ublock/filters/11.txt' },
  { rulesetId: 'nocoin', name: 'NoCoin', category: 'malware', enabled: true, homepage: 'https://github.com/hoshsadiq/adblock-nocoin-list', description: 'Browser-based crypto-miners.', url: 'https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/nocoin.txt' }
);

// Regional lists: country-specific blocking so every region gets the same
// protection Brave provides. Sources verified live; AdGuard CDN mirrors are
// preferred where available because they never move.
const REGIONAL_LISTS = [
  { rulesetId: 'easylist_germany', name: 'EasyList Germany', category: 'ads', homepage: 'https://easylist.to/', description: 'German-language ads.', url: 'https://easylist.to/easylistgermany/easylistgermany.txt' },
  { rulesetId: 'easylist_france', name: 'Liste FR (France)', category: 'ads', homepage: 'https://liste-fr.adblock.fr/', description: 'French-language ads.', url: 'https://easylist-downloads.adblockplus.org/liste_fr.txt' },
  { rulesetId: 'easylist_italy', name: 'EasyList Italy', category: 'ads', homepage: 'https://easylistitalia.github.io/', description: 'Italian-language ads.', url: 'https://easylist-downloads.adblockplus.org/easylistitaly.txt' },
  { rulesetId: 'easylist_china', name: 'EasyList China', category: 'ads', homepage: 'https://github.com/easylist/easylistchina', description: 'Chinese-language ads.', url: 'https://raw.githubusercontent.com/easylist/easylistchina/master/easylistchina.txt' },
  { rulesetId: 'easylist_poland', name: 'EasyList Poland', category: 'ads', homepage: 'https://easylist.to/', description: 'Polish-language ads.', url: 'https://easylist-downloads.adblockplus.org/easylistpolish.txt' },
  { rulesetId: 'easylist_spanish', name: 'EasyList Spanish', category: 'ads', homepage: 'https://easylist.to/', description: 'Spanish-language ads.', url: 'https://easylist-downloads.adblockplus.org/easylistspanish.txt' },
  { rulesetId: 'easylist_portugal', name: 'EasyList Portuguese', category: 'ads', homepage: 'https://easylist.to/', description: 'Portuguese-language ads.', url: 'https://easylist-downloads.adblockplus.org/easylistportuguese.txt' },
  { rulesetId: 'easylist_netherlands', name: 'EasyList Dutch', category: 'ads', homepage: 'https://easylist.to/', description: 'Dutch-language ads.', url: 'https://easylist-downloads.adblockplus.org/easylistdutch.txt' },
  { rulesetId: 'easylist_czech', name: 'EasyList Czech & Slovak', category: 'ads', homepage: 'https://github.com/tomasko126/easylistczechandslovak', description: 'Czech and Slovak ads.', url: 'https://raw.githubusercontent.com/tomasko126/easylistczechandslovak/master/filters.txt' },
  { rulesetId: 'easylist_bulgaria', name: 'Bulgarian List', category: 'ads', homepage: 'https://stanev.org/abp/', description: 'Bulgarian-language ads.', url: 'https://stanev.org/abp/adblock_bg.txt' },
  { rulesetId: 'easylist_greece', name: 'Greek AdBlock Filter', category: 'ads', homepage: 'https://www.void.gr/kargig/void-gr-filters.txt', description: 'Greek-language ads.', url: 'https://www.void.gr/kargig/void-gr-filters.txt' },
  { rulesetId: 'easylist_russia', name: 'RU AdList (Russia)', category: 'ads', homepage: 'https://code.google.com/archive/p/ruadlist/', description: 'Russian-language ads.', url: 'https://easylist-downloads.adblockplus.org/ruadlist.txt' },
  { rulesetId: 'easylist_serbia', name: "Dandelion Sprout's Serbo-Croatian List", category: 'ads', homepage: 'https://github.com/DandelionSprout/adfilt', description: 'Serbian, Croatian, Bosnian and Montenegrin ads.', url: 'https://raw.githubusercontent.com/DandelionSprout/adfilt/master/SerboCroatianList.txt' },
  { rulesetId: 'easylist_israel', name: 'EasyList Hebrew', category: 'ads', homepage: 'https://github.com/easylist/EasyListHebrew', description: 'Hebrew-language ads.', url: 'https://raw.githubusercontent.com/easylist/EasyListHebrew/master/EasyListHebrew.txt' },
  { rulesetId: 'easylist_lithuania', name: 'EasyList Lithuania', category: 'ads', homepage: 'https://github.com/EasyList-Lithuania', description: 'Lithuanian-language ads.', url: 'https://filters.adtidy.org/extension/ublock/filters/110.txt' },
  { rulesetId: 'easylist_latvia', name: 'Latvian List', category: 'ads', homepage: 'https://github.com/Latvian-List/adblock-latvian', description: 'Latvian-language ads.', url: 'https://filters.adtidy.org/extension/ublock/filters/111.txt' },
  { rulesetId: 'easylist_romania', name: 'ROList (Romania)', category: 'ads', homepage: 'https://www.zoso.ro/rolist/', description: 'Romanian-language ads.', url: 'https://filters.adtidy.org/extension/ublock/filters/114.txt' },
  { rulesetId: 'easylist_hungary', name: 'Hufilter (Hungary)', category: 'ads', homepage: 'https://github.com/hufilter/hufilter', description: 'Hungarian ads and trackers.', url: 'https://filters.adtidy.org/extension/ublock/filters/203.txt' },
  { rulesetId: 'easylist_denmark', name: "Dandelion Sprout's Nordic Filters", category: 'ads', homepage: 'https://github.com/DandelionSprout/nordicfilters', description: 'Nordic ads (Denmark, Norway, Finland, Iceland).', url: 'https://filters.adtidy.org/extension/ublock/filters/249.txt' },
  { rulesetId: 'easylist_sweden', name: "Frellwit's Swedish Filter", category: 'ads', homepage: 'https://github.com/lassekongo83/Frellwits-filter-lists', description: 'Swedish ads and trackers.', url: 'https://filters.adtidy.org/extension/ublock/filters/243.txt' },
  { rulesetId: 'easylist_turkey', name: 'AdGuard Turkish', category: 'ads', homepage: 'https://github.com/AdguardTeam/AdguardFilters', description: 'Turkish-language ads.', url: 'https://filters.adtidy.org/extension/ublock/filters/13.txt' },
  { rulesetId: 'easylist_japan', name: 'AdGuard Japanese', category: 'ads', homepage: 'https://github.com/AdguardTeam/AdguardFilters', description: 'Japanese-language ads.', url: 'https://filters.adtidy.org/extension/ublock/filters/7.txt' },
  { rulesetId: 'easylist_korea', name: 'YousList (Korea)', category: 'ads', homepage: 'https://github.com/yous/YousList', description: 'Korean-language ads.', url: 'https://raw.githubusercontent.com/yous/YousList/master/youslist.txt' },
  { rulesetId: 'easylist_vietnam', name: 'ABPVN (Vietnam)', category: 'ads', homepage: 'https://abpvn.com/', description: 'Vietnamese-language ads.', url: 'https://raw.githubusercontent.com/abpvn/abpvn/master/filter/abpvn_adguard.txt' },
  { rulesetId: 'easylist_india', name: 'IndianList', category: 'ads', homepage: 'https://adblock-indian.github.io/', description: 'Hindi, Tamil and other Indian-language ads.', url: 'https://easylist-downloads.adblockplus.org/indianlist.txt' },
  { rulesetId: 'oisd', name: 'OISD Small', category: 'ads', homepage: 'https://oisd.nl/', description: 'Curated aggressive list covering ads, trackers and malware worldwide.', url: 'https://abp.oisd.nl/' },
  { rulesetId: 'annoyances_plus', name: 'Annoyances Plus', category: 'annoyances', enabled: true, homepage: 'https://github.com/AdguardTeam/AdguardFilters', description: 'Cookie notices, popups, widgets, app banners and self-promos merged from seven lists.', sources: [
    'https://filters.adtidy.org/extension/ublock/filters/18.txt',
    'https://filters.adtidy.org/extension/ublock/filters/19.txt',
    'https://filters.adtidy.org/extension/ublock/filters/20.txt',
    'https://filters.adtidy.org/extension/ublock/filters/21.txt',
    'https://filters.adtidy.org/extension/ublock/filters/22.txt',
    'https://filters.adtidy.org/extension/ublock/filters/201.txt',
    'https://filters.adtidy.org/extension/ublock/filters/250.txt'
  ] }
];
FILTER_LISTS.push(...REGIONAL_LISTS);

const NETWORK_SKIP = /(##|#@#|#\?#|#\$#|#@\$#|\+js\()/;
const KEYWORDS = { 'ads': ['ads', 'adblock'], 'trackers': ['track', 'privacy', 'spyware'], 'malware': ['malware', 'badware', 'nocoin'], 'annoyances': ['annoyance', 'unbreak'], 'social': ['social'], 'cookieNotices': ['cookie'] };

function slotFor(rulesetId) {
  const index = FILTER_LISTS.findIndex((list) => list.rulesetId === rulesetId);
  return index === -1 ? 0 : index + 1;
}

function categoryOf(rulesetId) {
  const list = FILTER_LISTS.find((entry) => entry.rulesetId === rulesetId);
  if (list) return list.category;
  for (const [category, words] of Object.entries(KEYWORDS)) {
    if (words.some((word) => rulesetId.includes(word))) return category;
  }
  return 'ads';
}

async function fetchText(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { 'user-agent': UA }, signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseDomains(prefix) {
  const domains = [];
  const excluded = [];
  for (const raw of String(prefix).split(',')) {
    let entry = raw.trim().toLowerCase();
    if (!entry || entry === '*') continue;
    const negated = entry.startsWith('~');
    if (negated) entry = entry.slice(1);
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(entry)) continue; // no wildcards: DNR can't express them
    if (negated) excluded.push(entry);
    else domains.push(entry);
  }
  return { domains, excluded };
}

/**
 * Compile one filter list into sanitized DNR rules.
 * Hosts-file lines ("0.0.0.0 ads.example.com") are understood as well.
 */
function compileNetworkRules(text, rulesetId) {
  const bad = collectBadFilters(text);
  const seen = new Set();
  const collected = [];
  let skipped = 0;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[') || trimmed.startsWith('#')) continue;
    if (NETWORK_SKIP.test(trimmed)) continue;
    if (trimmed.includes('$badfilter')) continue;
    if (bad.has(trimmed.split('$')[0])) { skipped++; continue; }

    let filter = trimmed;
    const hostsMatch = filter.match(/^(?:0\.0\.0\.0|127\.0\.0\.1|::1)\s+(\S+)$/);
    if (hostsMatch) {
      const host = hostsMatch[1].toLowerCase();
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(host) || host === 'localhost' || host.includes('localhost.')) { skipped++; continue; }
      filter = `||${host}^`;
    } else if (!/[/*^|$.#@=]/.test(filter) && /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(filter)) {
      filter = `||${filter}^`; // bare domain line
    }

    try {
      const parsed = parseAbpFilter(filter);
      if (!parsed) { skipped++; continue; }
      const rule = createDnrRule(parsed, 1, rulesetId, filter);
      if (!rule) { skipped++; continue; }
      const clean = sanitizeRule(rule);
      if (!clean) { skipped++; continue; }
      const key = JSON.stringify([clean.action, clean.condition]);
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      const urlFilter = clean.condition.urlFilter || '';
      const regexFilter = clean.condition.regexFilter || '';
      const patternLen = urlFilter.length + regexFilter.length;
      clean.priority = clean.priority || 1;
      // uBO-grade ranking: allow/unbreak first (priority>=2), then broad
      // third-party + host-anchored rules, then cheaper/shorter patterns —
      // so a fixed per-list cap keeps coverage instead of alphabetical luck.
      collected.push({
        rule: clean,
        allowRank: clean.action.type === 'allow' ? 0 : (clean.priority >= 3 ? 1 : 2),
        weight: urlFilter.startsWith('||') ? 0 : 1,
        broad: (clean.condition.domainType === 'thirdParty' ? 1 : 0) +
          (clean.condition.resourceTypes ? 0 : 1),
        length: patternLen,
      });
    } catch {
      skipped++;
    }
  }

  // Prefer allow/unbreak, then domain-anchored, then broad, then short paths.
  collected.sort((a, b) =>
    (a.allowRank - b.allowRank) ||
    (a.weight - b.weight) ||
    (b.broad - a.broad) ||
    (a.length - b.length));
  const capped = collected.slice(0, MAX_RULES_PER_LIST).map((entry) => entry.rule);
  const baseId = slotFor(rulesetId) * RULESET_SLOT + 1;
  capped.forEach((rule, index) => { rule.id = baseId + index; });
  if (capped.length >= MAX_RULES_PER_LIST) skipped += collected.length - capped.length;
  return { rules: capped, skipped, total: collected.length };
}

const SUPPORTED_SCRIPTLETS = new Set([
  'set-constant', 'json-prune', 'abort-on-property-read', 'abort-on-property-write',
  'no-fetch-if', 'remove-attr', 'remove-class', 'set-cookie'
]);
const SCRIPTLET_ALIASES = { aopr: 'abort-on-property-read', aopw: 'abort-on-property-write' };
// Procedural / unsupported cosmetic syntax - skipped instead of breaking pages.
const UNSUPPORTED_SELECTOR = /(:style\(|:remove-attr|:remove-class|:has-text|:xpath|:upward|:matches-css|:min-text-length|:watch-attr|:if\(|:others\(|:contains\(|:matches-attr|:matches-media|:matches-path|:subject|:webrtc|:remove\(\)\s*:style)/;

function bucketOf(domain) {
  const first = (domain || '').replace(/^www\./, '').charAt(0);
  return /[a-z0-9]/.test(first) ? first : '_';
}

function bump(map, key, value) {
  if (!map[key]) map[key] = [];
  map[key].push(value);
}

/**
 * Collect cosmetic (element hiding) filters and scriptlets from a list.
 * Returns per-bucket shards plus counters.
 */
function collectCosmetic(text, target) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) continue;

    const scriptletMatch = trimmed.match(/#\+js\(([^)]*)\)/) ||
      trimmed.match(/#%#\/\/scriptlet\(([^)]*)\)/);
    if (scriptletMatch) {
      const parts = scriptletMatch[1].split(',').map((part) => part.trim()).filter(Boolean);
      const name = SCRIPTLET_ALIASES[parts[0]] || parts[0];
      if (!SUPPORTED_SCRIPTLETS.has(name)) continue;
      const args = parts.slice(1).map((arg) => arg.replace(/^['"]|['"]$/g, ''));
      const prefix = trimmed.slice(0, trimmed.search(/#(\+js|%#|@?#)/));
      const { domains } = parseDomains(prefix);
      if (domains.length === 0) target.scriptletGeneric.push([name, args]);
      else for (const domain of domains) bump(target.scriptlets, bucketOf(domain) + '|' + domain, [name, args]);
      continue;
    }

    let marker = null;
    if (trimmed.includes('#@#')) marker = '#@#';
    else if (trimmed.includes('##')) marker = '##';
    else if (trimmed.includes('#?#')) marker = '#?#';
    if (!marker) continue;

    const index = trimmed.indexOf(marker);
    const prefix = trimmed.slice(0, index);
    const selector = trimmed.slice(index + marker.length).trim();
    if (!selector || selector.length < 2 || UNSUPPORTED_SELECTOR.test(selector)) continue;
    if (marker === '#?#' && !/^[.#\[]/.test(selector)) continue;

    const { domains, excluded } = parseDomains(prefix);
    const isException = marker === '#@#';
    const cssSelector = selector.replace(/\s+/g, ' ');

    if (domains.length === 0 && !isException) {
      if (excluded.length > 0) target.genericNeg.push([cssSelector, excluded]);
      else target.generic.push(cssSelector);
      continue;
    }
    if (isException && domains.length === 0) {
      // global exception (rare) - applied through the generic bucket
      for (const domain of excluded) bump(target.genericExcept, domain, cssSelector);
      continue;
    }
    for (const domain of domains) {
      if (isException) bump(target.except, bucketOf(domain) + '|' + domain, cssSelector);
      else bump(target.hide, bucketOf(domain) + '|' + domain, cssSelector);
    }
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function buildShards(texts) {
  const generic = { generic: [], genericNeg: [], genericExcept: {} };
  const hide = {};
  const except = {};
  const scriptlets = { generic: [], domains: {} };

  const target = {
    generic: generic.generic,
    genericNeg: generic.genericNeg,
    genericExcept: generic.genericExcept,
    hide,
    except,
    scriptlets: {},
    scriptletGeneric: []
  };

  for (const text of texts) collectCosmetic(text, target);

  // "bucket|domain" keys -> per-bucket shard files
  const perBucket = new Map();
  const addTo = (bucket, kind, domain, selector) => {
    if (!perBucket.has(bucket)) perBucket.set(bucket, { hide: {}, except: {} });
    const shard = perBucket.get(bucket);
    if (!shard[kind][domain]) shard[kind][domain] = [];
    if (!shard[kind][domain].includes(selector)) shard[kind][domain].push(selector);
  };
  for (const [key, selectors] of Object.entries(hide)) {
    const [bucket, domain] = key.split('|');
    for (const selector of new Set(selectors)) addTo(bucket, 'hide', domain, selector);
  }
  for (const [key, selectors] of Object.entries(except)) {
    const [bucket, domain] = key.split('|');
    for (const selector of new Set(selectors)) addTo(bucket, 'except', domain, selector);
  }
  for (const [key, calls] of Object.entries(target.scriptlets)) {
    const [, domain] = key.split('|');
    if (!scriptlets.domains[domain]) scriptlets.domains[domain] = [];
    for (const call of calls) {
      if (!scriptlets.domains[domain].some((entry) => JSON.stringify(entry) === JSON.stringify(call))) {
        scriptlets.domains[domain].push(call);
      }
    }
  }

  fs.rmSync(COSMETIC_DIR, { recursive: true, force: true });
  fs.rmSync(SCRIPTLET_DIR, { recursive: true, force: true });
  writeJson(path.join(COSMETIC_DIR, 'generic.json'), {
    generic: [...new Set(generic.generic)],
    genericNeg: generic.genericNeg,
    genericExcept: generic.genericExcept
  });
  let bucketCount = 0;
  for (const [bucket, shard] of perBucket) {
    if (Object.keys(shard.hide).length === 0 && Object.keys(shard.except).length === 0) continue;
    writeJson(path.join(COSMETIC_DIR, `${bucket}.json`), shard);
    bucketCount++;
  }
  scriptlets.generic = target.scriptletGeneric;
  writeJson(path.join(SCRIPTLET_DIR, 'all.json'), scriptlets);

  const cosmeticCount = new Set(generic.generic).size +
    Object.values(perBucket).reduce((sum, shard) =>
      sum + Object.values(shard.hide).reduce((n, list) => n + new Set(list).size, 0), 0);
  const scriptletCount = target.scriptletGeneric.length +
    Object.values(scriptlets.domains).reduce((sum, list) => sum + list.length, 0);
  return { cosmeticCount, bucketCount, scriptletCount };
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Post-build repair pass: re-validates every stored regexFilter with the same
 * Chrome load-time check and rewrites files that contain invalid entries.
 * Returns the number of rules repaired. This is the self-healing step that
 * keeps validators (and Chrome itself) at zero blocking errors even when a
 * filter list ships patterns RE2 cannot compile.
 */
async function fixInvalidRegexRules(rulesets) {
  const { validateRegexFilter } = await import('./background/abp-parser.js');
  let repaired = 0;
  for (const [rulesetId, meta] of Object.entries(rulesets || {})) {
    const filePath = path.join(RULES_DIR, meta.file);
    let rules;
    try {
      rules = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(rules)) continue;
    let dirty = false;
    const kept = [];
    for (const rule of rules) {
      const rf = rule?.condition?.regexFilter;
      if (typeof rf !== 'string') { kept.push(rule); continue; }
      // Same lone-trailing-backslash repair the optimizer applies.
      const fixed = rf.replace(/(^|[^\\])(?:\\\\)*\\$/, '$1');
      if (fixed !== rf) {
        rule.condition.regexFilter = fixed;
        dirty = true;
      }
      if (validateRegexFilter(rule.condition.regexFilter)) {
        dirty = true; // drop invalid — a broken regex kills the whole ruleset
        continue;
      }
      kept.push(rule);
    }
    if (dirty) {
      kept.forEach((rule, index) => { rule.id = index + 1; });
      writeJson(filePath, kept);
      meta.ruleCount = kept.length;
      meta.size = fs.statSync(filePath).size;
      repaired += rules.length - kept.length;
    }
  }
  if (repaired > 0) writeStaticIndex();
  return repaired;
}

function listMeta(rulesetId) {
  const list = FILTER_LISTS.find((entry) => entry.rulesetId === rulesetId);
  if (list) return list;
  const curated = {
    'block-rules': { name: 'AeroGuard Core', category: 'ads', homepage: 'https://github.com/bhatiaarav61/AeroGuard', description: 'Curated core blocking rules.', enabled: true },
    'custom': { name: 'AeroGuard Extras', category: 'ads', homepage: 'https://github.com/bhatiaarav61/AeroGuard', description: 'Extra hand-written rules (anti-adblock test sites).', enabled: true },
    'youtube_ads': { name: 'YouTube Ads', category: 'ads', homepage: 'https://github.com/bhatiaarav61/AeroGuard', description: 'YouTube ad endpoints (ads, tracking, manifests).', enabled: true },
    'tracking-params': { name: 'Tracking Parameter Stripper', category: 'trackers', homepage: 'https://github.com/bhatiaarav61/AeroGuard', description: 'Strips tracking parameters (utm_*, gclid, fbclid...) from URLs, Brave-style.', enabled: true }
  }[rulesetId];
  return curated || { name: rulesetId, category: categoryOf(rulesetId), homepage: '', description: '', enabled: true };
}

function readRulesets() {
  const files = fs.readdirSync(RULES_DIR)
    .filter((file) => file.endsWith('.json') && file !== 'ruleset-index.json' && file !== 'static-index.json')
    .sort((a, b) => {
      const rank = (file) => (CURATED_FILES.includes(file) ? 0 : 1);
      return rank(a) - rank(b) || a.localeCompare(b);
    });

  const rulesets = {};
  const hashes = [];
  let totalRules = 0;
  const resources = [];

  for (const file of files) {
    const filePath = path.join(RULES_DIR, file);
    let rules;
    try {
      rules = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.warn(`[build] skipping ${file}: ${error.message}`);
      continue;
    }
    if (!Array.isArray(rules) || rules.length === 0) continue;
    const rulesetId = file.replace(/\.json$/, '');
    for (const rule of rules) {
      const filter = rule && rule.condition ? (rule.condition.urlFilter || rule.condition.regexFilter) : null;
      if (typeof filter === 'string') hashes.push(fnv1a(filter));
    }
    const meta = listMeta(rulesetId);
    rulesets[rulesetId] = {
      id: rulesetId,
      file,
      name: meta.name,
      category: meta.category,
      description: meta.description,
      homepage: meta.homepage,
      ruleCount: rules.length,
      size: fs.statSync(filePath).size,
      enabled: meta.enabled !== false,
      idBase: (FILTER_LISTS.findIndex((entry) => entry.rulesetId === rulesetId) + 1) * RULESET_SLOT
    };
    totalRules += rules.length;
    resources.push({ id: `ruleset_${rulesetId}`, enabled: meta.enabled !== false, path: `rules/${file}` });
  }
  return { rulesets, hashes, totalRules, resources };
}

function writeStaticIndex() {
  const { rulesets, hashes, totalRules, resources } = readRulesets();
  writeJson(STATIC_INDEX, { built: Date.now(), h: hashes });
  writeJson(INDEX_FILE, { built: Date.now(), totalRules, rulesets });
  writeManifest(resources);
  console.log(`[build] index: ${Object.keys(rulesets).length} rulesets, ${totalRules} rules, ` +
    `${resources.filter((r) => r.enabled).length} enabled`);
  return { rulesets, totalRules };
}

function writeManifest(resources) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const limited = resources.slice(0, 50);
  if (resources.length > 50) {
    console.warn(`[build] ${resources.length} rulesets, keeping the first 50 (Chrome limit)`);
  }
  manifest.declarative_net_request = Object.assign({}, manifest.declarative_net_request, { rule_resources: limited });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * Tracking-parameter stripping (Brave "query filter" equivalent).
 * DNR cannot regex-match query keys, so each param becomes one rule with
 * queryTransform.removeParams. `removeparam` list filters are skipped by the
 * parser, so this is generated as a curated ruleset instead.
 */
const TRACKING_PARAMS = [
  // Google /DoubleClick
  'gclid', 'gclsrc', 'dclid', 'wbraid', 'gbraid', 'yclid', 's_kwcid',
  // Adobe / email marketing
  'mc_cid', 'mc_eid', 'mkt_tok', 'vero_id', 'vero_conv', 'elqTrackId', 'elqTrack',
  // Meta / Instagram / Threads
  'fbclid', 'igshid', 'igsh', 'si',
  // X / Twitter, TikTok, LinkedIn
  'twclid', 'ttclid', 'tclid', 'li_fat_id', 'originalReferer',
  // Microsoft / Bing
  'msclkid', 'cvid', 'ocid', 'form', 'skcid',
  // Analytics swill
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic', 'utm_experiment',
  'utm_social', 'utm_brand', 'utm_campaign_id', 'utm_placeholder',
  // Amazon / retail / misc
  'ascsubtag', 'ascsubtag', 'pd_rd_w', 'pd_rd_r', 'pf_rd_p', 'pf_rd_r', 'pf_rd_s',
  'psc', 'smid', 'spIA', 'sr_id', 'rb_clickid', 'sscid', 'oly_anon_id', 'oly_enc_id',
  // Pinterest / Snapchat / Reddit / Spotify
  'epik', 'sc_eh', 'rdtcid', 'sp_cm_campaign',
  // Chinese platforms
  'spm', 'spm_id_from', 'vd_source', 'share_source', 'vn_cid',
  // Misc click trackers
  'trk_contact', 'trk_msg', 'trk_module', 'trk_sid', 'gdfbclk', 'wickedid', 'hsa_cam',
  'hsa_grp', 'hsa_ad', 'hsa_src', 'hsa_tgt', 'hsa_kw', 'hsa_mt', 'hsa_net', 'hsa_ver',
  'hsa_acc', '_hsenc', '_hsmi', 'hsCtaTracking', 'tw_adid', 'tw_campaign'
];

function writeTrackingParamsRuleset() {
  const usable = [...new Set(TRACKING_PARAMS.map(p => p.trim()).filter(Boolean))].sort();
  const rules = usable.map((param, i) => ({
    id: 40000 + i,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { transform: { queryTransform: { removeParams: [param] } } }
    },
    // Chrome requires a URL filter on transform rules; '*' matches every URL.
    condition: { urlFilter: '*', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest'] }
  }));
  writeJson(path.join(RULES_DIR, 'tracking-params.json'), rules);
  console.log(`[build] tracking-params: ${rules.length} stripping rules`);
  return rules.length;
}

/**
 * Firefox / event-page manifest. Chromium browsers (Chrome, Edge, Brave, Opera)
 * load manifest.json directly; Firefox needs background.scripts instead of a
 * service worker and a strict_min_version where MV3 + DNR are complete.
 */
function writeFirefoxManifest() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const gecko = manifest.browser_specific_settings?.gecko || { id: 'aeroguard@aeroguard.io' };
  const ff = {
    ...manifest,
    background: {
      scripts: ['background/service-worker.js'],
      type: 'module'
    },
    browser_specific_settings: {
      gecko: { ...gecko, strict_min_version: '121.0' }
    }
  };
  delete ff.minimum_chrome_version;
  fs.writeFileSync(path.join(__dirname, 'manifest-firefox.json'), JSON.stringify(ff, null, 2) + '\n');
  console.log('[build] manifest-firefox.json written (Firefox 121+)');
}

async function main() {
  const args = process.argv.slice(2);
  const onlyArg = args.find((arg) => arg.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean) : null;
  const cosmeticOnly = args.includes('--cosmetic');
  const indexOnly = args.includes('--index');

  fs.mkdirSync(RULES_DIR, { recursive: true });

  if (indexOnly) {
    writeStaticIndex();
    return;
  }

  const lists = only ? FILTER_LISTS.filter((list) => only.includes(list.rulesetId)) : FILTER_LISTS;
  const texts = new Map();
  const failures = [];

  for (const list of lists) {
    try {
      process.stdout.write(`[build] ${list.rulesetId} ... `);
      const urls = list.sources || [list.url];
      const parts = [];
      for (const url of urls) {
        const text = await fetchText(url);
        parts.push(text);
        if (cosmeticOnly) texts.set(list.rulesetId, [...(texts.get(list.rulesetId) || ''), text].join('\n'));
      }
      const text = parts.join('\n');
      texts.set(list.rulesetId, text);
      if (cosmeticOnly) {
        console.log(`${(text.length / 1024).toFixed(0)} KB downloaded`);
        continue;
      }
      const { rules, skipped, total } = compileNetworkRules(text, list.rulesetId);
      writeJson(path.join(RULES_DIR, `${list.rulesetId}.json`), rules);
      console.log(`${rules.length} rules (${total} parsed, ${skipped} skipped)` + (urls.length > 1 ? ` [${urls.length} sources]` : ''));
    } catch (error) {
      failures.push(`${list.rulesetId}: ${error.message}`);
      console.log(`FAILED (${error.message})`);
    }
  }

  const writeShards = cosmeticOnly || !only;
  if (texts.size > 0 && writeShards) {
    const shards = buildShards([...texts.values()]);
    console.log(`[build] cosmetic: ${shards.cosmeticCount} selectors in ${shards.bucketCount} shards, ` +
      `${shards.scriptletCount} scriptlet calls`);
  }

  if (failures.length > 0) {
    console.warn(`[build] ${failures.length} list(s) failed: ${failures.join('; ')}`);
  }

  writeTrackingParamsRuleset();
  const { rulesets, totalRules } = writeStaticIndex();
  const fixed = await fixInvalidRegexRules(rulesets);
  if (fixed > 0) console.log(`[build] repaired ${fixed} invalid regexFilter rules`);
  writeFirefoxManifest();
  if (totalRules > 310000) {
    console.warn(`[build] WARNING: ${totalRules} static rules - close to Chrome's 330k limit`);
  }
}

main().catch((error) => {
  console.error('[build] fatal:', error);
  process.exit(1);
});





