// stats-engine.js
export class StatsEngine {
  constructor() {
    this.stats = { blocked: 0, allowed: 0, youtubeBlocked: 0, byList: {} };
  }

  async init() {
    const { stats } = await chrome.storage.local.get('stats');
    if (stats) this.stats = stats;
  }

  trackBlocked(url, ruleId = 0, list = 'unknown') {
    this.stats.blocked++;
    this.stats.byList[list] = (this.stats.byList[list] || 0) + 1;
    if (url.includes('youtube.com') || url.includes('googlevideo.com') || url.includes('doubleclick.net') || url.includes('googlesyndication.com')) {
      this.stats.youtubeBlocked++;
    }
    this.save();
  }

  trackAllowed(url) {
    this.stats.allowed++;
    this.save();
  }

  getStats() {
    const total = this.stats.blocked + this.stats.allowed;
    return {
      ...this.stats,
      total,
      blockRate: total > 0 ? Math.round((this.stats.blocked / total) * 100) : 0,
      youtubeBlockRate: this.stats.youtubeBlocked > 0 ? Math.round((this.stats.youtubeBlocked / (this.stats.youtubeBlocked + (this.stats.allowed * 0.1))) * 100) : 0
    };
  }

  save() {
    chrome.storage.local.set({ stats: this.stats }).catch(() => {});
  }

  reset() {
    this.stats = { blocked: 0, allowed: 0, youtubeBlocked: 0, byList: {} };
    this.save();
  }
}