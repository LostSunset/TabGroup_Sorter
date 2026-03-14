# TabGroup Sorter

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-brightgreen.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![Version](https://img.shields.io/badge/version-2.0.0-orange.svg)](https://github.com/LostSunset/TabGroup_Sorter/releases)
[![GitHub stars](https://img.shields.io/github/stars/LostSunset/TabGroup_Sorter?style=social)](https://github.com/LostSunset/TabGroup_Sorter/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/LostSunset/TabGroup_Sorter?style=social)](https://github.com/LostSunset/TabGroup_Sorter/network/members)
[![GitHub issues](https://img.shields.io/github/issues/LostSunset/TabGroup_Sorter)](https://github.com/LostSunset/TabGroup_Sorter/issues)

Chrome 擴充套件 — 針對 Chrome 原生分頁群組 (Tab Groups) 進行排序、自動分組、自訂規則、工作區管理的全方位工具。

## 功能

### 核心排序
- **多種排序方式**：依群組名稱、分頁數量、顏色、建立順序排列（升序/降序）
- **即時自動排序**：群組建立/更新時自動重排，可開關
- **新視窗自動排序**：開啟新視窗時自動套用偏好排序
- **手動拖曳排序**：直接拖曳群組項目調整順序
- **釘選群組**：將特定群組釘選在排序最前面
- **已關閉群組排序**：已關閉的群組預設依名稱 A→Z 排列

### 智慧分組
- **依網域自動分組**：一鍵將未分組分頁依網域自動歸類（支援 40+ 知名網域名稱對映）
- **自訂規則分組**：設定 URL 模式（Glob/Regex）→ 指定群組名稱 + 顏色，優先於網域分組

### 群組管理
- **收合/展開全部**：一鍵收合或展開所有分頁群組
- **解散所有群組**：一鍵將所有群組還原為未分組狀態
- **統一顏色**：9 色圓點選擇器，一鍵套用到所有群組
- **去重分頁**：掃描並關閉重複 URL 的分頁（兩步確認）

### 追蹤與還原
- **已關閉群組追蹤**：自動記錄已關閉的分頁群組，保留名稱、顏色與所有分頁 URL
- **一鍵重新開啟**：已關閉的群組可一鍵還原（重建群組 + 還原所有分頁）
- **消失群組偵測**：Service Worker 重啟時自動偵測消失的群組並加入追蹤
- **工作區儲存/還原**：將目前所有群組+分頁存為命名工作區，在新視窗還原

### 快捷鍵
| 快捷鍵 | 功能 |
|--------|------|
| `Alt+S` | 排序分頁群組 |
| `Alt+C` | 收合所有群組 |
| `Alt+E` | 展開所有群組 |
| `Alt+G` | 依網域自動分組 |

### 其他
- **雙語介面**：繁體中文 / English 即時切換
- **未分組分頁管理**：可選擇將未分組的分頁移到最前或最後
- **暗色主題**：深色 UI，搭配 9 色群組色彩系統

## 安裝方式

1. 下載或 clone 此專案
2. 開啟 Chrome，前往 `chrome://extensions/`
3. 開啟右上角「開發人員模式」
4. 點擊「載入未封裝項目」
5. 選擇此專案資料夾

## 使用方式

1. 點擊工具列上的 TabGroup Sorter 圖示
2. 使用快速操作列：自動分組 / 去重 / 解散群組
3. 選擇排序方式（名稱/分頁數/顏色/順序）與方向
4. 拖曳群組手動調整、釘選重要群組
5. 在設定中啟用即時自動排序、管理自訂規則
6. 儲存工作區配置，隨時還原

## 專案結構

```
TabGroup_Sorter/
├── manifest.json          # 擴充套件配置（Manifest V3）
├── background.js          # Service Worker（排序引擎、自動分組、規則匹配、快捷鍵）
├── popup.html             # Popup 介面
├── popup.css              # 樣式（暗色主題）
├── popup.js               # Popup 邏輯（UI、規則編輯器、工作區管理）
├── icons/                 # 擴充套件圖示
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── _locales/              # 多語系
│   ├── zh_TW/messages.json
│   └── en/messages.json
└── README.md
```

## 權限說明

| 權限 | 用途 |
|------|------|
| `tabGroups` | 讀取與操作分頁群組（排序、分組、收合） |
| `tabs` | 讀取分頁資訊（URL、分頁數、去重） |
| `storage` | 儲存設定、已關閉群組紀錄、自訂規則、工作區 |

## 技術

- Chrome Extension Manifest V3
- 原生 HTML / CSS / JavaScript
- 無外部依賴，所有邏輯在本地執行
- Service Worker 事件驅動架構

## Changelog

### v2.0.0 (2026-03-15)
- **新功能**：依網域自動分組（支援 40+ 知名網域名稱對映）
- **新功能**：自訂規則分組（Glob/Regex URL 模式匹配）
- **新功能**：即時自動排序（群組變更時自動重排，500ms debounce 防迴圈）
- **新功能**：去重分頁（兩步確認，5 秒自動取消）
- **新功能**：工作區儲存/還原（在新視窗還原完整群組配置）
- **新功能**：鍵盤快捷鍵 Alt+S/C/E/G
- **新功能**：解散所有群組
- **新功能**：統一顏色（9 色選擇器）
- **新功能**：消失群組偵測（SW 重啟時自動追蹤）
- **改進**：已關閉群組預設按名稱排序
- **修復**：移除不存在的 `chrome.tabGroups.onMoved` API
- **修復**：修正 `TAB_GROUP_ID_NONE` 常數錯誤
- **修復**：新增 ReDoS 防護
- **修復**：修正 `chrome://newtab` URL 建立問題

### v1.1.3
- 修復所有 getElementById null TypeError

### v1.1.0
- 追蹤已關閉的分頁群組，支援排序與一鍵重新開啟

### v1.0.0
- 初始版本：名稱/分頁數/顏色/順序排序、拖曳、收合/展開、雙語

## License

MIT

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=LostSunset/TabGroup_Sorter&type=Date)](https://star-history.com/#LostSunset/TabGroup_Sorter&Date)
