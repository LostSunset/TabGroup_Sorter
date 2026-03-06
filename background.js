// TabGroup Sorter - Background Service Worker
// 負責：追蹤群組狀態、儲存已關閉群組、新視窗自動排序

const COLOR_ORDER = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

// ── 群組快取（持久化到 storage）──

let groupCache = {};
let cacheLoaded = false;
let persistTimer = null;

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

  // Remove stale entries (groups that no longer exist)
  for (const oldId of oldIds) {
    if (!currentIds.has(oldId)) {
      delete groupCache[oldId];
    }
  }

  // Update all current groups
  for (const group of allGroups) {
    await cacheGroup(group.id);
  }
  persistCache();
}

// ── 事件監聽 ──

// 群組事件
chrome.tabGroups.onCreated.addListener((group) => {
  cacheGroup(group.id);
});

chrome.tabGroups.onUpdated.addListener((group) => {
  cacheGroup(group.id);
});

chrome.tabGroups.onMoved.addListener((group) => {
  cacheGroup(group.id);
});

chrome.tabGroups.onRemoved.addListener(async (group) => {
  await cacheReady;

  const cached = groupCache[group.id];

  // 建立已關閉群組記錄
  const closedEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
    title: group.title || (cached && cached.title) || '',
    color: group.color || (cached && cached.color) || 'grey',
    tabs: (cached && cached.tabs && cached.tabs.length > 0)
      ? cached.tabs
      : [],
    closedAt: Date.now()
  };

  // 只儲存有分頁資料的群組
  if (closedEntry.tabs.length > 0) {
    const result = await chrome.storage.local.get('closedGroups');
    const closedGroups = result.closedGroups || [];
    closedGroups.unshift(closedEntry);
    // 最多保留 200 筆
    if (closedGroups.length > 200) closedGroups.length = 200;
    await chrome.storage.local.set({ closedGroups });
  }

  delete groupCache[group.id];
  persistCache();
});

// 分頁事件 — 只在正向變更時更新快取
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.groupId > -1 && (changeInfo.url || changeInfo.title || changeInfo.status === 'complete')) {
    cacheGroup(tab.groupId);
  }
});

chrome.tabs.onAttached.addListener(async (tabId) => {
  const tab = await chrome.tabs.get(tabId);
  if (tab.groupId > -1) cacheGroup(tab.groupId);
});

// 分頁從群組移動時，延遲更新快取（避免與 onRemoved 衝突）
chrome.tabs.onRemoved.addListener(() => {
  setTimeout(() => refreshAllCache(), 800);
});

// ── 初始化 ──

chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.local.get('settings');
  if (!result.settings) {
    await chrome.storage.local.set({
      settings: {
        autoSort: false,
        sortMethod: null,
        sortDirection: 'asc',
        pinnedGroups: [],
        ungroupedPosition: 'end',
        language: 'zh_TW'
      }
    });
  }
  await cacheReady;
  refreshAllCache();
});

chrome.runtime.onStartup.addListener(async () => {
  await cacheReady;
  refreshAllCache();
});

// Service worker 喚醒時也刷新
cacheReady.then(() => refreshAllCache());

// ── 新視窗自動排序 ──

chrome.windows.onCreated.addListener((window) => {
  chrome.storage.local.get('settings', async (result) => {
    const settings = result.settings;
    if (settings && settings.autoSort && settings.sortMethod) {
      setTimeout(() => autoSort(window.id, settings), 1500);
    }
  });
});

async function autoSort(windowId, settings) {
  const { sortMethod, sortDirection, pinnedGroups = [], ungroupedPosition = 'end' } = settings;

  const tabs = await chrome.tabs.query({ windowId });
  const groups = await chrome.tabGroups.query({ windowId });

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
