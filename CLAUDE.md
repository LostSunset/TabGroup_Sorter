# CLAUDE.md — 專案開發規範與 Claude Code 工作準則

> **本文件為專案唯一權威規範，Claude Code 必須完整記憶並嚴格遵守。**
> **請勿刪除任何現有開發進度或錯誤紀錄。**
> **本文件與 memory/MEMORY.md 同步，任一方更新時另一方也必須同步更新。**

---

## 1. 專案環境管理

- **套件管理器**：如果使用 Python 一律使用 `uv`，禁止使用 pip 或其他工具。
- **Python 版本**：以最順暢、功能完整的版本為主
- **虛擬環境名稱**：`.venv`
- **環境變數預設**：`UV_PROJECT_ENVIRONMENT=.venv`（必須寫入 `.env` 或 shell profile，讓 uv 自動指向正確虛擬環境）
- **啟動環境指令**：`source .venv/bin/activate` 或 `uv run`
- **倉庫位址**：`https://github.com/LostSunset/DesktopLens_MCP.git`
- **設定方式**（擇一即可，建議兩者都加）：
  - 專案級：在專案根目錄 `.env` 中加入 `UV_PROJECT_ENVIRONMENT=.venv`
  - 使用者級：在 `~/.bashrc` 或 `~/.zshrc` 中加入 `export UV_PROJECT_ENVIRONMENT=.venv`

---

## 2. 正體中文 / UTF-8 支援（強制）

- 專案所有文字檔一律以 UTF-8 存檔。
- 測試資料讀寫一律明確指定 `encoding="utf-8"`。
- 執行時強制 UTF-8 輸出，設定 `PYTHONIOENCODING=utf-8`。
- CI 編碼一致：Linux `LANG=en_US.UTF-8` / `LC_ALL=en_US.UTF-8`；Windows 確保不破字。
- pytest 輸出需正確顯示中文，log 不可出現亂碼。

---

## 3. Lint 檢查與自動修復（推送前必做）

執行順序：
1. `ruff format .`（自動修復格式）
2. `ruff check --fix .`（自動修復 import 排序等）
3. `ruff check .`（最終檢查，必須零錯誤才可推送）

常見問題修復：
- **W293** → `ruff format`
- **E722** → 改為 `except Exception:`
- **I001** → `ruff check --fix`
- **F401** → 刪除或 `# noqa: F401`
- **NameError forward ref** → `from __future__ import annotations`

---

## 4. 版本規則（Semantic Versioning）

- **PATCH**（`fix:`）：v0.0.1 → v0.0.2
- **MINOR**（`feat:`）：v0.0.1 → v0.1.0
- **MAJOR**（`breaking:`）：v0.0.1 → v1.0.0

---

## 5. README 規範

必含徽章：CI 狀態、License: MIT、Python、GitHub stars/forks/issues
必含 Star History 圖表。

---

## 6. Release Agent 自動發布流程

觸發詞：「release」/「發布」
流程：`uv run pytest` → Lint 檢查修復 → 更新 README → 遞增版本號 → 提交 + tag → 推送

---

## 7. 開發團隊模式（預設啟用）

所有子代理一律使用 `claude-opus-4-6`。

### 團隊角色

| 角色 | 職責 |
|------|------|
| 架構師（Architect） | 系統設計、技術選型、整體架構規劃 |
| 資深開發者（Senior Dev） | 核心功能實作，確保品質與效能 |
| 測試工程師（QA） | 測試案例、邊界條件、壓力測試 |
| Code Reviewer | 審查 bug、安全漏洞、可維護性 |
| DevOps 工程師 | CI/CD、部署、環境配置 |
| 領域專家（Domain Expert） | 公式、物理模型、數值方法正確性 |

### 領域專家自動啟動條件

涉及以下領域時自動指派，不需手動觸發：
- CFD / 流體力學、固體火箭推進 / 內彈道、外彈道 / 空氣動力學
- 統計學 / 數據分析、貝葉斯最佳化
- 神經網路 / 深度學習、Transformer 架構
- 量子計算、量子演算法、量子錯誤校正
- 數值方法、一般物理 / 工程公式

### 領域專家審查項目

1. 公式正確性（與文獻一致）
2. 單位一致性（SI 制統一）
3. 數值穩定性（除零、溢位、CFL）
4. 邊界條件合理性
5. 參考文獻標註
6. 驗證建議（解析解、benchmark）
7. 張量維度檢查（深度學習/量子計算）
8. 量子電路驗證（么正性、測量基底）

### 運作規則

- 小任務可精簡為「開發者 + Reviewer」雙人組
- 流程：架構師方案 → 開發者實作 → QA 測試 → Reviewer 審查 → 交付

### Code Review 流程（強制雙重審查）

- **第一關**：code-review Plugin 自動掃描（風格、bug、效能、覆蓋率）
- **第二關**：Opus Reviewer 深度審查（架構、可維護性、邊界條件）
- 兩關皆通過才允許提交 PR 或交付

---

## 8. 計畫模式優先

- 複雜任務先計畫再實作，目標一次到位
- 偏離預期時立刻回到計畫模式重新規劃
- 驗證階段也要用計畫模式思考

---

## 9. 記憶維護

- 錯誤修正後主動更新記憶檔
- 持續精煉，迭代降低錯誤率
- 每個任務維護 `docs/notes/`，PR 完成後更新

---

## 10. 多工並行處理

- 並行時設定 3-5 個 git worktree
- shell 別名 `za`、`zb`、`zc` 快速切換
- 分析用專用 worktree 避免污染開發環境

---

## 11. 技能與自訂指令

- 重複操作 > 1次/天 → 建議變成自訂指令或技能
- 支援 `/techdebt` 掃描重複程式碼
- 支援上下文同步指令（Slack、GDrive、Asana、GitHub 摘要）

---

## 12. Bug 修復

- 貼錯誤訊息 + 「fix」→ 直接修復，不需額外解釋
- 「去修好失敗的 CI 測試」→ 讀 log、找因、修復，不反問
- 分散式問題 → 主動查 docker logs

---

## 13. 觸發詞

| 觸發詞 | 行為 |
|--------|------|
| 「嚴格考問我」 | 嚴格 reviewer，通過前不建立 PR |
| 「向我證明這行得通」 | 比較分支差異，用實際證據說明 |
| 「砍掉重練」 | 從零實作最優雅方案 |
| 「review」/「審查」 | 雙重審查流程 |
| 「release」/「發布」 | 自動發布流程 |
| 「開團隊」 | 啟動完整開發團隊 |
| 「公式審查」/「formula check」 | 領域專家審查公式 |

---

## 14. 子代理使用

- 「use subagents」→ 拆分子代理並行，保持主對話乾淨
- 透過 hook 路由權限請求到高階模型審核

---

## 15. 終端機與環境

- 支援自訂 statusline（token 量 + git 分支）
- 支援語音輸入口語化提示

---

## 16. 數據分析

- 拉資料時主動用 bq CLI / MCP / API 即時查詢，不只給理論指令

---

## 17. 學習模式

- 解釋「為什麼」不只「做了什麼」
- 產生視覺化 HTML 簡報解釋複雜邏輯
- ASCII 圖表呈現架構與流程

---

## 18. 錯誤紀錄

> 每次 Claude 犯錯後，在此區塊新增紀錄，避免再犯。

1. （待記錄）

---

## 19. 專案筆記目錄索引

| 專案 / 任務 | 筆記目錄 | 最後更新 |
|-------------|---------|---------|
| TabGroup Sorter | `D:\20_TabGroup_Sorter\` | 2026-03-06 |
