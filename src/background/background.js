/**
 * Background service worker
 * Manages storage and coordination between content scripts and popup
 */

console.info('[Expander] Background service worker booted');

const sendMessageSafe = (tabId, message) => {
  try {
    chrome.tabs.sendMessage(tabId, message, () => {
      if (chrome.runtime.lastError) {
        console.warn('[Expander] sendMessage failed', { tabId, error: chrome.runtime.lastError.message });
      }
    });
  } catch (err) {
    console.warn('[Expander] sendMessage threw', { tabId, error: err.message });
  }
};

// Listen for messages from popup and content scripts
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled.addListener((details) => {
    console.info('[Expander] onInstalled', { reason: details.reason });
  });

  chrome.runtime.onStartup?.addListener(() => {
    console.info('[Expander] onStartup');
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.info('[Expander] Message received', { action: request.action, fromTab: sender?.tab?.id });

    if (request.action === 'ping') {
      sendResponse({ ok: true, source: 'background' });
      return; // No async work
    }

    if (request.action === 'saveExpansions') {
      chrome.storage.sync.set({ expansions: request.expansions }, () => {
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => sendMessageSafe(tab.id, { action: 'expansionsUpdated' }));
        });
        sendResponse({ success: true });
      });
      return true; // Keep channel open for async response
    }
    
    if (request.action === 'saveShortcuts') {
      chrome.storage.sync.set({ shortcuts: request.shortcuts }, () => {
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => sendMessageSafe(tab.id, { action: 'shortcutsUpdated' }));
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

    if (request.action === 'ping') {
      return { ok: true, source: 'background' };
    }
  });
}
