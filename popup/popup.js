// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const els = {
    enabled: document.getElementById('enabled'),
    ytMode: document.getElementById('ytMode'),
    blocked: document.getElementById('blocked'),
    rate: document.getElementById('rate'),
    ytBlocked: document.getElementById('ytBlocked'),
    ytRate: document.getElementById('ytRate'),
    updateBtn: document.getElementById('updateBtn'),
    optionsBtn: document.getElementById('optionsBtn')
  };

  async function load() {
    const [settings, stats] = await Promise.all([
      chrome.storage.sync.get('settings'),
      chrome.runtime.sendMessage({ type: 'GET_STATS' })
    ]);

    const s = settings.settings || {};
    els.enabled.checked = s.enabled !== false;
    els.ytMode.value = s.youtubeMode || 'aggressive';

    if (stats) {
      els.blocked.textContent = stats.blocked?.toLocaleString() || 0;
      els.rate.textContent = (stats.blockRate || 0) + '%';
      els.ytBlocked.textContent = stats.youtubeBlocked?.toLocaleString() || 0;
      els.ytRate.textContent = (stats.youtubeBlockRate || 0) + '%';
    }
  }

  els.enabled.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({ type: 'TOGGLE_ENABLED', enabled: els.enabled.checked });
    load();
  });

  els.ytMode.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({ type: 'SET_YOUTUBE_MODE', mode: els.ytMode.value });
  });

  els.updateBtn.addEventListener('click', async () => {
    els.updateBtn.textContent = 'Updating...';
    els.updateBtn.disabled = true;
    const resp = await chrome.runtime.sendMessage({ type: 'FORCE_UPDATE' });
    els.updateBtn.textContent = 'Update Lists';
    els.updateBtn.disabled = false;
    if (resp.updated?.length) alert(`Updated ${resp.updated.length} filter lists`);
    load();
  });

  els.optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Refresh stats every 5s
  load();
  setInterval(load, 5000);
});