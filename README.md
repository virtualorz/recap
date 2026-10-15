# @virtualorz/recap

> 把 Claude Code 的對話紀錄，整理成每個專案的開發回顧。
>
> Turn your Claude Code conversation history into monthly dev logs and AI-written recaps, per project.

用 Claude Code 寫了一個月的程式，回頭想寫月報、做回顧、交接給同事時，才發現對話散落在幾十個 session 裡，而且 Claude Code 預設只保留 30 天。

`recap` 一行指令完成設定，之後在任何專案輸入 `/recap:month`，就能把這段期間的對話整理成逐月紀錄，再由 Claude 讀完後寫出開發回顧。

```bash
npx @virtualorz/recap install
```

```
/recap:month 2026-08 2026-10
```

```
.recap/
├── 2026-08.md                    ← 8 月所有 session 的對話紀錄
├── 2026-09.md
├── 2026-10.md
└── summary-2026-08_2026-10.md    ← Claude 寫的開發回顧
```

---

## 目錄

- [安裝](#安裝)
- [使用方式](#使用方式)
- [輸出內容](#輸出內容)
- [CLI 指令](#cli-指令)
- [在 Docker 裡使用 Claude Code](#在-docker-裡使用-claude-code)
- [運作原理](#運作原理)
- [常見問題](#常見問題)
- [解除安裝](#解除安裝)

---

## 安裝

```bash
npx @virtualorz/recap install
```

安裝程式會做三件事：

| 項目 | 寫入位置 | 說明 |
|---|---|---|
| 延長紀錄保留天數 | `settings.json` → `cleanupPeriodDays` | Claude Code 預設只保留 30 天的對話紀錄，改為 365 天。修改前自動備份；原本設定已更長則不變更。 |
| 匯出腳本 | `<設定目錄>/recap/recap.js` | 讀取對話紀錄並輸出 Markdown |
| 全域 slash commands | `<設定目錄>/commands/recap/` | 安裝 `/recap:month` 與 `/recap:export`，所有專案都能使用 |

`<設定目錄>` 依序取：`--config-dir` 參數 → 環境變數 `CLAUDE_CONFIG_DIR` → `~/.claude`，與 Claude Code 本身的規則相同。

### 安裝選項

```bash
npx @virtualorz/recap install --days 730              # 保留 2 年
npx @virtualorz/recap install --config-dir ~/.claude2  # 指定設定目錄
```

### 更新

```bash
npx @virtualorz/recap@latest install
```

重新安裝會覆蓋腳本與指令，`settings.json` 已是足夠天數時不會再改動。

> ⚠️ **安裝前已被清除的紀錄無法找回。** 越早安裝，能回顧的範圍越完整。

---

## 使用方式

在**專案資料夾**啟動 `claude`，然後輸入：

### `/recap:month` — 匯出並產生回顧

```
/recap:month                     # 本月
/recap:month 2026-09             # 指定月份
/recap:month 2026-08 2026-10     # 區間
```

Claude 會：

1. 把範圍內每個月的對話紀錄匯出到 `.recap/YYYY-MM.md`
2. 逐月讀完所有紀錄
3. 寫出 `.recap/summary-<月份或區間>.md`，內容包含：
   - 完成的功能與主要修改
   - 修正的 bug 與原因
   - 重要的技術決策或架構討論
   - 尚未完成或待追蹤的事項
   - 整個區間的整體回顧
4. 在對話中簡短列出重點

### `/recap:export` — 只匯出紀錄

```
/recap:export 2026-10
```

只產生 `.recap/YYYY-MM.md`，不讀取、不做摘要。適合想自己翻閱，或之後丟給其他工具處理時使用。

### 收錄範圍

- 只收錄**在目前資料夾（含子資料夾）啟動的 session**。在 A 專案執行，就只會有 A 專案的紀錄。
- 在上層目錄（例如 `~/projects`）執行，會把底下所有專案的紀錄合併在一起。
- 同一個設定目錄下用 `/logout`、`/login` 切換的不同帳號，紀錄會一起收錄。

### 建議加入 `.gitignore`

```gitignore
.recap/
```

---

## 輸出內容

### 每月紀錄 `.recap/YYYY-MM.md`

```markdown
# my-project — 2026-10 Claude Code 對話紀錄

共 12 個 session、87 則提問

## Session 3f2a9c1e（10/01 09:12 – 10/01 11:40）

**🧑 我** `10/01 09:12`

幫我把登入流程改成用 refresh token……

**🤖 Claude** `10/01 09:13`

好的，我先看一下目前的 auth middleware……
```

- 每個月一份檔案，沒有紀錄的月份不產生。
- 依 session 分段，按時間排序。
- 跨月的 session（例如月底開始、隔月繼續）會依每則訊息的時間分到各自月份。
- 只收錄文字對話；工具呼叫（讀檔、執行指令、編輯檔案）的細節不列入。

### 開發回顧 `.recap/summary-*.md`

由 Claude 根據紀錄撰寫，格式依月份分段，最後附整體回顧。

---

## CLI 指令

不進入 Claude 也能使用：

```bash
npx @virtualorz/recap install     # 安裝 / 更新
npx @virtualorz/recap doctor      # 檢查狀態
npx @virtualorz/recap export 2026-10   # 在目前資料夾匯出紀錄（不做摘要）
npx @virtualorz/recap uninstall   # 解除安裝
```

### `doctor`

不確定紀錄存在哪裡、設定有沒有生效時使用：

```
@virtualorz/recap v0.1.0 檢查

  執行環境　linux（容器內）　Node v22.22.0
  設定目錄　/root/.claude（預設 ~/.claude）
  對話紀錄　/root/.claude/projects　8 個專案、143 個 session
  保留天數　365 天
  匯出腳本　v0.1.0
  指令　　　/recap:month ✔　/recap:export ✔
```

---

## 在 Docker 裡使用 Claude Code

請在**容器內**執行安裝，寫入的路徑才會是容器看得到的路徑：

```bash
docker exec -it <容器名稱> npx @virtualorz/recap install
```

若設定目錄有掛載到主機，例如：

```yaml
volumes:
  - ~/.claude-data:/root/.claude
```

那麼安裝結果、對話紀錄都存在主機的 `~/.claude-data`，重建容器也不會遺失。`.recap/` 會產生在專案資料夾內，透過專案的掛載在主機上也看得到。

---

## 運作原理

Claude Code 會把每個 session 存成 JSONL 檔：

```
<設定目錄>/projects/<專案路徑編碼>/<session-id>.jsonl
```

每一行是一筆紀錄，包含 `type`（user / assistant）、`timestamp`、`cwd`、`sessionId` 與訊息內容。`recap` 掃描所有 JSONL，依 `cwd` 篩選出目前專案、依時間分到各月份，再輸出成 Markdown。

`/recap:month` 是一般的 Claude Code slash command：先執行匯出腳本，再指示 Claude 讀取產生的檔案並撰寫回顧。指令檔就在 `<設定目錄>/commands/recap/month.md`，可以依團隊需求自行調整摘要的格式與重點（重新執行 `install` 會覆蓋回預設內容）。

所有處理都在本機完成，`recap` 本身不會把任何資料傳送到外部；摘要階段由你正在使用的 Claude Code session 讀取檔案，與平常使用 Claude Code 相同。

---

## 常見問題

**Q：為什麼某些月份是空的？**

Claude Code 預設會刪除 30 天前的紀錄。安裝 `recap` 之前已被刪除的紀錄無法找回。執行 `doctor` 可以確認目前的保留天數。

**Q：找不到對話紀錄目錄？**

如果你用 `CLAUDE_CONFIG_DIR` 指定了 Claude Code 的設定目錄，請確認執行時這個環境變數也有設定。也可以用 `RECAP_PROJECTS_DIR` 直接指定 `projects` 目錄。

**Q：時間是用哪個時區？**

目前固定以 UTC+8（台北時間）判斷月份與顯示時間，不受系統或容器時區影響。

**Q：支援 Windows 嗎？**

支援。路徑比對會自動處理 `\` 與大小寫差異。

**Q：紀錄很多，摘要會不會讀不完？**

`/recap:month` 會要求 Claude 分段讀完每個檔案。區間很長、紀錄很多時，建議改成一個月一個月執行，摘要品質會比較好。

---

## 解除安裝

```bash
npx @virtualorz/recap uninstall
```

會移除匯出腳本與 `/recap:*` 指令。以下不會變動：

- `settings.json` 的 `cleanupPeriodDays`（如需還原請手動修改）
- 各專案內已產生的 `.recap/` 資料夾

---

## 需求

- Node.js 18 以上（Claude Code 本身已需要 Node.js，通常不用另外安裝）
- Claude Code

## License

MIT © Alvin Chen
