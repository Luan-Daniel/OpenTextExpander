/**
 * Background service worker
 * Manages storage and coordination between content scripts and popup
 */

// Listen for messages from popup and content scripts
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'saveExpansions') {
      chrome.storage.sync.set({ expansions: request.expansions }, () => {
        // Notify all tabs that expansions have been updated
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: 'expansionsUpdated' }).catch(() => {});
          });
        });
        sendResponse({ success: true });
      });
      return true; // Keep channel open for async response
    }
    
    if (request.action === 'saveShortcuts') {
      chrome.storage.sync.set({ shortcuts: request.shortcuts }, () => {
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: 'shortcutsUpdated' }).catch(() => {});
          });
        });
        sendResponse({ success: true });
      });
      return true;
    }

    if (request.action === 'getExpansions') {
      chrome.storage.sync.get(['expansions'], (result) => {
        sendResponse({ expansions: result.expansions || [] });
      });
      return true;
    }

    if (request.action === 'getShortcuts') {
      chrome.storage.sync.get(['shortcuts'], (result) => {
        sendResponse({ shortcuts: result.shortcuts || [] });
      });
      return true;
    }
  });
} else if (typeof browser !== 'undefined' && browser.runtime) {
  browser.runtime.onMessage.addListener((request) => {
    if (request.action === 'saveExpansions') {
      browser.storage.sync.set({ expansions: request.expansions }).then(() => {
        browser.tabs.query({}).then(tabs => {
          tabs.forEach(tab => {
            browser.tabs.sendMessage(tab.id, { action: 'expansionsUpdated' }).catch(() => {});
          });
        });
      });
    }
    
    if (request.action === 'saveShortcuts') {
      browser.storage.sync.set({ shortcuts: request.shortcuts }).then(() => {
        browser.tabs.query({}).then(tabs => {
          tabs.forEach(tab => {
            browser.tabs.sendMessage(tab.id, { action: 'shortcutsUpdated' }).catch(() => {});
          });
        });
      });
    }

    if (request.action === 'getExpansions') {
      return browser.storage.sync.get(['expansions']).then(result => ({
        expansions: result.expansions || []
      }));
    }

    if (request.action === 'getShortcuts') {
      return browser.storage.sync.get(['shortcuts']).then(result => ({
        shortcuts: result.shortcuts || []
      }));
    }
  });
}
