/**
 * Enhanced Build Script for AeroGuard
 * Compiles filter lists into optimized DNR rulesets with CNAME uncloaking integration
 * Run with: node build-rules-enhanced.js
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { parseAbpFilter, createDnrRule, filterValidRules } from './background/abp-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Valid DNR resource types
const VALID_DNR_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'script', 'xmlhttprequest',
  'image', 'stylesheet', 'font', 'object', 'media',
  'websocket', 'other', 'ping', 'csp_report'
];

// Comprehensive filter list definitions
const FILTER_LISTS = {
  // Core lists (enabled by default)
  easylist: {
    id: 'easylist', name: 'EasyList', url: 'https://easylist.to/easylist/easylist.txt',
    category: 'ads', enabled: true, rulesetId: 'easylist', priority: 1
  },
  easyprivacy: {
    id: 'easyprivacy', name: 'EasyPrivacy', url: 'https://easylist.to/easylist/easyprivacy.txt',
    category: 'trackers', enabled: true, rulesetId: 'easyprivacy', priority: 1
  },
  easylistCookie: {
    id: 'easylistCookie', name: 'EasyList Cookie', url: 'https://secure.fanboy.co.nz/fanboy-cookiemonster.txt',
    category: 'cookieNotices', enabled: true, rulesetId: 'easylist_cookie', priority: 1
  },
  peterLowe: {
    id: 'peterLowe', name: "Peter Lowe's List",
    url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext',
    category: 'malware', enabled: true, rulesetId: 'peterlowe', priority: 1
  },
  oisd: {
    id: 'oisd', name: 'OISD', url: 'https://big.oisd.nl/',
    category: 'ads', enabled: true, rulesetId: 'oisd', priority: 1
  },
  ublockFilters: {
    id: 'ublockFilters', name: 'uBlock Origin Filters',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
    category: 'ads', enabled: true, rulesetId: 'ublock_filters', priority: 1
  },
  ublockBadware: {
    id: 'ublockBadware', name: 'uBlock Badware',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt',
    category: 'malware', enabled: true, rulesetId: 'ublock_badware', priority: 1
  },
  ublockPrivacy: {
    id: 'ublockPrivacy', name: 'uBlock Privacy',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt',
    category: 'trackers', enabled: true, rulesetId: 'ublock_privacy', priority: 1
  },
  ublockResourceAbuse: {
    id: 'ublockResourceAbuse', name: 'uBlock Resource Abuse',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/resource-abuse.txt',
    category: 'malware', enabled: true, rulesetId: 'ublock_resource_abuse', priority: 1
  },
  ublockUnbreak: {
    id: 'ublockUnbreak', name: 'uBlock Unbreak',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt',
    category: 'annoyances', enabled: true, rulesetId: 'ublock_unbreak', priority: 1
  },
  fanboyAnnoyances: {
    id: 'fanboyAnnoyances', name: 'Fanboy Annoyances',
    url: 'https://easylist.to/easylist/fanboy-annoyance.txt',
    category: 'annoyances', enabled: true, rulesetId: 'fanboy_annoyances', priority: 1
  },
  fanboySocial: {
    id: 'fanboySocial', name: 'Fanboy Social',
    url: 'https://easylist.to/easylist/fanboy-social.txt',
    category: 'social', enabled: true, rulesetId: 'fanboy_social', priority: 1
  },

  // Regional lists
  easylistGermany: { id: 'easylistGermany', name: 'EasyList Germany', url: 'https://easylist.to/easylistgermany/easylistgermany.txt', category: 'regional', enabled: true, rulesetId: 'easylist_germany', priority: 1 },
  easylistFrance: { id: 'easylistFrance', name: 'EasyList France', url: 'https://easylist.to/easylistfr/easylistfr.txt', category: 'regional', enabled: true, rulesetId: 'easylist_france', priority: 1 },
  easylistChina: { id: 'easylistChina', name: 'EasyList China', url: 'https://easylist-downloads.adblockplus.org/easylistchina.txt', category: 'regional', enabled: true, rulesetId: 'easylist_china', priority: 1 },
  easylistItaly: { id: 'easylistItaly', name: 'EasyList Italy', url: 'https://easylist.to/easylistitaly/easylistitaly.txt', category: 'regional', enabled: true, rulesetId: 'easylist_italy', priority: 1 },
  easylistLithuania: { id: 'easylistLithuania', name: 'EasyList Lithuania', url: 'https://easylist.to/easylistlithuania/easylistlithuania.txt', category: 'regional', enabled: true, rulesetId: 'easylist_lithuania', priority: 1 },
  easylistPoland: { id: 'easylistPoland', name: 'EasyList Poland', url: 'https://easylist.to/easylistpoland/easylistpoland.txt', category: 'regional', enabled: true, rulesetId: 'easylist_poland', priority: 1 },
  easylistSpanish: { id: 'easylistSpanish', name: 'EasyList Spanish', url: 'https://easylist.to/easylistspanish/easylistspanish.txt', category: 'regional', enabled: true, rulesetId: 'easylist_spanish', priority: 1 },
  easylistBulgaria: { id: 'easylistBulgaria', name: 'EasyList Bulgaria', url: 'https://easylist.to/easylistbulgaria/easylistbulgaria.txt', category: 'regional', enabled: true, rulesetId: 'easylist_bulgaria', priority: 1 },
  easylistCzech: { id: 'easylistCzech', name: 'EasyList Czech', url: 'https://easylist.to/easylistczech/easylistczech.txt', category: 'regional', enabled: true, rulesetId: 'easylist_czech', priority: 1 },
  easylistDenmark: { id: 'easylistDenmark', name: 'EasyList Denmark', url: 'https://easylist.to/easylistdenmark/easylistdenmark.txt', category: 'regional', enabled: true, rulesetId: 'easylist_denmark', priority: 1 },
  easylistGreece: { id: 'easylistGreece', name: 'EasyList Greece', url: 'https://easylist.to/easylistgreece/easylistgreece.txt', category: 'regional', enabled: true, rulesetId: 'easylist_greece', priority: 1 },
  easylistHungary: { id: 'easylistHungary', name: 'EasyList Hungary', url: 'https://easylist.to/easylisthungary/easylisthungary.txt', category: 'regional', enabled: true, rulesetId: 'easylist_hungary', priority: 1 },
  easylistIsrael: { id: 'easylistIsrael', name: 'EasyList Israel', url: 'https://easylist.to/easylistisrael/easylistisrael.txt', category: 'regional', enabled: true, rulesetId: 'easylist_israel', priority: 1 },
  easylistLatvia: { id: 'easylistLatvia', name: 'EasyList Latvia', url: 'https://easylist.to/easylistlatvia/easylistlatvia.txt', category: 'regional', enabled: true, rulesetId: 'easylist_latvia', priority: 1 },
  easylistNetherlands: { id: 'easylistNetherlands', name: 'EasyList Netherlands', url: 'https://easylist.to/easylistnetherlands/easylistnetherlands.txt', category: 'regional', enabled: true, rulesetId: 'easylist_netherlands', priority: 1 },
  easylistPortugal: { id: 'easylistPortugal', name: 'EasyList Portugal', url: 'https://easylist.to/easylistportugal/easylistportugal.txt', category: 'regional', enabled: true, rulesetId: 'easylist_portugal', priority: 1 },
  easylistRomania: { id: 'easylistRomania', name: 'EasyList Romania', url: 'https://easylist.to/easylistromania/easylistromania.txt', category: 'regional', enabled: true, rulesetId: 'easylist_romania', priority: 1 },
  easylistSerbia: { id: 'easylistSerbia', name: 'EasyList Serbia', url: 'https://easylist.to/easylistserbia/easylistserbia.txt', category: 'regional', enabled: true, rulesetId: 'easylist_serbia', priority: 1 },
  easylistSlovakia: { id: 'easylistSlovakia', name: 'EasyList Slovakia', url: 'https://easylist.to/easylistslovakia/easylistslovakia.txt', category: 'regional', enabled: true, rulesetId: 'easylist_slovakia', priority: 1 },
  easylistSweden: { id: 'easylistSweden', name: 'EasyList Sweden', url: 'https://easylist.to/easylistsweden/easylistsweden.txt', category: 'regional', enabled: true, rulesetId: 'easylist_sweden', priority: 1 },
  easylistTurkey: { id: 'easylistTurkey', name: 'EasyList Turkey', url: 'https://easylist.to/easylistturkey/easylistturkey.txt', category: 'regional', enabled: true, rulesetId: 'easylist_turkey', priority: 1 },

  // Specialized lists
  nocoin: { id: 'nocoin', name: 'NoCoin', url: 'https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/nocoin.txt', category: 'malware', enabled: true, rulesetId: 'nocoin', priority: 1 },
  adguardDns: { id: 'adguardDns', name: 'AdGuard DNS', url: 'https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/dns.txt', category: 'ads', enabled: true, rulesetId: 'adguard_dns', priority: 1 },
  adguardMobileDns: { id: 'adguardMobileDns', name: 'AdGuard Mobile DNS', url: 'https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/mobile_dns.txt', category: 'ads', enabled: true, rulesetId: 'adguard_mobile_dns', priority: 1 },
  adguardBase: { id: 'adguardBase', name: 'AdGuard Base', url: 'https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/base.txt', category: 'ads', enabled: true, rulesetId: 'adguard_base', priority: 1 },
  adguardMobile: { id: 'adguardMobile', name: 'AdGuard Mobile', url: 'https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/mobile.txt', category: 'ads', enabled: true, rulesetId: 'adguard_mobile', priority: 1 },
  adguardTracking: { id: 'adguardTracking', name: 'AdGuard Tracking', url: 'https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/tracking.txt', category: 'trackers', enabled: true, rulesetId: 'adguard_tracking', priority: 1 },
  adguardAnnoyances: { id: 'adguardAnnoyances', name: 'AdGuard Annoyances', url: 'https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/annoyances.txt', category: 'annoyances', enabled: true, rulesetId: 'adguard_annoyances', priority: 1 },
  adguardSocial: { id: 'adguardSocial', name: 'AdGuard Social', url: 'https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/social.txt', category: 'social', enabled: true, rulesetId: 'adguard_social', priority: 1 }
};

// Major ad/tracker domains for priority sorting
const MAJOR_DOMAINS = [
  'google-analytics.com', 'googlesyndication.com', 'googleadservices.com',
  'adservice.google.com', 'pagead2.googlesyndication.com', 'ads.youtube.com',
  'googletagmanager.com', 'googletagservices.com', 'adx.g.doubleclick.net',
  'tpc.googlesyndication.com', 'doubleclick.net', 'facebook.net',
  'connect.facebook.net', 'pixel.facebook.com', 'analytics.facebook.com',
  'adsystem.amazon.com', 'amazon-adsystem.com', 'aax.amazon-adsystem.com',
  'c.amazon-adsystem.com', 'bat.bing.com', 'bingads.microsoft.com',
  'ads.msn.com', 'c.msn.com', 'static.ads-twitter.com', 'ads-api.twitter.com',
  'analytics.twitter.com', 'adserver.yahoo.com', 'gemini.yahoo.com',
  'analytics.yahoo.com', 'outbrain.com', 'outbrainimg.com', 'taboola.com',
  'trc.taboola.com', 'cdn.taboola.com', 'adnxs.com', 'rubiconproject.com',
  'pubmatic.com', 'casalemedia.com', 'openx.net', 'criteo.com', 'criteo.net',
  'cas.criteo.com', 'smartadserver.com', 'adsrvr.org', 'teads.tv',
  'bidswitch.net', 'moatads.com', 'exponential.com', 'quantserve.com',
  'quantcount.com', 'scorecardresearch.com', 'hotjar.com', 'static.hotjar.com',
  'crazyegg.com', 'mixpanel.com', 'segment.com', 'api.segment.io',
  'cdn.segment.com', 'optimizely.com', 'logx.optimizely.com', 'chartbeat.com',
  'chartbeat.net', 'parsely.com', 'imrworldwide.com', 'comscore.com',
  'bam.nr-data.net', 'browser-intake-datadoghq.com', 'sentry.io', 'bugsnag.com',
  'amplitude.com', 'mc.yandex.ru', 'hm.baidu.com'
];

// Utility functions
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => reject(new Error('Timeout')));
  });
}

function validateRule(rule) {
  if (!rule.condition || !rule.condition.resourceTypes) return false;
  rule.condition.resourceTypes = rule.condition.resourceTypes.filter(t => VALID_DNR_RESOURCE_TYPES.includes(t));
  return rule.condition.resourceTypes.length > 0;
}

async function buildAllRules() {
  console.log('[Build] Starting enhanced rule compilation...');

  const rulesDir = path.join(__dirname, 'rules');
  if (!fs.existsSync(rulesDir)) {
    fs.mkdirSync(rulesDir, { recursive: true });
  }

  let ruleId = 1;
  let allRules = [];
  let stats = { total: 0, parsed: 0, failed: 0, byCategory: {} };

  // Process each filter list
  for (const [key, list] of Object.entries(FILTER_LISTS)) {
    if (!list.enabled) {
      console.log(`[Build] Skipping ${list.name} (disabled)`);
      continue;
    }

    console.log(`[Build] Fetching ${list.name}...`);
    try {
      const text = await fetchUrl(list.url);
      console.log(`[Build] Fetched ${list.name}: ${(text.length / 1024).toFixed(1)} KB`);

      const lines = text.split('\n');
      let listRules = [];
      let listRuleCount = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) continue;
        if (trimmed.includes('##') || trimmed.includes('#@#') || trimmed.includes('#?#')) continue;

        try {
          const parsed = parseAbpFilter(trimmed);
          if (parsed) {
            const rule = createDnrRule(parsed, ruleId++, list.id, trimmed);
            if (rule && validateRule(rule)) {
              listRules.push(rule);
              listRuleCount++;
            }
          }
        } catch (e) {
          // Silently skip invalid rules
        }
      }

      console.log(`[Build] ${list.name}: ${listRuleCount} valid rules compiled`);
      stats.parsed += listRuleCount;
      stats.byCategory[list.category] = (stats.byCategory[list.category] || 0) + listRuleCount;
      allRules.push(...listRules);
      stats.total += listRuleCount;

      // Write individual ruleset
      if (listRules.length > 0 && list.rulesetId) {
        fs.writeFileSync(
          path.join(__dirname, 'rules', `${list.rulesetId}.json`),
          JSON.stringify(listRules, null, 2)
        );
        console.log(`[Build] Wrote ${listRules.length} rules to ${list.rulesetId}.json`);
      }

    } catch (error) {
      console.error(`[Build] Failed to process ${list.name}:`, error.message);
      stats.failed++;
    }
  }

  // Sort: major domains first, then domain-based, then path-based
  const domainPriority = new Map();
  MAJOR_DOMAINS.forEach((domain, index) => {
    domainPriority.set(domain, MAJOR_DOMAINS.length - index);
  });

  const domainRules = allRules.filter(r => r.condition.urlFilter.startsWith('||'));
  const pathRules = allRules.filter(r => !r.condition.urlFilter.startsWith('||'));

  domainRules.sort((a, b) => {
    const aDomain = a.condition.urlFilter.slice(2, a.condition.urlFilter.indexOf('^'));
    const bDomain = b.condition.urlFilter.slice(2, b.condition.urlFilter.indexOf('^'));
    const aPriority = domainPriority.get(aDomain) || 0;
    const bPriority = domainPriority.get(bDomain) || 0;
    if (aPriority !== bPriority) return bPriority - aPriority;
    return aDomain.localeCompare(bDomain);
  });

  allRules = [...domainRules, ...pathRules];

  // Cap total rules (leave room for dynamic/session rules)
  const MAX_STATIC_RULES = 30000;
  if (allRules.length > MAX_STATIC_RULES) {
    console.log(`[Build] Truncating from ${allRules.length} to ${MAX_STATIC_RULES}`);
    allRules.length = MAX_STATIC_RULES;
  }

  // Reassign sequential IDs
  allRules.forEach((rule, index) => { rule.id = index + 1; });

  // Write main combined ruleset
  fs.writeFileSync(
    path.join(__dirname, 'rules', 'block-rules.json'),
    JSON.stringify(allRules, null, 2)
  );

  // Write empty allow and custom rulesets
  fs.writeFileSync(path.join(__dirname, 'rules', 'allow-rules.json'), JSON.stringify([], null, 2));
  fs.writeFileSync(path.join(__dirname, 'rules', 'custom-rules.json'), JSON.stringify([], null, 2));

  // Generate CNAME uncloaking ruleset
  const cnameTrackingDomains = [
    'googlesyndication.com', 'doubleclick.net', 'googleadservices.com',
    'googletagmanager.com', 'google-analytics.com', 'analytics.google.com',
    'stats.g.doubleclick.net', 'googleads.g.doubleclick.net',
    'pagead2.googlesyndication.com', 'tpc.googlesyndication.com',
    'securepubads.g.doubleclick.net', 'adservice.google.com',
    'googletagservices.com', 'facebook.net', 'connect.facebook.net',
    'pixel.facebook.com', 'analytics.facebook.com', 'ads.facebook.com',
    'amazon-adsystem.com', 'aax.amazon-adsystem.com', 'c.amazon-adsystem.com',
    'bing.com', 'bat.bing.com', 'ads.msn.com', 'c.msn.com',
    't.co', 'analytics.twitter.com', 'ads-api.twitter.com', 'static.ads-twitter.com',
    'adnxs.com', 'rubiconproject.com', 'pubmatic.com', 'openx.net',
    'criteo.com', 'casalemedia.com', 'smartadserver.com', 'adsrvr.org',
    'teads.tv', 'bidswitch.net', 'moatads.com', 'quantserve.com',
    'scorecardresearch.com', 'hotjar.com', 'crazyegg.com',
    'mixpanel.com', 'segment.com', 'api.segment.io', 'optimizely.com',
    'cdn.optimizely.com', 'logx.optimizely.com', 'cdn.segment.com',
    'chartbeat.com', 'parsely.com', 'imrworldwide.com', 'comscore.com',
    'bam.nr-data.net'
  ];

  const cnameRules = cnameTrackingDomains.map((domain, index) => ({
    id: index + 1,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: VALID_DNR_RESOURCE_TYPES,
      domainType: 'thirdParty'
    }
  }));

  fs.writeFileSync(
    path.join(__dirname, 'rules', 'cname-uncloaking.json'),
    JSON.stringify(cnameRules, null, 2)
  );
  console.log(`[Build] Wrote ${cnameRules.length} CNAME uncloaking rules`);

  // Statistics
  const domainRuleCount = allRules.filter(r => r.condition.urlFilter.startsWith('||')).length;
  const pathRuleCount = allRules.length - domainRuleCount;
  console.log(`\n[Build] Complete!`);
  console.log(`[Build] Total rules: ${allRules.length} (Domain: ${domainRuleCount}, Path: ${pathRuleCount})`);
  console.log(`[Build] By category:`, stats.byCategory);
  console.log(`[Build] Failed lists: ${stats.failed}`);
  console.log(`\n[Build] Rules written to rules/ directory`);
  console.log(`[Build] Update manifest.json with new ruleset IDs if needed`);
}

// Run build
buildAllRules().catch(console.error);