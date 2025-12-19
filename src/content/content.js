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
    this.expansionDelimiter = ' '; // Space triggers expansion check
    this.minTriggerLength = 2; // Minimum characters for expansion
    this.maxTriggerLength = 50; // Maximum trigger length
  }

  init() {
    console.info('[Expander] Content manager init');
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
    // Check if character is the expansion delimiter
    const char = event.data;
    return char === this.expansionDelimiter && this.buffer.length > this.minTriggerLength;
  }

  /**
   * Extract potential trigger from buffer
   * Works backwards from the cursor position, excludes the space itself
   */
  _extractTrigger(buffer) {
    // Extract text up to cursor position (excluding the space that was just typed)
    const textBeforeCursor = buffer.substring(0, this.cursorPos - 1);
    
    // Find the last word before cursor (after last whitespace)
    const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
    const lastNewlineIndex = textBeforeCursor.lastIndexOf('\n');
    const lastBreak = Math.max(lastSpaceIndex, lastNewlineIndex);
    
    // Extract word from last break to cursor
    const word = lastBreak >= 0 ? textBeforeCursor.substring(lastBreak + 1) : textBeforeCursor;
    
    if (word.length < this.minTriggerLength) return null;
    if (word.length > this.maxTriggerLength) {
      // Take last N characters
      return word.substring(word.length - this.maxTriggerLength);
    }
    
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
    if (element.contentEditable === 'true') {
      // For contenteditable - use stored cursor position
      const text = element.innerText;
      const before = text.substring(0, this.cursorPos - match.trigger.length - 1);
      const after = text.substring(this.cursorPos);
      element.innerText = before + match.replacement + ' ' + after;
      
      // Restore cursor position
      const newCursorPos = before.length + match.replacement.length + 1;
      const selection = window.getSelection();
      const range = document.createRange();
      const textNode = element.firstChild || element;
      if (textNode.nodeType === Node.TEXT_NODE) {
        range.setStart(textNode, Math.min(newCursorPos, textNode.length));
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } else if (element.value !== undefined) {
      // For input/textarea - use stored cursor position
      const text = element.value;
      const before = text.substring(0, this.cursorPos - match.trigger.length - 1);
      const after = text.substring(this.cursorPos);
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
        if (request.action === 'ping') {
          sendResponse?.({ ok: true, source: 'content' });
          return; // No async work
        }

        if (request.action === 'expansionsUpdated') {
          console.info('[Expander] expansionsUpdated message received');
          expansionEngine.initialize();
        }

        if (request.action === 'shortcutsUpdated') {
          console.info('[Expander] shortcutsUpdated message received');
          expansionEngine.initialize();
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
          expansionEngine.initialize();
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
