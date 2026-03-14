// TabGroup Sorter v2.0 - Background Service Worker
// 負責：群組快取、事件監聽、自動排序引擎、自動分組、規則匹配、鍵盤快捷鍵、訊息處理

// ===================================================================
// SECTION 1: Constants & Cache
// ===================================================================

const COLOR_ORDER = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

let groupCache = {};
let cacheLoaded = false;
let persistTimer = null;
let isSorting = false;
let realtimeSortTimer = null;

const cacheReady = loadCache();

async function loadCache() {
  const result = await chrome.storage.local.get('groupCache');
  groupCache = result.groupCache || {};
  cacheLoaded = true;
}

function persistCache() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    chrome.storage.local.set({ groupCache });
  }, 300);
}

async function cacheGroup(groupId) {
  try {
    const group = await chrome.tabGroups.get(groupId);
    const tabs = await chrome.tabs.query({ groupId });
    groupCache[groupId] = {
      title: group.title || '',
      color: group.color,
      collapsed: group.collapsed,
      windowId: group.windowId,
      tabs: tabs.map(t => ({
        url: t.url || t.pendingUrl || '',
        title: t.title || '',
        favIconUrl: t.favIconUrl || ''
      }))
    };
    persistCache();
  } catch (e) {
    // Group may have been removed
  }
}

async function refreshAllCache() {
  const allGroups = await chrome.tabGroups.query({});
  const oldIds = new Set(Object.keys(groupCache).map(Number));
  const currentIds = new Set(allGroups.map(g => g.id));

  // 偵測已消失的群組（Service Worker 不活躍時被關閉的群組）
  // 將它們自動加入「已關閉的群組」清單
  const disappeared = [];
  for (const oldId of oldIds) {
    if (!currentIds.has(oldId)) {
      const cached = groupCache[oldId];
      if (cached && (cached.title || (cached.tabs && cached.tabs.length > 0))) {
        disappeared.push({
          id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
          title: cached.title || '',
          color: cached.color || 'grey',
          tabs: cached.tabs || [],
          closedAt: Date.now()
        });
      }
      delete groupCache[oldId];
    }
  }

  if (disappeared.length > 0) {
    const result = await chrome.storage.local.get('closedGroups');
    const closedGroups = result.closedGroups || [];
    // 避免重複：檢查標題+顏色是否已存在於最近的已關閉群組
    for (const entry of disappeared) {
      const isDuplicate = closedGroups.some(g =>
        g.title === entry.title && g.color === entry.color &&
        (Date.now() - g.closedAt) < 60000 // 1 分鐘內的同名群組視為重複
      );
      if (!isDuplicate) {
        closedGroups.unshift(entry);
      }
    }
    if (closedGroups.length > 200) closedGroups.length = 200;
    await chrome.storage.local.set({ closedGroups });
  }

  for (const group of allGroups) {
    await cacheGroup(group.id);
  }
  persistCache();
}

// ===================================================================
// SECTION 2: Event Listeners (Group & Tab tracking)
// ===================================================================

chrome.tabGroups.onCreated.addListener((group) => {
  cacheGroup(group.id);
  scheduleRealtimeSort(group.windowId);
});

chrome.tabGroups.onUpdated.addListener((group) => {
  cacheGroup(group.id);
  scheduleRealtimeSort(group.windowId);
});

// Note: chrome.tabGroups.onMoved does not exist in Chrome API; removed.

chrome.tabGroups.onRemoved.addListener(async (group) => {
  await cacheReady;

  const cached = groupCache[group.id];

  const closedEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
    title: group.title || (cached && cached.title) || '',
    color: group.color || (cached && cached.color) || 'grey',
    tabs: (cached && cached.tabs && cached.tabs.length > 0) ? cached.tabs : [],
    closedAt: Date.now()
  };

  // 即使沒有分頁資料（快取未命中），仍保存群組名稱和顏色以供顯示
  const result = await chrome.storage.local.get('closedGroups');
  const closedGroups = result.closedGroups || [];
  closedGroups.unshift(closedEntry);
  if (closedGroups.length > 200) closedGroups.length = 200;
  await chrome.storage.local.set({ closedGroups });

  delete groupCache[group.id];
  persistCache();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.groupId > -1 && (changeInfo.url || changeInfo.title || changeInfo.status === 'complete')) {
    cacheGroup(tab.groupId);
  }
});

chrome.tabs.onAttached.addListener(async (tabId) => {
  const tab = await chrome.tabs.get(tabId);
  if (tab.groupId > -1) cacheGroup(tab.groupId);
});

let tabRemoveRefreshTimer = null;
chrome.tabs.onRemoved.addListener(() => {
  if (tabRemoveRefreshTimer) clearTimeout(tabRemoveRefreshTimer);
  tabRemoveRefreshTimer = setTimeout(() => refreshAllCache(), 800);
});

// ===================================================================
// SECTION 3: Auto-Sort Engine
// ===================================================================

async function scheduleRealtimeSort(windowId) {
  if (isSorting) return;

  const { settings } = await chrome.storage.local.get('settings');
  if (!settings || !settings.realtimeAutoSort || !settings.sortMethod) return;

  if (realtimeSortTimer) clearTimeout(realtimeSortTimer);
  realtimeSortTimer = setTimeout(() => {
    autoSort(windowId, settings);
  }, 500);
}

async function autoSort(windowId, settings) {
  if (isSorting) return;
  isSorting = true;

  try {
    const { sortMethod, sortDirection, pinnedGroups = [], ungroupedPosition = 'end' } = settings;

    const tabs = await chrome.tabs.query({ windowId });
    const groups = await chrome.tabGroups.query({ windowId });

    if (groups.length === 0) return;

    const groupMap = {};
    for (const group of groups) {
      groupMap[group.id] = { id: group.id, title: group.title || '', color: group.color, tabCount: 0, minIndex: Infinity };
    }
    for (const tab of tabs) {
      if (tab.groupId !== -1 && groupMap[tab.groupId]) {
        groupMap[tab.groupId].tabCount++;
        groupMap[tab.groupId].minIndex = Math.min(groupMap[tab.groupId].minIndex, tab.index);
      }
    }

    const allGroups = Object.values(groupMap).sort((a, b) => a.minIndex - b.minIndex);
    const pinned = allGroups.filter(g => pinnedGroups.includes(g.id));
    const unpinned = allGroups.filter(g => !pinnedGroups.includes(g.id));

    sortGroups(unpinned, sortMethod, sortDirection);

    const sorted = [...pinned, ...unpinned];
    const ungroupedTabs = tabs.filter(t => t.groupId === -1).map(t => t.id);
    let idx = 0;

    if (ungroupedPosition === 'start' && ungroupedTabs.length > 0) {
      await chrome.tabs.move(ungroupedTabs, { index: 0 });
      idx = ungroupedTabs.length;
    }

    for (const group of sorted) {
      try {
        await chrome.tabGroups.move(group.id, { index: idx });
        const gTabs = await chrome.tabs.query({ windowId, groupId: group.id });
        idx += gTabs.length;
      } catch (e) {
        console.warn('autoSort: failed to move group', group.id, e);
      }
    }

    if (ungroupedPosition === 'end' && ungroupedTabs.length > 0) {
      try { await chrome.tabs.move(ungroupedTabs, { index: -1 }); } catch (e) { /* ignore */ }
    }
  } finally {
    // Delay clearing the flag to let move events settle
    setTimeout(() => { isSorting = false; }, 300);
  }
}

function sortGroups(groups, method, direction) {
  groups.sort((a, b) => {
    let cmp = 0;
    switch (method) {
      case 'name': cmp = (a.title || '').localeCompare(b.title || '', 'zh-Hant'); break;
      case 'tabCount': cmp = a.tabCount - b.tabCount; break;
      case 'color': cmp = COLOR_ORDER.indexOf(a.color) - COLOR_ORDER.indexOf(b.color); break;
      case 'created': cmp = a.minIndex - b.minIndex; break;
    }
    return direction === 'desc' ? -cmp : cmp;
  });
}

async function toggleCollapseAll(windowId, collapse) {
  const groups = await chrome.tabGroups.query({ windowId });
  if (groups.length === 0) return;

  if (collapse) {
    const [activeTab] = await chrome.tabs.query({ active: true, windowId });
    if (activeTab && activeTab.groupId !== -1) {
      const ungroupedTabs = await chrome.tabs.query({ windowId, groupId: chrome.tabs.TAB_GROUP_ID_NONE });
      if (ungroupedTabs.length > 0) {
        await chrome.tabs.update(ungroupedTabs[0].id, { active: true });
      } else {
        await chrome.tabs.create({ active: true });
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }

  for (const group of groups) {
    try {
      await chrome.tabGroups.update(group.id, { collapsed: collapse });
    } catch (e) {
      console.warn('toggleCollapse failed for group', group.id, e);
    }
  }
}

// ===================================================================
// SECTION 4: Auto Group by Domain
// ===================================================================

function domainHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function domainToGroupName(hostname) {
  const KNOWN_DOMAINS = {
    'github.com': 'GitHub',
    'gitlab.com': 'GitLab',
    'stackoverflow.com': 'StackOverflow',
    'google.com': 'Google',
    'youtube.com': 'YouTube',
    'twitter.com': 'Twitter',
    'x.com': 'X',
    'facebook.com': 'Facebook',
    'reddit.com': 'Reddit',
    'linkedin.com': 'LinkedIn',
    'amazon.com': 'Amazon',
    'wikipedia.org': 'Wikipedia',
    'notion.so': 'Notion',
    'slack.com': 'Slack',
    'discord.com': 'Discord',
    'figma.com': 'Figma',
    'medium.com': 'Medium',
    'netflix.com': 'Netflix',
    'twitch.tv': 'Twitch',
    'chatgpt.com': 'ChatGPT',
    'claude.ai': 'Claude',
    'docs.google.com': 'Google Docs',
    'mail.google.com': 'Gmail',
    'drive.google.com': 'Google Drive',
    'maps.google.com': 'Google Maps',
    'calendar.google.com': 'Google Calendar'
  };

  // Check subdomain-specific known domains first
  if (KNOWN_DOMAINS[hostname]) return KNOWN_DOMAINS[hostname];

  // Strip www.
  let domain = hostname.replace(/^www\./, '');
  if (KNOWN_DOMAINS[domain]) return KNOWN_DOMAINS[domain];

  // For subdomains like "docs.example.com", check if root domain is known
  const parts = domain.split('.');
  if (parts.length > 2) {
    const rootDomain = parts.slice(-2).join('.');
    if (KNOWN_DOMAINS[rootDomain]) {
      const subdomain = parts.slice(0, -2).join('.');
      return subdomain.charAt(0).toUpperCase() + subdomain.slice(1) + ' - ' + KNOWN_DOMAINS[rootDomain];
    }
  }

  // Generic: capitalize the main domain part
  const mainPart = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
}

async function autoGroupByDomain(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const ungrouped = tabs.filter(t => t.groupId === -1);

  if (ungrouped.length === 0) return { grouped: 0 };

  // Load settings for custom rules and domain color map
  const { settings } = await chrome.storage.local.get('settings');
  const customRules = (settings && settings.customRules) || [];
  const domainColorMap = (settings && settings.domainColorMap) || {};

  // Bucket tabs by domain
  const domainBuckets = {};
    for (const tab of ungrouped) {
    let url;
    try { url = new URL(tab.url || tab.pendingUrl || ''); } catch (e) { continue; }

    // Skip chrome://, edge://, file:// and extension internal pages
    if (url.protocol === 'chrome:' || url.protocol === 'edge:' || url.protocol === 'chrome-extension:' || url.protocol === 'file:') continue;
    if (!url.hostname) continue;

    // Check custom rules first
    const matchedRule = matchCustomRule(tab.url || tab.pendingUrl, customRules);
    if (matchedRule) {
      if (!domainBuckets[`rule:${matchedRule.id}`]) {
        domainBuckets[`rule:${matchedRule.id}`] = {
          name: matchedRule.groupName,
          color: matchedRule.groupColor,
          tabIds: [],
          isRule: true
        };
      }
      domainBuckets[`rule:${matchedRule.id}`].tabIds.push(tab.id);
      continue;
    }

    // Domain-based grouping
    const hostname = url.hostname.replace(/^www\./, '');
    if (!domainBuckets[hostname]) {
      const color = domainColorMap[hostname] || COLOR_ORDER[domainHash(hostname) % COLOR_ORDER.length];
      domainBuckets[hostname] = {
        name: domainToGroupName(hostname),
        color: color,
        tabIds: []
      };
    }
    domainBuckets[hostname].tabIds.push(tab.id);
  }

  // Only group domains with 2+ tabs (unless it's a rule match)
  let groupedCount = 0;
  let existingGroups = await chrome.tabGroups.query({ windowId });
  for (const [key, bucket] of Object.entries(domainBuckets)) {
    if (!bucket.isRule && bucket.tabIds.length < 2) continue;
    if (bucket.tabIds.length === 0) continue;

    try {
      const existing = existingGroups.find(g => g.title === bucket.name);

      if (existing) {
        // Add tabs to existing group
        await chrome.tabs.group({ tabIds: bucket.tabIds, groupId: existing.id });
      } else {
        // Create new group
        const groupId = await chrome.tabs.group({ tabIds: bucket.tabIds });
        await chrome.tabGroups.update(groupId, {
          title: bucket.name,
          color: bucket.color
        });
        // Refresh existing groups list for subsequent iterations
        existingGroups = await chrome.tabGroups.query({ windowId });
      }
      groupedCount += bucket.tabIds.length;
    } catch (e) {
      console.warn('autoGroupByDomain: failed to group', bucket.name, e);
    }
  }

  return { grouped: groupedCount };
}

// ===================================================================
// SECTION 5: Custom Rule Matching
// ===================================================================

function matchCustomRule(url, rules) {
  if (!url || !rules || rules.length === 0) return null;

  // Sort by priority (lower number = higher priority)
  const sorted = [...rules].filter(r => r.enabled !== false).sort((a, b) => (a.priority || 0) - (b.priority || 0));

  for (const rule of sorted) {
    try {
      if (rule.pattern.length > 200) continue;

      let regex;
      if (rule.patternType === 'regex') {
        // Reject known ReDoS patterns: nested quantifiers like (a+)+
        if (/([+*])\)[\+\*{]/.test(rule.pattern) || /\(\?[^)]*[+*]{2}/.test(rule.pattern)) continue;
        regex = new RegExp(rule.pattern);
      } else {
        // Glob to regex: * → .*, ? → ., escape others (safe, no backtracking risk)
        const escaped = rule.pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        regex = new RegExp(escaped, 'i');
      }

      if (regex.test(url)) return rule;
    } catch (e) {
      // Invalid pattern, skip
    }
  }
  return null;
}

// ===================================================================
// SECTION 6: Session Management
// ===================================================================

async function saveCurrentSession(windowId, sessionName) {
  const tabs = await chrome.tabs.query({ windowId });
  const groups = await chrome.tabGroups.query({ windowId });

  const sessionGroups = [];
  for (const group of groups) {
    const groupTabs = tabs.filter(t => t.groupId === group.id);
    sessionGroups.push({
      title: group.title || '',
      color: group.color,
      collapsed: group.collapsed,
      tabs: groupTabs.map(t => ({
        url: t.url || t.pendingUrl || '',
        title: t.title || '',
        favIconUrl: t.favIconUrl || ''
      }))
    });
  }

  const ungroupedTabs = tabs.filter(t => t.groupId === -1).map(t => ({
    url: t.url || t.pendingUrl || '',
    title: t.title || '',
    favIconUrl: t.favIconUrl || ''
  }));

  const session = {
    id: 'sess_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    name: sessionName || 'Session ' + new Date().toLocaleString(),
    savedAt: Date.now(),
    groups: sessionGroups,
    ungroupedTabs: ungroupedTabs
  };

  const result = await chrome.storage.local.get('savedSessions');
  const sessions = result.savedSessions || [];
  sessions.unshift(session);
  if (sessions.length > 50) sessions.length = 50;
  await chrome.storage.local.set({ savedSessions: sessions });

  return session;
}

async function restoreSession(sessionId) {
  const result = await chrome.storage.local.get('savedSessions');
  const sessions = result.savedSessions || [];
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return false;

  // Create new window
  const newWindow = await chrome.windows.create({ focused: true });
  const windowId = newWindow.id;

  // Remove the default new tab
  const defaultTabs = await chrome.tabs.query({ windowId });
  const defaultTabIds = defaultTabs.map(t => t.id);

  // Create ungrouped tabs first
  for (const tabData of (session.ungroupedTabs || [])) {
    if (tabData.url && !tabData.url.startsWith('chrome://')) {
      await chrome.tabs.create({ url: tabData.url, windowId, active: false });
    }
  }

  // Create groups with tabs
  for (const groupData of (session.groups || [])) {
    if (!groupData.tabs || groupData.tabs.length === 0) continue;

    const createdTabIds = [];
    for (const tabData of groupData.tabs) {
      const createOpts = { windowId, active: false };
      if (tabData.url && !tabData.url.startsWith('chrome://')) createOpts.url = tabData.url;
      const tab = await chrome.tabs.create(createOpts);
      createdTabIds.push(tab.id);
    }

    if (createdTabIds.length > 0) {
      try {
        const groupId = await chrome.tabs.group({ tabIds: createdTabIds });
        await chrome.tabGroups.update(groupId, {
          title: groupData.title,
          color: groupData.color,
          collapsed: groupData.collapsed || false
        });
      } catch (e) {
        console.warn('restoreSession: failed to create group', groupData.title, e);
      }
    }
  }

  // Only remove original default tabs if we created at least one tab
  const allCreatedTabs = await chrome.tabs.query({ windowId });
  if (allCreatedTabs.length > defaultTabIds.length) {
    try { await chrome.tabs.remove(defaultTabIds); } catch (e) { /* ignore */ }
  }

  return true;
}

async function deleteSession(sessionId) {
  const result = await chrome.storage.local.get('savedSessions');
  const sessions = (result.savedSessions || []).filter(s => s.id !== sessionId);
  await chrome.storage.local.set({ savedSessions: sessions });
}

// ===================================================================
// SECTION 7: Message Handler
// ===================================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.action) {
        case 'autoGroupByDomain': {
          const result = await autoGroupByDomain(msg.windowId);
          sendResponse(result);
          break;
        }
        case 'applyCustomRules': {
          const result = await autoGroupByDomain(msg.windowId);
          sendResponse(result);
          break;
        }
        case 'collapseAll': {
          await toggleCollapseAll(msg.windowId, true);
          sendResponse({ ok: true });
          break;
        }
        case 'expandAll': {
          await toggleCollapseAll(msg.windowId, false);
          sendResponse({ ok: true });
          break;
        }
        case 'sortGroups': {
          const { settings } = await chrome.storage.local.get('settings');
          if (settings && settings.sortMethod) {
            await autoSort(msg.windowId, settings);
          }
          sendResponse({ ok: true });
          break;
        }
        case 'saveSession': {
          const session = await saveCurrentSession(msg.windowId, msg.name);
          sendResponse({ ok: true, session });
          break;
        }
        case 'restoreSession': {
          const ok = await restoreSession(msg.sessionId);
          sendResponse({ ok });
          break;
        }
        case 'deleteSession': {
          await deleteSession(msg.sessionId);
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ error: 'unknown action' });
      }
    } catch (e) {
      console.error('Message handler error:', e);
      sendResponse({ error: e.message });
    }
  })();
  return true; // async response
});

// ===================================================================
// SECTION 8: Keyboard Shortcuts
// ===================================================================

chrome.commands.onCommand.addListener(async (command) => {
  let windowId;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    windowId = tab ? tab.windowId : undefined;
  } catch (e) {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    windowId = win.id;
  }

  if (!windowId) return;

  const { settings } = await chrome.storage.local.get('settings');

  switch (command) {
    case 'sort-groups':
      if (settings && settings.sortMethod) await autoSort(windowId, settings);
      break;
    case 'collapse-all':
      await toggleCollapseAll(windowId, true);
      break;
    case 'expand-all':
      await toggleCollapseAll(windowId, false);
      break;
    case 'auto-group':
      await autoGroupByDomain(windowId);
      break;
  }
});

// ===================================================================
// SECTION 9: Initialization
// ===================================================================

function migrateSettings(settings) {
  const defaults = {
    autoSort: false,
    sortMethod: null,
    sortDirection: 'asc',
    pinnedGroups: [],
    ungroupedPosition: 'end',
    language: 'zh_TW',
    realtimeAutoSort: false,
    customRules: [],
    domainColorMap: {}
  };
  return { ...defaults, ...settings };
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const result = await chrome.storage.local.get('settings');
  if (!result.settings) {
    await chrome.storage.local.set({ settings: migrateSettings({}) });
  } else if (details.reason === 'update') {
    // Migrate settings from previous version
    await chrome.storage.local.set({ settings: migrateSettings(result.settings) });
  }
  await cacheReady;
  initialRefreshDone = true;
  refreshAllCache();
});

chrome.runtime.onStartup.addListener(async () => {
  await cacheReady;
  initialRefreshDone = true;
  refreshAllCache();
});

// Initial cache refresh (only if not triggered by onInstalled/onStartup)
let initialRefreshDone = false;
cacheReady.then(() => {
  if (!initialRefreshDone) {
    initialRefreshDone = true;
    refreshAllCache();
  }
});

// New window auto-sort
chrome.windows.onCreated.addListener((window) => {
  chrome.storage.local.get('settings', async (result) => {
    const settings = result.settings;
    if (settings && settings.autoSort && settings.sortMethod) {
      setTimeout(() => autoSort(window.id, settings), 1500);
    }
  });
});
