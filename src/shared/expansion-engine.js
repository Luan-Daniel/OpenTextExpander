/**
 * Text expansion engine
 * Handles both text expansions and keyboard shortcuts
 * Optimized for fast execution during typing
 */

class ExpansionEngine {
  constructor() {
    // Trie structure for O(1) prefix lookup
    this.expansionTrie = {};
    this.expansions = new Map();

    // Shortcut map for O(1) lookup
    this.shortcuts = new Map();

    this.isReady = false;
  }

  /**
   * Initialize engine with stored expansions and shortcuts
   */
  async initialize() {
    try {
      const data = await this._getStorageData();
      this._buildTrie(data.expansions || []);
      this._buildShortcuts(data.shortcuts || []);
      this.isReady = true;
    } catch (error) {
      console.error('[!] Failed to initialize expansion engine:', error);
      this.isReady = true; // Still mark as ready to avoid blocking
    }
  }

  /**
   * Get data from storage (Chromium/Firefox compatible)
   */
  _getStorageData() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.get(['expansions', 'shortcuts'], (result) => {
          resolve(result);
        });
      } else if (typeof browser !== 'undefined' && browser.storage) {
        browser.storage.sync.get(['expansions', 'shortcuts']).then(resolve);
      } else {
        resolve({});
      }
    });
  }

  /**
   * Build trie from expansions for fast prefix matching
   */
  _buildTrie(expansions) {
    this.expansionTrie = {};
    this.expansions.clear();

    for (const expansion of expansions) {
      if (!expansion.trigger || !expansion.replacement) continue;

      const trigger = expansion.trigger.toLowerCase();
      this.expansions.set(trigger, expansion.replacement);

      // Build trie for faster matching
      let node = this.expansionTrie;
      for (const char of trigger) {
        if (!node[char]) {
          node[char] = {};
        }
        node = node[char];
      }
      node._value = expansion.replacement;
    }
  }

  /**
   * Build shortcuts map
   */
  _buildShortcuts(shortcuts) {
    this.shortcuts.clear();

    for (const shortcut of shortcuts) {
      if (!shortcut.keys || !shortcut.text) continue;

      this.shortcuts.set(shortcut.keys, shortcut.text);
    }
  }

  /**
   * Find matching expansion trigger in text
   * Returns {trigger, replacement, startIndex, endIndex} or null
   */
  findExpansionMatch(text) {
    if (!text || text.length === 0) return null;
    
    // Look for word boundaries to find potential triggers
    // Check backwards from end of text for trigger sequences
    const lowerText = text.toLowerCase();
    
    // Check if current text matches any trigger
    if (this.expansions.has(lowerText)) {
      return {
        trigger: lowerText,
        replacement: this.expansions.get(lowerText),
        startIndex: 0,
        endIndex: text.length
      };
    }

    // Check progressively shorter suffixes for matches
    for (let i = text.length - 1; i > 0; i--) {
      const suffix = lowerText.substring(i);
      if (this.expansions.has(suffix)) {
        return {
          trigger: suffix,
          replacement: this.expansions.get(suffix),
          startIndex: i,
          endIndex: text.length
        };
      }
    }

    return null;
  }

  /**
   * Check if a keystroke combination matches any shortcut
   * keys format: "ctrl+shift+m" or "alt+a"
   */
  getShortcutMatch(keyCombination) {
    return this.shortcuts.get(keyCombination) || null;
  }

  /**
   * Build keystroke combination string from KeyboardEvent
   */
  buildKeyCombination(event) {
    const parts = [];
    
    if (event.ctrlKey || event.metaKey) parts.push('ctrl');
    if (event.shiftKey) parts.push('shift');
    if (event.altKey) parts.push('alt');
    
    const key = event.key.toLowerCase();
    // Only add non-modifier keys
    if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
      parts.push(key);
    }
    
    return parts.length > 1 ? parts.join('+') : null;
  }

  /**
   * Update expansions (called from popup)
   */
  async updateExpansions(expansions) {
    this._buildTrie(expansions);
    await this._saveToStorage('expansions', expansions);
  }

  /**
   * Update shortcuts (called from popup)
   */
  async updateShortcuts(shortcuts) {
    this._buildShortcuts(shortcuts);
    await this._saveToStorage('shortcuts', shortcuts);
  }

  /**
   * Save data to storage (Chrome/Firefox compatible)
   */
  _saveToStorage(key, value) {
    return new Promise((resolve) => {
      const data = { [key]: value };
      
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.set(data, resolve);
      } else if (typeof browser !== 'undefined' && browser.storage) {
        browser.storage.sync.set(data).then(resolve);
      } else {
        resolve();
      }
    });
  }
}

// Create global instance
const expansionEngine = new ExpansionEngine();

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    expansionEngine.initialize();
  });
} else {
  expansionEngine.initialize();
}
