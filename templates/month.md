---
description: 匯出本專案 Claude Code 對話紀錄（每月一檔）並產生開發回顧摘要
argument-hint: [YYYY-MM] [YYYY-MM]
allowed-tools: Bash(node:*), Read, Write
---
<!-- installed by @virtualorz/recap v{{VERSION}} — 重新執行 install 會覆寫此檔 -->
!`node "{{SCRIPT_PATH}}" $ARGUMENTS`

以上是匯出結果。請依序完成：

1. 依照輸出中 `LOG_FILES:` 列出的檔案，逐一用 Read 讀取。每個檔案都要讀完整，檔案長時用 offset 分段讀。若輸出顯示範圍內沒有任何紀錄或發生錯誤，告知我後就結束。
2. 每讀完一個月份，先整理該月重點，再讀下一個月份。
3. 全部讀完後，整理成一份摘要，依月份分段，每月包含：
   - 完成的功能與主要修改
   - 修正的 bug 與原因
   - 重要的技術決策或架構討論
   - 尚未完成或待追蹤的事項
   最後加一段「整體回顧」，總結整個區間的進展與仍待處理的事項。
4. 把摘要寫入輸出中 `SUMMARY_FILE:` 指定的路徑。
5. 最後在對話中簡短列出重點。
