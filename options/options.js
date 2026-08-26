// options.js
document.addEventListener('DOMContentLoaded', async () => {
  const { settings = {} } = await chrome.storage.sync.get('settings');
  const s = settings || {};
  const filterEngine = { DEFAULT_LISTS: [
    { id: 'easylist', name: 'EasyList', category: 'core' },
    { id: 'easyprivacy', name: 'EasyPrivacy', category: 'core' },
    { id: 'peterlowe', name: "Peter Lowe's List", category: 'core' },
    { id: 'fanboy_annoyances', name: 'Fanboy Annoyances', category: 'annoyances' },
    { id: 'fanboy_social', name: 'Fanboy Social', category: 'annoyances' },
    { id: 'ublock_filters', name: 'uBlock Filters', category: 'ublock' },
    { id: 'ublock_privacy', name: 'uBlock Privacy', category: 'ublock' },
    { id: 'ublock_badware', name: 'uBlock Badware', category: 'ublock' },
    { id: 'ublock_annoyances', name: 'uBlock Annoyances', category: 'ublock' },
    { id: 'easylist_cookie', name: 'EasyList Cookie', category: 'specialized' },
    { id: 'anti_adblock', name: 'Anti-Adblock Killer', category: 'specialized' },
    { id: 'easylist_germany', name: 'EasyList Germany', category: 'regional' },
    { id: 'easylist_france', name: 'EasyList France', category: 'regional' },
    { id: 'easylist_china', name: 'EasyList China', category: 'regional' },
    { id: 'easylist_italy', name: 'EasyList Italy', category: 'regional' },
    { id: 'easylist_spain', name: 'EasyList Spain', category: 'regional' }
  ]};

  const enabledLists = s.filterLists || filterEngine.DEFAULT_LISTS.map(l => l.id);
  const customRules = s.customRules || [];

  document.getElementById('enabled').checked = s.enabled !== false;
  document.getElementById('ytMode').value = s.youtubeMode || 'aggressive';

  // Render filter lists
  const grid = document.getElementById('listGrid');
  grid.innerHTML = filterEngine.DEFAULT_LISTS.map(list => `
    <label class="list-item">
      <input type="checkbox" value="${list.id}" ${enabledLists.includes(list.id) ? 'checked' : ''}>
      <span>${list.name}</span>
      <span class="list-meta">${list.category}</span>
    </label>
  `).join('');

  // Render custom rules
  const crDiv = document.getElementById('customRules');
  function renderRules() {
    crDiv.innerHTML = customRules.map((r, i) => `
      <div class="custom-rule">
        <input type="text" value="${r.pattern || ''}" data-idx="${i}" class="rule-pattern" placeholder="||example.com^">
        <select data-idx="${i}" class="rule-action"><option value="block" ${r.action==='block'?'selected':''}>Block</option><option value="allow" ${r.action==='allow'?'selected':''}>Allow</option></select>
        <button class="btn btn-danger" data-idx="${i}" title="Delete">🗑️</button>
      </div>
    `).join('');
  }
  renderRules();

  // Event listeners
  document.getElementById('enabled').addEventListener('change', async e => {
    await chrome.runtime.sendMessage({ type: 'TOGGLE_ENABLED', enabled: e.target.checked });
  });

  document.getElementById('ytMode').addEventListener('change', async e => {
    await chrome.runtime.sendMessage({ type: 'SET_YOUTUBE_MODE', mode: e.target.value });
  });

  grid.addEventListener('change', async e => {
    if (e.target.type === 'checkbox') {
      const id = e.target.value;
      const idx = enabledLists.indexOf(id);
      if (idx >= 0 && !e.target.checked) enabledLists.splice(idx, 1);
      else if (idx < 0 && e.target.checked) enabledLists.push(id);
      await chrome.runtime.sendMessage({ type: 'TOGGLE_FILTER_LIST', listId: id, enabled: e.target.checked });
    }
  });

  document.getElementById('addRule').addEventListener('click', async () => {
    const pattern = document.getElementById('newRulePattern').value.trim();
    const action = document.getElementById('newRuleAction').value;
    if (!pattern) return;
    customRules.push({ pattern, action, id: Date.now(), added: new Date().toISOString() });
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { customRules } });
    document.getElementById('newRulePattern').value = '';
    renderRules();
  });

  crDiv.addEventListener('click', async e => {
    if (e.target.tagName === 'BUTTON') {
      const idx = parseInt(e.target.dataset.idx);
      customRules.splice(idx, 1);
      await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { customRules } });
      renderRules();
    }
  });

  crDiv.addEventListener('change', async e => {
    if (e.target.classList.contains('rule-pattern')) {
      customRules[parseInt(e.target.dataset.idx)].pattern = e.target.value;
      await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { customRules } });
    }
    if (e.target.classList.contains('rule-action')) {
      customRules[parseInt(e.target.dataset.idx)].action = e.target.value;
      await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { customRules } });
    }
  });

  document.getElementById('exportBtn').addEventListener('click', async () => {
    const { settings } = await chrome.storage.sync.get('settings');
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'aeroguard-settings.json'; a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());

  document.getElementById('importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const imported = JSON.parse(text);
      await chrome.storage.sync.set({ settings: imported });
      alert('Imported successfully! Reloading...');
      location.reload();
    } catch { alert('Invalid JSON'); }
  });

  document.getElementById('resetBtn').addEventListener('click', async () => {
    if (confirm('Reset ALL settings? This cannot be undone.')) {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      alert('Reset complete. Reloading...');
      location.reload();
    }
  });

  // Save on any change
  async function saveAll() {
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { enabled: document.getElementById('enabled').checked, youtubeMode: document.getElementById('ytMode').value, filterLists: enabledLists, customRules } });
  }

  document.getElementById('enabled').addEventListener('change', saveAll);
  document.getElementById('ytMode').addEventListener('change', saveAll);
  grid.addEventListener('change', saveAll);
});