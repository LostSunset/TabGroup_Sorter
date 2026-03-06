# TabGroup Sorter

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-brightgreen.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![GitHub stars](https://img.shields.io/github/stars/LostSunset/TabGroup_Sorter?style=social)](https://github.com/LostSunset/TabGroup_Sorter/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/LostSunset/TabGroup_Sorter?style=social)](https://github.com/LostSunset/TabGroup_Sorter/network/members)
[![GitHub issues](https://img.shields.io/github/issues/LostSunset/TabGroup_Sorter)](https://github.com/LostSunset/TabGroup_Sorter/issues)

Chrome 擴充套件，讓你輕鬆對瀏覽器中的分頁群組 (Tab Groups) 進行排序與管理。

## 功能

- **多種排序方式**：依群組名稱、分頁數量、顏色、順序排列（升序/降序）
- **手動拖曳排序**：直接拖曳群組項目來調整順序
- **釘選群組**：將特定群組釘選在排序結果最前面
- **收合/展開全部**：一鍵收合或展開所有分頁群組
- **未分組分頁管理**：可選擇將未分組的分頁移到最前或最後
- **自動排序**：開啟新視窗時自動套用偏好的排序規則
- **雙語介面**：繁體中文 / English 切換

## 安裝方式

1. 下載或 clone 此專案
2. 開啟 Chrome，前往 `chrome://extensions/`
3. 開啟右上角「開發人員模式」
4. 點擊「載入未封裝項目」
5. 選擇此專案資料夾

## 使用方式

1. 點擊工具列上的 TabGroup Sorter 圖示
2. 在彈出面板中可看到目前所有分頁群組
3. 選擇排序方式（名稱/分頁數/顏色/順序）與方向（升序/降序）
4. 或直接拖曳群組項目手動調整順序
5. 點擊齒輪圖示可開啟設定，啟用自動排序

## 專案結構

```
TabGroup_Sorter/
├── manifest.json          # 擴充套件配置（Manifest V3）
├── background.js          # Service Worker
├── popup.html             # Popup 介面
├── popup.css              # 樣式
├── popup.js               # Popup 邏輯
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

- `tabGroups`：讀取與操作分頁群組
- `tabs`：讀取分頁資訊以進行排序
- `storage`：儲存使用者偏好設定

## 技術

- Chrome Extension Manifest V3
- 原生 HTML / CSS / JavaScript
- 無外部依賴，所有邏輯在本地執行

## License

MIT

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=LostSunset/TabGroup_Sorter&type=Date)](https://star-history.com/#LostSunset/TabGroup_Sorter&Date)
