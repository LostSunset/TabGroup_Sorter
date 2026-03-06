// TabGroup Sorter - Background Service Worker

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

// Listen for new windows — apply auto-sort if enabled
chrome.windows.onCreated.addListener((window) => {
  chrome.storage.local.get('settings', async (result) => {
    const settings = result.settings;
    if (settings && settings.autoSort && settings.sortMethod) {
      // Small delay to let tabs load
      setTimeout(() => {
        applySort(window.id, settings.sortMethod, settings.sortDirection, settings.pinnedGroups, settings.ungroupedPosition);
      }, 1000);
    }
  });
});

// Message handler for popup communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getGroups') {
    getGroupsInfo(message.windowId).then(sendResponse);
    return true;
  }
  if (message.action === 'sort') {
    applySort(message.windowId, message.sortMethod, message.sortDirection, message.pinnedGroups, message.ungroupedPosition)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.action === 'moveGroup') {
    moveGroupToIndex(message.windowId, message.groupId, message.targetIndex)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.action === 'toggleCollapseAll') {
    toggleCollapseAll(message.windowId, message.collapse)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.action === 'saveSettings') {
    chrome.storage.local.set({ settings: message.settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  if (message.action === 'getSettings') {
    chrome.storage.local.get('settings', (result) => {
      sendResponse(result.settings || {});
    });
    return true;
  }
});

async function getGroupsInfo(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const groups = await chrome.tabGroups.query({ windowId });

  const groupMap = {};
  for (const group of groups) {
    groupMap[group.id] = {
      id: group.id,
      title: group.title || '',
      color: group.color,
      collapsed: group.collapsed,
      tabCount: 0,
      minIndex: Infinity
    };
  }

  let ungroupedCount = 0;
  let ungroupedMinIndex = Infinity;

  for (const tab of tabs) {
    if (tab.groupId !== -1 && groupMap[tab.groupId]) {
      groupMap[tab.groupId].tabCount++;
      groupMap[tab.groupId].minIndex = Math.min(groupMap[tab.groupId].minIndex, tab.index);
    } else {
      ungroupedCount++;
      ungroupedMinIndex = Math.min(ungroupedMinIndex, tab.index);
    }
  }

  const groupList = Object.values(groupMap).sort((a, b) => a.minIndex - b.minIndex);

  return {
    groups: groupList,
    ungroupedCount,
    ungroupedMinIndex
  };
}

async function applySort(windowId, sortMethod, sortDirection, pinnedGroups = [], ungroupedPosition = 'end') {
  const info = await getGroupsInfo(windowId);
  let groups = info.groups;

  // Separate pinned groups
  const pinned = groups.filter(g => pinnedGroups.includes(g.id));
  const unpinned = groups.filter(g => !pinnedGroups.includes(g.id));

  // Sort unpinned groups
  unpinned.sort((a, b) => {
    let cmp = 0;
    switch (sortMethod) {
      case 'name':
        cmp = (a.title || '').localeCompare(b.title || '', 'zh-Hant');
        break;
      case 'tabCount':
        cmp = a.tabCount - b.tabCount;
        break;
      case 'color':
        cmp = COLOR_ORDER.indexOf(a.color) - COLOR_ORDER.indexOf(b.color);
        break;
      case 'created':
        // Use current position as proxy for creation order
        cmp = a.minIndex - b.minIndex;
        break;
      default:
        cmp = 0;
    }
    return sortDirection === 'desc' ? -cmp : cmp;
  });

  // Combine: pinned first, then sorted unpinned
  const sortedGroups = [...pinned, ...unpinned];

  // Move ungrouped tabs
  const tabs = await chrome.tabs.query({ windowId });
  const ungroupedTabs = tabs.filter(t => t.groupId === -1).map(t => t.id);

  // Calculate target index and move groups sequentially
  let currentIndex = 0;

  if (ungroupedPosition === 'start' && ungroupedTabs.length > 0) {
    await chrome.tabs.move(ungroupedTabs, { index: 0 });
    currentIndex = ungroupedTabs.length;
  }

  for (const group of sortedGroups) {
    try {
      await chrome.tabGroups.move(group.id, { index: currentIndex });
      // Recalculate: get updated tab count for this group
      const groupTabs = await chrome.tabs.query({ windowId, groupId: group.id });
      currentIndex += groupTabs.length;
    } catch (e) {
      // Group may have been closed during sort
      console.warn('Failed to move group:', group.id, e);
    }
  }

  if (ungroupedPosition === 'end' && ungroupedTabs.length > 0) {
    try {
      await chrome.tabs.move(ungroupedTabs, { index: -1 });
    } catch (e) {
      console.warn('Failed to move ungrouped tabs:', e);
    }
  }
}

async function moveGroupToIndex(windowId, groupId, targetIndex) {
  await chrome.tabGroups.move(groupId, { index: targetIndex });
}

async function toggleCollapseAll(windowId, collapse) {
  const groups = await chrome.tabGroups.query({ windowId });
  for (const group of groups) {
    await chrome.tabGroups.update(group.id, { collapsed: collapse });
  }
}
