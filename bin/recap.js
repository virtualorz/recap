#!/usr/bin/env node
// @virtualorz/recap — 把 Claude Code 對話紀錄整理成開發回顧
//   npx @virtualorz/recap install     安裝（改保留天數、裝 /recap:month、/recap:export）
//   npx @virtualorz/recap doctor      檢查紀錄位置與安裝狀態
//   npx @virtualorz/recap uninstall   移除
//   npx @virtualorz/recap export ...  直接在 terminal 匯出
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PKG = require('../package.json');
const ROOT = path.join(__dirname, '..');
const MARKER = '@virtualorz/recap';
const DEFAULT_DAYS = 365;
const CLAUDE_DEFAULT_CLEANUP = 30;
// 安裝到 <設定目錄>/commands/recap/<name>.md → Claude Code 中為 /recap:<name>
const COMMANDS = ['month', 'export'];

// ---------- 參數 ----------
const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'help';
const rest = cmd === 'help' ? argv : argv.slice(1);
function opt(name) {
  const i = rest.indexOf(name);
  if (i < 0) return undefined;
  const v = rest[i + 1];
  if (v === undefined || v.startsWith('--')) fail(`${name} 需要一個值`);
  return v;
}
const has = name => rest.includes(name);

// ---------- 小工具 ----------
const tty = process.stdout.isTTY;
const paint = code => s => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = { ok: paint(32), warn: paint(33), err: paint(31), dim: paint(2) };
function fail(msg) {
  console.error(c.err(`✖ ${msg}`));
  process.exit(1);
}
const expandHome = p => (p && p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);
const fwd = p => p.replace(/\\/g, '/'); // command 檔內用 / 分隔，Windows 的 Git Bash 也吃
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const isOurs = file => fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(MARKER);

// 設定目錄：--config-dir > CLAUDE_CONFIG_DIR > ~/.claude（與 Claude Code 相同規則）
function resolveConfigDir() {
  const fromOpt = opt('--config-dir');
  const dir = fromOpt || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return {
    dir: path.resolve(expandHome(dir)),
    source: fromOpt ? '--config-dir' : process.env.CLAUDE_CONFIG_DIR ? 'CLAUDE_CONFIG_DIR' : '預設 ~/.claude',
  };
}
function paths(cfg) {
  const commandDir = path.join(cfg, 'commands', 'recap');
  return {
    settings: path.join(cfg, 'settings.json'),
    projects: path.join(cfg, 'projects'),
    toolDir: path.join(cfg, 'recap'),
    script: path.join(cfg, 'recap', 'recap.js'),
    versionFile: path.join(cfg, 'recap', 'VERSION'),
    commandDir,
    command: name => path.join(commandDir, `${name}.md`),
  };
}
function readSettings(file) {
  if (!fs.existsSync(file)) return { exists: false, data: {} };
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return { exists: true, data: {} };
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('不是 JSON 物件');
    return { exists: true, data };
  } catch (e) {
    fail(`${file} 不是合法的 JSON（${e.message}），為避免弄壞設定，未做任何修改。請先修正後再執行。`);
  }
}
const inContainer = () => fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');

// ---------- install ----------
function install() {
  const { dir: cfg, source } = resolveConfigDir();
  const p = paths(cfg);
  const daysOpt = opt('--days');
  const days = daysOpt === undefined ? DEFAULT_DAYS : Number(daysOpt);
  if (!Number.isInteger(days) || days < 1) fail('--days 必須是正整數');

  console.log(`\n${MARKER} v${PKG.version} 安裝中`);
  console.log(c.dim(`Claude 設定目錄：${cfg}（${source}）\n`));

  if (!fs.existsSync(cfg)) {
    console.log(c.warn(`⚠ ${cfg} 不存在，這台機器（或容器）可能還沒執行過 claude。`));
    console.log(c.warn('  若 claude 跑在 Docker 裡，請在容器內執行安裝；或用 --config-dir 指定目錄。'));
    console.log(c.warn('  將建立此目錄並繼續。\n'));
  }

  // 1. 先驗證 settings.json，失敗就整個中止，不留半套
  const s = readSettings(p.settings);

  // 2. 匯出腳本
  fs.mkdirSync(p.toolDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'lib', 'recap.js'), p.script);
  fs.writeFileSync(p.versionFile, PKG.version + '\n');
  console.log(`${c.ok('✔')} 匯出腳本　${p.script}`);

  // 3. 全域 slash commands
  fs.mkdirSync(p.commandDir, { recursive: true });
  for (const name of COMMANDS) {
    const file = p.command(name);
    if (fs.existsSync(file) && !isOurs(file)) {
      const bak = `${file}.bak-${stamp()}`;
      fs.copyFileSync(file, bak);
      console.log(c.warn(`⚠ 已存在非本工具的 ${path.basename(file)}，已備份到 ${bak}`));
    }
    const tpl = fs.readFileSync(path.join(ROOT, 'templates', `${name}.md`), 'utf8');
    fs.writeFileSync(file, tpl.replace(/{{SCRIPT_PATH}}/g, fwd(p.script)).replace(/{{VERSION}}/g, PKG.version));
  }
  console.log(`${c.ok('✔')} 指令　　　${p.commandDir}`);
  console.log(c.dim(`             → /recap:month、/recap:export（所有專案皆可用）`));

  // 4. 紀錄保留天數
  const cur = s.data.cleanupPeriodDays;
  if (typeof cur === 'number' && cur >= days) {
    console.log(`${c.ok('✔')} 保留天數　已是 ${cur} 天，不變更`);
  } else {
    if (s.exists) {
      const bak = `${p.settings}.bak-${stamp()}`;
      fs.copyFileSync(p.settings, bak);
      console.log(c.dim(`  settings.json 已備份到 ${bak}`));
    }
    s.data.cleanupPeriodDays = days;
    fs.writeFileSync(p.settings, JSON.stringify(s.data, null, 2) + '\n');
    const before = cur === undefined ? `未設定（預設 ${CLAUDE_DEFAULT_CLEANUP} 天）` : `${cur} 天`;
    console.log(`${c.ok('✔')} 保留天數　${before} → ${days} 天`);
  }

  console.log(`
完成！在專案資料夾啟動 claude 後輸入：
  /recap:month                     本月：匯出 + 摘要
  /recap:month 2026-08 2026-10     區間：每月一份 log + 一份摘要
  /recap:export 2026-10            只匯出 log，不做摘要

輸出位置：專案內的 .recap/ 資料夾
${c.dim('建議在專案 .gitignore 加入：.recap/')}
${c.dim(`注意：安裝前已超過 ${CLAUDE_DEFAULT_CLEANUP} 天的舊紀錄可能已被 Claude Code 清除，無法找回。`)}
`);
}

// ---------- uninstall ----------
function uninstall() {
  const { dir: cfg } = resolveConfigDir();
  const p = paths(cfg);
  let removed = 0;
  if (fs.existsSync(p.toolDir)) {
    fs.rmSync(p.toolDir, { recursive: true, force: true });
    console.log(`${c.ok('✔')} 已移除 ${p.toolDir}`);
    removed++;
  }
  for (const name of COMMANDS) {
    const file = p.command(name);
    if (!fs.existsSync(file)) continue;
    if (isOurs(file)) {
      fs.rmSync(file);
      console.log(`${c.ok('✔')} 已移除 ${file}`);
      removed++;
    } else {
      console.log(c.warn(`⚠ ${file} 不是本工具安裝的，保留不動`));
    }
  }
  if (fs.existsSync(p.commandDir) && fs.readdirSync(p.commandDir).length === 0) fs.rmdirSync(p.commandDir);
  if (!removed) console.log('沒有找到已安裝的檔案。');
  console.log(c.dim('settings.json 的 cleanupPeriodDays 保留不動；如需還原請手動修改。'));
  console.log(c.dim('各專案內的 .recap/ 資料夾不會刪除。'));
}

// ---------- doctor ----------
function doctor() {
  const { dir: cfg, source } = resolveConfigDir();
  const p = paths(cfg);
  const line = (k, v) => console.log(`  ${k.padEnd(5, '　')}${v}`);
  console.log(`\n${MARKER} v${PKG.version} 檢查\n`);
  line('執行環境', `${process.platform}${inContainer() ? '（容器內）' : ''}　Node ${process.version}`);
  line('設定目錄', `${cfg}（${source}）${fs.existsSync(cfg) ? '' : c.err(' ✖ 不存在')}`);

  if (fs.existsSync(p.projects)) {
    let dirs = 0, files = 0;
    for (const d of fs.readdirSync(p.projects)) {
      const full = path.join(p.projects, d);
      if (!fs.statSync(full).isDirectory()) continue;
      dirs++;
      files += fs.readdirSync(full).filter(f => f.endsWith('.jsonl')).length;
    }
    line('對話紀錄', `${p.projects}　${dirs} 個專案、${files} 個 session`);
  } else {
    line('對話紀錄', c.err(`${p.projects} 不存在`));
  }

  let s = {};
  if (fs.existsSync(p.settings)) {
    try { s = JSON.parse(fs.readFileSync(p.settings, 'utf8') || '{}'); } catch { s = null; }
  }
  if (s === null) line('保留天數', c.err('settings.json 格式錯誤'));
  else if (s.cleanupPeriodDays === undefined) line('保留天數', c.warn(`未設定（預設 ${CLAUDE_DEFAULT_CLEANUP} 天），請執行 install`));
  else line('保留天數', `${s.cleanupPeriodDays} 天`);

  const v = fs.existsSync(p.versionFile) ? fs.readFileSync(p.versionFile, 'utf8').trim() : null;
  line('匯出腳本', v ? `v${v}${v !== PKG.version ? c.warn(`（最新 v${PKG.version}，可重新 install 更新）`) : ''}` : c.warn('未安裝'));
  line('指令', COMMANDS.map(n => (isOurs(p.command(n)) ? `/recap:${n} ✔` : c.warn(`/recap:${n} 未安裝`))).join('　'));
  console.log('');
}

// ---------- export ----------
function exportLogs() {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lib', 'recap.js'), ...rest], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

function help() {
  console.log(`
${MARKER} v${PKG.version} — 把 Claude Code 對話紀錄整理成開發回顧

用法：
  npx ${MARKER} install [--days N] [--config-dir DIR]
      保留天數改為 N（預設 ${DEFAULT_DAYS}）、安裝 /recap:month 與 /recap:export
  npx ${MARKER} doctor
      檢查紀錄位置、保留天數、安裝狀態
  npx ${MARKER} uninstall
      移除腳本與指令（不動 settings.json）
  npx ${MARKER} export [YYYY-MM] [YYYY-MM]
      不經過 Claude，直接把目前資料夾的紀錄匯出到 .recap/

設定目錄依序取：--config-dir、環境變數 CLAUDE_CONFIG_DIR、~/.claude
claude 跑在 Docker 裡時，請在容器內執行，例如：
  docker exec -it <容器> npx ${MARKER} install
`);
}

const commands = { install, uninstall, doctor, export: exportLogs, help };
if (has('-v') || has('--version')) { console.log(PKG.version); process.exit(0); }
if (!commands[cmd]) { console.error(c.err(`未知指令：${cmd}`)); help(); process.exit(1); }
commands[cmd]();
