// TabGroup Sorter - Background Service Worker
// 僅負責：初始化設定 + 新視窗自動排序

const COLOR_ORDER = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('settings', (result) => {
    if (!result.settings) {
      chrome.storage.local.set({
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
  });
});

chrome.windows.onCreated.addListener((window) => {
  chrome.storage.local.get('settings', async (result) => {
    const settings = result.settings;
    if (settings && settings.autoSort && settings.sortMethod) {
      setTimeout(() => {
        autoSort(window.id, settings);
      }, 1000);
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

  unpinned.sort((a, b) => {
    let cmp = 0;
    switch (sortMethod) {
      case 'name': cmp = (a.title || '').localeCompare(b.title || '', 'zh-Hant'); break;
      case 'tabCount': cmp = a.tabCount - b.tabCount; break;
      case 'color': cmp = COLOR_ORDER.indexOf(a.color) - COLOR_ORDER.indexOf(b.color); break;
      case 'created': cmp = a.minIndex - b.minIndex; break;
    }
    return sortDirection === 'desc' ? -cmp : cmp;
  });

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
      const groupTabs = await chrome.tabs.query({ windowId, groupId: group.id });
      idx += groupTabs.length;
    } catch (e) {
      console.warn('autoSort: failed to move group', group.id, e);
    }
  }

  if (ungroupedPosition === 'end' && ungroupedTabs.length > 0) {
    try { await chrome.tabs.move(ungroupedTabs, { index: -1 }); } catch (e) { /* ignore */ }
  }
}
