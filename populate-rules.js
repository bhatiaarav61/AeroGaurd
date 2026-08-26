/**
 * Quick script to populate filter list JSON files for the manifest's static rulesets
 * Run with: node populate-rules.js
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { parseAbpFilter, createDnrRule, convertToUrlFilter, parseFilterList, filterValidRules } from './background/abp-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Only the filter lists referenced in manifest.json static rulesets
const MANIFEST_LISTS = {
  easylist: {
    id: 'easylist',
    name: 'EasyList',
    url: 'https://easylist.to/easylist/easylist.txt',
    rulesetId: 'easylist',
    ruleIdBase: 10000
  },
  easyprivacy: {
    id: 'easyprivacy',
    name: 'EasyPrivacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    rulesetId: 'easyprivacy',
    ruleIdBase: 20000
  },
  fanboy_annoyances: {
    id: 'fanboy_annoyances',
    name: 'Fanboy Annoyances',
    url: 'https://easylist.to/easylist/fanboy-annoyance.txt',
    rulesetId: 'fanboy_annoyances',
    ruleIdBase: 30000
  },
  fanboy_social: {
    id: 'fanboy_social',
    name: 'Fanboy Social',
    url: 'https://easylist.to/easylist/fanboy-social.txt',
    rulesetId: 'fanboy_social',
    ruleIdBase: 40000
  },
  ublock_filters: {
    id: 'ublock_filters',
    name: 'uBlock Filters',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
    rulesetId: 'ublock_filters',
    ruleIdBase: 50000
  },
  ublock_privacy: {
    id: 'ublock_privacy',
    name: 'uBlock Privacy',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt',
    rulesetId: 'ublock_privacy',
    ruleIdBase: 60000
  },
  ublock_badware: {
    id: 'ublock_badware',
    name: 'uBlock Badware',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt',
    rulesetId: 'ublock_badware',
    ruleIdBase: 70000
  },
  ublock_annoyances: {
    id: 'ublock_annoyances',
    name: 'uBlock Annoyances',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances.txt',
    rulesetId: 'ublock_annoyances',
    ruleIdBase: 80000
  },
  easylist_cookie: {
    id: 'easylist_cookie',
    name: 'EasyList Cookie',
    url: 'https://secure.fanboy.co.nz/fanboy-cookiemonster.txt',
    rulesetId: 'easylist_cookie',
    ruleIdBase: 90000
  },
  anti_adblock: {
    id: 'anti_adblock',
    name: 'Anti-Adblock Killer',
    url: 'https://raw.githubusercontent.com/reek/anti-adblock-killer/master/anti-adblock-killer-filters.txt',
    rulesetId: 'anti_adblock',
    ruleIdBase: 100000
  },
  easylist_germany: {
    id: 'easylist_germany',
    name: 'EasyList Germany',
    url: 'https://easylist.to/easylist/easylistgermany.txt',
    rulesetId: 'easylist_germany',
    ruleIdBase: 110000
  },
  easylist_france: {
    id: 'easylist_france',
    name: 'EasyList France',
    url: 'https://easylist.to/easylist/easylistfr.txt',
    rulesetId: 'easylist_france',
    ruleIdBase: 120000
  },
  easylist_china: {
    id: 'easylist_china',
    name: 'EasyList China',
    url: 'https://easylist.to/easylist/easylistchina.txt',
    rulesetId: 'easylist_china',
    ruleIdBase: 130000
  },
  easylist_italy: {
    id: 'easylist_italy',
    name: 'EasyList Italy',
    url: 'https://easylist.to/easylist/easylistitaly.txt',
    rulesetId: 'easylist_italy',
    ruleIdBase: 140000
  },
  easylist_spain: {
    id: 'easylist_spain',
    name: 'EasyList Spain',
    url: 'https://easylist.to/easylist/easylistspain.txt',
    rulesetId: 'easylist_spain',
    ruleIdBase: 150000
  },
  easylist_poland: {
    id: 'easylist_poland',
    name: 'EasyList Poland',
    url: 'https://easylist.to/easylist/easylistpoland.txt',
    rulesetId: 'easylist_poland',
    ruleIdBase: 160000
  },
  easylist_netherlands: {
    id: 'easylist_netherlands',
    name: 'EasyList Netherlands',
    url: 'https://easylist.to/easylist/easylistnetherlands.txt',
    rulesetId: 'easylist_netherlands',
    ruleIdBase: 170000
  },
  easylist_taiwan: {
    id: 'easylist_taiwan',
    name: 'EasyList Taiwan',
    url: 'https://easylist.to/easylist/easylisttaiwan.txt',
    rulesetId: 'easylist_taiwan',
    ruleIdBase: 180000
  },
  youtube_ads: {
    id: 'youtube_ads',
    name: 'YouTube Ads',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/youtube.txt',
    rulesetId: 'youtube_ads',
    ruleIdBase: 190000
  }
};

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

async function compileList(list) {
  console.log(`[Populate] Fetching ${list.name}...`);
  const text = await fetchUrl(list.url);
  console.log(`[Populate] Fetched ${list.name}: ${(text.length / 1024).toFixed(1)} KB`);

  const lines = text.split('\n');
  let listRules = [];
  let ruleId = list.ruleIdBase;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) continue;
    if (trimmed.includes('##') || trimmed.includes('#@#') || trimmed.includes('#?#') || trimmed.includes('#%#')) continue; // Skip cosmetic filters

    try {
      const parsed = parseAbpFilter(trimmed);
      if (parsed) {
        const rule = createDnrRule(parsed, ruleId++, list.id, trimmed);
        if (rule && rule.condition && rule.condition.resourceTypes) {
          rule.condition.resourceTypes = rule.condition.resourceTypes.filter(t =>
            ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'stylesheet', 'font', 'object', 'media', 'websocket', 'other', 'ping', 'csp_report'].includes(t)
          );
          if (rule.condition.resourceTypes.length > 0) {
            listRules.push(rule);
          }
        }
      }
    } catch (e) {
      // Skip invalid rules
    }
  }

  console.log(`[Populate] ${list.name}: ${listRules.length} valid rules compiled`);
  return listRules;
}

async function main() {
  console.log('[Populate] Starting filter list population...');

  const rulesDir = path.join(__dirname, 'rules');
  if (!fs.existsSync(rulesDir)) {
    fs.mkdirSync(rulesDir, { recursive: true });
  }

  for (const [key, list] of Object.entries(MANIFEST_LISTS)) {
    try {
      const rules = await compileList(list);
      if (rules.length > 0) {
        fs.writeFileSync(
          path.join(rulesDir, `${list.rulesetId}.json`),
          JSON.stringify(rules, null, 2)
        );
        console.log(`[Populate] ✅ Wrote ${rules.length} rules to rules/${list.rulesetId}.json`);
      } else {
        fs.writeFileSync(
          path.join(rulesDir, `${list.rulesetId}.json`),
          JSON.stringify([], null, 2)
        );
        console.log(`[Populate] ⚠️ Wrote empty array to rules/${list.rulesetId}.json`);
      }
    } catch (error) {
      console.error(`[Populate] ❌ Failed ${list.name}:`, error.message);
      // Write empty array so manifest doesn't fail
      fs.writeFileSync(
        path.join(rulesDir, `${list.rulesetId}.json`),
        JSON.stringify([], null, 2)
      );
    }
  }

  // Also write custom.json as empty
  fs.writeFileSync(
    path.join(rulesDir, 'custom.json'),
    JSON.stringify([], null, 2)
  );

  console.log('\n[Populate] Complete! Reload the extension.');
}

main().catch(console.error);