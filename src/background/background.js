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
      const scope = request.scope || 'global';
      const domain = request.domain;
      if (scope === 'domain' && domain) {
        chrome.storage.sync.get(['expansions_domains'], (res) => {
          const map = res.expansions_domains || {};
          map[domain] = request.expansions;
          chrome.storage.sync.set({ expansions_domains: map }, () => {
            chrome.tabs.query({}, (tabs) => {
              tabs.forEach(tab => sendMessageSafe(tab.id, { action: 'expansionsUpdated' }));
            });
            sendResponse({ success: true });
          });
        });
      } else {
        chrome.storage.sync.set({ expansions: request.expansions }, () => {
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => sendMessageSafe(tab.id, { action: 'expansionsUpdated' }));
          });
          sendResponse({ success: true });
        });
      }
      return true; // Keep channel open for async response
    }
    
    if (request.action === 'saveShortcuts') {
      const scope = request.scope || 'global';
      const domain = request.domain;
      if (scope === 'domain' && domain) {
        chrome.storage.sync.get(['shortcuts_domains'], (res) => {
          const map = res.shortcuts_domains || {};
          map[domain] = request.shortcuts;
          chrome.storage.sync.set({ shortcuts_domains: map }, () => {
            chrome.tabs.query({}, (tabs) => {
              tabs.forEach(tab => sendMessageSafe(tab.id, { action: 'shortcutsUpdated' }));
            });
            sendResponse({ success: true });
          });
        });
      } else {
        chrome.storage.sync.set({ shortcuts: request.shortcuts }, () => {
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => sendMessageSafe(tab.id, { action: 'shortcutsUpdated' }));
          });
          sendResponse({ success: true });
        });
      }
      return true;
    }

    if (request.action === 'getExpansions') {
      const scope = request.scope || 'global';
      const domain = request.domain;
      if (scope === 'domain' && domain) {
        chrome.storage.sync.get(['expansions_domains'], (res) => {
          const list = (res.expansions_domains || {})[domain] || [];
          sendResponse({ expansions: list });
        });
      } else {
        chrome.storage.sync.get(['expansions'], (result) => {
          sendResponse({ expansions: result.expansions || [] });
        });
      }
      return true;
    }

    if (request.action === 'getShortcuts') {
      const scope = request.scope || 'global';
      const domain = request.domain;
      if (scope === 'domain' && domain) {
        chrome.storage.sync.get(['shortcuts_domains'], (res) => {
          const list = (res.shortcuts_domains || {})[domain] || [];
          sendResponse({ shortcuts: list });
        });
      } else {
        chrome.storage.sync.get(['shortcuts'], (result) => {
          sendResponse({ shortcuts: result.shortcuts || [] });
        });
      }
      return true;
    }

    if (request.action === 'saveSettings') {
      if (request.merge) {
        // Merge new settings with existing ones
        chrome.storage.sync.get(['settings'], (res) => {
          const merged = Object.assign(res.settings || {}, request.settings);
          chrome.storage.sync.set({ settings: merged }, () => {
            chrome.tabs.query({}, (tabs) => {
              tabs.forEach(tab => sendMessageSafe(tab.id, { action: 'settingsUpdated' }));
            });
            sendResponse({ success: true });
          });
        });
      } else {
        chrome.storage.sync.set({ settings: request.settings }, () => {
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => sendMessageSafe(tab.id, { action: 'settingsUpdated' }));
          });
          sendResponse({ success: true });
        });
      }
      return true;
    }

    if (request.action === 'getSettings') {
      chrome.storage.sync.get(['settings'], (result) => {
        sendResponse({ settings: result.settings || {} });
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
