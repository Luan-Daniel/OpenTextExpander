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
    
    this.setupElements();
    this.attachListeners();
    this.loadLanguage();
    this.loadData();
  }

  setupElements() {
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
    const githubUrl = 'https://github.com/Luan-Daniel/OpenTextExpander'; // Replace with actual URL
    window.open(githubUrl, '_blank');
  }

  async loadData() {
    try {
      const chrome_api = typeof chrome !== 'undefined' ? chrome : 
                        typeof browser !== 'undefined' ? browser : null;
      
      if (!chrome_api) return;

      // Load expansions
      chrome_api.runtime.sendMessage(
        { action: 'getExpansions' },
        (response) => {
          if (response) {
            this.expansions = response.expansions || [];
            this.renderExpansions();
          }
        }
      );

      // Load shortcuts
      chrome_api.runtime.sendMessage(
        { action: 'getShortcuts' },
        (response) => {
          if (response) {
            this.shortcuts = response.shortcuts || [];
            this.renderShortcuts();
          }
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
      { action: 'saveExpansions', expansions: this.expansions },
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
      { action: 'saveShortcuts', shortcuts: this.shortcuts },
      (response) => {
        if (response?.success) {
          console.log('Shortcuts saved');
          // Show notification to reload page
          this._showReloadNotification();
        }
      }
    );
  }

  /**
   * Show notification about reloading page for new shortcuts
   */
  _showReloadNotification() {
    // Create temporary notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #3498db;
      color: white;
      padding: 15px 20px;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-size: 14px;
      z-index: 10000;
      max-width: 300px;
    `;
    const msg = this.messages?.shortcutsSaved?.message || '✓ Shortcuts saved! <strong>Reload any open pages for new shortcuts to take effect.</strong>';
    notification.innerHTML = msg;
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s';
      setTimeout(() => notification.remove(), 300);
    }, 5000);
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
}

// Initialize popup when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
  });
} else {
  new PopupManager();
}
