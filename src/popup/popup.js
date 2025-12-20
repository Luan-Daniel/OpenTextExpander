/**
 * Popup script - manage expansions and shortcuts UI
 */

class PopupManager {
  constructor() {
    this.expansions = [];
    this.shortcuts = [];
    this.editingExpansionIndex = null;
    this.editingShortcutIndex = null;
    this.currentLanguage = 'en';
    this.extensionReady = false;
    this.contentScriptReady = false;
    
    this.setupElements();
    this.attachListeners();
    this.loadLanguage();
    this.loadData();
    this.checkExtensionStatus();
  }

  setupElements() {
    // Status indicator
    this.statusIndicator = document.getElementById('statusIndicator');
    
    // Language switcher
    this.langSwitcher = document.getElementById('langSwitcher');
    
    // Tab buttons
    this.tabButtons = document.querySelectorAll('.tab-button');
    
    // Lists
    this.expansionsList = document.getElementById('expansionsList');
    this.shortcutsList = document.getElementById('shortcutsList');
    
    // Buttons
    this.addExpansionBtn = document.getElementById('addExpansionBtn');
    this.addShortcutBtn = document.getElementById('addShortcutBtn');
    this.testPageLink = document.getElementById('testPageLink');
    this.githubLink = document.getElementById('githubLink');
    this.importBtn = document.getElementById('importBtn');
    this.exportBtn = document.getElementById('exportBtn');
    this.domainScope = document.getElementById('domainScope');
    this.currentDomainEl = document.getElementById('currentDomain');
    this.punctAware = document.getElementById('punctAware');
    this.caseSensitive = document.getElementById('caseSensitive');
    
    // Modals
    this.expansionModal = document.getElementById('expansionModal');
    this.shortcutModal = document.getElementById('shortcutModal');
    
    // Forms
    this.expansionForm = document.getElementById('expansionForm');
    this.shortcutForm = document.getElementById('shortcutForm');
    
    // Form fields
    this.expansionTrigger = document.getElementById('expansionTrigger');
    this.expansionReplacement = document.getElementById('expansionReplacement');
    this.deleteExpansionBtn = document.getElementById('deleteExpansionBtn');
    
    this.ctrlKey = document.getElementById('ctrlKey');
    this.shiftKey = document.getElementById('shiftKey');
    this.altKey = document.getElementById('altKey');
    this.mainKey = document.getElementById('mainKey');
    this.shortcutText = document.getElementById('shortcutText');
    this.deleteShortcutBtn = document.getElementById('deleteShortcutBtn');
    
    // Close buttons
    this.closeButtons = document.querySelectorAll('.close');
  }

  attachListeners() {
    // Language switcher
    this.langSwitcher.addEventListener('click', () => this.switchLanguage());
    
    // Tab switching
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // Add buttons
    this.addExpansionBtn.addEventListener('click', () => this.openExpansionModal());
    this.addShortcutBtn.addEventListener('click', () => this.openShortcutModal());
    this.importBtn.addEventListener('click', () => this.importSettings());
    this.exportBtn.addEventListener('click', () => this.exportSettings());
    this.domainScope.addEventListener('change', () => this.toggleScope());
    this.punctAware.addEventListener('change', () => this.saveSettings());
    this.caseSensitive.addEventListener('change', () => this.saveSettings());

    // Test page links
    this.testPageLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.openTestPage();
    });
    this.githubLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.openGitHubPage();
    });

    // Forms
    this.expansionForm.addEventListener('submit', (e) => this.saveExpansion(e));
    this.shortcutForm.addEventListener('submit', (e) => this.saveShortcut(e));

    // Delete buttons
    this.deleteExpansionBtn.addEventListener('click', () => this.deleteExpansion());
    this.deleteShortcutBtn.addEventListener('click', () => this.deleteShortcut());

    // Close modals
    this.closeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        this.closeModal(modal);
      });
    });

    // Close modal on outside click
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.closeModal(e.target);
      }
    });
  }

  /**
   * Open the test page in a new tab
   */
  openTestPage() {
    const chrome_api = typeof chrome !== 'undefined' ? chrome : 
                      typeof browser !== 'undefined' ? browser : null;
    
    if (!chrome_api) return;

    // Get extension URL and create test page path
    const testPageUrl = chrome_api.runtime.getURL('src/debug/test-page.html');
    
    // Open in new tab
    if (chrome_api.tabs) {
      chrome_api.tabs.create({ url: testPageUrl });
    } else if (chrome_api.windows) {
      // Firefox fallback
      chrome_api.windows.openDefaultBrowser?.(testPageUrl);
    }
  }

  openGitHubPage() {
    const githubUrl = 'https://github.com/Luan-Daniel/OpenTextExpander';
    window.open(githubUrl, '_blank');
  }

  async loadData() {
    try {
      const chrome_api = typeof chrome !== 'undefined' ? chrome : 
                        typeof browser !== 'undefined' ? browser : null;
      
      if (!chrome_api) return;

      // Restore scope preference
      const savedScope = localStorage.getItem('crapless_domainScope') === 'true';
      if (this.domainScope) {
        this.domainScope.checked = savedScope;
      }

      // Resolve current active tab domain (must be async)
      const domain = await new Promise((resolve) => {
        chrome_api.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
          const url = tabs && tabs[0]?.url;
          try {
            const hostname = url ? new URL(url).hostname : '';
            this.currentDomain = hostname;
            if (this.currentDomainEl) this.currentDomainEl.textContent = hostname ? `Domain: ${hostname}` : '';
            resolve(hostname);
          } catch {
            resolve('');
          }
        });
      });

      const scope = this.domainScope?.checked ? 'domain' : 'global';

      // Load expansions
      chrome_api.runtime.sendMessage(
        { action: 'getExpansions', scope, domain },
        (response) => {
          if (response) {
            this.expansions = response.expansions || [];
            this.renderExpansions();
          }
        }
      );

      // Load shortcuts
      chrome_api.runtime.sendMessage(
        { action: 'getShortcuts', scope, domain },
        (response) => {
          if (response) {
            this.shortcuts = response.shortcuts || [];
            this.renderShortcuts();
          }
        }
      );

      // Load settings
      chrome_api.runtime.sendMessage(
        { action: 'getSettings' },
        (response) => {
          const settings = response?.settings || {};
          this.punctAware.checked = !!settings.punctuationAware;
          this.caseSensitive.checked = !!settings.caseSensitive;
        }
      );
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }

  switchTab(tabName) {
    // Update active tab button
    this.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update active content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
  }

  // Save settings (punctuation aware, case sensitive)
  saveSettings() {
    const chrome_api = typeof chrome !== 'undefined' ? chrome : 
                      typeof browser !== 'undefined' ? browser : null;
    if (!chrome_api) return;
    const settings = {
      punctuationAware: this.punctAware.checked,
      caseSensitive: this.caseSensitive.checked
    };
    chrome_api.runtime.sendMessage({ action: 'saveSettings', settings }, () => {
      // Broadcast to all tabs to reload engine
      chrome_api.tabs?.query({}, (tabs) => {
        tabs?.forEach(tab => {
          chrome_api.tabs.sendMessage(tab.id, { action: 'settingsUpdated' }, () => {
            void chrome_api.runtime.lastError;
          });
        });
      });
    });
  }

  // Scope toggle: reload data with new scope
  toggleScope() {
    const chrome_api = typeof chrome !== 'undefined' ? chrome : 
                      typeof browser !== 'undefined' ? browser : null;
    if (!chrome_api) return;

    const checked = this.domainScope.checked;
    this.currentDomainEl.textContent = checked ? window.location.hostname : '';
    
    // Persist scope preference to localStorage
    localStorage.setItem('crapless_domainScope', checked ? 'true' : 'false');
    
    // Persist scope to storage.sync so content scripts can see it
    chrome_api.runtime.sendMessage(
      { 
        action: 'saveSettings', 
        settings: { 
          domainScope: checked 
        },
        merge: true // Signal to merge with existing settings
      },
      () => {
        // Reload data with new scope
        this.loadData();
      }
    );
  }

  /**
   * Export all settings (global + domain-specific) to JSON file
   */
  exportSettings() {
    const chrome_api = typeof chrome !== 'undefined' ? chrome : 
                      typeof browser !== 'undefined' ? browser : null;
    if (!chrome_api) return;

    // Get all data at once
    chrome_api.storage?.sync?.get(null, (allData) => {
      const backup = {
        version: 1,
        exportDate: new Date().toISOString(),
        global: {
          expansions: allData?.expansions || [],
          shortcuts: allData?.shortcuts || [],
          settings: allData?.settings || {}
        },
        domains: {
          expansions: allData?.expansions_domains || {},
          shortcuts: allData?.shortcuts_domains || {}
        }
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `open-text-expander-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  /**
   * Import all settings from JSON backup file
   */
  importSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const backup = JSON.parse(text);

        const chrome_api = typeof chrome !== 'undefined' ? chrome : 
                          typeof browser !== 'undefined' ? browser : null;
        if (!chrome_api) return;

        const updates = {};

        // Restore global data
        if (backup.global) {
          if (Array.isArray(backup.global.expansions)) {
            updates.expansions = backup.global.expansions;
          }
          if (Array.isArray(backup.global.shortcuts)) {
            updates.shortcuts = backup.global.shortcuts;
          }
          if (backup.global.settings && typeof backup.global.settings === 'object') {
            updates.settings = backup.global.settings;
          }
        }

        // Restore domain data
        if (backup.domains) {
          if (backup.domains.expansions && typeof backup.domains.expansions === 'object') {
            updates.expansions_domains = backup.domains.expansions;
          }
          if (backup.domains.shortcuts && typeof backup.domains.shortcuts === 'object') {
            updates.shortcuts_domains = backup.domains.shortcuts;
          }
        }

        // Save all updates
        chrome_api.storage?.sync?.set(updates, () => {
          // Reload current popup
          this.loadData();
          alert('All settings imported successfully!');
        });
      } catch (e) {
        alert('Invalid backup file: ' + e.message);
      }
    };
    input.click();
  }

  /**
   * Load the saved language preference
   */
  loadLanguage() {
    const saved = localStorage.getItem('crapless_language') || 'en';
    this.currentLanguage = saved;
    this.updateLanguageButton();
    this.applyTranslations();
  }

  /**
   * Cycle through languages: EN -> PT -> ES -> EN
   */
  switchLanguage() {
    const languages = ['en', 'pt', 'es'];
    const currentIndex = languages.indexOf(this.currentLanguage);
    const nextIndex = (currentIndex + 1) % languages.length;
    this.currentLanguage = languages[nextIndex];
    
    localStorage.setItem('crapless_language', this.currentLanguage);
    this.updateLanguageButton();
    this.applyTranslations();
  }

  /**
   * Update the language button text
   */
  updateLanguageButton() {
    const langMap = { en: 'EN', pt: 'PT', es: 'ES' };
    this.langSwitcher.textContent = `Lang: ${langMap[this.currentLanguage]}`;
  }

  /**
   * Apply translations to all UI elements
   */
  async applyTranslations() {
    try {
      const response = await fetch(`/_locales/${this.currentLanguage}/messages.json`);
      const messages = await response.json();
      
      // Update tab buttons
      const tabButtons = document.querySelectorAll('.tab-button');
      if (tabButtons[0]) tabButtons[0].textContent = messages.textExpansions.message;
      if (tabButtons[1]) tabButtons[1].textContent = messages.keyboardShortcuts.message;
      
      // Update buttons
      if (this.addExpansionBtn) this.addExpansionBtn.textContent = messages.addExpansion.message;
      if (this.addShortcutBtn) this.addShortcutBtn.textContent = messages.addShortcut.message;
      if (this.importBtn) this.importBtn.textContent = messages.import.message;
      if (this.exportBtn) this.exportBtn.textContent = messages.export.message;
      if (this.testPageLink) this.testPageLink.textContent = messages.testPage.message;
      if (this.githubLink) this.githubLink.textContent = messages.repoLink.message;
      
      // Update modal titles (using h2, not h3)
      const expansionModalTitle = document.querySelector('#expansionModal h2');
      const shortcutModalTitle = document.querySelector('#shortcutModal h2');
      if (expansionModalTitle) expansionModalTitle.textContent = messages.editExpansion.message;
      if (shortcutModalTitle) shortcutModalTitle.textContent = messages.editShortcut.message;
      
      // Update form labels
      const triggerLabel = document.querySelector('label[for="expansionTrigger"]');
      const replacementLabel = document.querySelector('label[for="expansionReplacement"]');
      const keysLabel = document.querySelector('#shortcutModal .form-group label');
      const textLabel = document.querySelector('label[for="shortcutText"]');
      
      if (triggerLabel) triggerLabel.textContent = messages.trigger.message;
      if (replacementLabel) replacementLabel.textContent = messages.replacement.message;
      if (keysLabel) keysLabel.textContent = messages.keys.message;
      if (textLabel) textLabel.textContent = messages.textToInsert.message;
      
      // Update placeholders
      if (this.expansionTrigger) this.expansionTrigger.placeholder = messages.triggerPlaceholder.message;
      if (this.expansionReplacement) this.expansionReplacement.placeholder = messages.replacementPlaceholder.message;
      if (this.mainKey) this.mainKey.placeholder = messages.keyPlaceholder.message;
      
      // Update Save button labels in modals
      const saveButtons = document.querySelectorAll('.btn-primary[type="submit"]');
      saveButtons.forEach(btn => {
        btn.textContent = messages.save.message;
      });
      
      // Update Delete button labels in modals
      const deleteButtons = document.querySelectorAll('.btn-secondary[type="button"]');
      deleteButtons.forEach(btn => {
        if (btn.id === 'deleteExpansionBtn' || btn.id === 'deleteShortcutBtn') {
          btn.textContent = messages.delete.message;
        }
      });
      
      // Update settings checkboxes
      const punctAwareLabel = document.querySelector('label:has(#punctAware)');
      const caseSensitiveLabel = document.querySelector('label:has(#caseSensitive)');
      const domainScopeLabel = document.querySelector('label:has(#domainScope)');
      
      if (punctAwareLabel) {
        const checkbox = punctAwareLabel.querySelector('input');
        punctAwareLabel.textContent = '';
        punctAwareLabel.appendChild(checkbox);
        punctAwareLabel.appendChild(document.createTextNode(` ${messages.punctuationAware.message}`));
      }
      if (caseSensitiveLabel) {
        const checkbox = caseSensitiveLabel.querySelector('input');
        caseSensitiveLabel.textContent = '';
        caseSensitiveLabel.appendChild(checkbox);
        caseSensitiveLabel.appendChild(document.createTextNode(` ${messages.caseSensitive.message}`));
      }
      if (domainScopeLabel) {
        const checkbox = domainScopeLabel.querySelector('input');
        domainScopeLabel.textContent = '';
        domainScopeLabel.appendChild(checkbox);
        domainScopeLabel.appendChild(document.createTextNode(` ${messages.perDomainSettings.message}`));
      }
      
      // Re-render lists to update empty states
      this.renderExpansions();
      this.renderShortcuts();
      
      // Store messages for later use
      this.messages = messages;
    } catch (error) {
      console.error('Failed to load translations:', error);
    }
  }

  renderExpansions() {
    if (this.expansions.length === 0) {
      const emptyMsg = this.messages?.noExpansions?.message || 'No expansions yet. Add one to get started!';
      this.expansionsList.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
      return;
    }

    const editLabel = this.messages?.edit?.message || 'Edit';
    
    this.expansionsList.innerHTML = this.expansions.map((exp, index) => `
      <div class="list-item" data-index="${index}">
        <div class="list-item-content">
          <div class="list-item-trigger">${this.escapeHtml(exp.trigger)}</div>
          <div class="list-item-value">${this.escapeHtml(exp.replacement)}</div>
        </div>
        <div class="list-item-actions">
          <button class="list-item-edit" data-index="${index}">${editLabel}</button>
        </div>
      </div>
    `).join('');

    // Attach edit listeners
    this.expansionsList.querySelectorAll('.list-item-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editExpansion(parseInt(btn.dataset.index));
      });
    });
  }

  renderShortcuts() {
    if (this.shortcuts.length === 0) {
      const emptyMsg = this.messages?.noShortcuts?.message || 'No shortcuts yet. Add one to get started!';
      this.shortcutsList.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
      return;
    }

    const editLabel = this.messages?.edit?.message || 'Edit';
    
    this.shortcutsList.innerHTML = this.shortcuts.map((shortcut, index) => `
      <div class="list-item" data-index="${index}">
        <div class="list-item-content">
          <div class="list-item-trigger">${this.escapeHtml(shortcut.keys)}</div>
          <div class="list-item-value">${this.escapeHtml(shortcut.text)}</div>
        </div>
        <div class="list-item-actions">
          <button class="list-item-edit" data-index="${index}">${editLabel}</button>
        </div>
      </div>
    `).join('');

    // Attach edit listeners
    this.shortcutsList.querySelectorAll('.list-item-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editShortcut(parseInt(btn.dataset.index));
      });
    });
  }

  openExpansionModal() {
    this.editingExpansionIndex = null;
    this.expansionTrigger.value = '';
    this.expansionReplacement.value = '';
    this.deleteExpansionBtn.style.display = 'none';
    this.openModal(this.expansionModal);
  }

  editExpansion(index) {
    this.editingExpansionIndex = index;
    const exp = this.expansions[index];
    this.expansionTrigger.value = exp.trigger;
    this.expansionReplacement.value = exp.replacement;
    this.deleteExpansionBtn.style.display = 'block';
    this.openModal(this.expansionModal);
  }

  saveExpansion(e) {
    e.preventDefault();

    const trigger = this.expansionTrigger.value.trim();
    const replacement = this.expansionReplacement.value.trim();

    if (!trigger || !replacement) {
      const msg = this.messages?.fillBothFields?.message || 'Please fill in both fields';
      alert(msg);
      return;
    }

    // Prevent duplicates: offer overwrite or cancel
    const existingIndex = this.expansions.findIndex(exp => exp.trigger === trigger);
    if (existingIndex !== -1 && existingIndex !== this.editingExpansionIndex) {
      const overwrite = confirm(`Trigger "${trigger}" already exists. Overwrite?`);
      if (!overwrite) return;
      this.editingExpansionIndex = existingIndex;
    }

    if (this.editingExpansionIndex === null) {
      this.expansions.push({ trigger, replacement });
    } else {
      this.expansions[this.editingExpansionIndex] = { trigger, replacement };
    }

    this.saveExpansionsToStorage();
    this.renderExpansions();
    this.closeModal(this.expansionModal);
  }

  deleteExpansion() {
    if (this.editingExpansionIndex !== null) {
      this.expansions.splice(this.editingExpansionIndex, 1);
      this.saveExpansionsToStorage();
      this.renderExpansions();
      this.closeModal(this.expansionModal);
    }
  }

  saveExpansionsToStorage() {
    const chrome_api = typeof chrome !== 'undefined' ? chrome : 
                      typeof browser !== 'undefined' ? browser : null;
    
    if (!chrome_api) return;
    chrome_api.runtime.sendMessage(
      { action: 'saveExpansions', expansions: this.expansions, scope: this.domainScope?.checked ? 'domain' : 'global', domain: this.currentDomain },
      (response) => {
        if (response?.success) {
          console.log('Expansions saved');
        }
      }
    );
  }

  openShortcutModal() {
    this.editingShortcutIndex = null;
    this.ctrlKey.checked = false;
    this.shiftKey.checked = false;
    this.altKey.checked = false;
    this.mainKey.value = '';
    this.shortcutText.value = '';
    this.deleteShortcutBtn.style.display = 'none';
    this.openModal(this.shortcutModal);
  }

  editShortcut(index) {
    this.editingShortcutIndex = index;
    const shortcut = this.shortcuts[index];
    
    // Parse key combination
    const parts = shortcut.keys.split('+');
    this.ctrlKey.checked = parts.includes('ctrl');
    this.shiftKey.checked = parts.includes('shift');
    this.altKey.checked = parts.includes('alt');
    this.mainKey.value = parts[parts.length - 1];
    
    this.shortcutText.value = shortcut.text;
    this.deleteShortcutBtn.style.display = 'block';
    this.openModal(this.shortcutModal);
  }

  saveShortcut(e) {
    e.preventDefault();

    const parts = [];
    if (this.ctrlKey.checked) parts.push('ctrl');
    if (this.shiftKey.checked) parts.push('shift');
    if (this.altKey.checked) parts.push('alt');
    
    const mainKey = this.mainKey.value.trim().toLowerCase();
    if (!mainKey) {
      const msg = this.messages?.enterMainKey?.message || 'Please enter a main key';
      alert(msg);
      return;
    }
    parts.push(mainKey);

    const text = this.shortcutText.value.trim();
    if (!text) {
      const msg = this.messages?.enterText?.message || 'Please enter text to insert';
      alert(msg);
      return;
    }

    const keys = parts.join('+');

    if (this.editingShortcutIndex === null) {
      this.shortcuts.push({ keys, text });
    } else {
      this.shortcuts[this.editingShortcutIndex] = { keys, text };
    }

    this.saveShortcutsToStorage();
    this.renderShortcuts();
    this.closeModal(this.shortcutModal);
  }

  deleteShortcut() {
    if (this.editingShortcutIndex !== null) {
      this.shortcuts.splice(this.editingShortcutIndex, 1);
      this.saveShortcutsToStorage();
      this.renderShortcuts();
      this.closeModal(this.shortcutModal);
    }
  }

  saveShortcutsToStorage() {
    const chrome_api = typeof chrome !== 'undefined' ? chrome : 
                      typeof browser !== 'undefined' ? browser : null;
    
    if (!chrome_api) return;

    chrome_api.runtime.sendMessage(
      { action: 'saveShortcuts', shortcuts: this.shortcuts, scope: this.domainScope?.checked ? 'domain' : 'global', domain: this.currentDomain },
      (response) => {
        if (response?.success) {
          console.log('Shortcuts saved');
        }
      }
    );
  }

  openModal(modal) {
    modal.classList.add('active');
  }

  closeModal(modal) {
    modal.classList.remove('active');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Check extension and content script status
   */
  async checkExtensionStatus() {
    if (!this.statusIndicator) return;
    
    this.updateStatusIndicator('loading');
    
    // Check background service worker
    try {
      const chrome_api = typeof chrome !== 'undefined' ? chrome : 
                        typeof browser !== 'undefined' ? browser : null;
      
      if (!chrome_api) {
        this.updateStatusIndicator('error');
        return;
      }

      // Ping background to confirm it's alive
      chrome_api.runtime.sendMessage(
        { action: 'ping' },
        (response) => {
          if (response?.ok) {
            this.extensionReady = true;
            this.checkContentScriptStatus();
          } else {
            this.updateStatusIndicator('error');
          }
        }
      );
    } catch (err) {
      console.error('[Expander] Failed to check extension status:', err);
      this.updateStatusIndicator('error');
    }
  }

  /**
   * Check if content script is loaded in current tab
   */
  checkContentScriptStatus() {
    const chrome_api = typeof chrome !== 'undefined' ? chrome : 
                      typeof browser !== 'undefined' ? browser : null;
    
    if (!chrome_api || !chrome_api.tabs) {
      // No tabs API, mark as ready anyway (popup doesn't need content script)
      this.contentScriptReady = true;
      this.updateStatusIndicator('ready');
      return;
    }

    // Get current active tab and ping content script
    chrome_api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        this.updateStatusIndicator('ready');
        return;
      }

      chrome_api.tabs.sendMessage(
        tabs[0].id,
        { action: 'ping' },
        (response) => {
          // Check for errors (e.g., content script not loaded due to browser restrictions)
          const err = chrome_api.runtime.lastError;
          if (err) {
            // Forbidden: extension cannot load on this page (extension URLs, system pages, etc)
            this.updateStatusIndicator('forbidden');
          } else if (response?.ok) {
            this.contentScriptReady = true;
            this.updateStatusIndicator('ready');
          } else {
            // Content script not loaded on this tab, but not forbidden
            this.updateStatusIndicator('ready');
          }
        }
      );
    });
  }

  /**
   * Update status indicator emoji and title
   */
  updateStatusIndicator(state) {
    if (!this.statusIndicator) return;

    const states = {
      loading: { emoji: '⏳', title: 'Loading extension...' },
      ready: { emoji: '✅', title: 'Extension ready' },
      error: { emoji: '❌', title: 'Extension error' },
      forbidden: { emoji: '🚫', title: 'Content script not loaded on this page' }
    };

    const stateInfo = states[state] || states.error;
    this.statusIndicator.textContent = stateInfo.emoji;
    this.statusIndicator.title = stateInfo.title;
  }
}

// Initialize popup when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
  });
} else {
  new PopupManager();
}
