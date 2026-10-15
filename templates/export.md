---
description: 只匯出本專案 Claude Code 對話紀錄到 .recap/（每月一檔），不產生摘要
argument-hint: [YYYY-MM] [YYYY-MM]
allowed-tools: Bash(node:*)
---
<!-- installed by @virtualorz/recap v{{VERSION}} — 重新執行 install 會覆寫此檔 -->
!`node "{{SCRIPT_PATH}}" $ARGUMENTS`

以上是匯出結果。請只用一兩句話告訴我產生了哪些檔案（或範圍內沒有紀錄、發生了什麼錯誤），不要讀取檔案內容，也不要做摘要。
