/**
 * AeroGuard - Popup Script
 * Handles UI interactions for the extension popup
 */

class PopupController {
  constructor() {
    this.tab = null;
    this.extensionEnabled = true;
    this.tabEnabled = true;
    this.stats = { blocked: 0, trackers: 0, ads: 0, malware: 0 };
    this.filterLists = [];
    this.updateInterval = null;
    this.init();
  }

  async init() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      this.tab = tabs[0] || null;
      this.cacheElements();
      await this.loadAllData();
      this.setupEventListeners();
      this.startPeriodicUpdates();
      console.log('[AeroGuard Popup] Initialized');
    } catch (error) {
      console.error('[Popup] Init error:', error);
    }
  }

  cacheElements() {
    this.mainToggle = document.getElementById('mainToggle');
    this.toggleStatus = document.getElementById('toggleStatus');
    this.siteToggle = document.getElementById('siteToggle');
    this.siteToggleStatus = document.getElementById('siteToggleStatus');
    this.blockedCount = document.getElementById('blockedCount');
    this.trackersBlocked = document.getElementById('trackersBlocked');
    this.adsBlocked = document.getElementById('adsBlocked');
    this.malwareBlocked = document.getElementById('malwareBlocked');
    this.elementPickerBtn = document.getElementById('elementPickerBtn');
    this.reportIssueBtn = document.getElementById('reportIssueBtn');
    this.filterListsContainer = document.getElementById('filterLists');
    this.updateListsBtn = document.getElementById('updateListsBtn');
    this.siteIcon = document.getElementById('siteIcon');
    this.siteName = document.getElementById('siteName');
    this.siteUrl = document.getElementById('siteUrl');
    this.optionsBtn = document.getElementById('optionsBtn');
    this.helpBtn = document.getElementById('helpBtn');
  }

  setupEventListeners() {
    this.mainToggle.addEventListener('click', () => this.toggleExtension());
    this.siteToggle.addEventListener('click', () => this.toggleSite());
    this.elementPickerBtn.addEventListener('click', () => this.startElementPicker());
    this.reportIssueBtn.addEventListener('click', () => this.reportIssue());
    this.updateListsBtn.addEventListener('click', () => this.updateFilterLists());
    this.optionsBtn.addEventListener('click', () => this.openOptions());
    this.helpBtn.addEventListener('click', () => this.openHelp());

    chrome.runtime.onMessage.addListener((message) => this.handleBackgroundMessage(message));
  }

  async loadAllData() {
    await Promise.all([
      this.loadExtensionState(),
      this.loadStats(),
      this.loadFilterLists(),
      this.loadSiteInfo()
    ]);
  }

  async loadExtensionState() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_EXTENSION_STATE' });
      if (response) {
        this.extensionEnabled = response.enabled;
        this.tabEnabled = response.tabEnabled !== false;
        this.updateToggleUI();
      }
    } catch (error) {
      console.error('[Popup] Failed to load extension state:', error);
    }
  }

  async loadStats() {
    if (!this.tab) return;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TAB_STATS', tabId: this.tab.id
      });
      if (response) {
        this.stats = {
          blocked: response.blockedCount || 0,
          trackers: response.blockedByType?.trackers || 0,
          ads: response.blockedByType?.ads || 0,
          malware: response.blockedByType?.malware || 0
        };
        this.updateStatsUI();
      }
    } catch (error) {
      console.error('[Popup] Failed to load stats:', error);
    }
  }

  async loadFilterLists() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_FILTER_LISTS' });
      if (response) {
        this.filterLists = response;
        this.renderFilterLists();
      }
    } catch (error) {
      console.error('[Popup] Failed to load filter lists:', error);
    }
  }

  async loadSiteInfo() {
    // Handle case where tab might be undefined
    if (!this.tab || !this.tab?.url) {
      this.siteName.textContent = 'Unknown';
      this.siteUrl.textContent = '';
      this.siteIcon.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
        </svg>
      `;
      this.siteIcon.style.background = 'var(--primary-light)';
      this.siteIcon.style.color = 'var(--primary)';
      return;
    }
    try {
      const url = new URL(this.tab.url);
      const domain = url.hostname.replace(/^www\./, '');
      // Use AeroGuard logo instead of website's first letter
      this.siteIcon.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
        </svg>
      `;
      this.siteIcon.style.background = 'var(--primary-light)';
      this.siteIcon.style.color = 'var(--primary)';
      this.siteName.textContent = domain;
      this.siteUrl.textContent = url.origin;
    } catch {
      this.siteName.textContent = 'Unknown';
      this.siteUrl.textContent = '';
    }
  }

  updateToggleUI() {
    this.mainToggle.classList.toggle('enabled', this.extensionEnabled);
    this.toggleStatus.textContent = this.extensionEnabled ? 'Active' : 'Inactive';
    this.toggleStatus.classList.toggle('off', !this.extensionEnabled);

    this.siteToggle.classList.toggle('enabled', this.tabEnabled);
    this.siteToggleStatus.textContent = this.tabEnabled ? 'Enabled' : 'Disabled';
    this.siteToggleStatus.classList.toggle('off', !this.tabEnabled);

    this.siteToggle.disabled = !this.extensionEnabled;
    this.siteToggle.style.opacity = this.extensionEnabled ? '1' : '0.5';
  }

  updateStatsUI() {
    this.animateValue(this.blockedCount, this.stats.blocked);
    this.animateValue(this.trackersBlocked, this.stats.trackers);
    this.animateValue(this.adsBlocked, this.stats.ads);
    this.animateValue(this.malwareBlocked, this.stats.malware);
  }

  animateValue(element, target) {
    const current = parseInt(element.textContent) || 0;
    if (current === target) return;
    const duration = 500;
    const start = performance.now();
    const animate = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(current + (target - current) * eased);
      element.textContent = value > 999 ? '999+' : value;
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  renderFilterLists() {
    this.filterListsContainer.innerHTML = '';
    this.filterLists.forEach(list => {
      const item = document.createElement('div');
      item.className = 'filter-list-item';
      item.innerHTML = `
        <div class="filter-list-info">
          <span class="filter-list-name">${this.escapeHtml(list.name)}</span>
          <span class="filter-list-count">${list.ruleCount.toLocaleString()} rules</span>
        </div>
        <button class="toggle-switch filter-list-toggle ${list.enabled ? 'enabled' : ''}"
                data-list="${this.escapeHtml(list.id)}"
                aria-label="${list.enabled ? 'Disable' : 'Enable'} ${list.name}">
          <span class="toggle-thumb"></span>
        </button>
      `;
      this.filterListsContainer.appendChild(item);
    });

    this.filterListsContainer.querySelectorAll('.filter-list-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => this.toggleFilterList(e.currentTarget.dataset.list));
    });
  }

  async toggleExtension() {
    const newState = !this.extensionEnabled;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TOGGLE_EXTENSION', payload: { enabled: newState }
      });
      if (response?.enabled !== undefined) {
        this.extensionEnabled = response.enabled;
        this.updateToggleUI();
        await this.loadStats();
      } else if (response?.error) {
        console.error('[Popup] Toggle extension error:', response.error);
        this.showNotification('Failed to toggle protection', 'error');
      }
    } catch (error) {
      console.error('[Popup] Failed to toggle extension:', error);
      this.showNotification('Failed to toggle protection', 'error');
    }
  }

  async toggleSite() {
    if (!this.tab) return;
    const newState = !this.tabEnabled;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TOGGLE_TAB', payload: { enabled: newState }
      });
      if (response?.tabEnabled !== undefined) {
        this.tabEnabled = response.tabEnabled;
        this.updateToggleUI();
        await this.loadStats();
      } else if (response?.error) {
        console.error('[Popup] Toggle site error:', response.error);
        this.showNotification('Failed to toggle site protection', 'error');
      }
    } catch (error) {
      console.error('[Popup] Failed to toggle site:', error);
      this.showNotification('Failed to toggle site protection', 'error');
    }
  }

  async toggleFilterList(listId) {
    const list = this.filterLists.find(l => l.id === listId);
    if (!list) return;
    const newState = !list.enabled;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TOGGLE_FILTER_LIST', payload: { key: listId, enabled: newState }
      });
      if (response?.success) {
        list.enabled = newState;
        this.renderFilterLists();
        await this.loadStats();
      }
    } catch (error) {
      console.error('[Popup] Failed to toggle filter list:', error);
    }
  }

  async updateFilterLists() {
    this.updateListsBtn.disabled = true;
    this.updateListsBtn.textContent = 'Updating...';
    try {
      const response = await chrome.runtime.sendMessage({ type: 'UPDATE_FILTER_LISTS' });
      if (response?.success) {
        await this.loadFilterLists();
        await this.loadStats();
        this.showNotification('Filter lists updated successfully', 'success');
      } else if (response?.error) {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('[Popup] Failed to update filter lists:', error);
      this.showNotification('Failed to update lists: ' + error.message, 'error');
    } finally {
      this.updateListsBtn.disabled = false;
      this.updateListsBtn.textContent = 'Update Lists';
    }
  }

  startElementPicker() {
    if (!this.tab) return;
    this.showNotification('Click on any element to block it', 'info');
    chrome.tabs.sendMessage(this.tab.id, { type: 'ELEMENT_PICKER_START' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Popup] Element picker error:', chrome.runtime.lastError.message);
        this.showNotification('Failed to start element picker. Please refresh the page.', 'error');
        return;
      }
      if (response?.selector) {
        this.showNotification('Element selected! Right-click to block.', 'info');
      }
    });
  }

  reportIssue() {
    if (!this.tab) return;
    const url = encodeURIComponent(this.tab.url);
    chrome.tabs.create({ url: `https://github.com/aeroguard/aeroguard/issues/new?template=unblocked-ad.md&url=${url}` });
    this.showNotification('Opening issue reporter...', 'info');
  }

  openOptions() {
    chrome.runtime.openOptionsPage();
  }

  openHelp() {
    chrome.tabs.create({ url: chrome.runtime.getURL('help/help.html') });
  }

  handleBackgroundMessage(message) {
    switch (message.type) {
      case 'EXTENSION_TOGGLED':
        this.extensionEnabled = message.enabled;
        this.updateToggleUI();
        break;
      case 'STATS_UPDATED':
        if (message.tabId === this.tab?.id) {
          this.stats = message.stats;
          this.updateStatsUI();
        }
        break;
      case 'FILTER_LISTS_UPDATED':
        this.loadFilterLists();
        break;
    }
  }

  startPeriodicUpdates() {
    this.updateInterval = setInterval(() => this.loadStats(), 3000);
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `adblocker-notification ${type}`;
    notification.innerHTML = `
      <span class="adblocker-notification-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <div class="adblocker-notification-content"><div class="adblocker-notification-title">${this.escapeHtml(message)}</div></div>
      <button class="adblocker-notification-close">&times;</button>
    `;
    document.body.appendChild(notification);
    notification.querySelector('.adblocker-notification-close').addEventListener('click', () => notification.remove());
    setTimeout(() => {
      notification.style.animation = 'adblocker-slide-in 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy() {
    if (this.updateInterval) clearInterval(this.updateInterval);
  }
}

document.addEventListener('DOMContentLoaded', () => { window.popupController = new PopupController(); });
window.addEventListener('beforeunload', () => { if (window.popupController) window.popupController.destroy(); });
