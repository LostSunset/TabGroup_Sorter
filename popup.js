// TabGroup Sorter v2.0 - Popup Script
// 直接呼叫 Chrome API，部分操作透過 sendMessage 委託 background

// ===================================================================
// SECTION 1: Constants & i18n
// ===================================================================

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
    realtimeAutoSort: '即時自動排序（群組變更時排序）',
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
    ago: '前',
    // v2.0 new
    autoGroup: '自動分組',
    autoGroupDone: '已依網域自動分組！',
    autoGroupNone: '沒有可分組的分頁',
    dedupTabs: '去重分頁',
    foundDuplicates: '找到 {n} 個重複，再按一次確認關閉',
    noDuplicates: '沒有重複的分頁',
    dedupDone: '已關閉 {n} 個重複分頁！',
    ungroupAll: '解散群組',
    ungroupDone: '已解散所有群組！',
    savedSessions: '已儲存的工作區',
    saveSession: '儲存目前',
    restoreSession: '還原',
    deleteSession: '刪除',
    sessionName: '工作區名稱...',
    sessionSaved: '已儲存工作區！',
    sessionRestored: '正在還原工作區...',
    noSessions: '沒有已儲存的工作區',
    groupsCount: '個群組',
    tabsCount: '個分頁',
    customRules: '自訂規則',
    addRule: '新增規則',
    editRule: '編輯',
    deleteRule: '刪除',
    uniformColor: '統一顏色',
    uniformColorDone: '已統一群組顏色！',
    chooseColor: '選擇顏色',
    noRules: '尚無自訂規則',
    ruleSaved: '規則已儲存！',
    ruleDeleted: '規則已刪除！'
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
    realtimeAutoSort: 'Real-time auto sort (on group change)',
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
    ago: 'ago',
    // v2.0 new
    autoGroup: 'Auto Group',
    autoGroupDone: 'Auto grouped by domain!',
    autoGroupNone: 'No tabs to group',
    dedupTabs: 'Dedup',
    foundDuplicates: 'Found {n} duplicates. Click again to close',
    noDuplicates: 'No duplicates found',
    dedupDone: 'Closed {n} duplicate tabs!',
    ungroupAll: 'Ungroup',
    ungroupDone: 'All groups dissolved!',
    savedSessions: 'Saved Sessions',
    saveSession: 'Save Current',
    restoreSession: 'Restore',
    deleteSession: 'Del',
    sessionName: 'Session name...',
    sessionSaved: 'Session saved!',
    sessionRestored: 'Restoring session...',
    noSessions: 'No saved sessions',
    groupsCount: 'groups',
    tabsCount: 'tabs',
    customRules: 'Custom Rules',
    addRule: 'Add Rule',
    editRule: 'Edit',
    deleteRule: 'Del',
    uniformColor: 'Uniform Color',
    uniformColorDone: 'Color applied to all groups!',
    chooseColor: 'Choose a color',
    noRules: 'No custom rules',
    ruleSaved: 'Rule saved!',
    ruleDeleted: 'Rule deleted!'
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
let dedupPending = null; // For two-step dedup confirmation
let editingRuleId = null; // For rule editing

// ===================================================================
// SECTION 2: DOM & Chrome API Helpers
// ===================================================================

function $(id) {
  return document.getElementById(id);
}

async function getOpenGroups(windowId) {
  let tabs = await chrome.tabs.query({ windowId });
  let groups = await chrome.tabGroups.query({ windowId });

  if (groups.length === 0 && tabs.length === 0) {
    tabs = await chrome.tabs.query({ currentWindow: true });
    groups = await chrome.tabGroups.query({});
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
  const firstUrl = closedGroup.tabs[0]?.url;
  const createOpts = { active: false };
  if (firstUrl && !firstUrl.startsWith('chrome://')) createOpts.url = firstUrl;
  const firstTab = await chrome.tabs.create(createOpts);

  const groupId = await chrome.tabs.group({ tabIds: [firstTab.id] });
  await chrome.tabGroups.update(groupId, {
    title: closedGroup.title,
    color: closedGroup.color
  });

  for (let i = 1; i < closedGroup.tabs.length; i++) {
    const url = closedGroup.tabs[i]?.url;
    const opts = { active: false };
    if (url && !url.startsWith('chrome://')) opts.url = url;
    const tab = await chrome.tabs.create(opts);
    await chrome.tabs.group({ tabIds: [tab.id], groupId });
  }

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

// ===================================================================
// SECTION 3: UI Initialization & Event Binding
// ===================================================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTabs.length > 0) {
      currentWindowId = activeTabs[0].windowId;
    } else {
      const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
      currentWindowId = win.id;
    }

    const settings = await loadSettings();
    if (settings) {
      currentLang = settings.language || 'zh_TW';
      currentDirection = settings.sortDirection || 'asc';
      currentSortMethod = settings.sortMethod || null;
      pinnedGroups = settings.pinnedGroups || [];
      const autoSortEl = $('auto-sort');
      const realtimeEl = $('realtime-auto-sort');
      const ungroupedPosEl = $('ungrouped-position');
      if (autoSortEl) autoSortEl.checked = settings.autoSort || false;
      if (realtimeEl) realtimeEl.checked = settings.realtimeAutoSort || false;
      if (ungroupedPosEl) ungroupedPosEl.value = settings.ungroupedPosition || 'end';
    }

    applyLanguage();
    updateDirectionButtons();
    updateSortButtons();
    await refreshAll();
    bindEvents();
  } catch (err) {
    console.error('TabGroup Sorter init error:', err);
  }
});

function applyLanguage() {
  const t = i18n[currentLang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) el.textContent = t[key];
  });
  const langBtn = $('btn-lang');
  if (langBtn) langBtn.textContent = currentLang === 'zh_TW' ? 'EN' : '中';

  // Update placeholders
  const sessionInput = $('session-name-input');
  if (sessionInput) sessionInput.placeholder = t.sessionName;
}

function on(id, event, handler) {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
}

function bindEvents() {
  // Language toggle
  on('btn-lang', 'click', async () => {
    currentLang = currentLang === 'zh_TW' ? 'en' : 'zh_TW';
    applyLanguage();
    await refreshAll();
  });

  // Settings toggle
  on('btn-settings', 'click', () => {
    const panel = $('settings-panel');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  // Collapse/Expand (via background)
  on('btn-collapse-all', 'click', async () => {
    await chrome.runtime.sendMessage({ action: 'collapseAll', windowId: currentWindowId });
    await refreshAll();
    showToast(i18n[currentLang].collapsed);
  });

  on('btn-expand-all', 'click', async () => {
    await chrome.runtime.sendMessage({ action: 'expandAll', windowId: currentWindowId });
    await refreshAll();
    showToast(i18n[currentLang].expanded);
  });

  // Auto Group (via background)
  on('btn-auto-group', 'click', async () => {
    const btn = $('btn-auto-group');
    if (btn) btn.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ action: 'autoGroupByDomain', windowId: currentWindowId });
      await refreshAll();
      const t = i18n[currentLang];
      showToast(result && result.grouped > 0 ? t.autoGroupDone : t.autoGroupNone);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Dedup Tabs (two-step)
  on('btn-dedup', 'click', async () => {
    const t = i18n[currentLang];
    if (dedupPending) {
      // Second click: close duplicates
      await chrome.tabs.remove(dedupPending);
      const count = dedupPending.length;
      dedupPending = null;
      const btn = $('btn-dedup');
      if (btn) { btn.classList.remove('confirm'); btn.textContent = t.dedupTabs; }
      await refreshAll();
      showToast(t.dedupDone.replace('{n}', count));
    } else {
      // First click: find duplicates
      const duplicates = await findDuplicateTabs();
      if (duplicates.length === 0) {
        showToast(t.noDuplicates);
      } else {
        dedupPending = duplicates;
        const btn = $('btn-dedup');
        if (btn) {
          btn.classList.add('confirm');
          btn.textContent = t.foundDuplicates.replace('{n}', duplicates.length);
        }
        // Auto-cancel after 5s
        setTimeout(() => {
          if (dedupPending) {
            dedupPending = null;
            const btn2 = $('btn-dedup');
            if (btn2) { btn2.classList.remove('confirm'); btn2.textContent = i18n[currentLang].dedupTabs; }
          }
        }, 5000);
      }
    }
  });

  // Ungroup All
  on('btn-ungroup-all', 'click', async () => {
    const tabs = await chrome.tabs.query({ windowId: currentWindowId });
    const groupedTabIds = tabs.filter(t => t.groupId !== -1).map(t => t.id);
    if (groupedTabIds.length > 0) {
      await chrome.tabs.ungroup(groupedTabIds);
    }
    await refreshAll();
    showToast(i18n[currentLang].ungroupDone);
  });

  // Sort buttons
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (currentSortMethod === btn.dataset.sort) {
        currentDirection = currentDirection === 'asc' ? 'desc' : 'asc';
        updateDirectionButtons();
      }
      currentSortMethod = btn.dataset.sort;
      updateSortButtons();
      await performSort();
    });
  });

  on('btn-asc', 'click', async () => {
    currentDirection = 'asc';
    updateDirectionButtons();
    if (currentSortMethod) await performSort();
  });

  on('btn-desc', 'click', async () => {
    currentDirection = 'desc';
    updateDirectionButtons();
    if (currentSortMethod) await performSort();
  });

  // Save settings
  on('btn-save-settings', 'click', async () => {
    const currentSettings = await loadSettings();
    await saveSettings({
      ...currentSettings,
      autoSort: $('auto-sort')?.checked || false,
      realtimeAutoSort: $('realtime-auto-sort')?.checked || false,
      sortMethod: currentSortMethod,
      sortDirection: currentDirection,
      pinnedGroups,
      ungroupedPosition: $('ungrouped-position')?.value || 'end',
      language: currentLang
    });
    showToast(i18n[currentLang].saved);
  });

  on('btn-clear-closed', 'click', async () => {
    await clearAllClosed();
    await refreshAll();
    showToast(i18n[currentLang].cleared);
  });

  on('ungrouped-position', 'change', () => {
    if (currentSortMethod) performSort();
  });

  // Session: save
  on('btn-save-session', 'click', () => {
    const form = $('save-session-form');
    if (form) {
      form.style.display = form.style.display === 'none' ? 'flex' : 'none';
      if (form.style.display === 'flex') {
        const input = $('session-name-input');
        if (input) { input.value = ''; input.focus(); }
      }
    }
  });

  on('btn-confirm-save-session', 'click', async () => {
    const input = $('session-name-input');
    const name = input ? input.value.trim() : '';
    await chrome.runtime.sendMessage({ action: 'saveSession', windowId: currentWindowId, name: name || undefined });
    const form = $('save-session-form');
    if (form) form.style.display = 'none';
    await refreshSessions();
    showToast(i18n[currentLang].sessionSaved);
  });

  on('btn-cancel-save-session', 'click', () => {
    const form = $('save-session-form');
    if (form) form.style.display = 'none';
  });

  // Enter key on session name input
  const sessionInput = $('session-name-input');
  if (sessionInput) {
    sessionInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('btn-confirm-save-session')?.click();
    });
  }

  // Rules: add
  on('btn-add-rule', 'click', () => {
    editingRuleId = null;
    showRuleEditor();
  });

  on('btn-save-rule', 'click', async () => {
    await saveRule();
  });

  on('btn-cancel-rule', 'click', () => {
    hideRuleEditor();
  });

  // Uniform color
  on('btn-uniform-color', 'click', () => {
    const picker = $('color-picker');
    if (picker) picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
  });

  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', async () => {
      const color = dot.dataset.color;
      const groups = await chrome.tabGroups.query({ windowId: currentWindowId });
      for (const group of groups) {
        try {
          await chrome.tabGroups.update(group.id, { color });
        } catch (e) { /* ignore */ }
      }
      const picker = $('color-picker');
      if (picker) picker.style.display = 'none';
      await refreshAll();
      showToast(i18n[currentLang].uniformColorDone);
    });
  });
}

// ===================================================================
// SECTION 4: Sort Logic
// ===================================================================

async function performSort() {
  // Save current settings first so background uses latest sort preferences
  const currentSettings = await loadSettings();
  await saveSettings({
    ...currentSettings,
    sortMethod: currentSortMethod,
    sortDirection: currentDirection,
    pinnedGroups,
    ungroupedPosition: $('ungrouped-position')?.value || 'end'
  });
  // Delegate to background to respect isSorting guard
  await chrome.runtime.sendMessage({ action: 'sortGroups', windowId: currentWindowId });
  await refreshAll();
  showToast(i18n[currentLang].sortDone);
}

function updateSortButtons() {
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === currentSortMethod);
  });
}

function updateDirectionButtons() {
  const ascBtn = $('btn-asc');
  const descBtn = $('btn-desc');
  if (ascBtn) ascBtn.classList.toggle('active', currentDirection === 'asc');
  if (descBtn) descBtn.classList.toggle('active', currentDirection === 'desc');
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

// ===================================================================
// SECTION 5: Open Groups UI
// ===================================================================

async function refreshAll() {
  await Promise.all([refreshOpenGroups(), refreshClosedGroups(), refreshSessions(), refreshRules()]);
}

async function refreshOpenGroups() {
  let data;
  try {
    data = await getOpenGroups(currentWindowId);
  } catch (e) {
    console.warn('refreshOpenGroups error:', e);
    data = { groups: [], ungroupedCount: 0 };
  }
  const list = $('open-group-list');
  const t = i18n[currentLang];
  if (!list) return;

  const countEl = $('open-count');
  if (countEl) countEl.textContent = data.groups.length;

  if (data.groups.length === 0) {
    list.innerHTML = `<div class="empty-state">${t.noOpenGroups}</div>`;
  } else {
    list.innerHTML = '';
    data.groups.forEach((group, i) => list.appendChild(createOpenGroupItem(group, i, t)));
    setupDragAndDrop(list);
  }

  const ungroupedInfo = $('ungrouped-info');
  if (ungroupedInfo) {
    if (data.ungroupedCount > 0) {
      ungroupedInfo.style.display = 'flex';
      const ucEl = $('ungrouped-count');
      if (ucEl) ucEl.textContent = data.ungroupedCount;
    } else {
      ungroupedInfo.style.display = 'none';
    }
  }
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

// ===================================================================
// SECTION 6: Closed Groups UI
// ===================================================================

async function refreshClosedGroups() {
  let closedGroups;
  try {
    closedGroups = await getClosedGroups();
  } catch (e) {
    console.warn('refreshClosedGroups error:', e);
    closedGroups = [];
  }
  const list = $('closed-group-list');
  const t = i18n[currentLang];
  if (!list) return;

  // 已關閉群組預設按名稱排序，有選擇排序方式時依該方式排序
  closedGroups = sortClosedGroups([...closedGroups], currentSortMethod || 'name', currentDirection);

  const countEl = $('closed-count');
  if (countEl) countEl.textContent = closedGroups.length;

  if (closedGroups.length === 0) {
    list.innerHTML = `<div class="empty-state">${t.noClosedGroups}</div>`;
  } else {
    list.innerHTML = '';
    closedGroups.forEach(group => list.appendChild(createClosedGroupItem(group, t)));
  }
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

// ===================================================================
// SECTION 7: Saved Sessions UI
// ===================================================================

async function refreshSessions() {
  let sessions;
  try {
    const result = await chrome.storage.local.get('savedSessions');
    sessions = result.savedSessions || [];
  } catch (e) {
    console.warn('refreshSessions error:', e);
    sessions = [];
  }
  const list = $('session-list');
  const t = i18n[currentLang];
  if (!list) return;

  const countEl = $('session-count');
  if (countEl) countEl.textContent = sessions.length;

  if (sessions.length === 0) {
    list.innerHTML = `<div class="empty-state">${t.noSessions}</div>`;
  } else {
    list.innerHTML = '';
    sessions.forEach(session => list.appendChild(createSessionItem(session, t)));
  }
}

function createSessionItem(session, t) {
  const item = document.createElement('div');
  item.className = 'session-item';

  const groupCount = session.groups?.length || 0;
  const tabCount = (session.groups || []).reduce((sum, g) => sum + (g.tabs?.length || 0), 0) + (session.ungroupedTabs?.length || 0);
  const timeAgo = formatTimeAgo(session.savedAt, t);

  item.innerHTML = `
    <span class="session-name">${escapeHtml(session.name)}</span>
    <span class="session-meta">${groupCount}${t.groupsCount} ${tabCount}${t.tabsCount} ${timeAgo}</span>
    <div class="session-actions">
      <button class="btn-restore" data-id="${session.id}">${t.restoreSession}</button>
      <button class="btn-delete-session" data-id="${session.id}">&times;</button>
    </div>
  `;

  item.querySelector('.btn-restore').addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '...';
    showToast(t.sessionRestored);
    await chrome.runtime.sendMessage({ action: 'restoreSession', sessionId: session.id });
  });

  item.querySelector('.btn-delete-session').addEventListener('click', async (e) => {
    e.stopPropagation();
    await chrome.runtime.sendMessage({ action: 'deleteSession', sessionId: session.id });
    await refreshSessions();
  });

  return item;
}

// ===================================================================
// SECTION 8: Custom Rules UI
// ===================================================================

async function refreshRules() {
  let rules;
  try {
    const settings = await loadSettings();
    rules = settings.customRules || [];
  } catch (e) {
    console.warn('refreshRules error:', e);
    rules = [];
  }
  const list = $('rule-list');
  const t = i18n[currentLang];
  if (!list) return;

  if (rules.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:8px 0;">${t.noRules}</div>`;
  } else {
    list.innerHTML = '';
    rules.forEach(rule => list.appendChild(createRuleItem(rule, t)));
  }
}

function createRuleItem(rule, t) {
  const item = document.createElement('div');
  item.className = 'rule-item';

  item.innerHTML = `
    <span class="group-color" style="background:${COLOR_MAP[rule.groupColor] || COLOR_MAP.grey}"></span>
    <span class="rule-group-name">${escapeHtml(rule.groupName)}</span>
    <span class="rule-pattern">${escapeHtml(rule.pattern)}</span>
    <div class="rule-actions">
      <button class="btn-edit-rule" title="${t.editRule}">&#x270E;</button>
      <button class="btn-delete-rule" title="${t.deleteRule}">&times;</button>
    </div>
  `;

  item.querySelector('.btn-edit-rule').addEventListener('click', (e) => {
    e.stopPropagation();
    editingRuleId = rule.id;
    showRuleEditor(rule);
  });

  item.querySelector('.btn-delete-rule').addEventListener('click', async (e) => {
    e.stopPropagation();
    const settings = await loadSettings();
    settings.customRules = (settings.customRules || []).filter(r => r.id !== rule.id);
    await saveSettings(settings);
    await refreshRules();
    showToast(i18n[currentLang].ruleDeleted);
  });

  return item;
}

function showRuleEditor(rule) {
  const editor = $('rule-editor');
  if (!editor) return;
  editor.style.display = 'flex';

  const patternInput = $('rule-pattern');
  const typeSelect = $('rule-type');
  const nameInput = $('rule-name');
  const colorSelect = $('rule-color');

  if (rule) {
    if (patternInput) patternInput.value = rule.pattern || '';
    if (typeSelect) typeSelect.value = rule.patternType || 'glob';
    if (nameInput) nameInput.value = rule.groupName || '';
    if (colorSelect) colorSelect.value = rule.groupColor || 'blue';
  } else {
    if (patternInput) patternInput.value = '';
    if (typeSelect) typeSelect.value = 'glob';
    if (nameInput) nameInput.value = '';
    if (colorSelect) colorSelect.value = 'blue';
  }

  if (patternInput) patternInput.focus();
}

function hideRuleEditor() {
  const editor = $('rule-editor');
  if (editor) editor.style.display = 'none';
  editingRuleId = null;
}

async function saveRule() {
  const pattern = $('rule-pattern')?.value.trim();
  const patternType = $('rule-type')?.value || 'glob';
  const groupName = $('rule-name')?.value.trim();
  const groupColor = $('rule-color')?.value || 'blue';

  if (!pattern || !groupName) return;

  // Validate regex if type is regex
  if (patternType === 'regex') {
    try { new RegExp(pattern); } catch (e) {
      showToast('Invalid regex!', true);
      return;
    }
  }

  const settings = await loadSettings();
  const rules = settings.customRules || [];

  if (editingRuleId) {
    const idx = rules.findIndex(r => r.id === editingRuleId);
    if (idx >= 0) {
      rules[idx] = { ...rules[idx], pattern, patternType, groupName, groupColor };
    }
  } else {
    rules.push({
      id: 'rule_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      pattern,
      patternType,
      groupName,
      groupColor,
      enabled: true,
      priority: rules.length
    });
  }

  settings.customRules = rules;
  await saveSettings(settings);
  hideRuleEditor();
  await refreshRules();
  showToast(i18n[currentLang].ruleSaved);
}

// ===================================================================
// SECTION 9: Duplicate Tab Detection
// ===================================================================

async function findDuplicateTabs() {
  const tabs = await chrome.tabs.query({ windowId: currentWindowId });
  const seen = new Set();
  const duplicates = [];

  for (const tab of tabs) {
    const url = tab.url || tab.pendingUrl;
    if (!url) continue;

    // Normalize: strip trailing slash and hash fragment
    const normalized = url.replace(/\/$/, '').replace(/#.*$/, '');

    if (seen.has(normalized)) {
      duplicates.push(tab.id);
    } else {
      seen.add(normalized);
    }
  }

  return duplicates;
}

// ===================================================================
// SECTION 10: Drag & Drop
// ===================================================================

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

// ===================================================================
// SECTION 11: Utilities
// ===================================================================

function showToast(message, isWarning) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = isWarning ? 'toast warning' : 'toast';
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 1500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
