const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { parseAbpFilter, createDnrRule } = require("./background/abp-parser.js");

const MISSING_LISTS = {
  peterLowe: {
    id: "peterLowe",
    name: "Peter Lowe's List",
    url: "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext",
    category: "malware",
    enabled: true,
    rulesetId: "peterlowe",
    priority: 1
  },
  oisd: {
    id: "oisd",
    name: "OISD",
    url: "https://big.oisd.nl/",
    category: "ads",
    enabled: true,
    rulesetId: "oisd",
    priority: 1
  },
  adguardBase: {
    id: "adguardBase",
    name: "AdGuard Base",
    url: "https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/dns.txt",
    category: "ads",
    enabled: true,
    rulesetId: "adguard_base",
    priority: 1
  },
  adguardMobile: {
    id: "adguardMobile",
    name: "AdGuard Mobile",
    url: "https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/mobile_dns.txt",
    category: "ads",
    enabled: true,
    rulesetId: "adguard_mobile",
    priority: 1
  },
  adguardTracking: {
    id: "adguardTracking",
    name: "AdGuard Tracking",
    url: "https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/tracking.txt",
    category: "trackers",
    enabled: true,
    rulesetId: "adguard_tracking",
    priority: 1
  },
  adguardAnnoyances: {
    id: "adguardAnnoyances",
    name: "AdGuard Annoyances",
    url: "https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/annoyances.txt",
    category: "annoyances",
    enabled: true,
    rulesetId: "adguard_annoyances",
    priority: 1
  },
  adguardSocial: {
    id: "adguardSocial",
    name: "AdGuard Social",
    url: "https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/social.txt",
    category: "social",
    enabled: true,
    rulesetId: "adguard_social",
    priority: 1
  },
  nocoin: {
    id: "nocoin",
    name: "NoCoin",
    url: "https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/nocoin.txt",
    category: "malware",
    enabled: true,
    rulesetId: "nocoin",
    priority: 1
  },
  fanboySocial: {
    id: "fanboySocial",
    name: "Fanboy Social",
    url: "https://easylist.to/easylist/fanboy-social.txt",
    category: "social",
    enabled: true,
    rulesetId: "fanboy_social",
    priority: 1
  }
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error("HTTP " + res.statusCode + ": " + res.statusMessage));
        return;
      }
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

async function buildRulesForList(list, baseId) {
  let ruleId = baseId;
  let listRules = [];

  try {
    console.log("[Fetch] Downloading " + list.name + " from " + list.url + "...");
    const text = await fetchUrl(list.url);
    console.log("[Fetch] Downloaded " + text.length + " bytes for " + list.name);

    const lines = text.split("\n");
    let parsed = 0, failed = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("!") || trimmed.startsWith("[")) continue;
      if (trimmed.includes("##") || trimmed.includes("#@#") || trimmed.includes("#?#")) continue;

      try {
        const parsedFilter = parseAbpFilter(trimmed);
        if (parsedFilter) {
          const rule = createDnrRule(parsedFilter, ruleId, list.id, trimmed);
          if (rule) {
            rule.condition.resourceTypes = rule.condition.resourceTypes.filter(t =>
              ["main_frame", "sub_frame", "script", "xmlhttprequest", "image", "stylesheet", "font", "object", "media", "websocket", "other", "ping", "csp_report"].includes(t)
            );
            if (rule.condition.resourceTypes.length > 0) {
              listRules.push(rule);
              ruleId++;
              parsed++;
            }
          }
        } catch (e) {
          failed++;
        }
      } catch (e) {
        failed++;
      }
    }

    console.log("[Fetch] " + list.name + ": parsed " + parsed + " rules, failed " + failed);
  } catch (error) {
    console.error("[Fetch] Failed to fetch " + list.name + ":", error.message);
  }

  return { rules: listRules, nextId: ruleId };
}

async function main() {
  console.log("[Fetch] Starting missing filter list fetch...\n");
  
  let currentId = 1000000;
  
  for (const [key, list] of Object.entries(MISSING_LISTS)) {
    const { rules, nextId } = await buildRulesForList(list, currentId);
    currentId = nextId;

    if (rules.length > 0) {
      const outputPath = path.join(__dirname, "rules", list.rulesetId + ".json");
      fs.writeFileSync(outputPath, JSON.stringify(rules, null, 2));
      console.log("[Fetch] Wrote " + rules.length + " rules to " + list.rulesetId + ".json\n");
    } else {
      console.log("[Fetch] No rules generated for " + list.name + "\n");
    }
  }

  console.log("[Fetch] Complete!");
  console.log("[Fetch] Remember to rebuild the main block-rules.json using build-rules.js");
}

main().catch(console.error);
