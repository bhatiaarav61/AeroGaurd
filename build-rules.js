/**
 * Build script to compile filter lists into DNR static rulesets
 * Run with: node build-rules.js
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { parseAbpFilter, createDnrRule, convertToUrlFilter, parseFilterList, filterValidRules } from './background/abp-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Filter list definitions
const FILTER_LISTS = {
  easylist: {
    id: 'easylist',
    name: 'EasyList',
    url: 'https://easylist.to/easylist/easylist.txt',
    category: 'ads',
    enabled: true,
    rulesetId: 'easylist',
    priority: 1
  },
  easyprivacy: {
    id: 'easyprivacy',
    name: 'EasyPrivacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    category: 'trackers',
    enabled: true,
    rulesetId: 'easyprivacy',
    priority: 1
  },
  easylistCookie: {
    id: 'easylistCookie',
    name: 'EasyList Cookie',
    url: 'https://secure.fanboy.co.nz/fanboy-cookiemonster.txt',
    category: 'cookieNotices',
    enabled: true,
    rulesetId: 'easylist_cookie',
    priority: 1
  },
  peterLowe: {
    id: 'peterLowe',
    name: "Peter Lowe's List",
    url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext',
    category: 'malware',
    enabled: true,
    rulesetId: 'peterlowe',
    priority: 1
  },
  ublockFilters: {
    id: 'ublockFilters',
    name: 'uBlock Origin Filters',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
    category: 'ads',
    enabled: true,
    rulesetId: 'ublock_filters',
    priority: 1
  },
  ublockBadware: {
    id: 'ublockBadware',
    name: 'uBlock Badware',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt',
    category: 'malware',
    enabled: true,
    rulesetId: 'ublock_badware',
    priority: 1
  },
  ublockPrivacy: {
    id: 'ublockPrivacy',
    name: 'uBlock Privacy',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt',
    category: 'trackers',
    enabled: true,
    rulesetId: 'ublock_privacy',
    priority: 1
  },
  ublockResourceAbuse: {
    id: 'ublockResourceAbuse',
    name: 'uBlock Resource Abuse',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/resource-abuse.txt',
    category: 'malware',
    enabled: true,
    rulesetId: 'ublock_resource_abuse',
    priority: 1
  },
  ublockUnbreak: {
    id: 'ublockUnbreak',
    name: 'uBlock Unbreak',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt',
    category: 'annoyances',
    enabled: true,
    rulesetId: 'ublock_unbreak',
    priority: 1
  },
  fanboyAnnoyances: {
    id: 'fanboyAnnoyances',
    name: 'Fanboy Annoyances',
    url: 'https://easylist.to/easylist/fanboy-annoyance.txt',
    category: 'annoyances',
    enabled: true,
    rulesetId: 'fanboy_annoyances',
    priority: 1
  },
  fanboySocial: {
    id: 'fanboySocial',
    name: 'Fanboy Social',
    url: 'https://easylist.to/easylist/fanboy-social.txt',
    category: 'social',
    enabled: false,
    rulesetId: 'fanboy_social',
    priority: 1
  },
  // OISD - comprehensive list
  oisd: {
    id: 'oisd',
    name: 'OISD',
    url: 'https://big.oisd.nl/',
    category: 'ads',
    enabled: true,
    rulesetId: 'oisd',
    priority: 1
  }
};

// Valid DNR resource types
const VALID_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'script', 'xmlhttprequest',
  'image', 'stylesheet', 'font', 'object', 'media',
  'websocket', 'other', 'ping', 'csp_report'
];

// Resource type mapping from ABP to DNR
const RESOURCE_TYPE_MAP = {
  script: 'script',
  image: 'image',
  stylesheet: 'stylesheet',
  object: 'object',
  xmlhttprequest: 'xmlhttprequest',
  'object-subrequest': 'object_subrequest',
  subdocument: 'sub_frame',
  document: 'main_frame',
  elemhide: 'other',
  other: 'other',
  font: 'font',
  media: 'media',
  websocket: 'websocket',
  ping: 'ping',
  csp: 'csp_report',
  cookie: 'cookie',
  redirect: 'redirect',
  'redirect-rule': 'redirect',
  removeparam: 'removeparam',
  important: 'important'
};

const ALL_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'script', 'xmlhttprequest',
  'image', 'stylesheet', 'font', 'object', 'media',
  'websocket', 'other', 'ping', 'csp_report'
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
    req.setTimeout(30000, () => reject(new Error('Timeout')));
  });
}


// Main build function
async function buildRules() {
  console.log('[Build] Starting rule compilation...');

  const rulesDir = path.join(__dirname, 'rules');
  if (!fs.existsSync(rulesDir)) {
    fs.mkdirSync(rulesDir, { recursive: true });
  }

  let ruleId = 1;
  let allRules = [];
  let stats = { total: 0, parsed: 0, failed: 0 };

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
        if (trimmed.includes('##') || trimmed.includes('#@#') || trimmed.includes('#?#')) continue; // Skip cosmetic filters

        const parsed = parseAbpFilter(trimmed);
        if (parsed) {
          const rule = createDnrRule(parsed, ruleId++, list.key, trimmed);
          if (rule) {
            // Validate rule
            if (rule.condition && rule.condition.resourceTypes) {
              const validTypes = ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'stylesheet', 'font', 'object', 'media', 'websocket', 'other', 'ping', 'csp_report'];
              const validTypesSet = new Set(['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'stylesheet', 'font', 'object', 'media', 'websocket', 'other', 'ping', 'csp_report']);
              rule.condition.resourceTypes = rule.condition.resourceTypes.filter(t => validTypesSet.has(t));
              if (rule.condition.resourceTypes.length > 0) {
                listRules.push(rule);
                listRuleCount++;
              }
            }
          }
        }

        console.log(`[Build] ${list.name}: ${listRuleCount} valid rules compiled`);
        stats.parsed += listRuleCount;
        allRules.push(...listRules);
        stats.total += listRuleCount;
      }
    } catch (error) {
      console.error(`[Build] Failed to process ${list.name}:`, error.message);
      stats.failed++;
    }
  }

  // Sort rules: domain-based rules (||domain^) first, then path-based rules
  // This ensures major ad networks are blocked even when hitting the 4500 rule limit
  allRules.sort((a, b) => {
    const aIsDomain = a.condition.urlFilter.startsWith('||');
    const bIsDomain = b.condition.urlFilter.startsWith('||');
    if (aIsDomain && !bIsDomain) return -1;
    if (!aIsDomain && bIsDomain) return 1;
    return 0;
  });

  // Priority list of major ad/tracker domains to ensure they're included
  const majorDomains = [
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

  // Create a priority map for faster lookup
  const domainPriority = new Map();
  majorDomains.forEach((domain, index) => {
    domainPriority.set(domain, majorDomains.length - index); // Higher index = higher priority
  });

  // Sort domain rules by priority (major domains first)
  const domainRules = allRules.filter(r => r.condition.urlFilter.startsWith('||'));
  const pathRules = allRules.filter(r => !r.condition.urlFilter.startsWith('||'));

  domainRules.sort((a, b) => {
    // Extract domain from urlFilter (||domain^)
    const aDomain = a.condition.urlFilter.slice(2, a.condition.urlFilter.indexOf('^'));
    const bDomain = b.condition.urlFilter.slice(2, b.condition.urlFilter.indexOf('^'));

    const aPriority = domainPriority.get(aDomain) || 0;
    const bPriority = domainPriority.get(bDomain) || 0;

    if (aPriority !== bPriority) return bPriority - aPriority; // Higher priority first

    // If both have same priority, sort alphabetically for consistency
    return aDomain.localeCompare(bDomain);
  });

  // Combine: major domains first, then remaining domain rules, then path rules
  allRules = [...domainRules, ...pathRules];

  // Cap total rules to stay within dynamic rule limit (leave room for custom rules)
  const MAX_RULES = 4500;
  if (allRules.length > 4500) {
    console.log(`[Build] Truncating rules from ${allRules.length} to 4500`);
    allRules.length = 4500;
  }

  // Reassign unique sequential IDs (1-4500) after truncation
  allRules.forEach((rule, index) => {
    rule.id = index + 1;
  });

  // Log statistics
  const domainRuleCount = allRules.filter(r => r.condition.urlFilter.startsWith('||')).length;
  const pathRuleCount = allRules.length - domainRuleCount;
  console.log(`[Build] Domain-based rules: ${domainRuleCount}, Path-based rules: ${pathRuleCount}`);

  // Write compiled rulesets
  console.log('[Build] Writing rulesets...');

  // Main block ruleset
  fs.writeFileSync(
    path.join(__dirname, 'rules', 'block-rules.json'),
    JSON.stringify(allRules, null, 2)
  );

  // Allow rules (empty for now)
  fs.writeFileSync(
    path.join(__dirname, 'rules', 'allow-rules.json'),
    JSON.stringify([], null, 2)
  );

  // Custom rules (empty)
  fs.writeFileSync(
    path.join(__dirname, 'rules', 'custom-rules.json'),
    JSON.stringify([], null, 2)
  );

  // Generate individual rulesets for each filter list
  for (const [key, list] of Object.entries(FILTER_LISTS)) {
    if (!list.enabled) continue;
    if (list.rulesetId) {
      // Re-fetch and compile individual ruleset
      try {
        const text = await fetchUrl(list.url);
        const lines = text.split('\n');
        let listRules = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) continue;
          if (trimmed.includes('##') || trimmed.includes('#@#') || trimmed.includes('#?#')) continue;

          const parsed = parseAbpFilter(trimmed);
          if (parsed) {
            const rule = createDnrRule(parsed, ruleId++, list.key, trimmed);
            if (rule) {
              rule.condition.resourceTypes = rule.condition.resourceTypes.filter(t =>
                ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'stylesheet', 'font', 'object', 'media', 'websocket', 'other', 'ping', 'csp_report'].includes(t)
              );
              if (rule.condition.resourceTypes.length > 0) {
                listRules.push(rule);
              }
            }
          }
        }

        // Write the ruleset once after processing all lines
        if (listRules.length > 0) {
          fs.writeFileSync(
            path.join(__dirname, 'rules', `${list.rulesetId}.json`),
            JSON.stringify(listRules, null, 2)
          );
          console.log(`[Build] Wrote ${listRules.length} rules to ${list.rulesetId}.json`);
        }
      } catch (error) {
        console.error(`[Build] Failed to create ruleset for ${list.name}:`, error.message);
      }
    }

    console.log(`[Build] Complete! Total rules: ${allRules.length}`);
    console.log(`[Build] Stats: parsed=${stats.parsed}, failed=${stats.failed}`);

    // Generate manifest update
    console.log('\n[Build] Don\'t forget to update manifest.json with the new rulesets!');
  }
}

// Run build
buildRules().catch(console.error);