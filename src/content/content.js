/**
 * Content script - runs in page context
 * Detects typing, handles text expansion, and injects text via shortcuts
 * Optimized for minimal overhead during typing
 */

class ContentScriptManager {
  constructor() {
    this.activeElement = null;
    this.buffer = '';
    this.expansionDelimiter = ' '; // Space triggers expansion check
    this.minTriggerLength = 2; // Minimum characters for expansion
    this.maxTriggerLength = 50; // Maximum trigger length
  }

  init() {
    this._attachListeners();
    this._setupMessageListener();
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

    // Handle keyboard shortcuts
    document.addEventListener('keydown', (e) => this._handleKeydown(e), true);
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
      this.buffer = element.innerText || '';
    }
    // For regular input/textarea
    else if (element.value !== undefined) {
      this.buffer = element.value;
    }
  }

  /**
   * Determine if expansion check should run
   * Typically triggered on space, but could be other delimiters
   */
  _shouldCheckExpansion(event) {
    // Check if character is the expansion delimiter
    const char = event.data;
    return char === this.expansionDelimiter && this.buffer.length > this.minTriggerLength;
  }

  /**
   * Extract potential trigger from buffer
   * Works backwards from the delimiter, excludes the space itself
   */
  _extractTrigger(buffer) {
    // Remove trailing delimiter (space) and whitespace
    // The space is at the end, so we remove it along with any other trailing whitespace
    const text = buffer.trimEnd();
    
    if (text.length < this.minTriggerLength) return null;
    if (text.length > this.maxTriggerLength) {
      // Take last N characters
      return text.substring(text.length - this.maxTriggerLength);
    }
    
    return text;
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
    if (element.contentEditable === 'true') {
      // For contenteditable
      const text = element.innerText;
      // Remove trigger and the trailing space that triggered the expansion
      const before = text.substring(0, text.length - match.trigger.length - 1);
      element.innerText = before + match.replacement + ' ';
    } else if (element.value !== undefined) {
      // For input/textarea
      const cursorPos = element.selectionStart;
      const text = element.value;
      // Remove trigger and the trailing space that triggered the expansion
      const before = text.substring(0, cursorPos - match.trigger.length - 1);
      const after = text.substring(cursorPos);
      element.value = before + match.replacement + ' ' + after;
      
      // Restore cursor position after replacement + space
      const newPos = before.length + match.replacement.length + 1;
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
        if (request.action === 'expansionsUpdated') {
          expansionEngine.initialize();
        }
      });
    } else if (typeof browser !== 'undefined' && browser.runtime) {
      browser.runtime.onMessage.addListener((request) => {
        if (request.action === 'expansionsUpdated') {
          expansionEngine.initialize();
        }
      });
    }
  }
}

// Initialize content script manager
const contentManager = new ContentScriptManager();

// Wait for expansion engine to be ready
const initCheck = setInterval(() => {
  if (expansionEngine.isReady) {
    clearInterval(initCheck);
    contentManager.init();
  }
}, 50);

// Fallback timeout
setTimeout(() => {
  clearInterval(initCheck);
  if (!expansionEngine.isReady) {
    contentManager.init();
  }
}, 2000);
