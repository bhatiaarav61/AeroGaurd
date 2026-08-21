/**
 * Options Script - Handles all settings page logic for AeroGuard
 */

class OptionsController {
  constructor() {
    this.settings = {};
    this.filterLists = [];
    this.allowlist = [];
    this.customRules = [];
    this.cosmeticFilters = [];
    this.stats = {};
    this.currentTab = 'general';
    this.init();
  }

  async init() {
    this.cacheElements();
    this.setupEventListeners();
    await this.loadAllData();
    this.showTab('general');
    console.log('[Options] Initialized');
  }

  cacheElements() {
    // Navigation
    this.navItems = document.querySelectorAll('.nav-item');
    this.tabPanels = document.querySelectorAll('.tab-panel');

    // General settings
    this.enabledToggle = document.getElementById('enabled');
    this.showBadgeToggle = document.getElementById('showBadge');
    this.showNotificationsToggle = document.getElementById('showNotifications');
    this.themeSelect = document.getElementById('theme');
    this.languageSelect = document.getElementById('language');
    this.blockAdsToggle = document.getElementById('blockAds');
    this.blockTrackersToggle = document.getElementById('blockTrackers');
    this.blockMalwareToggle = document.getElementById('blockMalware');
    this.blockAnnoyancesToggle = document.getElementById('blockAnnoyances');
    this.blockSocialToggle = document.getElementById('blockSocial');
    this.blockCookieNoticesToggle = document.getElementById('blockCookieNotices');

    // Filter lists
    this.filterListGrid = document.getElementById('filterListGrid');
    this.updateIntervalSelect = document.getElementById('updateInterval');
    this.lastUpdatedText = document.getElementById('lastUpdatedText');
    this.updateNowBtn = document.getElementById('updateNowBtn');
    this.addCustomListBtn = document.getElementById('addCustomListBtn');

    // Allowlist
    this.allowlistInput = document.getElementById('allowlistInput');
    this.addAllowlistSubmitBtn = document.getElementById('addAllowlistSubmitBtn');
    this.allowlistList = document.getElementById('allowlistList');

    // Custom rules
    this.customRulesList = document.getElementById('customRulesList');
    this.addCustomRuleBtn = document.getElementById('addCustomRuleBtn');
    this.customRuleModal = document.getElementById('customRuleModal');
    this.customRuleModalClose = document.getElementById('customRuleModalClose');
    this.customRuleCancel = document.getElementById('customRuleCancel');
    this.customRuleForm = document.getElementById('customRuleForm');
    this.customRuleId = document.getElementById('customRuleId');
    this.customRuleModalTitle = document.getElementById('customRuleModalTitle');
    this.customRuleType = document.getElementById('customRuleType');
    this.customRulePattern = document.getElementById('customRulePattern');
    this.customRuleDomains = document.getElementById('customRuleDomains');

    // Cosmetic filters
    this.cosmeticFiltersList = document.getElementById('cosmeticFiltersList');
    this.addCosmeticFilterBtn = document.getElementById('addCosmeticFilterBtn');
    this.cosmeticFilterModal = document.getElementById('cosmeticFilterModal');
    this.cosmeticFilterModalClose = document.getElementById('cosmeticFilterModalClose');
    this.cosmeticFilterCancel = document.getElementById('cosmeticFilterCancel');
    this.cosmeticFilterForm = document.getElementById('cosmeticFilterForm');
    this.cosmeticFilterId = document.getElementById('cosmeticFilterId');
    this.cosmeticFilterModalTitle = document.getElementById('cosmeticFilterModalTitle');
    this.cosmeticFilterSelector = document.getElementById('cosmeticFilterSelector');
    this.cosmeticFilterDomains = document.getElementById('cosmeticFilterDomains');
    this.cosmeticFilterException = document.getElementById('cosmeticFilterException');

    // Advanced
    this.strictBlockingToggle = document.getElementById('strictBlocking');
    this.blockWebRTCToggle = document.getElementById('blockWebRTC');
    this.blockRemoteFontsToggle = document.getElementById('blockRemoteFonts');
    this.blockThirdPartyFramesToggle = document.getElementById('blockThirdPartyFrames');
    this.debugModeToggle = document.getElementById('debugMode');
    this.exportDataBtn = document.getElementById('exportDataBtn');
    this.importDataBtn = document.getElementById('importDataBtn');
    this.resetAllBtn = document.getElementById('resetAllBtn');
    this.advancedStatsGrid = document.getElementById('advancedStatsGrid');
    this.resetStatsBtn = document.getElementById('resetStatsBtn');
    this.importFileInput = document.getElementById('importFileInput');

    // Back button
    this.openFullHelpBtn = document.getElementById("openFullHelpBtn");
    this.openGitHubIssuesBtn = document.getElementById("openGitHubIssuesBtn");
    this.backToPopup = document.getElementById('backToPopup');
  }

  setupEventListeners() {
    // Navigation
    this.navItems.forEach(item => {
      item.addEventListener('click', () => this.showTab(item.dataset.tab));
    });

    // General settings toggles
    this.enabledToggle.addEventListener('click', () => this.toggleSetting('enabled', this.enabledToggle));
    this.showBadgeToggle.addEventListener('click', () => this.toggleSetting('showBadge', this.showBadgeToggle));
    this.showNotificationsToggle.addEventListener('click', () => this.toggleSetting('showNotifications', this.showNotificationsToggle));
    this.blockAdsToggle.addEventListener('click', () => this.toggleFilterList('easylist', this.blockAdsToggle));
    this.blockTrackersToggle.addEventListener('click', () => this.toggleFilterList('easyprivacy', this.blockTrackersToggle));
    this.blockMalwareToggle.addEventListener('click', () => this.toggleFilterList('malware', this.blockMalwareToggle));
    this.blockAnnoyancesToggle.addEventListener('click', () => this.toggleFilterList('annoyances', this.blockAnnoyancesToggle));
    this.blockSocialToggle.addEventListener('click', () => this.toggleFilterList('social', this.blockSocialToggle));
    this.blockCookieNoticesToggle.addEventListener('click', () => this.toggleFilterList('easylistCookie', this.blockCookieNoticesToggle));

    this.themeSelect.addEventListener('change', () => this.updateSetting('theme', this.themeSelect.value));
    this.languageSelect.addEventListener('change', () => this.updateSetting('language', this.languageSelect.value));

    // Filter lists
    this.updateIntervalSelect.addEventListener('change', () => this.updateSetting('updateInterval', parseInt(this.updateIntervalSelect.value)));
    this.updateNowBtn.addEventListener('click', () => this.updateFilterLists());
    this.addCustomListBtn.addEventListener('click', () => this.showAddCustomListDialog());

    // Allowlist
    this.addAllowlistSubmitBtn.addEventListener('click', () => this.addToAllowlist());
    this.allowlistInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addToAllowlist();
    });

    // Custom rules
    this.addCustomRuleBtn.addEventListener('click', () => this.openCustomRuleModal());
    this.customRuleModalClose.addEventListener('click', () => this.closeCustomRuleModal());
    this.customRuleCancel.addEventListener('click', () => this.closeCustomRuleModal());
    this.customRuleForm.addEventListener('submit', (e) => this.saveCustomRule(e));
    this.customRuleModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeCustomRuleModal());

    // Cosmetic filters
    this.addCosmeticFilterBtn.addEventListener('click', () => this.openCosmeticFilterModal());
    this.cosmeticFilterModalClose.addEventListener('click', () => this.closeCosmeticFilterModal());
    this.cosmeticFilterCancel.addEventListener('click', () => this.closeCosmeticFilterModal());
    this.cosmeticFilterForm.addEventListener('submit', (e) => this.saveCosmeticFilter(e));
    this.cosmeticFilterModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeCosmeticFilterModal());

    // Advanced
    this.strictBlockingToggle.addEventListener('click', () => this.toggleSetting('advanced.strictBlocking', this.strictBlockingToggle));
    this.blockWebRTCToggle.addEventListener('click', () => this.toggleSetting('advanced.blockWebRTC', this.blockWebRTCToggle));
    this.blockRemoteFontsToggle.addEventListener('click', () => this.toggleSetting('advanced.blockRemoteFonts', this.blockRemoteFontsToggle));
    this.blockThirdPartyFramesToggle.addEventListener('click', () => this.toggleSetting('advanced.blockThirdPartyFrames', this.blockThirdPartyFramesToggle));
    this.debugModeToggle.addEventListener('click', () => this.toggleSetting('debugMode', this.debugModeToggle));
    this.exportDataBtn.addEventListener('click', () => this.exportData());
    this.importDataBtn.addEventListener('click', () => this.importFileInput.click());
    this.importFileInput.addEventListener('change', (e) => this.importData(e));
    this.resetAllBtn.addEventListener('click', () => this.resetAllSettings());
    this.resetStatsBtn.addEventListener('click', () => this.resetStatistics());

    // Back button
    this.backToPopup.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
    });

    // Listen for background messages
    chrome.runtime.onMessage.addListener((message) => {
      this.handleBackgroundMessage(message);
    });

    // Help buttons
    this.openFullHelpBtn.addEventListener("click", () => this.openFullHelp());
    this.openGitHubIssuesBtn.addEventListener("click", () => this.openGitHubIssues());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeCustomRuleModal();
        this.closeCosmeticFilterModal();
      }
    });
  }

  async loadAllData() {
    try {
      const [settings, filterLists, allowlist, customRules, cosmeticFilters, stats] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }),
        chrome.runtime.sendMessage({ type: 'GET_FILTER_LISTS' }),
        chrome.runtime.sendMessage({ type: 'GET_ALLOWLIST' }),
        chrome.runtime.sendMessage({ type: 'GET_CUSTOM_RULES' }),
        chrome.runtime.sendMessage({ type: 'GET_COSMETIC_FILTERS' }),
        chrome.runtime.sendMessage({ type: 'GET_GLOBAL_STATS' })
      ]);

      this.settings = settings || {};
      this.filterLists = filterLists || [];
      this.allowlist = allowlist || [];
      this.customRules = customRules || [];
      this.cosmeticFilters = cosmeticFilters || [];
      this.stats = stats || {};

      this.updateUI();
    } catch (error) {
      console.error('[Options] Failed to load data:', error);
      this.showNotification('Failed to load settings', 'error');
    }
  }

  updateUI() {
    this.updateGeneralSettings();
    this.updateFilterLists();
    this.updateAllowlist();
    this.updateCustomRules();
    this.updateCosmeticFilters();
    this.updateAdvancedSettings();
  }

  updateGeneralSettings() {
    const setToggle = (toggle, value) => {
      toggle.classList.toggle('enabled', value);
      toggle.setAttribute('aria-checked', value);
    };

    setToggle(this.enabledToggle, this.settings.enabled !== false);
    setToggle(this.showBadgeToggle, this.settings.showBadge !== false);
    setToggle(this.showNotificationsToggle, this.settings.showNotifications !== false);
    setToggle(this.blockAdsToggle, this.settings.blockAds !== false);
    setToggle(this.blockTrackersToggle, this.settings.blockTrackers !== false);
    setToggle(this.blockMalwareToggle, this.settings.blockMalware !== false);
    setToggle(this.blockAnnoyancesToggle, this.settings.blockAnnoyances !== false);
    setToggle(this.blockSocialToggle, this.settings.blockSocial === true);
    setToggle(this.blockCookieNoticesToggle, this.settings.blockCookieNotices !== false);

    this.themeSelect.value = this.settings.theme || 'system';
    this.languageSelect.value = this.settings.language || 'en';
  }

  updateFilterLists() {
    this.filterListGrid.innerHTML = '';

    this.filterLists.forEach(list => {
      const card = document.createElement('div');
      card.className = 'filter-list-card';
      card.innerHTML = `
        <div class="filter-list-header">
          <div class="filter-list-title">
            <span class="filter-list-name">${this.escapeHtml(list.name)}</span>
            <span class="filter-list-category">${this.escapeHtml(list.category)}</span>
          </div>
          <div class="filter-list-stats">
            <span class="filter-list-count">${list.ruleCount.toLocaleString()} rules</span>
            <span class="filter-list-size">${(list.size / 1024).toFixed(1)} KB</span>
          </div>
        </div>
        <p class="filter-list-description">${this.escapeHtml(list.description)}</p>
        <div class="filter-list-footer">
          <button class="toggle-switch filter-list-toggle ${list.enabled ? 'enabled' : ''}"
                  data-list="${this.escapeHtml(list.id)}"
                  aria-label="${list.enabled ? 'Disable' : 'Enable'} ${list.name}">
            <span class="toggle-thumb"></span>
          </button>
          <a href="${this.escapeHtml(list.homepage)}" target="_blank" class="filter-list-link">View Source</a>
        </div>
      `;
      this.filterListGrid.appendChild(card);
    });

    // Add event listeners to filter list toggles
    this.filterListGrid.querySelectorAll('.filter-list-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        const listId = e.currentTarget.dataset.list;
        this.toggleFilterList(listId, e.currentTarget);
      });
    });

    // Update last updated time
    const lastUpdated = Math.max(...this.filterLists.map(l => l.lastUpdated || 0));
    if (lastUpdated > 0) {
      const date = new Date(lastUpdated);
      this.lastUpdatedText.textContent = date.toLocaleString();
    } else {
      this.lastUpdatedText.textContent = 'Never';
    }

    this.updateIntervalSelect.value = this.settings.updateInterval || 24;
  }

  updateAllowlist() {
    this.allowlistList.innerHTML = '';

    if (this.allowlist.length === 0) {
      this.allowlistList.innerHTML = `
        <li class="allowlist-empty" style="padding: 24px; text-align: center; color: var(--text-muted);">
          No sites in allowlist. Add a domain to allow all content on that site.
        </li>
      `;
      return;
    }

    this.allowlist.forEach(item => {
      const li = document.createElement('li');
      li.className = 'allowlist-item';
      const isDomain = !item.condition.urlFilter.includes('*') && item.condition.urlFilter.startsWith('||');
      li.innerHTML = `
        <div class="allowlist-item-info">
          <span class="allowlist-item-domain">${this.escapeHtml(item.condition.domains?.[0] || item.condition.urlFilter)}</span>
          <span class="allowlist-item-type">${isDomain ? 'Domain' : 'URL Pattern'}</span>
        </div>
        <div class="allowlist-item-actions">
          <button class="delete" data-id="${item.id}" aria-label="Remove from allowlist">Remove</button>
        </div>
      `;
      this.allowlistList.appendChild(li);
    });

    // Add event listeners
    this.allowlistList.querySelectorAll('.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        this.removeFromAllowlist(id);
      });
    });
  }

  updateCustomRules() {
    this.customRulesList.innerHTML = '';

    if (this.customRules.length === 0) {
      this.customRulesList.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted);">
          No custom rules. Create rules to block or allow specific content.
        </div>
      `;
      return;
    }

    this.customRules.forEach(rule => {
      const item = document.createElement('div');
      item.className = 'custom-rule-item';
      const isAllow = rule.action?.type === 'allow';
      item.innerHTML = `
        <div class="custom-rule-info">
          <span class="custom-rule-pattern">${this.escapeHtml(rule.condition?.urlFilter || '')}</span>
          <div class="custom-rule-meta">
            <span class="custom-rule-type ${isAllow ? 'allow' : 'block'}">${isAllow ? 'Allow' : 'Block'}</span>
            ${rule.condition?.domains ? `<span class="custom-rule-domains">${this.escapeHtml(rule.condition.domains.join(', '))}</span>` : ''}
          </div>
        </div>
        <div class="custom-rule-actions">
          <button class="edit" data-id="${rule.id}" aria-label="Edit rule">Edit</button>
          <button class="delete" data-id="${rule.id}" aria-label="Delete rule">Delete</button>
        </div>
      `;
      this.customRulesList.appendChild(item);
    });

    // Add event listeners
    this.customRulesList.querySelectorAll('.edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        this.openCustomRuleModal(id);
      });
    });

    this.customRulesList.querySelectorAll('.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        this.deleteCustomRule(id);
      });
    });
  }

  updateCosmeticFilters() {
    this.cosmeticFiltersList.innerHTML = '';

    if (this.cosmeticFilters.length === 0) {
      this.cosmeticFiltersList.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted);">
          No cosmetic filters. Add CSS selectors to hide page elements.
        </div>
      `;
      return;
    }

    this.cosmeticFilters.forEach(filter => {
      const item = document.createElement('div');
      item.className = 'cosmetic-filter-item';
      const isException = filter.filter.includes('#@#');
      const selector = filter.filter.split(isException ? '#@#' : '##')[1] || filter.filter;
      const domains = filter.domains?.join(', ') || 'All sites';
      item.innerHTML = `
        <div class="cosmetic-filter-info">
          <span class="cosmetic-filter-selector">${this.escapeHtml(selector)}</span>
          <div class="cosmetic-filter-meta">
            <span class="cosmetic-filter-type ${isException ? 'exception' : 'hide'}">${isException ? 'Exception' : 'Hide'}</span>
            <span class="cosmetic-filter-domains">${this.escapeHtml(domains)}</span>
          </div>
        </div>
        <div class="cosmetic-filter-actions">
          <button class="edit" data-id="${filter.id}" aria-label="Edit filter">Edit</button>
          <button class="delete" data-id="${filter.id}" aria-label="Delete filter">Delete</button>
        </div>
      `;
      this.cosmeticFiltersList.appendChild(item);
    });

    // Add event listeners
    this.cosmeticFiltersList.querySelectorAll('.edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        this.openCosmeticFilterModal(id);
      });
    });

    this.cosmeticFiltersList.querySelectorAll('.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        this.deleteCosmeticFilter(id);
      });
    });
  }

  updateAdvancedSettings() {
    const setToggle = (toggle, value) => {
      toggle.classList.toggle('enabled', value);
      toggle.setAttribute('aria-checked', value);
    };

    setToggle(this.strictBlockingToggle, this.settings.advanced?.strictBlocking === true);
    setToggle(this.blockWebRTCToggle, this.settings.advanced?.blockWebRTC === true);
    setToggle(this.blockRemoteFontsToggle, this.settings.advanced?.blockRemoteFonts === true);
    setToggle(this.blockThirdPartyFramesToggle, this.settings.advanced?.blockThirdPartyFrames === true);
    setToggle(this.debugModeToggle, this.settings.debugMode === true);

    // Update stats
    this.advancedStatsGrid.innerHTML = `
      <div class="stat-card">
        <span class="stat-value">${this.stats.totalBlocked?.toLocaleString() || 0}</span>
        <span class="stat-label">Total Blocked</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${(this.stats.blockedByType?.ads || 0).toLocaleString()}</span>
        <span class="stat-label">Ads</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${(this.stats.blockedByType?.trackers || 0).toLocaleString()}</span>
        <span class="stat-label">Trackers</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${(this.stats.blockedByType?.malware || 0).toLocaleString()}</span>
        <span class="stat-label">Malware</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${(this.stats.blockedByType?.annoyances || 0).toLocaleString()}</span>
        <span class="stat-label">Annoyances</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${(this.stats.blockedByType?.cookieNotices || 0).toLocaleString()}</span>
        <span class="stat-label">Cookie Notices</span>
      </div>
    `;
  }

  showTab(tabName) {
    this.currentTab = tabName;

    // Update nav
    this.navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tabName);
    });

    // Update panels
    this.tabPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });

    // Load tab-specific data
    if (tabName === 'filter-lists') {
      this.loadFilterLists();
    } else if (tabName === 'allowlist') {
      this.loadAllowlist();
    } else if (tabName === 'custom-rules') {
      this.loadCustomRules();
    } else if (tabName === 'cosmetic') {
      this.loadCosmeticFilters();
    } else if (tabName === 'advanced') {
      this.loadStats();
    }
  }

  // Settings actions
  async toggleSetting(key, toggleElement) {
    const currentValue = this.getNestedValue(this.settings, key);
    const newValue = !currentValue;

    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTING',
        payload: { key, value: newValue }
      });

      this.setNestedValue(this.settings, key, newValue);
      toggleElement.classList.toggle('enabled', newValue);
      toggleElement.setAttribute('aria-checked', newValue);
    } catch (error) {
      console.error('[Options] Failed to toggle setting:', error);
      this.showNotification('Failed to update setting', 'error');
    }
  }

  async updateSetting(key, value) {
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTING',
        payload: { key, value }
      });

      this.setNestedValue(this.settings, key, value);
    } catch (error) {
      console.error('[Options] Failed to update setting:', error);
      this.showNotification('Failed to update setting', 'error');
    }
  }

  async toggleFilterList(listKey, toggleElement) {
    const list = this.filterLists.find(l => l.id === listKey);
    if (!list) return;

    const newState = !list.enabled;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TOGGLE_FILTER_LIST',
        payload: { key: listKey, enabled: newState }
      });

      if (response?.success) {
        list.enabled = newState;
        if (toggleElement) {
          toggleElement.classList.toggle('enabled', newState);
          toggleElement.setAttribute('aria-checked', newState);
        }
        this.showNotification(`${list.name} ${newState ? 'enabled' : 'disabled'}`, 'success');
      }
    } catch (error) {
      console.error('[Options] Failed to toggle filter list:', error);
      this.showNotification('Failed to update filter list', 'error');
    }
  }

  async updateFilterLists() {
    this.updateNowBtn.disabled = true;
    this.updateNowBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinning">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      Updating...
    `;

    try {
      await chrome.runtime.sendMessage({ type: 'UPDATE_FILTER_LISTS' });
      await this.loadFilterLists();
      this.showNotification('Filter lists updated', 'success');
    } catch (error) {
      console.error('[Options] Failed to update filter lists:', error);
      this.showNotification('Failed to update filter lists', 'error');
    } finally {
      this.updateNowBtn.disabled = false;
      this.updateNowBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        Update Now
      `;
    }
  }

  // Allowlist
  async addToAllowlist() {
    const input = this.allowlistInput.value.trim();
    if (!input) return;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ADD_TO_ALLOWLIST',
        payload: { url: input }
      });

      if (response?.rule) {
        this.allowlistInput.value = '';
        await this.loadAllowlist();
        this.showNotification('Added to allowlist', 'success');
      }
    } catch (error) {
      console.error('[Options] Failed to add to allowlist:', error);
      this.showNotification('Failed to add to allowlist', 'error');
    }
  }

  async removeFromAllowlist(id) {
    try {
      await chrome.runtime.sendMessage({
        type: 'REMOVE_FROM_ALLOWLIST',
        payload: { id }
      });

      await this.loadAllowlist();
      this.showNotification('Removed from allowlist', 'success');
    } catch (error) {
      console.error('[Options] Failed to remove from allowlist:', error);
      this.showNotification('Failed to remove from allowlist', 'error');
    }
  }

  async loadAllowlist() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ALLOWLIST' });
      this.allowlist = response || [];
      this.updateAllowlist();
    } catch (error) {
      console.error('[Options] Failed to load allowlist:', error);
    }
  }

  // Custom Rules
  openCustomRuleModal(ruleId = null) {
    this.customRuleForm.reset();
    this.customRuleId.value = '';

    if (ruleId) {
      const rule = this.customRules.find(r => r.id === ruleId);
      if (rule) {
        this.customRuleModalTitle.textContent = 'Edit Custom Rule';
        this.customRuleId.value = rule.id;
        this.customRuleType.value = rule.action?.type === 'allow' ? 'allow' : 'block';
        this.customRulePattern.value = rule.condition?.urlFilter || '';
        this.customRuleDomains.value = rule.condition?.domains?.join(', ') || '';
      }
    } else {
      this.customRuleModalTitle.textContent = 'Add Custom Rule';
    }

    this.customRuleModal.classList.remove('hidden');
    this.customRulePattern.focus();
  }

  closeCustomRuleModal() {
    this.customRuleModal.classList.add('hidden');
  }

  async saveCustomRule(event) {
    event.preventDefault();

    const id = this.customRuleId.value ? parseInt(this.customRuleId.value) : null;
    const type = this.customRuleType.value;
    const pattern = this.customRulePattern.value.trim();
    const domains = this.customRuleDomains.value.split(',').map(d => d.trim()).filter(d => d);

    if (!pattern) {
      this.showNotification('Please enter a filter pattern', 'error');
      return;
    }

    const rule = {
      condition: {
        urlFilter: pattern,
        ...(domains.length > 0 && { domains })
      },
      action: { type },
      priority: 1
    };

    try {
      if (id) {
        await chrome.runtime.sendMessage({
          type: 'UPDATE_CUSTOM_RULE',
          payload: { id, updates: rule }
        });
        this.showNotification('Rule updated', 'success');
      } else {
        const response = await chrome.runtime.sendMessage({
          type: 'ADD_CUSTOM_RULE',
          payload: rule
        });
        if (response?.rule) {
          this.showNotification('Rule added', 'success');
        }
      }

      this.closeCustomRuleModal();
      await this.loadCustomRules();
    } catch (error) {
      console.error('[Options] Failed to save custom rule:', error);
      this.showNotification('Failed to save rule', 'error');
    }
  }

  async deleteCustomRule(id) {
    if (!confirm('Delete this rule?')) return;

    try {
      await chrome.runtime.sendMessage({
        type: 'REMOVE_CUSTOM_RULE',
        payload: { id }
      });

      await this.loadCustomRules();
      this.showNotification('Rule deleted', 'success');
    } catch (error) {
      console.error('[Options] Failed to delete custom rule:', error);
      this.showNotification('Failed to delete rule', 'error');
    }
  }

  async loadCustomRules() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CUSTOM_RULES' });
      this.customRules = response || [];
      this.updateCustomRules();
    } catch (error) {
      console.error('[Options] Failed to load custom rules:', error);
    }
  }

  // Cosmetic Filters
  openCosmeticFilterModal(filterId = null) {
    this.cosmeticFilterForm.reset();
    this.cosmeticFilterId.value = '';

    if (filterId) {
      const filter = this.cosmeticFilters.find(f => f.id === filterId);
      if (filter) {
        this.cosmeticFilterModalTitle.textContent = 'Edit Cosmetic Filter';
        this.cosmeticFilterId.value = filter.id;
        const isException = filter.filter.includes('#@#');
        const parts = filter.filter.split(isException ? '#@#' : '##');
        this.cosmeticFilterSelector.value = parts[1] || '';
        this.cosmeticFilterDomains.value = filter.domains?.join(', ') || '';
        this.cosmeticFilterException.checked = isException;
      }
    } else {
      this.cosmeticFilterModalTitle.textContent = 'Add Cosmetic Filter';
    }

    this.cosmeticFilterModal.classList.remove('hidden');
    this.cosmeticFilterSelector.focus();
  }

  closeCosmeticFilterModal() {
    this.cosmeticFilterModal.classList.add('hidden');
  }

  async saveCosmeticFilter(event) {
    event.preventDefault();

    const id = this.cosmeticFilterId.value ? parseInt(this.cosmeticFilterId.value) : null;
    const selector = this.cosmeticFilterSelector.value.trim();
    const domains = this.cosmeticFilterDomains.value.split(',').map(d => d.trim()).filter(d => d);
    const isException = this.cosmeticFilterException.checked;

    if (!selector) {
      this.showNotification('Please enter a CSS selector', 'error');
      return;
    }

    const filter = {
      filter: `${domains.join(',')}${isException ? '#@#' : '##'}${selector}`,
      domains,
      enabled: true
    };

    try {
      if (id) {
        await chrome.runtime.sendMessage({
          type: 'UPDATE_COSMETIC_FILTER',
          payload: { id, filter }
        });
        this.showNotification('Filter updated', 'success');
      } else {
        await chrome.runtime.sendMessage({
          type: 'ADD_COSMETIC_FILTER',
          payload: filter
        });
        this.showNotification('Filter added', 'success');
      }

      this.closeCosmeticFilterModal();
      await this.loadCosmeticFilters();
    } catch (error) {
      console.error('[Options] Failed to save cosmetic filter:', error);
      this.showNotification('Failed to save filter', 'error');
    }
  }

  async deleteCosmeticFilter(id) {
    if (!confirm('Delete this filter?')) return;

    try {
      await chrome.runtime.sendMessage({
        type: 'REMOVE_COSMETIC_FILTER',
        payload: { id }
      });

      await this.loadCosmeticFilters();
      this.showNotification('Filter deleted', 'success');
    } catch (error) {
      console.error('[Options] Failed to delete cosmetic filter:', error);
      this.showNotification('Failed to delete filter', 'error');
    }
  }

  async loadCosmeticFilters() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_COSMETIC_FILTERS' });
      this.cosmeticFilters = response || [];
      this.updateCosmeticFilters();
    } catch (error) {
      console.error('[Options] Failed to load cosmetic filters:', error);
    }
  }

  async loadFilterLists() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_FILTER_LISTS' });
      this.filterLists = response || [];
      this.updateFilterLists();
    } catch (error) {
      console.error('[Options] Failed to load filter lists:', error);
    }
  }

  async loadStats() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_GLOBAL_STATS' });
      this.stats = response || {};
      this.updateAdvancedSettings();
    } catch (error) {
      console.error('[Options] Failed to load stats:', error);
    }
  }

  // Advanced actions
  async exportData() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'EXPORT_DATA' });

      if (response) {
        const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `adblocker-pro-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showNotification('Settings exported', 'success');
      }
    } catch (error) {
      console.error('[Options] Failed to export data:', error);
      this.showNotification('Failed to export data', 'error');
    }
  }

  async importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const response = await chrome.runtime.sendMessage({
        type: 'IMPORT_DATA',
        payload: { data }
      });

      if (response?.success) {
        this.showNotification('Settings imported successfully', 'success');
        await this.loadAllData();
      } else {
        this.showNotification('Invalid backup file', 'error');
      }
    } catch (error) {
      console.error('[Options] Failed to import data:', error);
      this.showNotification('Failed to import data', 'error');
    } finally {
      event.target.value = '';
    }
  }

  async resetAllSettings() {
    if (!confirm('This will reset ALL settings to defaults. Are you sure?')) return;

    try {
      await chrome.runtime.sendMessage({ type: 'RESET_SETTINGS' });
      this.showNotification('All settings reset', 'success');
      await this.loadAllData();
    } catch (error) {
      console.error('[Options] Failed to reset settings:', error);
      this.showNotification('Failed to reset settings', 'error');
    }
  }

  async resetStatistics() {
    if (!confirm('Reset all blocking statistics?')) return;

    try {
      await chrome.runtime.sendMessage({ type: 'RESET_STATS' });
      this.showNotification('Statistics reset', 'success');
      await this.loadStats();
    } catch (error) {
      console.error('[Options] Failed to reset statistics:', error);
      this.showNotification('Failed to reset statistics', 'error');
    }
  }

  // Utility functions
  getNestedValue(obj, path) {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((o, k) => o[k] = o[k] || {}, obj);
    target[lastKey] = value;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `adblocker-notification ${type}`;
    notification.innerHTML = `
      <span class="adblocker-notification-icon">
        ${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}
      </span>
      <div class="adblocker-notification-content">
        <div class="adblocker-notification-title">${this.escapeHtml(message)}</div>
      </div>
      <button class="adblocker-notification-close">&times;</button>
    `;

    document.body.appendChild(notification);

    notification.querySelector('.adblocker-notification-close').addEventListener('click', () => {
      notification.remove();
    });

    setTimeout(() => {
      notification.style.animation = 'adblocker-slide-in 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }

  showAddCustomListDialog() {
    const url = prompt('Enter the URL of the filter list:');
    if (!url) return;

    const name = prompt('Enter a name for this filter list:');
    if (!name) return;

    this.addCustomList(url, name);
  }

  async addCustomList(url, name) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ADD_CUSTOM_FILTER_LIST',
        payload: { url, name }
      });

      if (response?.id) {
        this.showNotification('Custom filter list added', 'success');
        await this.loadFilterLists();
      }
    } catch (error) {
      console.error('[Options] Failed to add custom list:', error);
      this.showNotification('Failed to add custom list', 'error');
    }
  }

  handleBackgroundMessage(message) {
    switch (message.type) {
      case 'SETTINGS_UPDATED':
        this.loadAllData();
        break;
      case 'FILTER_LISTS_UPDATED':
        this.loadFilterLists();
        break;
      case 'STATS_UPDATED':
        this.loadStats();
        break;
    }
  }

  openFullHelp() {
    chrome.tabs.create({ url: chrome.runtime.getURL("help/help.html") });
  }

  openGitHubIssues() {
    chrome.tabs.create({ url: "https://github.com/bhatiaarav61/AeroGuard/issues" });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.optionsController = new OptionsController();
});

// Add spinning animation for update button
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .spinning {
    animation: spin 1s linear infinite;
  }
`;
document.head.appendChild(style);