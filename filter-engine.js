// filter-engine.js — 15 Premium Filter Lists
export const DEFAULT_LISTS = [
  // Core (3)
  { id: 'easylist', name: 'EasyList', url: 'https://easylist.to/easylist/easylist.txt', enabled: true, ruleIdBase: 100000, category: 'core' },
  { id: 'easyprivacy', name: 'EasyPrivacy', url: 'https://easylist.to/easylist/easyprivacy.txt', enabled: true, ruleIdBase: 200000, category: 'core' },
  { id: 'peterlowe', name: "Peter Lowe's List", url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext', enabled: true, ruleIdBase: 300000, category: 'core' },

  // Annoyances (2)
  { id: 'fanboy_annoyances', name: 'Fanboy Annoyances', url: 'https://easylist.to/easylist/fanboy-annoyance.txt', enabled: true, ruleIdBase: 400000, category: 'annoyances' },
  { id: 'fanboy_social', name: 'Fanboy Social', url: 'https://easylist.to/easylist/fanboy-social.txt', enabled: true, ruleIdBase: 500000, category: 'annoyances' },

  // uBlock Origin (4) — Highest quality
  { id: 'ublock_filters', name: 'uBlock Filters', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt', enabled: true, ruleIdBase: 600000, category: 'ublock' },
  { id: 'ublock_privacy', name: 'uBlock Privacy', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt', enabled: true, ruleIdBase: 700000, category: 'ublock' },
  { id: 'ublock_badware', name: 'uBlock Badware', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt', enabled: true, ruleIdBase: 800000, category: 'ublock' },
  { id: 'ublock_annoyances', name: 'uBlock Annoyances', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances.txt', enabled: true, ruleIdBase: 900000, category: 'ublock' },

  // Specialized (2)
  { id: 'easylist_cookie', name: 'EasyList Cookie', url: 'https://easylist.to/easylist/easylist-cookie.txt', enabled: true, ruleIdBase: 1000000, category: 'specialized' },
  { id: 'anti_adblock', name: 'Anti-Adblock Killer', url: 'https://raw.githubusercontent.com/reek/anti-adblock-killer/master/anti-adblock-killer-filters.txt', enabled: true, ruleIdBase: 1100000, category: 'specialized' },

  // Regional (5)
  { id: 'easylist_germany', name: 'EasyList Germany', url: 'https://easylist.to/easylist/easylistgermany.txt', enabled: true, ruleIdBase: 1200000, category: 'regional' },
  { id: 'easylist_france', name: 'EasyList France', url: 'https://easylist.to/easylist/easylistfr.txt', enabled: true, ruleIdBase: 1300000, category: 'regional' },
  { id: 'easylist_china', name: 'EasyList China', url: 'https://easylist.to/easylist/easylistchina.txt', enabled: true, ruleIdBase: 1400000, category: 'regional' },
  { id: 'easylist_italy', name: 'EasyList Italy', url: 'https://easylist.to/easylist/easylistitaly.txt', enabled: true, ruleIdBase: 1500000, category: 'regional' },
  { id: 'easylist_spain', name: 'EasyList Spain', url: 'https://easylist.to/easylist/easylistspain.txt', enabled: true, ruleIdBase: 1600000, category: 'regional' }
];

const VALID_TYPES = ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'stylesheet', 'font', 'object', 'media', 'websocket', 'other', 'ping', 'csp_report'];

const TYPE_MAP = {
  script: 'script', image: 'image', stylesheet: 'stylesheet', object: 'object',
  xmlhttprequest: 'xmlhttprequest', subdocument: 'sub_frame', document: 'main_frame',
  elemhide: 'other', font: 'font', media: 'media', websocket: 'websocket',
  ping: 'ping', csp: 'csp_report', cookie: 'cookie'
};

export class FilterEngine {
  constructor() {
    this.lists = new Map();
    this.cache = new Map();
  }

  async initialize(enabledIds = []) {
    for (const list of DEFAULT_LISTS) {
      list.enabled = enabledIds.includes(list.id);
      this.lists.set(list.id, { ...list, rules: [], lastUpdated: null, etag: null, errorCount: 0 });
    }
    await this.loadCache();
    const enabled = Array.from(this.lists.values()).filter(l => l.enabled);
    await Promise.allSettled(enabled.map(l => this.fetchAndParse(l)));
  }

  async fetchAndParse(list) {
    const headers = {};
    if (list.etag) headers['If-None-Match'] = list.etag;
    if (list.lastModified) headers['If-Modified-Since'] = list.lastModified;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const resp = await fetch(list.url, { headers, signal: controller.signal });
      clearTimeout(timeout);

      if (resp.status === 304) return false;
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const text = await resp.text();
      const etag = resp.headers.get('etag');
      const lastModified = resp.headers.get('last-modified');

      const parsed = this.parseABP(text, list.id);
      if (parsed.length === 0) throw new Error('No valid rules');

      const dnrRules = this.convertToDNR(parsed, list.ruleIdBase, list.id);

      this.lists.set(list.id, {
        ...list,
        rules: dnrRules,
        lastUpdated: new Date().toISOString(),
        etag,
        lastModified,
        errorCount: 0
      });

      await this.saveCache(list.id, dnrRules, list.lastUpdated, etag, lastModified);
      console.log(`[FilterEngine] ${list.name}: ${dnrRules.length} DNR rules`);
      return true;
    } catch (e) {
      clearTimeout(timeout);
      // Fallback to cache
      const cached = this.cache.get(list.id);
      if (cached?.rules?.length) {
        this.lists.set(list.id, { ...list, rules: cached.rules, lastUpdated: cached.lastUpdated, etag: cached.etag, lastModified: cached.lastModified, errorCount: (list.errorCount || 0) + 1 });
        return false;
      }
      throw e;
    }
  }

  parseABP(text, listId) {
    const rules = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line || line.startsWith('!') || line.startsWith('[')) continue;

      const isException = line.startsWith('@@');
      if (isException) line = line.substring(2);

      const optionMatch = line.match(/\$(.+)$/);
      const cleanLine = line.replace(/\$.*$/, '');
      const options = this.parseOptions(optionMatch ? optionMatch[1] : '');

      let parsed = null;

      // Domain: ||example.com^
      const domainMatch = cleanLine.match(/^\|\|([^/\^]+)(\^|$)/);
      if (domainMatch) parsed = { type: 'domain', domain: domainMatch[1].toLowerCase(), options };

      // URL pattern
      else if (cleanLine.includes('/') || cleanLine.includes('*') || cleanLine.includes('?')) {
        parsed = { type: 'url', pattern: cleanLine.replace(/^\||\|$/g, ''), options };
      }

      // Regex: /pattern/
      else if (cleanLine.match(/^\/(.+)\/([a-z]*)$/)) {
        const m = cleanLine.match(/^\/(.+)\/([a-z]*)$/);
        parsed = { type: 'regex', pattern: m[1], flags: m[2], options };
      }

      if (parsed) {
        rules.push({ ...parsed, isException, listId, raw: lines[i] });
      }
    }
    return rules;
  }

  parseOptions(optStr) {
    const opts = { domains: [], excludeDomains: [], thirdParty: null, matchCase: false, resourceTypes: [], important: false };
    if (!optStr) return opts;

    for (const opt of optStr.split(',')) {
      const [key, val] = opt.split('=').map(s => s.trim());
      switch (key) {
        case 'domain':
          if (val) {
            const d = val.split('|');
            opts.domains = d.filter(x => !x.startsWith('~')).map(x => x.toLowerCase());
            opts.excludeDomains = d.filter(x => x.startsWith('~')).map(x => x.substring(1).toLowerCase());
          }
          break;
        case 'third-party': opts.thirdParty = true; break;
        case '~third-party': opts.thirdParty = false; break;
        case 'match-case': opts.matchCase = true; break;
        case 'important': opts.important = true; break;
        default:
          if (TYPE_MAP[key]) opts.resourceTypes.push(TYPE_MAP[key]);
      }
    }
    return opts;
  }

  convertToDNR(parsed, baseId, listId) {
    return parsed.map((r, i) => {
      const rule = { id: baseId + i, priority: r.isException ? 2 : 1, action: r.isException ? { type: 'allow' } : { type: 'block' }, condition: {} };
      const o = r.options || {};

      if (r.type === 'domain') rule.condition.urlFilter = `||${r.domain}^`;
      else if (r.type === 'url') rule.condition.urlFilter = r.pattern;
      else if (r.type === 'regex') rule.condition.regexFilter = r.pattern;

      if (o.domains?.length) rule.condition.initiatorDomains = o.domains;
      if (o.excludeDomains?.length) rule.condition.excludedInitiatorDomains = o.excludeDomains;
      if (o.resourceTypes?.length) rule.condition.resourceTypes = o.resourceTypes.filter(t => VALID_TYPES.includes(t));
      else rule.condition.resourceTypes = VALID_TYPES.filter(t => t !== 'main_frame');
      if (o.thirdParty !== null) rule.condition.domainType = o.thirdParty ? 'thirdParty' : 'firstParty';
      if (o.matchCase) rule.condition.isUrlFilterCaseSensitive = true;

      if (!rule.condition.urlFilter && !rule.condition.regexFilter) return null;
      return rule;
    }).filter(Boolean);
  }

  getDNRRules() {
    const rules = [];
    for (const [, list] of this.lists) {
      if (list.enabled && list.rules) rules.push(...list.rules);
    }
    return rules;
  }

  getStatus() {
    const status = {};
    for (const [id, list] of this.lists) {
      status[id] = { name: list.name, enabled: list.enabled, ruleCount: list.rules?.length || 0, lastUpdated: list.lastUpdated, category: list.category };
    }
    return status;
  }

  toggleList(id, enabled) {
    const list = this.lists.get(id);
    if (list) { list.enabled = enabled; this.lists.set(id, list); }
  }

  setEnabledLists(ids) {
    for (const [id, list] of this.lists) { list.enabled = ids.includes(id); this.lists.set(id, list); }
  }

  async updateAll() {
    const enabled = Array.from(this.lists.values()).filter(l => l.enabled);
    const results = await Promise.allSettled(enabled.map(l => this.fetchAndParse(l)));
    return enabled.filter((_, i) => results[i].status === 'fulfilled' && results[i].value === true).map(l => l.id);
  }

  async loadCache() {
    const { filterCache } = await chrome.storage.local.get('filterCache');
    if (filterCache) {
      for (const [id, data] of Object.entries(filterCache)) {
        if (this.lists.has(id) && data.rules) {
          this.cache.set(id, data);
          const l = this.lists.get(id);
          l.rules = data.rules; l.lastUpdated = data.lastUpdated; l.etag = data.etag; l.lastModified = data.lastModified;
          this.lists.set(id, l);
        }
      }
    }
  }

  async saveCache(id, rules, lastUpdated, etag, lastModified) {
    const { filterCache = {} } = await chrome.storage.local.get('filterCache');
    filterCache[id] = { rules, lastUpdated, etag, lastModified, ruleCount: rules.length };
    await chrome.storage.local.set({ filterCache });
    this.cache.set(id, filterCache[id]);
  }
}