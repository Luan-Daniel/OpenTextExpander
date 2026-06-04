/**
 * Popup script - manage profiles, expansions, and shortcuts UI
 */

class PopupManager {
  constructor() {
    this.profiles = [];
    this.activeProfileId = null;
    this.currentProfile = null;
    this.currentLanguage = 'en';
    this.extensionReady = false;
    this.contentScriptReady = false;
    this.messages = {};
    this.pendingConfirmation = null;
    this.profileMenuOpen = false;

    this.setupElements();
    this.attachListeners();
    this.loadLanguage();
    this.loadData();
    this.checkExtensionStatus();
  }

  setupElements() {
    this.statusIndicator = document.getElementById('statusIndicator');
    this.langSwitcher = document.getElementById('langSwitcher');
    this.tabButtons = document.querySelectorAll('.tab-button');

    this.profileLabel = document.getElementById('profileLabel');
    this.profileSelect = document.getElementById('profileSelect');
    this.addProfileBtn = document.getElementById('addProfileBtn');
    this.profileMenuBtn = document.getElementById('profileMenuBtn');
    this.profileMenu = document.getElementById('profileMenu');
    this.profileMenuItems = this.profileMenu ? this.profileMenu.querySelectorAll('button[data-action]') : [];

    this.expansionsList = document.getElementById('expansionsList');
    this.shortcutsList = document.getElementById('shortcutsList');

    this.addExpansionBtn = document.getElementById('addExpansionBtn');
    this.addShortcutBtn = document.getElementById('addShortcutBtn');
    this.testPageLink = document.getElementById('testPageLink');
    this.githubLink = document.getElementById('githubLink');
    this.punctAware = document.getElementById('punctAware');
    this.caseSensitive = document.getElementById('caseSensitive');

    this.expansionModal = document.getElementById('expansionModal');
    this.shortcutModal = document.getElementById('shortcutModal');
    this.confirmModal = document.getElementById('confirmModal');

    this.expansionForm = document.getElementById('expansionForm');
    this.shortcutForm = document.getElementById('shortcutForm');

    this.expansionTrigger = document.getElementById('expansionTrigger');
    this.expansionReplacement = document.getElementById('expansionReplacement');
    this.deleteExpansionBtn = document.getElementById('deleteExpansionBtn');

    this.ctrlKey = document.getElementById('ctrlKey');
    this.shiftKey = document.getElementById('shiftKey');
    this.altKey = document.getElementById('altKey');
    this.mainKey = document.getElementById('mainKey');
    this.shortcutText = document.getElementById('shortcutText');
    this.deleteShortcutBtn = document.getElementById('deleteShortcutBtn');

    this.confirmTitle = document.getElementById('confirmTitle');
    this.confirmWarning = document.getElementById('confirmWarning');
    this.confirmCancelBtn = document.getElementById('confirmCancelBtn');
    this.confirmActionBtn = document.getElementById('confirmActionBtn');

    this.closeButtons = document.querySelectorAll('.close');
  }

  attachListeners() {
    this.langSwitcher.addEventListener('click', () => this.switchLanguage());

    this.tabButtons.forEach((btn) => {
      btn.addEventListener('click', (event) => this.switchTab(event.target.dataset.tab));
    });

    this.profileSelect.addEventListener('change', () => this.switchProfile(this.profileSelect.value));
    this.addProfileBtn.addEventListener('click', () => this.createProfile());
    this.profileMenuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleProfileMenu();
    });

    this.profileMenuItems.forEach((item) => {
      item.addEventListener('click', (event) => {
        event.stopPropagation();
        this.handleProfileMenuAction(item.dataset.action);
      });
    });

    this.addExpansionBtn.addEventListener('click', () => this.openExpansionModal());
    this.addShortcutBtn.addEventListener('click', () => this.openShortcutModal());
    this.punctAware.addEventListener('change', () => this.saveCurrentSettings());
    this.caseSensitive.addEventListener('change', () => this.saveCurrentSettings());

    this.testPageLink.addEventListener('click', (event) => {
      event.preventDefault();
      this.openTestPage();
    });

    this.githubLink.addEventListener('click', (event) => {
      event.preventDefault();
      this.openGitHubPage();
    });

    this.expansionForm.addEventListener('submit', (event) => this.saveExpansion(event));
    this.shortcutForm.addEventListener('submit', (event) => this.saveShortcut(event));
    this.deleteExpansionBtn.addEventListener('click', () => this.deleteExpansion());
    this.deleteShortcutBtn.addEventListener('click', () => this.deleteShortcut());

    this.confirmCancelBtn.addEventListener('click', () => this.closeModal(this.confirmModal));
    this.confirmActionBtn.addEventListener('click', () => this.runConfirmationAction());

    this.closeButtons.forEach((btn) => {
      btn.addEventListener('click', (event) => {
        const modal = event.target.closest('.modal');
        this.closeModal(modal);
      });
    });

    window.addEventListener('click', (event) => {
      if (event.target.classList.contains('modal')) {
        this.closeModal(event.target);
      }

      if (!event.target.closest('.profile-bar')) {
        this.closeProfileMenu();
      }
    });
  }

  getApi() {
    return typeof chrome !== 'undefined' ? chrome : typeof browser !== 'undefined' ? browser : null;
  }

  sendMessage(message) {
    const api = this.getApi();
    if (!api?.runtime?.sendMessage) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              resolve(null);
              return;
            }
            resolve(response || null);
          });
          return;
        }

        const result = browser.runtime.sendMessage(message);
        if (result && typeof result.then === 'function') {
          result.then(resolve).catch(() => resolve(null));
        } else {
          resolve(result || null);
        }
      } catch {
        resolve(null);
      }
    });
  }

  async loadData() {
    try {
      const response = await this.sendMessage({ action: 'getProfilesState' });
      if (response) {
        this.applyProfilesState(response);
      }
    } catch (error) {
      console.error('Failed to load profile data:', error);
    }
  }

  applyProfilesState(state) {
    this.profiles = Array.isArray(state?.profiles) ? state.profiles : [];
    this.activeProfileId = state?.activeProfileId || this.profiles[0]?.id || null;
    this.currentProfile = this.profiles.find((profile) => profile.id === this.activeProfileId) || this.profiles[0] || this.createEmptyProfile();

    this.renderProfileSelect();
    this.applyCurrentProfileToUI();
    this.renderExpansions();
    this.renderShortcuts();
  }

  createEmptyProfile() {
    return {
      id: null,
      name: '',
      expansions: [],
      shortcuts: [],
      settings: {},
    };
  }

  renderProfileSelect() {
    if (!this.profileSelect) return;

    this.profileSelect.innerHTML = '';

    if (this.profiles.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = this.messages?.noProfiles?.message || 'No profiles available';
      this.profileSelect.appendChild(option);
      this.profileSelect.disabled = true;
      this.addProfileBtn.disabled = false;
      this.profileMenuBtn.disabled = false;
      return;
    }

    this.profileSelect.disabled = false;
    this.profiles.forEach((profile) => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      this.profileSelect.appendChild(option);
    });

    this.profileSelect.value = this.activeProfileId || this.profiles[0].id;
  }

  applyCurrentProfileToUI() {
    const settings = this.currentProfile?.settings || {};
    if (this.punctAware) this.punctAware.checked = !!settings.punctuationAware;
    if (this.caseSensitive) this.caseSensitive.checked = !!settings.caseSensitive;
  }

  getActiveProfile() {
    return this.profiles.find((profile) => profile.id === this.activeProfileId) || this.currentProfile || this.createEmptyProfile();
  }

  async switchProfile(profileId) {
    if (!profileId || profileId === this.activeProfileId) {
      return;
    }

    await this.sendMessage({ action: 'setActiveProfile', profileId });
    await this.loadData();
  }

  toggleProfileMenu(forceOpen = null) {
    const shouldOpen = forceOpen === null ? this.profileMenu.hidden : forceOpen;
    this.profileMenu.hidden = !shouldOpen;
    this.profileMenuOpen = shouldOpen;
    this.profileMenuBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }

  closeProfileMenu() {
    if (this.profileMenu) {
      this.profileMenu.hidden = true;
      this.profileMenuOpen = false;
      this.profileMenuBtn.setAttribute('aria-expanded', 'false');
    }
  }

  async handleProfileMenuAction(action) {
    this.closeProfileMenu();

    switch (action) {
      case 'add-profile':
        await this.createProfile();
        break;
      case 'copy-profile':
        await this.copyCurrentProfile();
        break;
      case 'rename-profile': {
        const promptMessage = this.messages?.renameProfilePrompt?.message || 'Enter a new name for the profile';
        const currentName = this.getActiveProfile()?.name || '';
        const newName = window.prompt(promptMessage, currentName);
        if (newName === null) return;
        const trimmed = newName.trim();
        if (!trimmed) return;

        const response = await this.sendMessage({ action: 'saveProfileState', profileId: this.activeProfileId, updates: { name: trimmed } });
        if (response) {
          this.applyProfilesState(response);
        } else {
          await this.loadData();
        }
        break;
      }
      case 'delete-profile':
        this.openConfirmation({
          title: this.messages?.deleteCurrentProfileWarningTitle?.message || 'Delete profile?',
          message: this.messages?.deleteCurrentProfileWarningBody?.message || 'This will permanently delete the current profile and all of its expansions, shortcuts, and settings.',
          actionLabel: this.messages?.deleteCurrentProfile?.message || 'Delete current profile',
          onConfirm: async () => {
            await this.sendMessage({ action: 'deleteCurrentProfile', profileId: this.activeProfileId });
            await this.loadData();
          },
        });
        break;
      case 'export-profile':
        this.exportCurrentProfile();
        break;
      case 'import-profiles':
        await this.importProfiles();
        break;
      case 'export-all-profiles':
        this.exportAllProfiles();
        break;
      case 'delete-all-profiles':
        this.openConfirmation({
          title: this.messages?.deleteAllProfilesWarningTitle?.message || 'Delete all profiles?',
          message: this.messages?.deleteAllProfilesWarningBody?.message || 'This will permanently delete every profile and reset the extension to a single empty default profile.',
          actionLabel: this.messages?.deleteAllProfiles?.message || 'Delete all profiles',
          onConfirm: async () => {
            await this.sendMessage({ action: 'deleteAllProfiles' });
            await this.loadData();
          },
        });
        break;
      default:
        break;
    }
  }

  openConfirmation({ title, message, actionLabel, onConfirm }) {
    this.pendingConfirmation = onConfirm;
    this.confirmTitle.textContent = title;
    this.confirmWarning.textContent = message;
    this.confirmActionBtn.textContent = actionLabel;
    this.openModal(this.confirmModal);
  }

  async runConfirmationAction() {
    if (typeof this.pendingConfirmation === 'function') {
      const action = this.pendingConfirmation;
      this.pendingConfirmation = null;
      this.closeModal(this.confirmModal);
      await action();
    }
  }

  async createProfile() {
    const promptMessage = this.messages?.profileNamePrompt?.message || 'Enter a name for the new profile';
    const profileName = window.prompt(promptMessage, 'New profile');
    if (profileName === null) return;

    const trimmed = profileName.trim();
    if (!trimmed) return;

    const response = await this.sendMessage({ action: 'createProfile', name: trimmed });
    if (response) {
      this.applyProfilesState(response);
    } else {
      await this.loadData();
    }
  }

  async copyCurrentProfile() {
    const response = await this.sendMessage({ action: 'copyCurrentProfile' });
    if (response) {
      this.applyProfilesState(response);
    } else {
      await this.loadData();
    }
  }

  exportCurrentProfile() {
    const profile = this.getActiveProfile();
    if (!profile?.id) return;

    const payload = {
      version: 2,
      profile,
    };

    this.downloadJson(payload, `${this.slugify(profile.name || 'profile')}.json`);
  }

  exportAllProfiles() {
    const payload = {
      version: 2,
      activeProfileId: this.activeProfileId,
      profiles: this.profiles,
    };

    this.downloadJson(payload, 'crapless-expander-profiles.json');
  }

  async importProfiles() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const response = await this.sendMessage({ action: 'importProfiles', data });

        if (response) {
          this.applyProfilesState(response);
          alert(this.messages?.importProfilesSuccess?.message || 'Profiles imported successfully.');
        } else {
          await this.loadData();
          alert(this.messages?.importProfilesSuccess?.message || 'Profiles imported successfully.');
        }
      } catch (error) {
        alert(`${this.messages?.importProfilesFailed?.message || 'Failed to import profiles:'} ${error.message}`);
      }
    };
    input.click();
  }

  downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  slugify(text) {
    return String(text)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async saveCurrentSettings() {
    const currentSettings = this.currentProfile?.settings || {};
    const nextSettings = {
      ...currentSettings,
      punctuationAware: !!this.punctAware.checked,
      caseSensitive: !!this.caseSensitive.checked,
    };

    const response = await this.sendMessage({
      action: 'saveProfileState',
      profileId: this.activeProfileId,
      updates: { settings: nextSettings },
    });

    if (response?.profiles) {
      this.applyProfilesState(response);
    } else {
      this.currentProfile.settings = nextSettings;
    }
  }

  saveCurrentProfile(updates = {}) {
    return this.sendMessage({
      action: 'saveProfileState',
      profileId: this.activeProfileId,
      updates,
    }).then((response) => {
      if (response?.profiles) {
        this.applyProfilesState(response);
      }
      return response;
    });
  }

  async openTestPage() {
    const api = this.getApi();
    if (!api) return;

    const testPageUrl = api.runtime.getURL('src/debug/test-page.html');
    if (api.tabs?.create) {
      api.tabs.create({ url: testPageUrl });
    }
  }

  openGitHubPage() {
    window.open('https://github.com/Luan-Daniel/OpenTextExpander', '_blank');
  }

  switchTab(tabName) {
    this.tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-content').forEach((content) => {
      content.classList.remove('active');
    });

    const activeTab = document.getElementById(tabName);
    if (activeTab) {
      activeTab.classList.add('active');
    }
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
    const expansion = this.currentProfile.expansions[index];
    if (!expansion) return;

    this.expansionTrigger.value = expansion.trigger;
    this.expansionReplacement.value = expansion.replacement;
    this.deleteExpansionBtn.style.display = 'block';
    this.openModal(this.expansionModal);
  }

  async saveExpansion(event) {
    event.preventDefault();

    const trigger = this.expansionTrigger.value.trim();
    const replacement = this.expansionReplacement.value.trim();

    if (!trigger || !replacement) {
      alert(this.messages?.fillBothFields?.message || 'Please fill in both fields');
      return;
    }

    const expansions = [...(this.currentProfile.expansions || [])];
    const existingIndex = expansions.findIndex((item) => item.trigger === trigger);

    if (existingIndex !== -1 && existingIndex !== this.editingExpansionIndex) {
      const overwrite = confirm(`Trigger "${trigger}" already exists. Overwrite?`);
      if (!overwrite) return;
      this.editingExpansionIndex = existingIndex;
    }

    if (this.editingExpansionIndex === null) {
      expansions.push({ trigger, replacement });
    } else {
      expansions[this.editingExpansionIndex] = { trigger, replacement };
    }

    this.currentProfile.expansions = expansions;
    this.currentProfile = { ...this.currentProfile, expansions };
    this.renderExpansions();
    this.closeModal(this.expansionModal);
    await this.saveCurrentProfile({ expansions });
  }

  async deleteExpansion() {
    if (this.editingExpansionIndex === null) return;

    const expansions = [...(this.currentProfile.expansions || [])];
    expansions.splice(this.editingExpansionIndex, 1);
    this.currentProfile.expansions = expansions;
    this.currentProfile = { ...this.currentProfile, expansions };
    this.renderExpansions();
    this.closeModal(this.expansionModal);
    await this.saveCurrentProfile({ expansions });
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
    const shortcut = this.currentProfile.shortcuts[index];
    if (!shortcut) return;

    const parts = shortcut.keys.split('+');
    this.ctrlKey.checked = parts.includes('ctrl');
    this.shiftKey.checked = parts.includes('shift');
    this.altKey.checked = parts.includes('alt');
    this.mainKey.value = parts[parts.length - 1];
    this.shortcutText.value = shortcut.text;
    this.deleteShortcutBtn.style.display = 'block';
    this.openModal(this.shortcutModal);
  }

  async saveShortcut(event) {
    event.preventDefault();

    const parts = [];
    if (this.ctrlKey.checked) parts.push('ctrl');
    if (this.shiftKey.checked) parts.push('shift');
    if (this.altKey.checked) parts.push('alt');

    const mainKey = this.mainKey.value.trim().toLowerCase();
    if (!mainKey) {
      alert(this.messages?.enterMainKey?.message || 'Please enter a main key');
      return;
    }
    parts.push(mainKey);

    const text = this.shortcutText.value.trim();
    if (!text) {
      alert(this.messages?.enterText?.message || 'Please enter text to insert');
      return;
    }

    const shortcuts = [...(this.currentProfile.shortcuts || [])];
    const keys = parts.join('+');

    if (this.editingShortcutIndex === null) {
      shortcuts.push({ keys, text });
    } else {
      shortcuts[this.editingShortcutIndex] = { keys, text };
    }

    this.currentProfile.shortcuts = shortcuts;
    this.currentProfile = { ...this.currentProfile, shortcuts };
    this.renderShortcuts();
    this.closeModal(this.shortcutModal);
    await this.saveCurrentProfile({ shortcuts });
  }

  async deleteShortcut() {
    if (this.editingShortcutIndex === null) return;

    const shortcuts = [...(this.currentProfile.shortcuts || [])];
    shortcuts.splice(this.editingShortcutIndex, 1);
    this.currentProfile.shortcuts = shortcuts;
    this.currentProfile = { ...this.currentProfile, shortcuts };
    this.renderShortcuts();
    this.closeModal(this.shortcutModal);
    await this.saveCurrentProfile({ shortcuts });
  }

  renderExpansions() {
    const expansions = this.currentProfile?.expansions || [];
    if (expansions.length === 0) {
      const emptyMessage = this.messages?.noExpansions?.message || 'No expansions yet. Add one to get started!';
      this.expansionsList.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
      return;
    }

    const editLabel = this.messages?.edit?.message || 'Edit';
    this.expansionsList.innerHTML = expansions.map((expansion, index) => `
      <div class="list-item" data-index="${index}">
        <div class="list-item-content">
          <div class="list-item-trigger">${this.escapeHtml(expansion.trigger)}</div>
          <div class="list-item-value">${this.escapeHtml(expansion.replacement)}</div>
        </div>
        <div class="list-item-actions">
          <button class="list-item-edit" data-index="${index}" type="button">${editLabel}</button>
        </div>
      </div>
    `).join('');

    this.expansionsList.querySelectorAll('.list-item-edit').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.editExpansion(parseInt(btn.dataset.index, 10));
      });
    });
  }

  renderShortcuts() {
    const shortcuts = this.currentProfile?.shortcuts || [];
    if (shortcuts.length === 0) {
      const emptyMessage = this.messages?.noShortcuts?.message || 'No shortcuts yet. Add one to get started!';
      this.shortcutsList.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
      return;
    }

    const editLabel = this.messages?.edit?.message || 'Edit';
    this.shortcutsList.innerHTML = shortcuts.map((shortcut, index) => `
      <div class="list-item" data-index="${index}">
        <div class="list-item-content">
          <div class="list-item-trigger">${this.escapeHtml(shortcut.keys)}</div>
          <div class="list-item-value">${this.escapeHtml(shortcut.text)}</div>
        </div>
        <div class="list-item-actions">
          <button class="list-item-edit" data-index="${index}" type="button">${editLabel}</button>
        </div>
      </div>
    `).join('');

    this.shortcutsList.querySelectorAll('.list-item-edit').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.editShortcut(parseInt(btn.dataset.index, 10));
      });
    });
  }

  openModal(modal) {
    if (modal) {
      modal.classList.add('active');
    }
  }

  closeModal(modal) {
    if (modal) {
      modal.classList.remove('active');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  loadLanguage() {
    const saved = localStorage.getItem('crapless_language') || 'en';
    this.currentLanguage = saved;
    this.updateLanguageButton();
    this.applyTranslations();
  }

  switchLanguage() {
    const languages = ['en', 'pt', 'es'];
    const currentIndex = languages.indexOf(this.currentLanguage);
    const nextIndex = (currentIndex + 1) % languages.length;
    this.currentLanguage = languages[nextIndex];

    localStorage.setItem('crapless_language', this.currentLanguage);
    this.updateLanguageButton();
    this.applyTranslations();
  }

  updateLanguageButton() {
    const langMap = { en: 'EN', pt: 'PT', es: 'ES' };
    this.langSwitcher.textContent = `Lang: ${langMap[this.currentLanguage]}`;
  }

  async applyTranslations() {
    try {
      const response = await fetch(`/_locales/${this.currentLanguage}/messages.json`);
      const messages = await response.json();
      this.messages = messages;

      if (this.profileLabel) this.profileLabel.textContent = messages.profileLabel?.message || 'Profiles';
      if (this.addProfileBtn) this.addProfileBtn.title = messages.addProfile?.message || 'Add profile';
      if (this.profileMenuBtn) this.profileMenuBtn.title = messages.profileMenu?.message || 'Profile menu';

      const menuText = {
        'add-profile': messages.addProfile?.message || 'Add profile',
        'copy-profile': messages.copyCurrentProfile?.message || 'Copy current profile',
        'rename-profile': messages.renameProfile?.message || 'Rename profile',
        'delete-profile': messages.deleteCurrentProfile?.message || 'Delete current profile',
        'export-profile': messages.exportCurrentProfile?.message || 'Export current profile',
        'import-profiles': messages.importProfiles?.message || 'Import profile(s)',
        'export-all-profiles': messages.exportAllProfiles?.message || 'Export all profiles',
        'delete-all-profiles': messages.deleteAllProfiles?.message || 'Delete all profiles',
      };

      Object.entries(menuText).forEach(([action, text]) => {
        const button = this.profileMenu?.querySelector(`button[data-action="${action}"]`);
        if (button) button.textContent = text;
      });

      const tabButtons = document.querySelectorAll('.tab-button');
      if (tabButtons[0]) tabButtons[0].textContent = messages.textExpansions?.message || 'Text Expansions';
      if (tabButtons[1]) tabButtons[1].textContent = messages.keyboardShortcuts?.message || 'Keyboard Shortcuts';

      if (this.addExpansionBtn) this.addExpansionBtn.textContent = messages.addExpansion?.message || '+ Add Expansion';
      if (this.addShortcutBtn) this.addShortcutBtn.textContent = messages.addShortcut?.message || '+ Add Shortcut';
      if (this.testPageLink) this.testPageLink.textContent = messages.testPage?.message || 'Test Page';
      if (this.githubLink) this.githubLink.textContent = messages.repoLink?.message || 'Github';

      const expansionModalTitle = document.querySelector('#expansionModal h2');
      const shortcutModalTitle = document.querySelector('#shortcutModal h2');
      if (expansionModalTitle) expansionModalTitle.textContent = messages.editExpansion?.message || 'Edit Expansion';
      if (shortcutModalTitle) shortcutModalTitle.textContent = messages.editShortcut?.message || 'Edit Shortcut';

      const triggerLabel = document.querySelector('label[for="expansionTrigger"]');
      const replacementLabel = document.querySelector('label[for="expansionReplacement"]');
      const keysLabel = document.querySelector('#shortcutModal .form-group label');
      const textLabel = document.querySelector('label[for="shortcutText"]');
      if (triggerLabel) triggerLabel.textContent = messages.trigger?.message || "Trigger (e.g., '\\man'):";
      if (replacementLabel) replacementLabel.textContent = messages.replacement?.message || 'Replacement Text:';
      if (keysLabel) keysLabel.textContent = messages.keys?.message || 'Keys:';
      if (textLabel) textLabel.textContent = messages.textToInsert?.message || 'Text to Insert:';

      if (this.expansionTrigger) this.expansionTrigger.placeholder = messages.triggerPlaceholder?.message || '\\man';
      if (this.expansionReplacement) this.expansionReplacement.placeholder = messages.replacementPlaceholder?.message || 'manuscript';
      if (this.mainKey) this.mainKey.placeholder = messages.keyPlaceholder?.message || "Key (e.g., 'm')";

      const saveButtons = document.querySelectorAll('.btn-primary[type="submit"]');
      saveButtons.forEach((btn) => {
        btn.textContent = messages.save?.message || 'Save';
      });

      const deleteButtons = document.querySelectorAll('.btn-secondary[type="button"]');
      deleteButtons.forEach((btn) => {
        if (btn.id === 'deleteExpansionBtn' || btn.id === 'deleteShortcutBtn') {
          btn.textContent = messages.delete?.message || 'Delete';
        }
      });

      if (this.confirmTitle) this.confirmTitle.textContent = messages.warning?.message || 'Warning';
      if (this.confirmCancelBtn) this.confirmCancelBtn.textContent = messages.confirmCancel?.message || 'Cancel';

      const punctAwareLabel = this.punctAware?.closest('label');
      const caseSensitiveLabel = this.caseSensitive?.closest('label');
      if (punctAwareLabel && this.punctAware) {
        punctAwareLabel.textContent = '';
        punctAwareLabel.appendChild(this.punctAware);
        punctAwareLabel.appendChild(document.createTextNode(` ${messages.punctuationAware?.message || 'Punctuation aware'}`));
        const tip = messages.punctuationAwareTooltip?.message || 'When enabled, punctuation is considered when matching triggers (e.g., commas, periods).';
        try { punctAwareLabel.title = tip; } catch (e) {}
        try { this.punctAware.title = tip; } catch (e) {}
      }
      if (caseSensitiveLabel && this.caseSensitive) {
        caseSensitiveLabel.textContent = '';
        caseSensitiveLabel.appendChild(this.caseSensitive);
        caseSensitiveLabel.appendChild(document.createTextNode(` ${messages.caseSensitive?.message || 'Case sensitive'}`));
        const tip2 = messages.caseSensitiveTooltip?.message || 'When enabled, triggers must match letter case exactly.';
        try { caseSensitiveLabel.title = tip2; } catch (e) {}
        try { this.caseSensitive.title = tip2; } catch (e) {}
      }

      this.renderExpansions();
      this.renderShortcuts();
    } catch (error) {
      console.error('Failed to load translations:', error);
    }
  }

  updateStatusIndicator(state) {
    if (!this.statusIndicator) return;

    const states = {
      loading: { emoji: '⏳', title: 'Loading extension...' },
      ready: { emoji: '✅', title: 'Extension ready' },
      error: { emoji: '❌', title: 'Extension error' },
      forbidden: { emoji: '🚫', title: 'Content script not loaded on this page' },
    };

    const stateInfo = states[state] || states.error;
    this.statusIndicator.textContent = stateInfo.emoji;
    this.statusIndicator.title = stateInfo.title;
  }

  async checkExtensionStatus() {
    if (!this.statusIndicator) return;

    this.updateStatusIndicator('loading');

    try {
      const api = this.getApi();
      if (!api) {
        this.updateStatusIndicator('error');
        return;
      }

      this.sendMessage({ action: 'ping' }).then((response) => {
        if (response?.ok) {
          this.extensionReady = true;
          this.checkContentScriptStatus();
        } else {
          this.updateStatusIndicator('error');
        }
      });
    } catch (error) {
      console.error('[Expander] Failed to check extension status:', error);
      this.updateStatusIndicator('error');
    }
  }

  checkContentScriptStatus() {
    const api = this.getApi();
    if (!api?.tabs) {
      this.contentScriptReady = true;
      this.updateStatusIndicator('ready');
      return;
    }

    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        this.updateStatusIndicator('ready');
        return;
      }

      api.tabs.sendMessage(tabs[0].id, { action: 'ping' }, (response) => {
        const err = api.runtime.lastError;
        if (err) {
          this.updateStatusIndicator('forbidden');
        } else if (response?.ok) {
          this.contentScriptReady = true;
          this.updateStatusIndicator('ready');
        } else {
          this.updateStatusIndicator('ready');
        }
      });
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
  });
} else {
  new PopupManager();
}
