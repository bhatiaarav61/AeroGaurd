/**
 * Filter List Manager
 *
 * Blocking is done by the static DNR rulesets declared in manifest.json
 * (compiled by build-rules.js). This manager reads their metadata from
 * rules/ruleset-index.json, reports status to the UIs and applies
 * enable/disable changes through chrome.declarativeNetRequest.
 */

const INDEX_URL = 'rules/ruleset-index.json';

// Keys the UIs use that are categories or aliases rather than ruleset ids.
const CATEGORY_ALIASES = {
  easylistCookie: '@category:annoyances',
  easylistcookie: '@category:annoyances',
  malware: '@category:malware',
  annoyances: '@category:annoyances',
  social: '@category:social',
  ads: '@category:ads',
  trackers: '@category:trackers',
  cookieNotices: '@category:cookieNotices'
};

class FilterListManager {
  constructor() {
    this.index = { built: 0, totalRules: 0, rulesets: {} };
    this.disabledLists = [];
    this.initialized = false;
  }

  /** Load ruleset metadata and sync enabled state. */
  async initialize(disabledLists = []) {
    this.disabledLists = Array.isArray(disabledLists) ? [...disabledLists] : [];
    try {
      const res = await fetch(chrome.runtime.getURL(INDEX_URL));
      if (res.ok) this.index = await res.json();
    } catch (e) {
      console.warn('[FilterListManager] Failed to load ruleset index:', e.message);
    }
    this.initialized = true;
    console.log(`[FilterListManager] Index loaded: ${this.getListIds().length} rulesets, ${this.index.totalRules} rules`);
  }

  getListIds() {
    return Object.keys(this.index.rulesets || {});
  }

  manifestIdOf(rulesetId) {
    return 'ruleset_' + rulesetId;
  }

  /** All manifest ruleset ids ("ruleset_xxx"). */
  getManifestIds() {
    return this.getListIds().map(id => this.manifestIdOf(id));
  }

  /** slot (idBase/100000) => category, for statistics categorization. */
  getSlotCategories() {
    const map = {};
    for (const [id, meta] of Object.entries(this.index.rulesets || {})) {
      if (meta.idBase) map[meta.idBase / 100000] = meta.category || 'other';
    }
    return map;
  }

  /** Resolve a UI key ("easylist", "malware", "easylistCookie") to ruleset ids. */
  resolveListKeys(key) {
    if (!key) return [];
    const ids = this.getListIds();
    if (ids.includes(key)) return [key];
    const alias = CATEGORY_ALIASES[key];
    if (alias?.startsWith('@category:')) {
      const category = alias.slice('@category:'.length);
      return ids.filter(id => this.index.rulesets[id].category === category);
    }
    if (alias && ids.includes(alias)) return [alias];
    // substring match as a last resort (e.g. "adguard" toggles all adguard lists)
    return ids.filter(id => id.includes(key.toLowerCase()));
  }

  /** Which ruleset ids are enabled in DNR right now. */
  async getEnabledIds() {
    try {
      const enabled = new Set(await chrome.declarativeNetRequest.getEnabledRulesets());
      return this.getListIds().filter(id => enabled.has(this.manifestIdOf(id)));
    } catch {
      return this.getListIds().filter(id => !this.disabledLists.includes(id));
    }
  }

  /** Array status for popup/options. */
  async getStatus() {
    const enabled = new Set(await this.getEnabledIds());
    return this.getListIds().map(id => {
      const meta = this.index.rulesets[id];
      return {
        id,
        name: meta.name || id,
        category: meta.category || 'ads',
        description: meta.description || '',
        homepage: meta.homepage || '',
        ruleCount: meta.ruleCount || 0,
        size: meta.size || 0,
        enabled: enabled.has(id),
        lastUpdated: this.index.built || 0
      };
    }).sort((a, b) => b.ruleCount - a.ruleCount);
  }

  /**
   * Enable/disable via the DNR API and remember the choice.
   * Accepts a concrete ruleset id ("easylist"), a UI key ("malware",
   * "easylistCookie") or a category — returns { changed, disabled } so the
   * popup/options UIs can refresh. Uses enableRuleset/disableRuleset, the
   * only keys Chrome's updateEnabledRulesets accepts.
   */
  async toggleList(rulesetId, enabled) {
    const ids = this.resolveListKeys(rulesetId);
    const targets = ids.length > 0 ? ids : [rulesetId];
    for (const id of targets) {
      if (enabled) this.disabledLists = this.disabledLists.filter(x => x !== id);
      else if (!this.disabledLists.includes(id)) this.disabledLists.push(id);
    }
    const manifestIds = targets.map((id) => this.manifestIdOf(id));
    try {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: enabled ? manifestIds : [],
        disableRulesetIds: enabled ? [] : manifestIds
      });
    } catch (e) {
      console.warn(`[FilterListManager] toggleList(${rulesetId}):`, e.message);
    }
    try {
      const { storageEngine } = await import('./storage-engine.js');
      const current = await storageEngine.get('settings', { backend: 'sync' });
      await storageEngine.set('settings', { ...(current.settings || {}), disabledLists: this.disabledLists }, { backend: 'sync' });
    } catch { /* persistence is best-effort */ }
    return { changed: targets, disabled: [...this.disabledLists] };
  }

  /**
   * Legacy API: static lists are updated with extension updates, so there is
   * nothing to fetch at runtime. Returns the list of rulesets re-synced.
   */
  async updateAll() {
    const enabled = await this.getEnabledIds();
    return enabled;
  }

  /** Legacy API kept so old callers keep working; blocking is static now. */
  getOptimizedRulesets() {
    return {};
  }

  getAvailableLists() {
    return this.getListIds();
  }

  isEnabled(listId) {
    return !this.disabledLists.includes(listId);
  }

  enableList(listId) {
    this.disabledLists = this.disabledLists.filter(x => x !== listId);
  }

  disableList(listId) {
    if (!this.disabledLists.includes(listId)) this.disabledLists.push(listId);
  }

  clear() {
    this.index = { built: 0, totalRules: 0, rulesets: {} };
  }
}

export const DEFAULT_FILTER_LISTS = [
  'easylist', 'easyprivacy', 'ublock_filters', 'ublock_badware',
  'ublock_privacy', 'ublock_unbreak', 'ublock_resource_abuse',
  'adguard_base', 'adguard_tracking', 'adguard_annoyances', 'annoyances_plus',
  'adguard_social', 'adguard_dns', 'fanboy_annoyances',
  'fanboy_social', 'peterlowe', 'nocoin'
];

export { FilterListManager };
export default FilterListManager;
