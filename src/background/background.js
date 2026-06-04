/**
 * Background service worker
 * Manages storage and coordination between content scripts and popup
 */

console.info('[Expander] Background service worker booted');

const DEFAULT_PROFILE_ID = 'default';
const DEFAULT_PROFILE_NAME = 'Default profile';

const hasChrome = typeof chrome !== 'undefined' && chrome.runtime && chrome.storage;
const hasBrowser = typeof browser !== 'undefined' && browser.runtime && browser.storage;

const storageGet = (keys) => new Promise((resolve) => {
  if (hasChrome) {
    chrome.storage.sync.get(keys, resolve);
    return;
  }

  if (hasBrowser) {
    browser.storage.sync.get(keys).then(resolve);
    return;
  }

  resolve({});
});

const storageSet = (items) => new Promise((resolve) => {
  if (hasChrome) {
    chrome.storage.sync.set(items, resolve);
    return;
  }

  if (hasBrowser) {
    browser.storage.sync.set(items).then(resolve);
    return;
  }

  resolve();
});

const storageRemove = (keys) => new Promise((resolve) => {
  if (hasChrome) {
    chrome.storage.sync.remove(keys, resolve);
    return;
  }

  if (hasBrowser) {
    browser.storage.sync.remove(keys).then(resolve);
    return;
  }

  resolve();
});

const queryTabs = () => new Promise((resolve) => {
  if (hasChrome) {
    chrome.tabs.query({}, resolve);
    return;
  }

  if (hasBrowser) {
    browser.tabs.query({}).then(resolve);
    return;
  }

  resolve([]);
});

const generateProfileId = () => `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createProfile = ({ id, name, expansions = [], shortcuts = [], settings = {} } = {}) => ({
  id: id || generateProfileId(),
  name: name || DEFAULT_PROFILE_NAME,
  expansions: Array.isArray(expansions) ? expansions : [],
  shortcuts: Array.isArray(shortcuts) ? shortcuts : [],
  settings: settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {},
});

const normalizeProfile = (profile, fallbackName = DEFAULT_PROFILE_NAME) => createProfile({
  id: profile?.id,
  name: profile?.name || fallbackName,
  expansions: profile?.expansions,
  shortcuts: profile?.shortcuts,
  settings: profile?.settings,
});

const profileMapFromList = (profiles) => {
  const result = {};
  (Array.isArray(profiles) ? profiles : []).forEach((profile) => {
    const normalized = normalizeProfile(profile);
    result[normalized.id] = normalized;
  });
  return result;
};

const uniqueProfileName = (name, profilesById, ignoreId = null) => {
  const baseName = (name || DEFAULT_PROFILE_NAME).trim() || DEFAULT_PROFILE_NAME;
  let candidate = baseName;

  while (Object.values(profilesById).some((profile) => profile.id !== ignoreId && profile.name === candidate)) {
    candidate += '_';
  }

  return candidate;
};

const sendMessageSafe = (tabId, message) => {
  try {
    if (hasChrome) {
      chrome.tabs.sendMessage(tabId, message, () => {
        if (chrome.runtime.lastError) {
          console.warn('[Expander] sendMessage failed', { tabId, error: chrome.runtime.lastError.message });
        }
      });
      return;
    }

    if (hasBrowser) {
      browser.tabs.sendMessage(tabId, message).catch((error) => {
        console.warn('[Expander] sendMessage failed', { tabId, error: error?.message || String(error) });
      });
    }
  } catch (err) {
    console.warn('[Expander] sendMessage threw', { tabId, error: err.message });
  }
};

const broadcastProfilesUpdated = async () => {
  const tabs = await queryTabs();
  tabs.forEach((tab) => {
    if (tab?.id != null) {
      sendMessageSafe(tab.id, { action: 'profilesUpdated' });
    }
  });
};

const ensureProfilesInitialized = async () => {
  const state = await storageGet(null);
  const storedProfiles = state.profiles && typeof state.profiles === 'object' && !Array.isArray(state.profiles)
    ? state.profiles
    : null;

  if (storedProfiles && Object.keys(storedProfiles).length > 0) {
    const normalizedProfiles = {};
    Object.entries(storedProfiles).forEach(([id, profile]) => {
      normalizedProfiles[id] = normalizeProfile({ ...profile, id }, profile?.name || DEFAULT_PROFILE_NAME);
    });

    const activeProfileId = normalizedProfiles[state.activeProfileId]
      ? state.activeProfileId
      : Object.keys(normalizedProfiles)[0];

    if (JSON.stringify(normalizedProfiles) !== JSON.stringify(storedProfiles) || activeProfileId !== state.activeProfileId) {
      await storageSet({ profiles: normalizedProfiles, activeProfileId });
    }

    return { profiles: normalizedProfiles, activeProfileId };
  }

  const profiles = {};
  const sharedSettings = state.settings && typeof state.settings === 'object' && !Array.isArray(state.settings)
    ? state.settings
    : {};

  profiles[DEFAULT_PROFILE_ID] = createProfile({
    id: DEFAULT_PROFILE_ID,
    name: DEFAULT_PROFILE_NAME,
    expansions: Array.isArray(state.expansions) ? state.expansions : [],
    shortcuts: Array.isArray(state.shortcuts) ? state.shortcuts : [],
    settings: sharedSettings,
  });

  const expansionDomains = state.expansions_domains && typeof state.expansions_domains === 'object' ? state.expansions_domains : {};
  const shortcutDomains = state.shortcuts_domains && typeof state.shortcuts_domains === 'object' ? state.shortcuts_domains : {};
  const domainNames = new Set([...Object.keys(expansionDomains), ...Object.keys(shortcutDomains)]);

  for (const domainName of domainNames) {
    const profileId = generateProfileId();
    const profileName = uniqueProfileName(domainName, profiles);
    profiles[profileId] = createProfile({
      id: profileId,
      name: profileName,
      expansions: expansionDomains[domainName] || [],
      shortcuts: shortcutDomains[domainName] || [],
      settings: sharedSettings,
    });
  }

  await storageSet({ profiles, activeProfileId: DEFAULT_PROFILE_ID });
  await storageRemove(['expansions', 'shortcuts', 'settings', 'expansions_domains', 'shortcuts_domains']);

  return { profiles, activeProfileId: DEFAULT_PROFILE_ID };
};

const getActiveProfileState = async () => {
  const state = await ensureProfilesInitialized();
  const activeProfile = state.profiles[state.activeProfileId] || state.profiles[Object.keys(state.profiles)[0]];
  return { ...state, activeProfile };
};

const saveProfilesState = async (profiles, activeProfileId) => {
  await storageSet({ profiles, activeProfileId });
  return { success: true, profiles: Object.values(profiles), activeProfileId };
};

const updateProfileState = async (profileId, updates = {}) => {
  const state = await ensureProfilesInitialized();
  const targetProfileId = profileId || state.activeProfileId;
  const currentProfile = state.profiles[targetProfileId];

  if (!currentProfile) {
    return { success: false, error: 'Profile not found' };
  }

  const nextProfile = normalizeProfile({
    ...currentProfile,
    ...updates,
    id: currentProfile.id,
    name: updates.name ? uniqueProfileName(updates.name, state.profiles, currentProfile.id) : currentProfile.name,
  }, currentProfile.name);

  const profiles = { ...state.profiles, [targetProfileId]: nextProfile };
  return saveProfilesState(profiles, state.activeProfileId);
};

const createNewProfile = async (name = DEFAULT_PROFILE_NAME, templateProfile = null) => {
  const state = await ensureProfilesInitialized();
  const profileId = generateProfileId();
  const profileName = uniqueProfileName(name, state.profiles);
  const profile = createProfile({
    id: profileId,
    name: profileName,
    expansions: templateProfile?.expansions || [],
    shortcuts: templateProfile?.shortcuts || [],
    settings: templateProfile?.settings || {},
  });

  const profiles = { ...state.profiles, [profileId]: profile };
  return saveProfilesState(profiles, profileId);
};

const copyCurrentProfile = async () => {
  const state = await getActiveProfileState();
  if (!state.activeProfile) {
    return { success: false, error: 'Profile not found' };
  }

  return createNewProfile(`${state.activeProfile.name} Copy`, state.activeProfile);
};

const deleteProfile = async (profileId) => {
  const state = await ensureProfilesInitialized();
  const targetProfileId = profileId || state.activeProfileId;

  if (!state.profiles[targetProfileId]) {
    return { success: false, error: 'Profile not found' };
  }

  const profiles = { ...state.profiles };
  delete profiles[targetProfileId];

  if (Object.keys(profiles).length === 0) {
    profiles[DEFAULT_PROFILE_ID] = createProfile({ id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME });
  }

  const nextActiveProfileId = profiles[state.activeProfileId] ? state.activeProfileId : Object.keys(profiles)[0];
  return saveProfilesState(profiles, nextActiveProfileId);
};

const deleteAllProfiles = async () => {
  const profiles = {
    [DEFAULT_PROFILE_ID]: createProfile({ id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME }),
  };

  return saveProfilesState(profiles, DEFAULT_PROFILE_ID);
};

const addImportedProfile = (profiles, profileLike, fallbackName) => {
  const normalized = normalizeProfile(profileLike, fallbackName);
  const profileId = generateProfileId();
  const profileName = uniqueProfileName(normalized.name, profiles);

  profiles[profileId] = createProfile({
    id: profileId,
    name: profileName,
    expansions: normalized.expansions,
    shortcuts: normalized.shortcuts,
    settings: normalized.settings,
  });
};

const importProfiles = async (payload) => {
  const state = await ensureProfilesInitialized();
  const profiles = { ...state.profiles };
  let importedCount = 0;

  if (Array.isArray(payload?.profiles)) {
    payload.profiles.forEach((profile, index) => {
      addImportedProfile(profiles, profile, `Imported profile ${index + 1}`);
      importedCount += 1;
    });
  } else if (payload?.profiles && typeof payload.profiles === 'object') {
    Object.values(payload.profiles).forEach((profile, index) => {
      addImportedProfile(profiles, profile, `Imported profile ${index + 1}`);
      importedCount += 1;
    });
  } else if (payload?.profile) {
    addImportedProfile(profiles, payload.profile, payload.profile?.name || 'Imported profile');
    importedCount += 1;
  } else if (payload?.global || payload?.domains) {
    addImportedProfile(profiles, {
      name: payload.global?.name || 'Imported profile',
      expansions: payload.global?.expansions || [],
      shortcuts: payload.global?.shortcuts || [],
      settings: payload.global?.settings || {},
    }, 'Imported profile');
    importedCount += 1;

    const expansionDomains = payload.domains?.expansions && typeof payload.domains.expansions === 'object' ? payload.domains.expansions : {};
    const shortcutDomains = payload.domains?.shortcuts && typeof payload.domains.shortcuts === 'object' ? payload.domains.shortcuts : {};
    const domainNames = new Set([...Object.keys(expansionDomains), ...Object.keys(shortcutDomains)]);

    for (const domainName of domainNames) {
      addImportedProfile(profiles, {
        name: domainName,
        expansions: expansionDomains[domainName] || [],
        shortcuts: shortcutDomains[domainName] || [],
        settings: payload.global?.settings || {},
      }, domainName);
      importedCount += 1;
    }
  }

  const activeProfileId = state.activeProfileId in profiles ? state.activeProfileId : Object.keys(profiles)[0];
  await saveProfilesState(profiles, activeProfileId);
  return { success: true, profiles: Object.values(profiles), activeProfileId, importedCount };
};

const handleMessage = async (request = {}, sender = {}) => {
  console.info('[Expander] Message received', { action: request.action, fromTab: sender?.tab?.id });

  switch (request.action) {
    case 'ping':
      return { ok: true, source: 'background' };

    case 'getProfilesState': {
      const state = await ensureProfilesInitialized();
      return { profiles: Object.values(state.profiles), activeProfileId: state.activeProfileId };
    }

    case 'setActiveProfile': {
      const state = await ensureProfilesInitialized();
      const nextProfileId = state.profiles[request.profileId] ? request.profileId : state.activeProfileId;
      await saveProfilesState(state.profiles, nextProfileId);
      return { success: true, activeProfileId: nextProfileId };
    }

    case 'saveProfileState':
      return updateProfileState(request.profileId || null, request.updates || {});

    case 'createProfile':
      return createNewProfile(request.name || DEFAULT_PROFILE_NAME);

    case 'copyCurrentProfile':
      return copyCurrentProfile();

    case 'deleteCurrentProfile':
      return deleteProfile(request.profileId || null);

    case 'deleteAllProfiles':
      return deleteAllProfiles();

    case 'importProfiles':
      return importProfiles(request.data || request.backup || request);

    case 'saveExpansions':
      return updateProfileState(request.profileId || null, { expansions: request.expansions || [] });

    case 'saveShortcuts':
      return updateProfileState(request.profileId || null, { shortcuts: request.shortcuts || [] });

    case 'saveSettings': {
      const state = await getActiveProfileState();
      const nextSettings = request.merge
        ? { ...(state.activeProfile?.settings || {}), ...(request.settings || {}) }
        : (request.settings || {});
      return updateProfileState(request.profileId || state.activeProfileId, { settings: nextSettings });
    }

    case 'getExpansions': {
      const state = await getActiveProfileState();
      return { expansions: state.activeProfile?.expansions || [] };
    }

    case 'getShortcuts': {
      const state = await getActiveProfileState();
      return { shortcuts: state.activeProfile?.shortcuts || [] };
    }

    case 'getSettings': {
      const state = await getActiveProfileState();
      return { settings: state.activeProfile?.settings || {} };
    }

    default:
      return undefined;
  }
};

if (hasChrome) {
  chrome.runtime.onInstalled.addListener((details) => {
    console.info('[Expander] onInstalled', { reason: details.reason });
    void ensureProfilesInitialized();
  });

  chrome.runtime.onStartup?.addListener(() => {
    console.info('[Expander] onStartup');
    void ensureProfilesInitialized();
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    handleMessage(request, sender)
      .then((response) => sendResponse(response))
      .catch((error) => {
        console.error('[Expander] Message handler failed', error);
        sendResponse({ success: false, error: error?.message || String(error) });
      });
    return true;
  });
} else if (hasBrowser) {
  browser.runtime.onMessage.addListener((request, sender) => handleMessage(request, sender));
}
