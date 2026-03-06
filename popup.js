// TabGroup Sorter - Popup Script

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
    groupList: '群組列表',
    noGroups: '目前沒有分頁群組',
    ungroupedTabs: '未分組分頁',
    moveToEnd: '移到最後',
    moveToStart: '移到最前',
    settingsTitle: '設定',
    autoSort: '開新視窗時自動排序',
    save: '儲存',
    sortDone: '排序完成！',
    saved: '已儲存！',
    unnamed: '(未命名)',
    pin: '釘選',
    unpin: '取消釘選',
    tabs: '個分頁'
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
    groupList: 'Groups',
    noGroups: 'No tab groups found',
    ungroupedTabs: 'Ungrouped tabs',
    moveToEnd: 'Move to end',
    moveToStart: 'Move to start',
    settingsTitle: 'Settings',
    autoSort: 'Auto-sort on new window',
    save: 'Save',
    sortDone: 'Sorted!',
    saved: 'Saved!',
    unnamed: '(Unnamed)',
    pin: 'Pin',
    unpin: 'Unpin',
    tabs: 'tabs'
  }
};

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

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  const window = await chrome.windows.getCurrent();
  currentWindowId = window.id;

  // Load settings
  const settings = await sendMessage({ action: 'getSettings' });
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
  await refreshGroupList();
  bindEvents();
});

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}

function applyLanguage() {
  const t = i18n[currentLang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) {
      if (el.tagName === 'OPTION') {
        el.textContent = t[key];
      } else {
        el.textContent = t[key];
      }
    }
  });
  document.getElementById('btn-lang').textContent = currentLang === 'zh_TW' ? 'EN' : '中';
}

function bindEvents() {
  // Language toggle
  document.getElementById('btn-lang').addEventListener('click', () => {
    currentLang = currentLang === 'zh_TW' ? 'en' : 'zh_TW';
    applyLanguage();
    refreshGroupList();
  });

  // Settings toggle
  document.getElementById('btn-settings').addEventListener('click', () => {
    const panel = document.getElementById('settings-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  // Collapse / Expand all
  document.getElementById('btn-collapse-all').addEventListener('click', async () => {
    await sendMessage({ action: 'toggleCollapseAll', windowId: currentWindowId, collapse: true });
    await refreshGroupList();
    showToast(i18n[currentLang].sortDone);
  });

  document.getElementById('btn-expand-all').addEventListener('click', async () => {
    await sendMessage({ action: 'toggleCollapseAll', windowId: currentWindowId, collapse: false });
    await refreshGroupList();
    showToast(i18n[currentLang].sortDone);
  });

  // Sort buttons
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      currentSortMethod = btn.dataset.sort;
      updateSortButtons();
      await performSort();
    });
  });

  // Direction buttons
  document.getElementById('btn-asc').addEventListener('click', () => {
    currentDirection = 'asc';
    updateDirectionButtons();
    if (currentSortMethod) performSort();
  });

  document.getElementById('btn-desc').addEventListener('click', () => {
    currentDirection = 'desc';
    updateDirectionButtons();
    if (currentSortMethod) performSort();
  });

  // Save settings
  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const settings = {
      autoSort: document.getElementById('auto-sort').checked,
      sortMethod: currentSortMethod,
      sortDirection: currentDirection,
      pinnedGroups,
      ungroupedPosition: document.getElementById('ungrouped-position').value,
      language: currentLang
    };
    await sendMessage({ action: 'saveSettings', settings });
    showToast(i18n[currentLang].saved);
  });

  // Ungrouped position change
  document.getElementById('ungrouped-position').addEventListener('change', () => {
    if (currentSortMethod) performSort();
  });
}

async function performSort() {
  const ungroupedPosition = document.getElementById('ungrouped-position').value;
  await sendMessage({
    action: 'sort',
    windowId: currentWindowId,
    sortMethod: currentSortMethod,
    sortDirection: currentDirection,
    pinnedGroups,
    ungroupedPosition
  });
  await refreshGroupList();
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

async function refreshGroupList() {
  const data = await sendMessage({ action: 'getGroups', windowId: currentWindowId });
  if (!data) return;

  const list = document.getElementById('group-list');
  const t = i18n[currentLang];

  document.getElementById('group-count').textContent = data.groups.length;

  if (data.groups.length === 0) {
    list.innerHTML = `<div class="empty-state">${t.noGroups}</div>`;
  } else {
    list.innerHTML = '';
    data.groups.forEach((group, index) => {
      const item = createGroupItem(group, index, t);
      list.appendChild(item);
    });
    setupDragAndDrop(list);
  }

  // Ungrouped info
  const ungroupedInfo = document.getElementById('ungrouped-info');
  if (data.ungroupedCount > 0) {
    ungroupedInfo.style.display = 'flex';
    document.getElementById('ungrouped-count').textContent = data.ungroupedCount;
  } else {
    ungroupedInfo.style.display = 'none';
  }
}

function createGroupItem(group, index, t) {
  const item = document.createElement('div');
  item.className = 'group-item';
  item.draggable = true;
  item.dataset.groupId = group.id;
  item.dataset.index = index;

  const isPinned = pinnedGroups.includes(group.id);
  const displayName = group.title || t.unnamed;
  const nameClass = group.title ? 'group-name' : 'group-name unnamed';

  item.innerHTML = `
    <span class="group-drag-handle">⠿</span>
    <span class="group-color" style="background:${COLOR_MAP[group.color] || COLOR_MAP.grey}"></span>
    <span class="${nameClass}">${escapeHtml(displayName)}</span>
    <span class="group-tab-count">${group.tabCount} ${t.tabs}</span>
    <button class="group-pin ${isPinned ? 'pinned' : ''}" data-group-id="${group.id}" title="${isPinned ? t.unpin : t.pin}">📌</button>
  `;

  // Pin button
  item.querySelector('.group-pin').addEventListener('click', (e) => {
    e.stopPropagation();
    const gid = group.id;
    if (pinnedGroups.includes(gid)) {
      pinnedGroups = pinnedGroups.filter(id => id !== gid);
    } else {
      pinnedGroups.push(gid);
    }
    refreshGroupList();
  });

  return item;
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

      // Reorder in DOM
      const allItems = [...list.querySelectorAll('.group-item')];
      const draggedIdx = allItems.indexOf(draggedItem);
      const targetIdx = allItems.indexOf(item);

      if (draggedIdx < targetIdx) {
        list.insertBefore(draggedItem, item.nextSibling);
      } else {
        list.insertBefore(draggedItem, item);
      }

      // Get the target group's current min tab index to move to
      const data = await sendMessage({ action: 'getGroups', windowId: currentWindowId });
      const targetGroup = data.groups.find(g => g.id === targetGroupId);
      if (targetGroup) {
        await sendMessage({
          action: 'moveGroup',
          windowId: currentWindowId,
          groupId: draggedGroupId,
          targetIndex: targetGroup.minIndex
        });
        await refreshGroupList();
        showToast(i18n[currentLang].sortDone);
      }
    });
  });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 1500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
