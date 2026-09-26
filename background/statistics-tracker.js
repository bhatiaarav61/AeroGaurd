/**
 * Statistics Tracker
 * Counts actually-blocked requests (from declarativeNetRequest.onRuleMatchedDebug),
 * categorized by which ruleset produced the match. Aggregates are persisted to
 * storage.local; per-tab counts live in memory.
 */

import storageEngine from './storage-engine.js';

const CATEGORIES = ['ads', 'trackers', 'malware', 'annoyances', 'social', 'cookieNotices', 'other'];
const STORE_KEY = 'stats';
const PERSIST_EVERY = 20; // blocks

function emptyCounts() {
  const counts = { blocked: 0 };
  for (const c of CATEGORIES) counts[c] = 0;
  return counts;
}

class StatisticsTracker {
  constructor() {
    this.totals = emptyCounts();
    this.perTab = new Map(); // tabId => counts
    this.ready = false;
    this.persistCounter = 0;
    this.persistTimer = null;
  }

  /** Load persisted aggregate totals. */
  async init() {
    if (this.ready) return;
    try {
      const stored = await storageEngine.get(STORE_KEY, { backend: 'local' });
      if (stored[STORE_KEY]) {
        this.totals = { ...emptyCounts(), ...stored[STORE_KEY] };
      }
    } catch { /* first run */ }
    this.ready = true;
  }

  /** Called by the service worker for every matched rule. */
  recordMatch(tabId, url, ruleId) {
    if (!this.ready) this.init();
    const category = this.categorize(ruleId);
    this.bump(this.totals, category);
    const id = Number.isInteger(tabId) ? tabId : -1;
    if (id >= 0) {
      if (!this.perTab.has(id)) this.perTab.set(id, emptyCounts());
      this.bump(this.perTab.get(id), category);
    }
    if (++this.persistCounter % PERSIST_EVERY === 0) this.persist();
  }

  bump(counts, category) {
    counts.blocked++;
    counts[category] = (counts[category] || 0) + 1;
  }

  /** Map a DNR rule id back to the category of the ruleset it came from. */
  categorize(ruleId) {
    const id = Number(ruleId) || 0;
    const slot = Math.floor((id - 1) / 100000);
    const category = this.slotCategories?.[slot];
    return CATEGORIES.includes(category) ? category : 'other';
  }

  /** The service worker supplies slot => category from the ruleset index. */
  setSlotCategories(map) {
    this.slotCategories = map || {};
  }

  getTabStats(tabId) {
    const counts = this.perTab.get(tabId) || emptyCounts();
    return {
      blockedCount: counts.blocked,
      blocked: counts.blocked,
      blockedByType: {
        ads: counts.ads || 0,
        trackers: counts.trackers || 0,
        malware: counts.malware || 0,
        annoyances: counts.annoyances || 0,
        social: counts.social || 0,
        cookieNotices: counts.cookieNotices || 0
      }
    };
  }

  getStats() {
    return {
      totalBlocked: this.totals.blocked,
      blockedCount: this.totals.blocked,
      blocked: this.totals.blocked,
      blockedByType: {
        ads: this.totals.ads || 0,
        trackers: this.totals.trackers || 0,
        malware: this.totals.malware || 0,
        annoyances: this.totals.annoyances || 0,
        social: this.totals.social || 0,
        cookieNotices: this.totals.cookieNotices || 0
      },
      totalDomains: this.totals.blocked,
      totalRequests: this.totals.blocked,
      lastUpdated: Date.now()
    };
  }

  async persist() {
    try {
      await storageEngine.set({ [STORE_KEY]: this.totals }, { backend: 'local' });
    } catch { /* storage may be unavailable during shutdown */ }
  }

  async reset() {
    this.totals = emptyCounts();
    this.perTab.clear();
    await this.persist();
  }

  // ---- legacy API kept for compatibility ----
  trackBlocked(url, ruleId = 0, filterList = 'unknown') {
    this.recordMatch(-1, url, ruleId);
  }

  trackAllowed(url) { /* allowed requests are not counted */ }

  recordBlock(domain, requestId) {
    this.recordMatch(-1, 'https://' + domain, requestId);
  }

  recordBlockedRequest(domain, requestId) {
    this.recordMatch(-1, 'https://' + domain, requestId);
  }

  getMetrics() {
    return this.getStats();
  }

  updateTimestamp() { /* timestamps are derived at read time */ }
}

export default StatisticsTracker;
export { StatisticsTracker };
