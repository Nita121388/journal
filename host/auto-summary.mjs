#!/usr/bin/env node
/**
 * auto-summary.mjs — 从 agent 会话历史自动沉淀「今日日程」到 Journal 卡片
 *
 * 用途：定时（Windows 计划任务 / 手动）运行，扫描本机 agent 会话历史，
 *       提取当天真实任务，幂等写入 host（界面时间线可见）。
 *
 * 用法：
 *   node auto-summary.mjs                # 默认今天
 *   node auto-summary.mjs --day 2026-09-23
 *   node auto-summary.mjs --dry-run      # 只打印将写入内容，不写
 *   node auto-summary.mjs --agent codex  # 只扫指定 agent（codex/claude/pi）
 *
 * 输出 JSON：{ ok, added, skipped, items:[{...}] }
 *
 * 数据流：
 *   ~/.codex/sessions/ 下全部 *.jsonl  →  提取今日会话  →  用户真实任务文本
 *   →  POST /api/cards（content=任务标题, time=会话开始整/半点刻度,
 *       tags=['src:codex-<sessionId>']）  →  host 权威库 → 扩展时间线可见
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const BASE = process.env.JOURNAL_HOST || 'http://127.0.0.1:8765';

/* ─── 小工具 ─────────────────────────────────────────── */

function localDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 时间吸附到 :00/:30 刻度（界面时间线只显示这两个刻度） */
function snapToHalf(hh) {
  const [h, m] = hh.split(':').map(Number);
  const mins = h * 60 + m;
  const snapped = Math.round(mins / 30) * 30;
  const sh = Math.floor(snapped / 60) % 24;
  const sm = snapped % 60;
  return `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
}

/** 追加 30 分钟 */
function add30(hh) {
  const [h, m] = hh.split(':').map(Number);
  const mins = h * 60 + m + 30;
  return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

async function request(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== null) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  return res.json();
}

function out(result) { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); }

/* ─── Codex 会话历史解析 ─────────────────────────────── */

/** 递归收集所有 *.jsonl 会话文件 */
function findJsonlFiles(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    try {
      if (statSync(full).isDirectory()) findJsonlFiles(full, acc);
      else if (name.endsWith('.jsonl')) acc.push(full);
    } catch { /* ignore */ }
  }
  return acc;
}

/** 提取一条 jsonl 的 type + payload 字符串 */
function parseLine(line) {
  try {
    const d = JSON.parse(line);
    return d;
  } catch { return null; }
}

/** 从顶层对象取 id + timestamp（Codex 在 payload，Pi 在顶层） */
function extractSessionMeta(obj) {
  // Codex: { type:'session_meta', payload: "{'id':..,'timestamp':..}" } 或 payload 对象
  if (obj.type === 'session_meta' && obj.payload) {
    if (typeof obj.payload === 'string') {
      return {
        id: obj.payload.match(/'id': '([^']+)'/)?.[1] ?? null,
        timestamp: obj.payload.match(/'timestamp': '([^']+)'/)?.[1] ?? null,
        cwd: obj.payload.match(/'cwd': '([^']*)'/)?.[1] ?? null,
        model: obj.payload.match(/'model': '([^']*)'/)?.[1] ?? null,
      };
    }
    return {
      id: obj.payload.id ?? null,
      timestamp: obj.payload.timestamp ?? null,
      cwd: obj.payload.cwd ?? null,
      model: obj.payload.model ?? null,
    };
  }
  // Pi: { type:'session', id, timestamp, cwd }
  if (obj.type === 'session') {
    return { id: obj.id ?? null, timestamp: obj.timestamp ?? null, cwd: obj.cwd ?? null, model: null };
  }
  // Pi: { type:'model_change', modelId, provider }
  if (obj.type === 'model_change') {
    return { id: null, timestamp: null, cwd: null, model: obj.modelId ?? null };
  }
  return { id: null, timestamp: null, cwd: null, model: null };
}

/** 从消息行取 role + 文本。兼容：
 *  Codex: { type:'response_item', payload:{ role, content:[{type:'input_text',text}] } }
 *  Pi:    { type:'message', message:{ role, content:[{type:'text',text}] } }
 */
function extractMessage(obj) {
  let payload = null;
  if (obj.type === 'response_item' && obj.payload) payload = obj.payload;
  else if (obj.type === 'message' && obj.message) payload = obj.message;
  if (!payload || typeof payload !== 'object') return null;
  const role = payload.role ?? '';
  const content = payload.content;
  let text = '';
  if (Array.isArray(content)) {
    for (const c of content) {
      if (c && typeof c.text === 'string') text += c.text + '\n';
    }
  } else if (typeof content === 'string') {
    text = content;
  }
  return { role, text: text.trim() };
}

/** 系统注入噪音片段（这些不是用户真实任务） */
const NOISE_MARKERS = [
  '<permissions', '# AGENTS.md', '<environment_context', '# Agent Workspace',
  'system', '<system-reminder>', '# File: ', '注意：', "we'll continue",
  '<input', '请查看', '继续', '确认', '<turn_narration', 'tool_result',
  '<task', '<feedback', '<reject', '<approve', 'trellis', 'AGENTS.md',
  'subagent', 'delegate', 'workflow', 'pi-subagents', 'SKILL.md',
  'C:\\Users\\chemclin', 'C:\/Users', 'D:\\', 'D:\/Code', 'E:\\', 'E:\/projects',
];

/** 判断一段用户消息是不是噪音（系统注入/空/纯命令/路径/工具反馈） */
function isNoise(text) {
  if (!text || text.length < 4) return true;
  if (NOISE_MARKERS.some(m => text.includes(m))) return true;
  // 常见纯系统/空的 user 消息
  if (/^(好的|OK|继续|好的继续|嗯|可以|对|是的|ok\b|go\b|是的继续|好|确认)/i.test(text)) return true;
  // 纯路径（无上下文）：C:\... / D:/... / 根路径开头
  if (/^[A-Za-z]:[\\\/]/.test(text) && text.length < 90) return true;
  // 纯命令（一条很短，无上下文）
  if (/^[a-z0-9 _-]{1,30}$/i.test(text) && text.length < 20) return true;
  return false;
}

/** 从用户消息里挑出「像任务标题」的第一条：去掉过长/含多段换行的 */
function pickTaskTitle(messages) {
  for (const m of messages) {
    if (isNoise(m)) continue;
    const firstLine = m.split('\n')[0].trim();
    // 去掉路径前缀："D:/tmp 这些可以删除嘛" → "这些可以删除嘛"
    const cleaned = firstLine.replace(/^[A-Za-z]:[\\\/][^\s]{0,80}\s+/, '').trim();
    if (cleaned.length > 2 && cleaned.length < 200) return cleaned;
  }
  return null;
}

/** 从文件名提取 session id + 时间兜底（文件名时间是 UTC，Z 结尾）
 * Pi: /YYYY-MM-DDTHH-MM-SS-sssZ_<uuid>.jsonl
 * Codex: /rollout-YYYY-MM-DDTHH-MM-SS-..._<uuid>.jsonl
 */
function fileMeta(file) {
  let startTime = null;
  const m = file.match(/\/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  if (m) startTime = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
  const m2 = file.match(/rollout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  if (!startTime && m2) startTime = new Date(Date.UTC(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]), Number(m2[4]), Number(m2[5]), Number(m2[6])));
  // UUID: 36 位，跟在最后一个 - 后面
  const id = file.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/)?.[1] ?? null;
  return { startTime, id };
}

/** 解析单个会话文件 → { sessionId, startTime, taskTitle } | null */
function parseSessionFile(file, targetDay) {
  let fd;
  try { fd = readFileSync(file, 'utf-8'); } catch { return null; }
  const lines = fd.split('\n');
  let sessionId = null;
  let startTime = null; // Date
  let project = null; // 会话 cwd
  let model = null;
  const userMessages = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    const meta = extractSessionMeta(parsed);
    if (meta.id && !sessionId) sessionId = meta.id;
    if (meta.timestamp && !startTime) startTime = new Date(meta.timestamp);
    if (meta.cwd && !project) project = meta.cwd;
    // 取会话中最后一次 model_change（会话中途可能换模型）
    if (meta.model && !meta.timestamp) model = meta.model;
    if (meta.model && meta.timestamp && !model) model = meta.model;
    const msg = extractMessage(parsed);
    if (msg && msg.role === 'user' && msg.text) userMessages.push(msg.text);
  }

  if (!startTime) { const fm = fileMeta(file); startTime = fm.startTime; }
  if (!sessionId) { const fm = fileMeta(file); sessionId = fm.id; }
  if (!startTime) return null;
  if (localDayKey(startTime) !== targetDay) return null; // 只取目标日

  const taskTitle = pickTaskTitle(userMessages);
  if (!taskTitle) return null;

  return { sessionId, startTime, taskTitle, project, model };
}

/* ─── 幂等写入 ────────────────────────────────────────── */

/**
 * 已存在的 src tag → 该会话已沉淀过，跳过
 */
async function existsSourceTag(cards, tag) {
  return cards.some(c => Array.isArray(c.tags) && c.tags.includes(tag));
}

/* ─── 主流程 ──────────────────────────────────────────── */

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { flags[key] = next; i++; }
    else flags[key] = true;
  }
}

const targetDay = /^\d{4}-\d{2}-\d{2}$/.test(flags.day) ? flags.day : localDayKey(new Date());
const dryRun = Boolean(flags['dry-run']);
const agentFilter = flags.agent || 'pi';

async function main() {
  // 1) 先查 host 是否在线、拿已有卡片（去重用）
  let existingCards = [];
  const listRes = await request('GET', '/api/cards');
  if (!listRes.ok && listRes.error?.code === 'HOST_OFFLINE') {
    out({ ok: false, error: { code: 'HOST_OFFLINE', message: 'host 未运行，请先启动：node E:/projects/journal/host/server.js' } });
    return;
  }
  if (listRes.ok) existingCards = Array.isArray(listRes.data) ? listRes.data : [];

  // 2) 扫描会话历史
  const sessionDirs = {
    codex: join(homedir(), '.codex', 'sessions'),
    claude: join(homedir(), '.claude', 'projects'),
    pi: join(homedir(), '.pi', 'agent', 'sessions'),
  };
  const dir = sessionDirs[agentFilter];
  if (!dir) {
    out({ ok: false, error: { code: 'BAD_AGENT', message: `未知 agent: ${agentFilter}（支持 codex/claude/pi）` } });
    return;
  }
  const files = findJsonlFiles(dir);
  const candidates = [];
  for (const f of files) {
    const r = parseSessionFile(f, targetDay);
    if (r) candidates.push(r);
  }
  // 按开始时间排序（同一时刻多个会话，最早优先）
  candidates.sort((a, b) => a.startTime - b.startTime);

  // 3) 幂等写入
  const added = [];
  const skipped = [];
  for (const c of candidates) {
    const tag = `src:${agentFilter}-${c.sessionId}`;
    if (await existsSourceTag(existingCards, tag)) {
      skipped.push({ sessionId: c.sessionId, reason: '已存在来源 tag', taskTitle: c.taskTitle });
      continue;
    }
    const start = snapToHalf(hhmm(c.startTime));
    const card = {
      content: c.taskTitle,
      type: 'text',
      assignedDate: targetDay,
      time: start,
      startTime: start,
      endTime: add30(start),
      tags: [tag],
      // 来源：定时任务无人驱动；agent=来源会话所属 agent，model=会话模型，project=会话工作目录
      provenance: {
        origin: 'agent-auto',
        agent: agentFilter,
        model: c.model ?? null,
        project: c.project ?? null,
      },
    };
    if (dryRun) {
      added.push({ ...card, _dryRun: true });
      existingCards.push({ tags: [tag] }); // 模拟已写，避免同会话重复出现在 dryRun 列表
      continue;
    }
    const res = await request('POST', '/api/cards', card);
    if (res.ok) {
      added.push({ sessionId: c.sessionId, card });
      existingCards.push({ tags: [tag] });
    } else {
      skipped.push({ sessionId: c.sessionId, reason: `写入失败: ${res.error?.code} ${res.error?.message}`, taskTitle: c.taskTitle });
    }
  }

  out({
    ok: true,
    data: { day: targetDay, agent: agentFilter, dryRun, totalSessions: candidates.length, added, skipped },
  });
}

main().catch(e => out({ ok: false, error: { code: 'FATAL', message: e.message } }));
