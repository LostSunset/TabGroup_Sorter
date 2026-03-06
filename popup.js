// TabGroup Sorter - Popup Script
// 直接呼叫 Chrome API，已關閉群組從 storage 讀取

const i18n = {
  zh_TW: {
    collapseAll: '收合全部',
    expandAll: '展開全部',
    sortBy: '排序方式',
    byName: '名稱',
    byTabCount: '分頁數',
    byColor: '顏色',
    byCreated: '順序',
    asc: '升序',
    desc: '降序',
    openGroups: '開啟中的群組',
    closedGroups: '已關閉的群組',
    noOpenGroups: '目前沒有開啟中的群組',
    noClosedGroups: '沒有已關閉的群組紀錄',
    ungroupedTabs: '未分組分頁',
    moveToEnd: '移到最後',
    moveToStart: '移到最前',
    settingsTitle: '設定',
    autoSort: '開新視窗時自動排序',
    clearClosed: '清除所有已關閉紀錄',
    save: '儲存',
    sortDone: '排序完成！',
    collapsed: '已收合全部！',
    expanded: '已展開全部！',
    saved: '已儲存！',
    cleared: '已清除！',
    reopened: '已重新開啟！',
    unnamed: '(未命名)',
    pin: '釘選',
    unpin: '取消釘選',
    tabs: '個分頁',
    reopen: '開啟',
    remove: '刪除',
    ago: '前'
  },
  en: {
    collapseAll: 'Collapse All',
    expandAll: 'Expand All',
    sortBy: 'Sort by',
    byName: 'Name',
    byTabCount: 'Tabs',
    byColor: 'Color',
    byCreated: 'Order',
    asc: 'Asc',
    desc: 'Desc',
    openGroups: 'Open Groups',
    closedGroups: 'Closed Groups',
    noOpenGroups: 'No open tab groups',
    noClosedGroups: 'No closed group records',
    ungroupedTabs: 'Ungrouped tabs',
    moveToEnd: 'Move to end',
    moveToStart: 'Move to start',
    settingsTitle: 'Settings',
    autoSort: 'Auto-sort on new window',
    clearClosed: 'Clear all closed records',
    save: 'Save',
    sortDone: 'Sorted!',
    collapsed: 'All collapsed!',
    expanded: 'All expanded!',
    saved: 'Saved!',
    cleared: 'Cleared!',
    reopened: 'Reopened!',
    unnamed: '(Unnamed)',
    pin: 'Pin',
    unpin: 'Unpin',
    tabs: 'tabs',
    reopen: 'Open',
    remove: 'Del',
    ago: 'ago'
  }
};

const COLOR_ORDER = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

const COLOR_MAP = {
  grey: 'var(--group-grey)',
  blue: 'var(--group-blue)',
  red: 'var(--group-red)',
  yellow: 'var(--group-yellow)',
  green: 'var(--group-green)',
  pink: 'var(--group-pink)',
  purple: 'var(--group-purple)',
  cyan: 'var(--group-cyan)',
  orange: 'var(--group-orange)'
};

let currentLang = 'zh_TW';
let currentDirection = 'asc';
let currentSortMethod = null;
let pinnedGroups = [];
let currentWindowId;

// ── Chrome API helpers ──

async function getOpenGroups(windowId) {
  let tabs = await chrome.tabs.query({ windowId });
  let groups = await chrome.tabGroups.query({ windowId });

  // Fallback: 如果 windowId 查不到結果，用 currentWindow
  if (groups.length === 0 && tabs.length === 0) {
    tabs = await chrome.tabs.query({ currentWindow: true });
    groups = await chrome.tabGroups.query({});
    // 過濾出同一視窗的群組
    if (tabs.length > 0) {
      const wid = tabs[0].windowId;
      groups = groups.filter(g => g.windowId === wid);
      tabs = tabs.filter(t => t.windowId === wid);
    }
  }

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
  for (const tab of tabs) {
    if (tab.groupId !== -1 && groupMap[tab.groupId]) {
      groupMap[tab.groupId].tabCount++;
      groupMap[tab.groupId].minIndex = Math.min(groupMap[tab.groupId].minIndex, tab.index);
    } else {
      ungroupedCount++;
    }
  }

  return {
    groups: Object.values(groupMap).sort((a, b) => a.minIndex - b.minIndex),
    ungroupedCount
  };
}

async function getClosedGroups() {
  const result = await chrome.storage.local.get('closedGroups');
  return result.closedGroups || [];
}

async function removeClosedGroup(closedId) {
  const result = await chrome.storage.local.get('closedGroups');
  const list = (result.closedGroups || []).filter(g => g.id !== closedId);
  await chrome.storage.local.set({ closedGroups: list });
}

async function clearAllClosed() {
  await chrome.storage.local.set({ closedGroups: [] });
}

async function reopenGroup(closedGroup) {
  // 建立第一個分頁
  const firstUrl = closedGroup.tabs[0]?.url || 'chrome://newtab';
  const firstTab = await chrome.tabs.create({ url: firstUrl, active: false });

  // 建立群組
  const groupId = await chrome.tabs.group({ tabIds: [firstTab.id] });
  await chrome.tabGroups.update(groupId, {
    title: closedGroup.title,
    color: closedGroup.color
  });

  // 建立其餘分頁並加入群組
  for (let i = 1; i < closedGroup.tabs.length; i++) {
    const url = closedGroup.tabs[i]?.url || 'chrome://newtab';
    const tab = await chrome.tabs.create({ url, active: false });
    await chrome.tabs.group({ tabIds: [tab.id], groupId });
  }

  // 從已關閉清單中移除
  await removeClosedGroup(closedGroup.id);
}

async function applySort(windowId, sortMethod, sortDirection, pinned, ungroupedPosition) {
  const info = await getOpenGroups(windowId);

  const pinnedList = info.groups.filter(g => pinned.includes(g.id));
  const unpinned = info.groups.filter(g => !pinned.includes(g.id));

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

  const sorted = [...pinnedList, ...unpinned];
  const tabs = await chrome.tabs.query({ windowId });
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
      console.warn('Sort: failed to move group', group.id, e);
    }
  }

  if (ungroupedPosition === 'end' && ungroupedTabs.length > 0) {
    try { await chrome.tabs.move(ungroupedTabs, { index: -1 }); } catch (e) { /* ignore */ }
  }
}

async function toggleCollapseAll(windowId, collapse) {
  const groups = await chrome.tabGroups.query({ windowId });
  if (groups.length === 0) return;

  if (collapse) {
    // Chrome 不允許收合含 active tab 的群組，需先把 active tab 移出
    const [activeTab] = await chrome.tabs.query({ active: true, windowId });
    if (activeTab && activeTab.groupId !== -1) {
      // 找一個不在任何群組的分頁或建立一個新分頁來切換焦點
      const ungroupedTabs = await chrome.tabs.query({ windowId, groupId: chrome.tabGroups.TAB_GROUP_ID_NONE });
      if (ungroupedTabs.length > 0) {
        await chrome.tabs.update(ungroupedTabs[0].id, { active: true });
      } else {
        const newTab = await chrome.tabs.create({ active: true });
        // 等一下讓 Chrome 切換焦點
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

async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get('settings', r => resolve(r.settings || {}));
  });
}

async function saveSettings(settings) {
  return new Promise(resolve => {
    chrome.storage.local.set({ settings }, resolve);
  });
}

// ── UI ──

document.addEventListener('DOMContentLoaded', async () => {
  // 用 active tab 取得正確的 windowId（比 chrome.windows.getCurrent 更可靠）
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentWindowId = activeTab.windowId;

  const settings = await loadSettings();
  if (settings) {
    currentLang = settings.language || 'zh_TW';
    currentDirection = settings.sortDirection || 'asc';
    currentSortMethod = settings.sortMethod || null;
    pinnedGroups = settings.pinnedGroups || [];
    document.getElementById('auto-sort').checked = settings.autoSort || false;
    document.getElementById('ungrouped-position').value = settings.ungroupedPosition || 'end';
  }

  applyLanguage();
  updateDirectionButtons();
  updateSortButtons();
  await refreshAll();
  bindEvents();
});

function applyLanguage() {
  const t = i18n[currentLang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) el.textContent = t[key];
  });
  document.getElementById('btn-lang').textContent = currentLang === 'zh_TW' ? 'EN' : '中';
}

function bindEvents() {
  document.getElementById('btn-lang').addEventListener('click', () => {
    currentLang = currentLang === 'zh_TW' ? 'en' : 'zh_TW';
    applyLanguage();
    refreshAll();
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    const panel = document.getElementById('settings-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('btn-collapse-all').addEventListener('click', async () => {
    await toggleCollapseAll(currentWindowId, true);
    await refreshAll();
    showToast(i18n[currentLang].collapsed);
  });

  document.getElementById('btn-expand-all').addEventListener('click', async () => {
    await toggleCollapseAll(currentWindowId, false);
    await refreshAll();
    showToast(i18n[currentLang].expanded);
  });

  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      // 同一排序方式再點一次 → 切換升降序
      if (currentSortMethod === btn.dataset.sort) {
        currentDirection = currentDirection === 'asc' ? 'desc' : 'asc';
        updateDirectionButtons();
      }
      currentSortMethod = btn.dataset.sort;
      updateSortButtons();
      await performSort();
    });
  });

  document.getElementById('btn-asc').addEventListener('click', async () => {
    currentDirection = 'asc';
    updateDirectionButtons();
    if (currentSortMethod) await performSort();
  });

  document.getElementById('btn-desc').addEventListener('click', async () => {
    currentDirection = 'desc';
    updateDirectionButtons();
    if (currentSortMethod) await performSort();
  });

  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    await saveSettings({
      autoSort: document.getElementById('auto-sort').checked,
      sortMethod: currentSortMethod,
      sortDirection: currentDirection,
      pinnedGroups,
      ungroupedPosition: document.getElementById('ungrouped-position').value,
      language: currentLang
    });
    showToast(i18n[currentLang].saved);
  });

  document.getElementById('btn-clear-closed').addEventListener('click', async () => {
    await clearAllClosed();
    await refreshAll();
    showToast(i18n[currentLang].cleared);
  });

  document.getElementById('ungrouped-position').addEventListener('change', () => {
    if (currentSortMethod) performSort();
  });
}

async function performSort() {
  const pos = document.getElementById('ungrouped-position').value;
  await applySort(currentWindowId, currentSortMethod, currentDirection, pinnedGroups, pos);
  await refreshAll();
  showToast(i18n[currentLang].sortDone);
}

function updateSortButtons() {
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === currentSortMethod);
  });
}

function updateDirectionButtons() {
  document.getElementById('btn-asc').classList.toggle('active', currentDirection === 'asc');
  document.getElementById('btn-desc').classList.toggle('active', currentDirection === 'desc');
}

async function refreshAll() {
  await Promise.all([refreshOpenGroups(), refreshClosedGroups()]);
}

async function refreshOpenGroups() {
  const data = await getOpenGroups(currentWindowId);
  const list = document.getElementById('open-group-list');
  const t = i18n[currentLang];

  document.getElementById('open-count').textContent = data.groups.length;

  if (data.groups.length === 0) {
    list.innerHTML = `<div class="empty-state">${t.noOpenGroups}</div>`;
  } else {
    list.innerHTML = '';
    data.groups.forEach((group, i) => list.appendChild(createOpenGroupItem(group, i, t)));
    setupDragAndDrop(list);
  }

  const ungroupedInfo = document.getElementById('ungrouped-info');
  if (data.ungroupedCount > 0) {
    ungroupedInfo.style.display = 'flex';
    document.getElementById('ungrouped-count').textContent = data.ungroupedCount;
  } else {
    ungroupedInfo.style.display = 'none';
  }
}

async function refreshClosedGroups() {
  let closedGroups = await getClosedGroups();
  const list = document.getElementById('closed-group-list');
  const t = i18n[currentLang];

  // 排序已關閉群組（套用當前排序方式）
  if (currentSortMethod) {
    closedGroups = sortClosedGroups([...closedGroups], currentSortMethod, currentDirection);
  }

  document.getElementById('closed-count').textContent = closedGroups.length;

  if (closedGroups.length === 0) {
    list.innerHTML = `<div class="empty-state">${t.noClosedGroups}</div>`;
  } else {
    list.innerHTML = '';
    closedGroups.forEach(group => list.appendChild(createClosedGroupItem(group, t)));
  }
}

function sortClosedGroups(groups, method, direction) {
  groups.sort((a, b) => {
    let cmp = 0;
    switch (method) {
      case 'name': cmp = (a.title || '').localeCompare(b.title || '', 'zh-Hant'); break;
      case 'tabCount': cmp = (a.tabs?.length || 0) - (b.tabs?.length || 0); break;
      case 'color': cmp = COLOR_ORDER.indexOf(a.color) - COLOR_ORDER.indexOf(b.color); break;
      case 'created': cmp = (a.closedAt || 0) - (b.closedAt || 0); break;
    }
    return direction === 'desc' ? -cmp : cmp;
  });
  return groups;
}

function createOpenGroupItem(group, index, t) {
  const item = document.createElement('div');
  item.className = 'group-item';
  item.draggable = true;
  item.dataset.groupId = group.id;
  item.dataset.index = index;

  const isPinned = pinnedGroups.includes(group.id);
  const displayName = group.title || t.unnamed;
  const nameClass = group.title ? 'group-name' : 'group-name unnamed';

  item.innerHTML = `
    <span class="group-drag-handle">&#x2807;</span>
    <span class="group-color" style="background:${COLOR_MAP[group.color] || COLOR_MAP.grey}"></span>
    <span class="${nameClass}">${escapeHtml(displayName)}</span>
    <span class="group-tab-count">${group.tabCount} ${t.tabs}</span>
    <button class="group-pin ${isPinned ? 'pinned' : ''}" title="${isPinned ? t.unpin : t.pin}">&#x1F4CC;</button>
  `;

  item.querySelector('.group-pin').addEventListener('click', (e) => {
    e.stopPropagation();
    if (pinnedGroups.includes(group.id)) {
      pinnedGroups = pinnedGroups.filter(id => id !== group.id);
    } else {
      pinnedGroups.push(group.id);
    }
    refreshOpenGroups();
  });

  return item;
}

function createClosedGroupItem(group, t) {
  const item = document.createElement('div');
  item.className = 'closed-item';

  const displayName = group.title || t.unnamed;
  const nameClass = group.title ? 'group-name' : 'group-name unnamed';
  const tabCount = group.tabs?.length || 0;
  const timeAgo = formatTimeAgo(group.closedAt, t);

  item.innerHTML = `
    <span class="group-color" style="background:${COLOR_MAP[group.color] || COLOR_MAP.grey}"></span>
    <span class="${nameClass}">${escapeHtml(displayName)}</span>
    <span class="group-tab-count">${tabCount} ${t.tabs}</span>
    <span class="closed-meta">${timeAgo}</span>
    <div class="closed-actions">
      <button class="btn-reopen" data-id="${group.id}">${t.reopen}</button>
      <button class="btn-remove-closed" data-id="${group.id}">&times;</button>
    </div>
  `;

  item.querySelector('.btn-reopen').addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '...';
    await reopenGroup(group);
    await refreshAll();
    showToast(i18n[currentLang].reopened);
  });

  item.querySelector('.btn-remove-closed').addEventListener('click', async (e) => {
    e.stopPropagation();
    await removeClosedGroup(group.id);
    await refreshClosedGroups();
  });

  return item;
}

function formatTimeAgo(timestamp, t) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (currentLang === 'zh_TW') {
    if (mins < 1) return '剛才';
    if (mins < 60) return `${mins} 分鐘前`;
    if (hours < 24) return `${hours} 小時前`;
    return `${days} 天前`;
  }
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ${t.ago}`;
  if (hours < 24) return `${hours}h ${t.ago}`;
  return `${days}d ${t.ago}`;
}

function setupDragAndDrop(list) {
  let draggedItem = null;

  list.querySelectorAll('.group-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedItem = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      list.querySelectorAll('.group-item').forEach(el => el.classList.remove('drag-over'));
      draggedItem = null;
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedItem && draggedItem !== item) {
        list.querySelectorAll('.group-item').forEach(el => el.classList.remove('drag-over'));
        item.classList.add('drag-over');
      }
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });

    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      if (!draggedItem || draggedItem === item) return;

      const draggedGroupId = parseInt(draggedItem.dataset.groupId);
      const targetGroupId = parseInt(item.dataset.groupId);

      const allItems = [...list.querySelectorAll('.group-item')];
      const draggedIdx = allItems.indexOf(draggedItem);
      const targetIdx = allItems.indexOf(item);

      if (draggedIdx < targetIdx) {
        list.insertBefore(draggedItem, item.nextSibling);
      } else {
        list.insertBefore(draggedItem, item);
      }

      const data = await getOpenGroups(currentWindowId);
      const targetGroup = data.groups.find(g => g.id === targetGroupId);
      if (targetGroup) {
        try {
          await chrome.tabGroups.move(draggedGroupId, { index: targetGroup.minIndex });
        } catch (err) {
          console.warn('Drag move failed:', err);
        }
        await refreshOpenGroups();
        showToast(i18n[currentLang].sortDone);
      }
    });
  });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 1500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
