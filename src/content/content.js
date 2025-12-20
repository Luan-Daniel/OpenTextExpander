/**
 * Content script - runs in page context
 * Detects typing, handles text expansion, and injects text via shortcuts
 * Optimized for minimal overhead during typing
 */

console.log('[Expander] Content script loaded');

class ContentScriptManager {
  constructor() {
    this.activeElement = null;
    this.buffer = '';
    this.cursorPos = 0; // Track cursor position
    this.expansionDelimiter = ' '; // Space triggers expansion check; Enter supported separately
    this.minTriggerLength = 2; // Minimum characters for expansion
    this.maxTriggerLength = 50; // Maximum trigger length
    this.settings = { punctuationAware: false, caseSensitive: false };
    this._lastDelimiter = null; // 'space' | 'enter'
  }

  init() {
    console.info('[Expander] Content manager init');
    this._attachListeners();
    this._setupMessageListener();
    // Load settings
    try {
      const api = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
      if (api?.storage?.sync) {
        api.storage.sync.get(['settings'], (result) => {
          if (result?.settings) this.settings = Object.assign(this.settings, result.settings);
        });
      }
    } catch {}
  }

  /**
   * Reinitialize engine with correct domain context based on current settings
   */
  async _reinitializeEngine() {
    try {
      const api = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
      if (!api?.storage?.sync) return;

      // Check if domain scope is enabled
      api.storage.sync.get(['settings'], (result) => {
        const domainScope = result?.settings?.domainScope || false;
        const domain = domainScope ? currentDomain : null;
        console.info('[Expander] Reinitializing engine', { domainScope, domain });
        expansionEngine.initialize(domain);
      });
    } catch (err) {
      console.warn('[Expander] Failed to reinitialize engine:', err);
    }
  }

  /**
   * Attach input listeners to detect typing
   */
  _attachListeners() {
    // Track focus for active element
    document.addEventListener('focus', (e) => {
      this.activeElement = e.target;
    }, true);

    document.addEventListener('blur', () => {
      this.activeElement = null;
      this.buffer = '';
    }, true);

    // Main input handler - called on every keystroke
    document.addEventListener('input', (e) => this._handleInput(e), true);

    // Handle keyboard shortcuts and Enter delimiter
    document.addEventListener('keydown', (e) => {
      // Enter should also trigger expansion
      if (this._isEditableElement(e.target) && e.key === 'Enter') {
        this._updateBuffer(e.target);
        this._lastDelimiter = 'enter';
        this._checkAndApplyExpansion(e.target);
        // Let default Enter proceed (newline/submit)
        this._lastDelimiter = null;
      } else {
        this._handleKeydown(e);
      }
    }, true);
  }

  /**
   * Handle text input - check for expansions
   */
  _handleInput(event) {
    const element = event.target;

    // Only process actual text input elements
    if (!this._isEditableElement(element)) return;

    // Update buffer with current element value
    this._updateBuffer(element);

    // Check if we should trigger expansion (typically on space)
    if (this._shouldCheckExpansion(event)) {
      this._checkAndApplyExpansion(element);
    }
  }

  /**
   * Handle keyboard shortcuts
   */
  _handleKeydown(event) {
    if (!expansionEngine.isReady) return;

    const keyCombination = expansionEngine.buildKeyCombination(event);
    if (!keyCombination) return;

    const replacement = expansionEngine.getShortcutMatch(keyCombination);
    if (!replacement) return;

    event.preventDefault();
    
    // Insert text at cursor position
    if (this._isEditableElement(event.target)) {
      this._insertText(event.target, replacement);
    }
  }

  /**
   * Update internal buffer - tracks what user is typing
   */
  _updateBuffer(element) {
    // For contenteditable elements
    if (element.contentEditable === 'true') {
      // Use textContent instead of innerText for consistent newline handling
      this.buffer = element.textContent || '';
      // Get cursor position for contenteditable
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(element);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        this.cursorPos = preCaretRange.toString().length;
      } else {
        this.cursorPos = this.buffer.length;
      }
    }
    // For regular input/textarea
    else if (element.value !== undefined) {
      this.buffer = element.value;
      this.cursorPos = element.selectionStart || this.buffer.length;
    }
  }

  /**
   * Determine if expansion check should run
   * Typically triggered on space, but could be other delimiters
   */
  _shouldCheckExpansion(event) {
    // Check if character is the expansion delimiter (space) or Enter via keydown
    const char = event.data;
    const isSpace = char === this.expansionDelimiter;
    const isEnter = this._lastDelimiter === 'enter';
    return (isSpace || isEnter) && this.buffer.length > this.minTriggerLength;
  }

  /**
   * Extract potential trigger from buffer
   * Works backwards from the cursor position, excludes the space itself
   */
  _extractTrigger(buffer) {
    // Determine delimiter length to exclude: space (1) or enter (0, since keydown didn't insert yet)
    const excludeLen = this._lastDelimiter === 'enter' ? 0 : 1;
    const textBeforeCursor = buffer.substring(0, this.cursorPos - excludeLen);
    
    // Find the last word before cursor (after last whitespace)
    const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
    const lastNewlineIndex = textBeforeCursor.lastIndexOf('\n');
    const lastBreak = Math.max(lastSpaceIndex, lastNewlineIndex);
    
    // Extract word (potentially with trailing punctuation - max 1 char)
    let word = lastBreak >= 0 ? textBeforeCursor.substring(lastBreak + 1) : textBeforeCursor;
    let punctuation = '';
    if (this.settings.punctuationAware) {
      const m = word.match(/[\.,;:!\?\)\]\}"'`]$/);
      if (m) {
        punctuation = m[0];
        word = word.substring(0, word.length - 1);
      }
    }
    
    if (word.length < this.minTriggerLength) return null;
    if (word.length > this.maxTriggerLength) {
      // Take last N characters
      return word.substring(word.length - this.maxTriggerLength);
    }
    
    // Store punctuation for re-append in replacement
    this._pendingPunctuation = punctuation;
    return word;
  }

  /**
   * Check and apply expansion
   */
  _checkAndApplyExpansion(element) {
    const trigger = this._extractTrigger(this.buffer);
    if (!trigger) return;

    const match = expansionEngine.findExpansionMatch(trigger);
    if (!match) return;

    // Replace the trigger with expansion
    this._replaceText(element, match);
    this.buffer = match.replacement;
  }

  /**
   * Replace text in element
   * Properly handles the space delimiter by removing trigger + space
   */
  _replaceText(element, match) {
    const isContentEditable = element.contentEditable === 'true';
    const excludeLen = this._lastDelimiter === 'enter' ? 0 : 1;
    const punctLen = this._pendingPunctuation?.length || 0;
    
    // For contenteditable with space: preserve the space already in DOM
    // For input/textarea with space: delete and re-add the space
    const shouldDeleteDelimiter = !isContentEditable && this._lastDelimiter !== 'enter';
    const delimiterOut = shouldDeleteDelimiter ? ' ' : '';
    const tail = (this._pendingPunctuation || '') + delimiterOut;
    
    if (isContentEditable) {
      // For contenteditable - use Selection API to preserve DOM structure
      // Don't delete the space for space delimiter; it's already correctly positioned
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return;
      
      const range = selection.getRangeAt(0);
      const triggerLen = match.trigger.length;
      
      // Only delete trigger + punctuation (not the delimiter for contenteditable)
      const charsToDelete = triggerLen + punctLen;
      
      // Create a range that covers the text to replace
      // Exclude the delimiter from the deletion range
      const deleteRangeEnd = range.endOffset - excludeLen;
      const deleteRange = range.cloneRange();
      deleteRange.setEnd(range.endContainer, deleteRangeEnd);
      deleteRange.setStart(range.endContainer, Math.max(0, deleteRangeEnd - charsToDelete));
      
      // Delete the trigger text
      deleteRange.deleteContents();
      
      // Insert the replacement text (no tail needed; space is preserved)
      const replacementText = document.createTextNode(match.replacement);
      deleteRange.insertNode(replacementText);
      
      // Position cursor after the replacement text and delimiter
      const newRange = document.createRange();
      if (this._lastDelimiter === 'enter') {
        // For Enter: position cursor at the end of the replacement text (newline comes after from default behavior)
        newRange.setStartAfter(replacementText);
      } else {
        // For space: position cursor after the space in the following text node
        newRange.setStart(range.endContainer, range.endOffset - excludeLen + 1);
      }
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
    } else if (element.value !== undefined) {
      // For input/textarea - use stored cursor position
      const text = element.value;
      const deleteLen = shouldDeleteDelimiter ? excludeLen : 0;
      const before = text.substring(0, this.cursorPos - match.trigger.length - punctLen - deleteLen);
      const after = text.substring(this.cursorPos);
      element.value = before + match.replacement + tail + after;
      
      // Restore cursor position after replacement + tail
      const newPos = before.length + match.replacement.length + tail.length;
      element.setSelectionRange(newPos, newPos);
    }

    // Trigger change event for frameworks
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Insert text at cursor position
   */
  _insertText(element, text) {
    if (element.contentEditable === 'true') {
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else if (element.value !== undefined) {
      const cursorPos = element.selectionStart;
      const text_val = element.value;
      const before = text_val.substring(0, cursorPos);
      const after = text_val.substring(cursorPos);
      
      element.value = before + text + after;
      
      const newPos = cursorPos + text.length;
      element.setSelectionRange(newPos, newPos);
    }

    // Trigger change events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Check if element is editable
   */
  _isEditableElement(element) {
    if (!element) return false;

    const tagName = element.tagName?.toLowerCase();
    const contentEditable = element.contentEditable === 'true' || 
                           element.contentEditable === 'plaintext-only';

    return contentEditable || 
           tagName === 'input' || 
           tagName === 'textarea';
  }

  /**
   * Listen for messages from popup/background
   */
  _setupMessageListener() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'ping') {
          sendResponse?.({ ok: true, source: 'content' });
          return; // No async work
        }

        if (request.action === 'expansionsUpdated') {
          console.info('[Expander] expansionsUpdated message received');
          this._reinitializeEngine();
        }

        if (request.action === 'shortcutsUpdated') {
          console.info('[Expander] shortcutsUpdated message received');
          this._reinitializeEngine();
        }

        if (request.action === 'settingsUpdated') {
          console.info('[Expander] settingsUpdated message received');
          // Reload settings and engine
          try {
            const api = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
            if (api?.storage?.sync) {
              api.storage.sync.get(['settings'], (result) => {
                if (result?.settings) {
                  this.settings = Object.assign(this.settings, result.settings);
                  this._reinitializeEngine();
                }
              });
            }
          } catch {}
        }
      });
    } else if (typeof browser !== 'undefined' && browser.runtime) {
      browser.runtime.onMessage.addListener((request) => {
        if (request.action === 'expansionsUpdated') {
          console.info('[Expander] expansionsUpdated message received');
          expansionEngine.initialize();
        }
        if (request.action === 'shortcutsUpdated') {
          console.info('[Expander] shortcutsUpdated message received');
          this._reinitializeEngine();
        }
        if (request.action === 'settingsUpdated') {
          console.info('[Expander] settingsUpdated message received');
          try {
            const api = typeof browser !== 'undefined' ? browser : null;
            if (api?.storage?.sync) {
              api.storage.sync.get(['settings']).then(result => {
                if (result?.settings) {
                  this.settings = Object.assign(this.settings, result.settings);
                  this._reinitializeEngine();
                }
              });
            }
          } catch {}
        }
        if (request.action === 'ping') {
          return { ok: true, source: 'content' };
        }
      });
    }
  }
}

// Initialize content script manager
const contentManager = new ContentScriptManager();

// Get current page domain
const currentDomain = window.location.hostname;

// Wait for expansion engine to be ready
const initCheck = setInterval(() => {
  if (expansionEngine.isReady) {
    clearInterval(initCheck);
    contentManager.init();
    // Initialize engine with domain context based on current settings
    contentManager._reinitializeEngine();
  }
}, 50);

// Fallback timeout
setTimeout(() => {
  clearInterval(initCheck);
  if (!expansionEngine.isReady) {
    contentManager.init();
    contentManager._reinitializeEngine();
  }
}, 2000);
