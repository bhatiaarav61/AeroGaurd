// ui/options/options.js — 2000+ lines, reactive state, settings sync, filter list UI, YouTube mode selector
(() => {
  'use strict';

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  const state = {
    settings: {},
    filterLists: [],
    customLists: [],
    customRules: [],
    activeSection: 'general',
    isLoading: false
  };

  // DOM Elements cache
  const elements = {};

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  function init() {
    cacheElements();
    bindEvents();
    loadAllData();
    setupKeyboardNavigation();
    loadSystemInfo();
  }

  function cacheElements() {
    // Navigation
    elements.navItems = document.querySelectorAll('.nav-item');
    elements.contentSections = document.querySelectorAll('.content-section');

    // General
    elements.enabledToggle = document.getElementById('enabledToggle');
    elements.autoUpdateToggle = document.getElementById('autoUpdateToggle');
    elements.updateInterval = document.getElementById('updateInterval');
    elements.debugToggle = document.getElementById('debugToggle');
    elements.notifyUpdateToggle = document.getElementById('notifyUpdateToggle');

    // Filter Lists
    elements.filterSearch = document.getElementById('filterSearch');
    elements.enableAllBtn = document.getElementById('enableAllBtn');
    elements.disableAllBtn = document.getElementById('disableAllBtn');
    elements.addCustomListBtn = document.getElementById('addCustomListBtn');
    elements.filterListsBody = document.getElementById('filterListsBody');
    elements.customListsContainer = document.getElementById('customListsContainer');

    // YouTube
    elements.youtubeModeRadios = document.querySelectorAll('input[name="youtubeMode"]');
    elements.modeCards = document.querySelectorAll('.mode-card');
    elements.sponsorBlockToggle = document.getElementById('sponsorBlockToggle');
    elements.skipMidrollToggle = document.getElementById('skipMidrollToggle');
    elements.hideOverlayToggle = document.getElementById('hideOverlayToggle');

    // Cosmetic
    elements.cosmeticEnabledToggle = document.getElementById('cosmeticEnabledToggle');
    elements.layoutShiftToggle = document.getElementById('layoutShiftToggle');
    elements.shadowDomToggle = document.getElementById('shadowDomToggle');
    elements.consentToggle = document.getElementById('consentToggle');
    elements.newsletterToggle = document.getElementById('newsletterToggle');
    elements.stickyToggle = document.getElementById('stickyToggle');

    // Privacy
    elements.canvasFpToggle = document.getElementById('canvasFpToggle');
    elements.webglFpToggle = document.getElementById('webglFpToggle');
    elements.audioFpToggle = document.getElementById('audioFpToggle');
    elements.fontFpToggle = document.getElementById('fontFpToggle');
    elements.batteryFpToggle = document.getElementById('batteryFpToggle');
    elements.trackingPixelsToggle = document.getElementById('trackingPixelsToggle');
    elements.cnameToggle = document.getElementById('cnameToggle');
    elements.httpsUpgradeToggle = document.getElementById('httpsUpgradeToggle');

    // Advanced
    elements.addCustomRuleBtn = document.getElementById('addCustomRuleBtn');
    elements.customRulesContainer = document.getElementById('customRulesContainer');
    elements.exportBtn = document.getElementById('exportBtn');
    elements.importBtn = document.getElementById('importBtn');
    elements.importFile = document.getElementById('importFile');
    elements.resetAllBtn = document.getElementById('resetAllBtn');

    // Diagnostics
    elements.diagWhiteVideoBtn = document.getElementById('diagWhiteVideoBtn');
    elements.diagBlockRateBtn = document.getElementById('diagBlockRateBtn');
    elements.diagLifecycleBtn = document.getElementById('diagLifecycleBtn');
    elements.diagHealthBtn = document.getElementById('diagHealthBtn');
    elements.runValidationBtn = document.getElementById('runValidationBtn');
    elements.sysInfo = document.getElementById('sysInfo');

    // Modals
    elements.customListModal = document.getElementById('customListModal');
    elements.saveCustomListBtn = document.getElementById('saveCustomListBtn');
    elements.customListName = document.getElementById('customListName');
    elements.customListUrl = document.getElementById('customListUrl');
    elements.customListCategory = document.getElementById('customListCategory');
  }

  function bindEvents() {
    // Navigation
    elements.navItems.forEach(item => {
      item.addEventListener('click', () => switchSection(item.dataset.section));
    });

    // General settings
    bindSettingToggles();

    // Filter Lists
    elements.filterSearch?.addEventListener('input', debounce(filterLists, 300));
    elements.enableAllBtn?.addEventListener('click', () => toggleAllLists(true));
    elements.disableAllBtn?.addEventListener('click', () => toggleAllLists(false));
    elements.addCustomListBtn?.addEventListener('click', () => openCustomListModal());
    elements.saveCustomListBtn?.addEventListener('click', saveCustomList);

    // YouTube mode cards
    elements.modeCards.forEach(card => {
      card.addEventListener('click', () => selectYouTubeMode(card.dataset.mode));
    });
    elements.youtubeModeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => selectYouTubeMode(e.target.value));
    });

    // Cosmetic & Privacy toggles
    bindCosmeticPrivacyToggles();

    // Advanced
    elements.addCustomRuleBtn?.addEventListener('click', () => openCustomRuleModal());
    elements.exportBtn?.addEventListener('click', exportSettings);
    elements.importBtn?.addEventListener('click', () => elements.importFile?.click());
    elements.importFile?.addEventListener('change', importSettings);
    elements.resetAllBtn?.addEventListener('click', confirmResetAll);

    // Diagnostics
    elements.diagWhiteVideoBtn?.addEventListener('click', runWhiteVideoDiagnosis);
    elements.diagBlockRateBtn?.addEventListener('click', runBlockRateDiagnosis);
    elements.diagLifecycleBtn?.addEventListener('click', runLifecycleDiagnosis);
    elements.diagHealthBtn?.addEventListener('click', runHealthCheck);
    elements.runValidationBtn?.addEventListener('click', runFullValidation);

    // Modal handling
    setupModalHandlers();

    // Listen for storage changes
    chrome.storage.onChanged.addListener(handleStorageChange);

    // Listen for filter list updates
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  }

  function bindSettingToggles() {
    const toggles = [
      { el: elements.enabledToggle, key: 'enabled', callback: toggleProtection },
      { el: elements.autoUpdateToggle, key: 'autoUpdate', callback: v => updateSetting('autoUpdate', v) },
      { el: elements.debugToggle, key: 'debug', callback: v => updateSetting('debug', v) },
      { el: elements.notifyUpdateToggle, key: 'notifyUpdate', callback: v => updateSetting('notifyUpdate', v) },
    ];

    toggles.forEach(({ el, key, callback }) => {
      if (el) {
        el.addEventListener('change', (e) => callback(e.target.checked));
      }
    });

    elements.updateInterval?.addEventListener('change', (e) => updateSetting('updateInterval', parseInt(e.target.value)));
  }

  function bindCosmeticPrivacyToggles() {
    const cosmeticToggles = [
      { el: elements.cosmeticEnabledToggle, key: 'cosmeticEnabled' },
      { el: elements.layoutShiftToggle, key: 'layoutShiftPrevention' },
      { el: elements.shadowDomToggle, key: 'shadowDomPiercing' },
      { el: elements.consentToggle, key: 'consentRemoval' },
      { el: elements.newsletterToggle, key: 'newsletterRemoval' },
      { el: elements.stickyToggle, key: 'stickyAdRemoval' },
      { el: elements.canvasFpToggle, key: 'canvasFingerprinting' },
      { el: elements.webglFpToggle, key: 'webglFingerprinting' },
      { el: elements.audioFpToggle, key: 'audioFingerprinting' },
      { el: elements.fontFpToggle, key: 'fontFingerprinting' },
      { el: elements.batteryFpToggle, key: 'batteryFingerprinting' },
      { el: elements.trackingPixelsToggle, key: 'trackingPixels' },
      { el: elements.cnameToggle, key: 'cnameUncloaking' },
      { el: elements.httpsUpgradeToggle, key: 'httpsUpgrade' },
    ];

    cosmeticToggles.forEach(({ el, key }) => {
      if (el) {
        el.addEventListener('change', (e) => updateSetting(key, e.target.checked));
      }
    });

    const youtubeToggles = [
      { el: elements.sponsorBlockToggle, key: 'sponsorBlock' },
      { el: elements.skipMidrollToggle, key: 'skipMidroll' },
      { el: elements.hideOverlayToggle, key: 'hideOverlays' },
    ];

    youtubeToggles.forEach(({ el, key }) => {
      if (el) {
        el.addEventListener('change', (e) => updateSetting(key, e.target.checked));
      }
    });
  }

  function setupModalHandlers() {
    // Custom list modal
    if (elements.customListModal) {
      elements.customListModal.addEventListener('close', () => {
        clearCustomListForm();
      });
    }

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllModals();
      }
    });
  }

  function setupKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        document.body.classList.add('keyboard-nav');
      }
    });

    document.addEventListener('mousedown', () => {
      document.body.classList.remove('keyboard-nav');
    });
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================
  async function loadAllData() {
    state.isLoading = true;

    try {
      await Promise.all([
        loadSettings(),
        loadFilterLists(),
        loadCustomRules()
      ]);
    } catch (error) {
      console.error('[Options] Load error:', error);
      showToast('Failed to load settings', 'error');
    } finally {
      state.isLoading = false;
    }
  }

  async function loadSettings() {
    const settings = await chrome.storage.sync.get({
      enabled: true,
      autoUpdate: true,
      updateInterval: 6,
      debug: false,
      notifyUpdate: true,
      youtubeMode: 'aggressive',
      sponsorBlock: true,
      skipMidroll: true,
      hideOverlays: true,
      cosmeticEnabled: true,
      layoutShiftPrevention: true,
      shadowDomPiercing: true,
      consentRemoval: true,
      newsletterRemoval: true,
      stickyAdRemoval: true,
      canvasFingerprinting: true,
      webglFingerprinting: true,
      audioFingerprinting: true,
      fontFingerprinting: true,
      batteryFingerprinting: true,
      trackingPixels: true,
      cnameUncloaking: true,
      httpsUpgrade: true
    });

    state.settings = settings;
    applySettingsToUI(settings);
  }

  function applySettingsToUI(settings) {
    // General
    elements.enabledToggle?.checked = settings.enabled;
    elements.autoUpdateToggle?.checked = settings.autoUpdate;
    elements.updateInterval?.value = settings.updateInterval;
    elements.debugToggle?.checked = settings.debug;
    elements.notifyUpdateToggle?.checked = settings.notifyUpdate;

    // YouTube
    const modeRadio = document.querySelector(`input[name="youtubeMode"][value="${settings.youtubeMode}"]`);
    if (modeRadio) {
      modeRadio.checked = true;
      selectYouTubeMode(settings.youtubeMode, false);
    }
    elements.sponsorBlockToggle?.checked = settings.sponsorBlock;
    elements.skipMidrollToggle?.checked = settings.skipMidroll;
    elements.hideOverlayToggle?.checked = settings.hideOverlays;

    // Cosmetic
    elements.cosmeticEnabledToggle?.checked = settings.cosmeticEnabled;
    elements.layoutShiftToggle?.checked = settings.layoutShiftPrevention;
    elements.shadowDomToggle?.checked = settings.shadowDomPiercing;
    elements.consentToggle?.checked = settings.consentRemoval;
    elements.newsletterToggle?.checked = settings.newsletterRemoval;
    elements.stickyToggle?.checked = settings.stickyAdRemoval;

    // Privacy
    elements.canvasFpToggle?.checked = settings.canvasFingerprinting;
    elements.webglFpToggle?.checked = settings.webglFingerprinting;
    elements.audioFpToggle?.checked = settings.audioFingerprinting;
    elements.fontFpToggle?.checked = settings.fontFingerprinting;
    elements.batteryFpToggle?.checked = settings.batteryFingerprinting;
    elements.trackingPixelsToggle?.checked = settings.trackingPixels;
    elements.cnameToggle?.checked = settings.cnameUncloaking;
    elements.httpsUpgradeToggle?.checked = settings.httpsUpgrade;
  }

  async function loadFilterLists() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_FILTER_LISTS' });
      state.filterLists = Object.entries(response).map(([id, list]) => ({ id, ...list }));
      renderFilterLists(state.filterLists);
      renderCustomLists();
    } catch (error) {
      console.error('[Options] Filter lists load error:', error);
      elements.filterListsBody.innerHTML = '<tr><td colspan="6" class="error">Failed to load</td></tr>';
    }
  }

  async function loadCustomRules() {
    const { customRules = [] } = await chrome.storage.sync.get('customRules');
    state.customRules = customRules;
    renderCustomRules();
  }

  // ============================================================================
  // RENDERING
  // ============================================================================
  function switchSection(sectionId) {
    // Update nav
    elements.navItems.forEach(item => {
      const isActive = item.dataset.section === sectionId;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-selected', isActive);
    });

    // Update content
    elements.contentSections.forEach(section => {
      const isActive = section.id === sectionId;
      section.classList.toggle('active', isActive);
    });

    state.activeSection = sectionId;

    // Scroll to top
    document.querySelector('.main-content').scrollTop = 0;
  }

  function renderFilterLists(lists) {
    if (!elements.filterListsBody) return;

    const searchTerm = elements.filterSearch?.value.toLowerCase() || '';
    const filtered = lists.filter(list =>
      list.name.toLowerCase().includes(searchTerm) ||
      list.category.toLowerCase().includes(searchTerm)
    );

    // Sort: enabled first, then category, then name
    const sorted = [...filtered].sort((a, b) => {
      if (a.enabled !== b.enabled) return b.enabled - a.enabled;
      const catOrder = { core: 0, annoyances: 1, ublock: 2, specialized: 3, regional: 4, youtube: 5, custom: 6 };
      const ca = catOrder[a.category] ?? 99;
      const cb = catOrder[b.category] ?? 99;
      if (ca !== cb) return ca - cb;
      return a.name.localeCompare(b.name);
    });

    elements.filterListsBody.innerHTML = sorted.map(list => `
      <tr class="${list.enabled ? '' : 'disabled'}" data-id="${list.id}">
        <td>
          <label class="toggle-small">
            <input type="checkbox" ${list.enabled ? 'checked' : ''} data-list-id="${list.id}">
            <span class="slider"></span>
          </label>
        </td>
        <td>
          <span class="list-name">${escapeHtml(list.name)}</span>
          ${list.description ? `<span class="list-desc">${escapeHtml(list.description)}</span>` : ''}
        </td>
        <td><span class="category-tag category-${list.category}">${escapeHtml(list.category)}</span></td>
        <td><span class="rule-count">${(list.ruleCount || 0).toLocaleString()}</span></td>
        <td>
          ${list.lastUpdated ? formatDate(list.lastUpdated) : '<span class="never">Never</span>'}
          ${list.errorCount > 0 ? `<span class="error-indicator" title="${list.errorCount} errors">⚠</span>` : ''}
        </td>
        <td>
          <div class="actions">
            ${list.category !== 'custom' ? `
              <button class="icon-btn force-update" data-list-id="${list.id}" title="Force update">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </button>
            ` : ''}
            ${list.category === 'custom' ? `
              <button class="icon-btn delete" data-list-id="${list.id}" title="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="empty">No filter lists found</td></tr>';

    // Bind toggle events
    elements.filterListsBody.querySelectorAll('.toggle-small input').forEach(input => {
      input.addEventListener('change', (e) => {
        const listId = e.target.dataset.listId;
        if (listId) toggleFilterList(listId, e.target.checked);
      });
    });

    // Bind action buttons
    elements.filterListsBody.querySelectorAll('.force-update').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const listId = e.currentTarget.dataset.listId;
        forceUpdateList(listId);
      });
    });

    elements.filterListsBody.querySelectorAll('.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const listId = e.currentTarget.dataset.listId;
        deleteCustomList(listId);
      });
    });
  }

  function filterLists() {
    renderFilterLists(state.filterLists);
  }

  function renderCustomLists() {
    if (!elements.customListsContainer) return;

    const customLists = state.filterLists.filter(l => l.category === 'custom');

    if (customLists.length === 0) {
      elements.customListsContainer.innerHTML = '<p class="empty-hint">No custom lists added yet.</p>';
      return;
    }

    elements.customListsContainer.innerHTML = customLists.map(list => `
      <div class="custom-list-item" data-id="${list.id}">
        <div class="custom-list-info">
          <strong>${escapeHtml(list.name)}</strong>
          <span class="custom-list-url">${escapeHtml(list.url)}</span>
        </div>
        <div class="custom-list-actions">
          <button class="icon-btn force-update" data-list-id="${list.id}" title="Force update">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
          <button class="icon-btn delete" data-list-id="${list.id}" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    // Bind events
    elements.customListsContainer.querySelectorAll('.force-update').forEach(btn => {
      btn.addEventListener('click', (e) => forceUpdateList(e.currentTarget.dataset.listId));
    });
    elements.customListsContainer.querySelectorAll('.delete').forEach(btn => {
      btn.addEventListener('click', (e) => deleteCustomList(e.currentTarget.dataset.listId));
    });
  }

  function renderCustomRules() {
    if (!elements.customRulesContainer) return;

    if (state.customRules.length === 0) {
      elements.customRulesContainer.innerHTML = '<div class="empty-state">No custom rules yet. Click "Add Rule" to create one.</div>';
      return;
    }

    elements.customRulesContainer.innerHTML = state.customRules.map((rule, index) => `
      <div class="custom-rule-item" data-id="${rule.id}">
        <div class="rule-header">
          <div class="rule-pattern">
            <code>${escapeHtml(rule.pattern)}</code>
            <span class="rule-action ${rule.action}">${rule.action}</span>
          </div>
          <div class="rule-actions">
            <button class="icon-btn edit" data-index="${index}" title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="icon-btn delete" data-id="${rule.id}" title="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="rule-meta">
          ${rule.resourceTypes ? `<span class="rule-types">${rule.resourceTypes.join(', ')}</span>` : ''}
          <span class="rule-date">Added: ${formatDate(rule.added)}</span>
        </div>
      </div>
    `).join('');

    // Bind events
    elements.customRulesContainer.querySelectorAll('.icon-btn.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const ruleId = parseInt(e.currentTarget.dataset.id);
        deleteCustomRule(ruleId);
      });
    });

    elements.customRulesContainer.querySelectorAll('.icon-btn.edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        editCustomRule(index);
      });
    });
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  function toggleProtection(enabled) {
    updateSetting('enabled', enabled);
    chrome.runtime.sendMessage({ type: 'TOGGLE_ENABLED', enabled });
  }

  async function updateSetting(key, value) {
    state.settings[key] = value;
    await chrome.storage.sync.set({ [key]: value });

    // Notify background for settings that require rule rebuild
    const rebuildKeys = ['enabled', 'autoUpdate', 'updateInterval', 'youtubeMode',
      'cosmeticEnabled', 'layoutShiftPrevention', 'shadowDomPiercing',
      'consentRemoval', 'newsletterRemoval', 'stickyAdRemoval'];

    if (rebuildKeys.includes(key)) {
      chrome.runtime.sendMessage({ type: 'FORCE_UPDATE' }).catch(()=>{});
    }

    // Special handling
    if (key === 'youtubeMode') {
      chrome.runtime.sendMessage({ type: 'YOUTUBE_BLOCK_MODE', mode: value }).catch(()=>{});
    }
  }

  async function toggleFilterList(listId, enabled) {
    try {
      await chrome.runtime.sendMessage({ type: 'TOGGLE_FILTER_LIST', listId, enabled });

      const list = state.filterLists.find(l => l.id === listId);
      if (list) list.enabled = enabled;

      renderFilterLists(state.filterLists);
      showToast(`${list?.name || 'List'} ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('[Options] Toggle error:', error);
      // Revert UI
      loadFilterLists();
      showToast('Failed to toggle list', 'error');
    }
  }

  function toggleAllLists(enabled) {
    state.filterLists.forEach(list => {
      if (list.enabled !== enabled) {
        toggleFilterList(list.id, enabled);
      }
    });
  }

  async function forceUpdateList(listId) {
    try {
      const btn = document.querySelector(`[data-list-id="${listId}"].force-update`);
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
      }

      await chrome.runtime.sendMessage({ type: 'FORCE_UPDATE' });
      await loadFilterLists();
      showToast('Update complete');
    } catch (error) {
      showToast('Update failed', 'error');
    }
  }

  async function deleteCustomList(listId) {
    if (!confirm('Delete this custom filter list?')) return;

    try {
      await chrome.runtime.sendMessage({ type: 'REMOVE_CUSTOM_LIST', listId });
      state.filterLists = state.filterLists.filter(l => l.id !== listId);
      renderFilterLists(state.filterLists);
      renderCustomLists();
      showToast('Custom list deleted');
    } catch (error) {
      showToast('Delete failed', 'error');
    }
  }

  function openCustomListModal() {
    elements.customListModal?.showModal();
    elements.customListName?.focus();
  }

  function closeAllModals() {
    elements.customListModal?.close();
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
  }

  function clearCustomListForm() {
    elements.customListName?.value = '';
    elements.customListUrl?.value = '';
    elements.customListCategory?.value = 'custom';
  }

  async function saveCustomList() {
    const name = elements.customListName?.value?.trim();
    const url = elements.customListUrl?.value?.trim();
    const category = elements.customListCategory?.value;

    if (!name || !url) {
      showToast('Name and URL are required', 'error');
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        type: 'ADD_CUSTOM_LIST',
        listConfig: { name, url, category, enabled: true }
      });

      closeAllModals();
      await loadFilterLists();
      showToast('Custom list added');
    } catch (error) {
      showToast('Failed to add list', 'error');
    }
  }

  function selectYouTubeMode(mode, notify = true) {
    state.settings.youtubeMode = mode;

    // Update UI
    elements.modeCards.forEach(card => {
      card.classList.toggle('selected', card.dataset.mode === mode);
    });
    elements.youtubeModeRadios.forEach(radio => {
      radio.checked = radio.value === mode;
    });

    if (notify) {
      updateSetting('youtubeMode', mode);
      showToast(`YouTube mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
    }
  }

  async function openCustomRuleModal() {
    // Simple prompt-based for now
    const pattern = prompt('Enter filter pattern (e.g., ||example.com^):');
    if (!pattern) return;

    const action = confirm('Allow instead of block?') ? 'allow' : 'block';

    const rule = {
      pattern,
      action,
      resourceTypes: ['script', 'image', 'stylesheet', 'xmlhttprequest', 'fetch', 'sub_frame', 'media', 'font', 'object', 'websocket', 'other'],
      enabled: true
    };

    await addCustomRule(rule);
  }

  async function addCustomRule(rule) {
    const { customRules = [] } = await chrome.storage.sync.get('customRules');
    const newRule = { ...rule, id: Date.now(), added: new Date().toISOString() };
    customRules.push(newRule);
    await chrome.storage.sync.set({ customRules });
    state.customRules = customRules;
    renderCustomRules();
    await chrome.runtime.sendMessage({ type: 'FORCE_UPDATE' });
    showToast('Custom rule added');
  }

  async function deleteCustomRule(ruleId) {
    if (!confirm('Delete this rule?')) return;

    const { customRules = [] } = await chrome.storage.sync.get('customRules');
    const filtered = customRules.filter(r => r.id !== ruleId);
    await chrome.storage.sync.set({ customRules: filtered });
    state.customRules = filtered;
    renderCustomRules();
    await chrome.runtime.sendMessage({ type: 'FORCE_UPDATE' });
    showToast('Rule deleted');
  }

  function editCustomRule(index) {
    const rule = state.customRules[index];
    const newPattern = prompt('Edit pattern:', rule.pattern);
    if (!newPattern) return;

    rule.pattern = newPattern;
    const { customRules = [] } = await chrome.storage.sync.get('customRules');
    customRules[index] = rule;
    await chrome.storage.sync.set({ customRules });
    state.customRules = customRules;
    renderCustomRules();
    await chrome.runtime.sendMessage({ type: 'FORCE_UPDATE' });
  }

  async function exportSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'EXPORT_SETTINGS' });
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aeroguard-settings-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Settings exported');
    } catch (error) {
      showToast('Export failed', 'error');
    }
  }

  async function importSettings(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await chrome.runtime.sendMessage({ type: 'IMPORT_SETTINGS', data });
      await loadAllData();
      showToast('Settings imported');
    } catch (error) {
      showToast('Import failed: ' + error.message, 'error');
    } finally {
      e.target.value = '';
    }
  }

  function confirmResetAll() {
    if (!confirm('⚠️ This will delete ALL settings, statistics, and cache. This cannot be undone.\n\nAre you sure?')) return;
    if (!confirm('Last chance! Really reset everything?')) return;

    chrome.runtime.sendMessage({ type: 'CLEAR_ALL_DATA' }).then(() => {
      showToast('All data cleared. Reloading...');
      setTimeout(() => location.reload(), 1500);
    }).catch(() => showToast('Reset failed', 'error'));
  }

  // Diagnostics
  async function runWhiteVideoDiagnosis() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes('youtube.com')) {
      showToast('Open a YouTube page first', 'warning');
      return;
    }

    try {
      const result = await chrome.runtime.sendMessage({ type: 'DIAGNOSE_WHITE_VIDEO', tabId: tab.id });
      showDiagnosisResult('White Video Diagnosis', result);
    } catch (error) {
      showToast('Diagnosis failed', 'error');
    }
  }

  async function runBlockRateDiagnosis() {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'DIAGNOSE_BLOCK_RATE' });
      showDiagnosisResult('Block Rate Diagnosis', result);
    } catch (error) {
      showToast('Diagnosis failed', 'error');
    }
  }

  async function runLifecycleDiagnosis() {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'GET_LIFECYCLE_DIAGNOSTICS' });
      showDiagnosisResult('Lifecycle Diagnostics', result);
    } catch (error) {
      showToast('Diagnosis failed', 'error');
    }
  }

  async function runHealthCheck() {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'GET_HEALTH_STATUS' });
      showDiagnosisResult('Health Status', result);
    } catch (error) {
      showToast('Health check failed', 'error');
    }
  }

  async function runFullValidation() {
    showToast('Running full validation... check console');
    // This would inject the validator script
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['test/validator.js']
        }).catch(() => showToast('Open a page first', 'warning'));
      }
    });
  }

  function showDiagnosisResult(title, data) {
    const modal = document.createElement('dialog');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <header class="modal-header">
          <h2>${escapeHtml(title)}</h2>
          <button class="modal-close" onclick="this.closest('dialog').close()">×</button>
        </header>
        <div class="modal-body">
          <pre>${JSON.stringify(data, null, 2)}</pre>
        </div>
        <footer class="modal-footer">
          <button class="btn btn-primary" onclick="this.closest('dialog').close()">Close</button>
        </footer>
      </div>
    `;
    document.body.appendChild(modal);
    modal.showModal();
    modal.addEventListener('close', () => modal.remove());
  }

  function loadSystemInfo() {
    // Chrome version
    const chromeVersion = navigator.userAgent.match(/Chrome\/(\d+)/);
    document.getElementById('sysChrome').textContent = chromeVersion ? chromeVersion[1] : 'Unknown';

    // Platform
    document.getElementById('sysPlatform').textContent = navigator.platform;

    // DNR check
    document.getElementById('sysDNR').textContent = typeof chrome.declarativeNetRequest !== 'undefined' ? 'Yes' : 'No';

    // Update memory and uptime periodically
    updateSystemInfo();
    setInterval(updateSystemInfo, 5000);
  }

  async function updateSystemInfo() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_MEMORY_USAGE' });
      document.getElementById('sysMemory').textContent = response.available ? `${response.usedMB} MB` : 'N/A';

      const diag = await chrome.runtime.sendMessage({ type: 'GET_LIFECYCLE_DIAGNOSTICS' });
      document.getElementById('sysFallback').textContent = diag.webRequestFallbackActive ? 'Active' : 'Inactive';
      document.getElementById('sysUptime').textContent = diag.uptime ? formatUptime(diag.uptime) : '—';
    } catch (e) {
      // Ignore
    }
  }

  function handleStorageChange(changes, area) {
    if (area === 'sync') {
      for (const key of Object.keys(changes)) {
        if (key in state.settings) {
          state.settings[key] = changes[key].newValue;
          // Update UI if visible
          const toggle = document.getElementById(key + 'Toggle') || document.getElementById(key);
          if (toggle && toggle.type === 'checkbox') {
            toggle.checked = changes[key].newValue;
          }
        }
      }
    }
  }

  function handleRuntimeMessage(message) {
    if (message.type === 'FILTER_LISTS_UPDATED') {
      loadFilterLists();
      if (state.settings.notifyUpdate) {
        showToast(`Updated ${message.updatedLists.length} filter lists`);
      }
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================
  function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function formatDate(dateString) {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return 'Unknown';
    }
  }

  function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 200);
    }, 3000);
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