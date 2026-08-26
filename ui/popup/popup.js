// ui/popup/popup.js — Real-time animated accessible popup with virtual scrolling
(() => {
  'use strict';

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  const state = {
    stats: null,
    filterLists: [],
    enabled: true,
    isLoading: false
  };

  // DOM Elements
  const elements = {
    statusIndicator: null,
    statusDot: null,
    statusLabel: null,
    blockedCount: null,
    blockRate: null,
    youtubeBlocked: null,
    youtubeRate: null,
    filterListsContainer: null,
    updateBtn: null,
    resetBtn: null,
    enabledToggle: null,
    optionsBtn: null,
    helpBtn: null
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  function init() {
    cacheElements();
    bindEvents();
    loadData();
    startAutoRefresh();
  }

  function cacheElements() {
    elements.statusIndicator = document.getElementById('statusIndicator');
    elements.statusDot = elements.statusIndicator?.querySelector('.dot');
    elements.statusLabel = elements.statusIndicator?.querySelector('.label');
    elements.blockedCount = document.getElementById('blockedCount');
    elements.blockRate = document.getElementById('blockRate');
    elements.youtubeBlocked = document.getElementById('youtubeBlocked');
    elements.youtubeRate = document.getElementById('youtubeRate');
    elements.filterListsContainer = document.getElementById('filterLists');
    elements.updateBtn = document.getElementById('updateBtn');
    elements.resetBtn = document.getElementById('resetBtn');
    elements.enabledToggle = document.getElementById('enabledToggle');
    elements.optionsBtn = document.getElementById('optionsBtn');
    elements.helpBtn = document.getElementById('helpBtn');
  }

  function bindEvents() {
    // Update button
    elements.updateBtn?.addEventListener('click', handleUpdate);

    // Reset button
    elements.resetBtn?.addEventListener('click', handleReset);

    // Toggle switch
    elements.enabledToggle?.addEventListener('change', handleToggle);

    // Footer links
    elements.optionsBtn?.addEventListener('click', () => chrome.runtime.openOptionsPage());
    elements.helpBtn?.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://github.com/aeroguard/aeroguard-ultimate/wiki' });
    });

    // Keyboard navigation
    document.addEventListener('keydown', handleKeyboard);
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================
  async function loadData() {
    setLoading(true);

    try {
      // Load stats
      const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
      state.stats = stats;
      renderStats(stats);

      // Load filter lists
      const lists = await chrome.runtime.sendMessage({ type: 'GET_FILTER_LISTS' });
      state.filterLists = Object.entries(lists).map(([id, list]) => ({ id, ...list }));
      renderFilterLists(state.filterLists);

      // Load enabled state
      const { enabled = true } = await chrome.storage.sync.get('enabled');
      state.enabled = enabled;
      updateToggleUI(enabled);

    } catch (error) {
      console.error('[Popup] Load error:', error);
      showError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  function startAutoRefresh() {
    // Refresh stats every 2 seconds
    setInterval(() => {
      if (!state.isLoading) {
        loadStats();
      }
    }, 2000);

    // Refresh filter lists every 30 seconds
    setInterval(() => {
      if (!state.isLoading) {
        loadFilterLists();
      }
    }, 30000);
  }

  async function loadStats() {
    try {
      const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
      state.stats = stats;
      renderStats(stats);
    } catch (e) {
      console.error('[Popup] Stats refresh error:', e);
    }
  }

  async function loadFilterLists() {
    try {
      const lists = await chrome.runtime.sendMessage({ type: 'GET_FILTER_LISTS' });
      state.filterLists = Object.entries(lists).map(([id, list]) => ({ id, ...list }));
      renderFilterLists(state.filterLists);
    } catch (e) {
      console.error('[Popup] Filter lists refresh error:', e);
    }
  }

  // ============================================================================
  // RENDERING
  // ============================================================================
  function renderStats(stats) {
    if (!stats) return;

    // Animate number changes
    animateValue(elements.blockedCount, stats.totalBlocked || 0);
    animateValue(elements.blockRate, `${stats.blockRate || 0}%`);
    animateValue(elements.youtubeBlocked, stats.youtubeAdsBlocked || 0);
    animateValue(elements.youtubeRate, `${stats.youtubeBlockRate || 0}%`);

    // Update status indicator
    updateStatusUI(stats);
  }

  function updateStatusUI(stats) {
    const isActive = state.enabled && (stats.totalRequests || 0) > 0;
    elements.statusIndicator?.classList.toggle('active', isActive);
    elements.statusLabel.textContent = isActive ? 'Active' : 'Inactive';
    elements.statusDot.style.background = isActive ? '#4ade80' : '#f87171';
  }

  function updateToggleUI(enabled) {
    elements.enabledToggle.checked = enabled;
    elements.enabledToggle.setAttribute('aria-checked', enabled);
  }

  function renderFilterLists(lists) {
    if (!elements.filterListsContainer) return;

    // Sort: enabled first, then by category, then by name
    const sorted = [...lists].sort((a, b) => {
      if (a.enabled !== b.enabled) return b.enabled - a.enabled;
      const catOrder = { core: 0, annoyances: 1, ublock: 2, specialized: 3, regional: 4, youtube: 5 };
      const ca = catOrder[a.category] ?? 99;
      const cb = catOrder[b.category] ?? 99;
      if (ca !== cb) return ca - cb;
      return a.name.localeCompare(b.name);
    });

    // Virtual scrolling: only render visible items (first 50)
    const visibleItems = sorted.slice(0, 50);
    const hasMore = sorted.length > 50;

    elements.filterListsContainer.innerHTML = visibleItems.map(list => `
      <div class="filter-list-item ${list.enabled ? '' : 'disabled'}" data-id="${list.id}">
        <div class="list-info">
          <label class="list-toggle">
            <input type="checkbox" ${list.enabled ? 'checked' : ''} aria-label="${list.name}">
            <span class="slider"></span>
          </label>
          <div class="list-details">
            <span class="list-name">${escapeHtml(list.name)}</span>
            <span class="list-meta">
              ${list.ruleCount?.toLocaleString() || 0} rules
              ${list.category ? `<span class="category-tag category-${list.category}">${list.category}</span>` : ''}
              ${list.errorCount > 0 ? `<span class="error-badge">${list.errorCount} errors</span>` : ''}
            </span>
          </div>
        </div>
        <div class="list-actions">
          ${!list.enabled && list.ruleCount === 0 ? '<span class="empty-badge">Empty</span>' : ''}
        </div>
      </div>
    `).join('') + (hasMore ? `
      <div class="filter-list-more">
        <button class="btn btn-link" id="showMoreBtn">Show ${sorted.length - 50} more...</button>
      </div>
    ` : '');

    // Bind toggle events
    elements.filterListsContainer.querySelectorAll('.list-toggle input').forEach(input => {
      input.addEventListener('change', (e) => {
        const item = e.target.closest('.filter-list-item');
        const listId = item?.dataset.id;
        if (listId) toggleFilterList(listId, e.target.checked);
      });
    });

    // Show more button
    const showMoreBtn = document.getElementById('showMoreBtn');
    if (showMoreBtn) {
      showMoreBtn.addEventListener('click', () => {
        // Render all items
        elements.filterListsContainer.innerHTML = sorted.map(list => `
          <div class="filter-list-item ${list.enabled ? '' : 'disabled'}" data-id="${list.id}">
            <div class="list-info">
              <label class="list-toggle">
                <input type="checkbox" ${list.enabled ? 'checked' : ''} aria-label="${list.name}">
                <span class="slider"></span>
              </label>
              <div class="list-details">
                <span class="list-name">${escapeHtml(list.name)}</span>
                <span class="list-meta">
                  ${list.ruleCount?.toLocaleString() || 0} rules
                  ${list.category ? `<span class="category-tag category-${list.category}">${list.category}</span>` : ''}
                  ${list.errorCount > 0 ? `<span class="error-badge">${list.errorCount} errors</span>` : ''}
                </span>
              </div>
            </div>
          </div>
        `).join('');

        // Re-bind toggles
        elements.filterListsContainer.querySelectorAll('.list-toggle input').forEach(input => {
          input.addEventListener('change', (e) => {
            const item = e.target.closest('.filter-list-item');
            const listId = item?.dataset.id;
            if (listId) toggleFilterList(listId, e.target.checked);
          });
        });
      });
    }
  }

  async function toggleFilterList(listId, enabled) {
    try {
      await chrome.runtime.sendMessage({ type: 'TOGGLE_FILTER_LIST', listId, enabled });
      // Update local state
      const list = state.filterLists.find(l => l.id === listId);
      if (list) list.enabled = enabled;
    } catch (e) {
      console.error('[Popup] Toggle filter list error:', e);
    }
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  async function handleUpdate() {
    elements.updateBtn.disabled = true;
    elements.updateBtn.innerHTML = `
      <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
      Updating...
    `;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'FORCE_UPDATE' });
      if (response.success) {
        showToast(response.updated?.length ? `Updated ${response.updated.length} lists` : 'Already up to date');
        await loadFilterLists();
      } else {
        showToast('Update failed', 'error');
      }
    } catch (e) {
      showToast('Update failed', 'error');
    } finally {
      elements.updateBtn.disabled = false;
      elements.updateBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        Update Lists
      `;
    }
  }

  async function handleReset() {
    if (!confirm('Reset all statistics? This cannot be undone.')) return;

    try {
      await chrome.runtime.sendMessage({ type: 'RESET_STATS' });
      state.stats = null;
      await loadStats();
      showToast('Statistics reset');
    } catch (e) {
      showToast('Reset failed', 'error');
    }
  }

  async function handleToggle(e) {
    const enabled = e.target.checked;
    state.enabled = enabled;

    try {
      await chrome.runtime.sendMessage({ type: 'TOGGLE_ENABLED', enabled });
      updateStatusUI(state.stats || {});
      showToast(enabled ? 'Protection enabled' : 'Protection disabled');
    } catch (err) {
      e.target.checked = !enabled;
      state.enabled = !enabled;
      showToast('Failed to toggle', 'error');
    }
  }

  function handleKeyboard(e) {
    // Escape to close (handled by browser)
    // Tab navigation is automatic
    // Enter/Space on focused buttons
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('btn')) {
      e.target.click();
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================
  function animateValue(element, newValue) {
    if (!element) return;

    const currentText = element.textContent;
    const isNumber = !isNaN(parseFloat(currentText)) && !isNaN(parseFloat(newValue));

    if (isNumber) {
      const current = parseFloat(currentText);
      const target = parseFloat(newValue);
      const duration = 300;
      const start = performance.now();

      function animate(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        const value = Math.round(current + (target - current) * eased);
        element.textContent = value.toLocaleString();
        if (progress < 1) requestAnimationFrame(animate);
      }

      requestAnimationFrame(animate);
    } else {
      element.textContent = newValue;
    }
  }

  function setLoading(loading) {
    state.isLoading = loading;
    elements.filterListsContainer?.classList.toggle('loading', loading);
  }

  function showError(message) {
    if (elements.filterListsContainer) {
      elements.filterListsContainer.innerHTML = `
        <div class="error-message">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <p>${escapeHtml(message)}</p>
        </div>
      `;
    }
  }

  function showToast(message, type = 'success') {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => toast.classList.add('show'));

    // Remove after 3 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================================
  // START
  // ============================================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();