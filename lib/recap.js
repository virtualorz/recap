#!/usr/bin/env node
// @virtualorz/recap：匯出 Claude Code 某資料夾的對話紀錄，每個月各存一個 md 檔
// 用法：node recap.js [起始月 YYYY-MM] [結束月 YYYY-MM] [專案路徑]
//   node recap.js                    → 本月
//   node recap.js 2026-09            → 單月
//   node recap.js 2026-08 2026-10    → 8、9、10 月各一個檔
//   預設路徑＝目前所在資料夾（含子資料夾）；參數順序不限，絕對路徑視為專案路徑
// 輸出：.recap/YYYY-MM.md（每月一份，該月沒有紀錄則不產生）
const fs = require('fs');
const path = require('path');
const os = require('os');

const pad = n => String(n).padStart(2, '0');
// 轉成台北時間（UTC+8），用 UTC getter 取值，不依賴容器時區設定
function local(iso) {
  const d = new Date(Date.parse(iso) + 8 * 3600e3);
  return {
    t: d.getTime(),
    ym: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`,
    md: `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`,
    hm: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}
// 列出 from～to 之間的所有月份
function monthRange(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${pad(m)}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

const args = process.argv.slice(2);
const months = args.filter(a => /^\d{4}-(0[1-9]|1[0-2])$/.test(a)).sort();
const pathArg = args.find(a => a.startsWith('/') || /^[A-Za-z]:[\\/]/.test(a));
const bad = args.filter(a => a !== pathArg && !months.includes(a));
if (bad.length) {
  console.error(`看不懂的參數：${bad.join(' ')}（月份格式為 YYYY-MM）`);
  process.exit(1);
}
const thisMonth = local(new Date().toISOString()).ym;
const from = months[0] || thisMonth;
const to = months[months.length - 1] || from;
const label = from === to ? from : `${from}_${to}`;
// 路徑統一成 / 分隔、去掉結尾斜線；Windows 不分大小寫
const norm = p => {
  const s = String(p).replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? s.toLowerCase() : s;
};
const cwdRaw = pathArg || process.cwd();
const cwd = norm(cwdRaw);
const projectName = String(cwdRaw).replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop();

// 對話紀錄位置：與 Claude Code 相同規則 → CLAUDE_CONFIG_DIR，否則 ~/.claude
// 另可用 RECAP_PROJECTS_DIR 直接指定 projects 目錄
const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const base = process.env.RECAP_PROJECTS_DIR || path.join(configDir, 'projects');
const OUT_DIR = '.recap';
if (!fs.existsSync(base)) {
  console.error(`找不到對話紀錄目錄：${base}`);
  console.error('若 Claude Code 使用自訂設定目錄，請設定 CLAUDE_CONFIG_DIR 或 RECAP_PROJECTS_DIR。');
  process.exit(1);
}

// byMonth: 月份 → (sessionId → 訊息陣列)
const byMonth = new Map(monthRange(from, to).map(m => [m, new Map()]));

for (const dir of fs.readdirSync(base)) {
  const full = path.join(base, dir);
  if (!fs.statSync(full).isDirectory()) continue;
  for (const file of fs.readdirSync(full)) {
    if (!file.endsWith('.jsonl')) continue;
    for (const line of fs.readFileSync(path.join(full, file), 'utf8').split('\n')) {
      let r;
      try { r = JSON.parse(line); } catch { continue; }
      if (!['user', 'assistant'].includes(r.type) || r.isMeta) continue;
      const rc = norm(r.cwd || '');
      if (rc !== cwd && !rc.startsWith(cwd + '/')) continue;
      if (!r.timestamp) continue;
      const ts = local(r.timestamp);
      const bucket = byMonth.get(ts.ym);
      if (!bucket) continue; // 不在範圍內

      let c = r.message && r.message.content;
      if (Array.isArray(c)) {
        // 只取文字，略過 tool_use / tool_result
        c = c.filter(b => b.type === 'text').map(b => b.text || '').join('\n');
      }
      if (typeof c !== 'string' || !c.trim()) continue;

      if (!bucket.has(r.sessionId)) bucket.set(r.sessionId, []);
      bucket.get(r.sessionId).push({ ts, role: r.type, text: c.trim() });
    }
  }
}

const written = [];
const empty = [];
for (const [ym, sessions] of byMonth) {
  if (sessions.size === 0) { empty.push(ym); continue; }

  // 跨月的 session 會依訊息時間拆到各自月份的檔案
  const sorted = [...sessions.entries()]
    .map(([sid, msgs]) => [sid, msgs.sort((a, b) => a.ts.t - b.ts.t)])
    .sort((a, b) => a[1][0].ts.t - b[1][0].ts.t);

  let nUser = 0;
  const body = [];
  for (const [sid, msgs] of sorted) {
    const first = msgs[0].ts, last = msgs[msgs.length - 1].ts;
    body.push(`\n## Session ${sid.slice(0, 8)}（${first.md} ${first.hm} – ${last.md} ${last.hm}）\n`);
    for (const m of msgs) {
      if (m.role === 'user') nUser++;
      body.push(`**${m.role === 'user' ? '🧑 我' : '🤖 Claude'}** \`${m.ts.md} ${m.ts.hm}\`\n\n${m.text}\n`);
    }
  }

  const out = [
    `# ${projectName} — ${ym} Claude Code 對話紀錄\n`,
    `共 ${sorted.length} 個 session、${nUser} 則提問\n`,
    ...body,
  ].join('\n');

  const fn = `${OUT_DIR}/${ym}.md`;
  fs.mkdirSync(path.join(process.cwd(), OUT_DIR), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), fn), out, 'utf8');
  written.push(fn);
  console.log(`已輸出 ${fn}：${sorted.length} 個 session、${nUser} 則提問`);
}

if (empty.length) console.log(`無紀錄的月份（未產生檔案）：${empty.join('、')}`);
if (written.length === 0) {
  console.log('範圍內沒有任何紀錄。');
} else {
  console.log(`\nLOG_FILES: ${written.join(' ')}`);
  console.log(`SUMMARY_FILE: ${OUT_DIR}/summary-${label}.md`);
}
