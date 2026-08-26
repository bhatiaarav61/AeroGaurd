// DNR Compiler - Converts filter lists to DNR rules
import { FilterListManager, ABPParser as FilterListParser, DNRConverter as DNRRuleConverter } from './filter-list-manager.js';
import { RuleOptimizer } from './rule-optimizer.js';

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid', 'mc_eid', 'yclid', '_ga', 'adlt',
  'gbraid', 'wbraid', 'ttclid', 'li_fat_id', 'twclid', 'igshid',
  'mc_cid', 'mc_eid'
];

export async function deployQueryStripperRules() {
  const rule = {
    id: 99999,
    priority: 200,
    action: {
      type: 'redirect',
      redirect: {
        transform: {
          queryTransform: {
            removeParams: TRACKING_PARAMS
          }
        }
      }
    },
    condition: {
      urlFilter: '*?*=*',
      resourceTypes: ['main_frame', 'sub_frame']
    }
  };

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [99999],
    addRules: [rule]
  });
  console.log('[AeroGuard Stripper] Tracking Parameter Stripper active.');
}

export async function deployUltraDnrEngine() {
  const filterListManager = new FilterListManager();
  await filterListManager.initialize();

  const allRules = [];

  // Get optimized rules from each filter list
  const rulesets = await filterListManager.getOptimizedRulesets();
  for (const [name, rules] of Object.entries(rulesets)) {
    const optimizer = new RuleOptimizer();
    const optimized = await optimizer.optimize(rules, name);
    console.log(`[DNR Compiler] ${name}: ${rules.length} -> ${optimized.length} rules`);
    allRules.push(...optimized);
  }

  return allRules;
}

// YouTube-specific DNR rules (high priority)
export async function deployYouTubeRules() {
  const ytDomains = ['youtube.com', 'youtube-nocookie.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'tv.youtube.com'];

  const rules = [];
  let id = 80000;

  const blockPatterns = [
    { url: '||youtube.com/api/stats/ads*', types: ['xmlhttprequest', 'fetch'] },
    { url: '||youtube.com/api/stats/qoe*', types: ['xmlhttprequest', 'fetch'] },
    { url: '||youtube.com/ptracking*', types: ['xmlhttprequest', 'fetch', 'ping'] },
    { url: '||youtube.com/pagead/*', types: ['xmlhttprequest', 'fetch', 'subdocument'] },
    { url: '||youtube.com/get_video_info*&adformat=*', types: ['xmlhttprequest', 'fetch'] },
    { url: '||youtube.com/get_video_info*&ad_type=*', types: ['xmlhttprequest', 'fetch'] },
    { url: '||youtube.com/get_video_info*&ad3_module=*', types: ['xmlhttprequest', 'fetch'] },
    { url: '||youtube.com/get_video_info*&afv_*', types: ['xmlhttprequest', 'fetch'] },
    { url: '||youtube.com/get_video_info*&vmap=*', types: ['xmlhttprequest', 'fetch'] },
    { url: '||youtube.com/get_video_info*&ad_tag=*', types: ['xmlhttprequest', 'fetch'] },
    { url: '||youtube.com/get_video_info*&ad_url=*', types: ['xmlhttprequest', 'fetch'] },
    { url: '||youtube.com/annotations_invideo*', types: ['xmlhttprequest', 'fetch'] },

    // Google ad domains
    { url: '||doubleclick.net/*', types: ['xmlhttprequest', 'fetch', 'subdocument', 'image', 'script'] },
    { url: '||googlesyndication.com/*', types: ['xmlhttprequest', 'fetch', 'subdocument', 'image', 'script'] },
    { url: '||googleadservices.com/*', types: ['xmlhttprequest', 'fetch', 'subdocument', 'image', 'script'] },
    { url: '||googletagmanager.com/*', types: ['xmlhttprequest', 'fetch', 'script'] },
    { url: '||googletagservices.com/*', types: ['xmlhttprequest', 'fetch', 'script'] },
    { url: '||pagead2.googlesyndication.com/*', types: ['xmlhttprequest', 'fetch', 'subdocument', 'image', 'script'] },
    { url: '||pubads.g.doubleclick.net/*', types: ['xmlhttprequest', 'fetch', 'subdocument', 'image', 'script'] },
    { url: '||securepubads.g.doubleclick.net/*', types: ['xmlhttprequest', 'fetch', 'subdocument', 'image', 'script'] },
    { url: '||adservice.google.com/*', types: ['xmlhttprequest', 'fetch', 'subdocument', 'image', 'script'] },

    // IMA SDK
    { url: '||imasdk.googleapis.com/*', types: ['script', 'xmlhttprequest', 'fetch'] },
    { url: '||imasdk.s3.amazonaws.com/*', types: ['script', 'xmlhttprequest', 'fetch'] },

    // YouTube ad player JS
    { url: '||s.ytimg.com/yts/jsbin/player-*ad*', types: ['script'] },
    { url: '||s.ytimg.com/yts/jsbin/*ima*', types: ['script'] },
    { url: '||s.ytimg.com/yts/jsbin/*ads*', types: ['script'] },

    // Ad subdomains
    { url: '||ads.youtube.com/*', types: ['xmlhttprequest', 'fetch', 'subdocument', 'image', 'script'] },
    { url: '||advertising.youtube.com/*', types: ['xmlhttprequest', 'fetch', 'subdocument', 'image', 'script'] },
    { url: '||partneradvertising.youtube.com/*', types: ['xmlhttprequest', 'fetch', 'subdocument', 'image', 'script'] },

    // Tracking pixels
    { url: '||googleads.g.doubleclick.net/pagead/viewthroughconversion/*', types: ['image', 'ping'] },
    { url: '||googleads.g.doubleclick.net/pagead/conversion/*', types: ['image', 'ping'] },
    { url: '||www.googleadservices.com/pagead/conversion/*', types: ['image', 'ping'] },
    { url: '||doubleclick.net/activity/*', types: ['image', 'ping'] },
    { url: '||fls.doubleclick.net/activityi/*', types: ['image', 'ping'] },
    { url: '||ad.doubleclick.net/activity/*', types: ['image', 'ping'] }
  ];

  for (const p of blockPatterns) {
    rules.push({
      id: id++,
      priority: 100,
      action: { type: 'block' },
      condition: {
        urlFilter: p.url,
        resourceTypes: p.types,
        initiatorDomains: ytDomains
      }
    });
  }

  // ALLOW rules (exceptions) - higher priority
  const allowPatterns = [
    { url: '||googlevideo.com/videoplayback*', types: ['media'] },
    { url: '||*.googlevideo.com/*', types: ['media'] },
    { url: '||youtube.com/api/stats/watchtime*', types: ['xmlhttprequest', 'fetch'] },
    { url: '||s.ytimg.com/yts/jsbin/player-*', types: ['script'] },
    { url: '||s.ytimg.com/yts/jsbin/www-embed-player*', types: ['script'] },
    { url: '||i.ytimg.com/*', types: ['image'] },
    { url: '||yt3.ggpht.com/*', types: ['image'] },
    { url: '||youtube.com/api/timedtext*', types: ['xmlhttprequest', 'fetch'] }
  ];

  let allowId = 90000;
  for (const p of allowPatterns) {
    rules.push({
      id: allowId++,
      priority: 2,
      action: { type: 'allow' },
      condition: {
        urlFilter: p.url,
        resourceTypes: p.types,
        initiatorDomains: ytDomains
      }
    });
  }

  return rules;
}