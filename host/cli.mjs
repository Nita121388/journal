#!/usr/bin/env node
/**
 * cli.mjs — Journal CLI，供 agent 通过 skill 调用
 * 所有输出 JSON，错误格式 { ok:false, error:{code,message} }
 *
 * 用法：
 *   node cli.mjs today
 *   node cli.mjs read [day]
 *   node cli.mjs write <day> --content "..."
 *   node cli.mjs delete <day>
 *   node cli.mjs todo list [--filter active|all|done]
 *   node cli.mjs todo add <title> [--priority high|medium|low] [--due YYYY-MM-DD]
 *   node cli.mjs todo done <id>
 *   node cli.mjs todo delete <id> [--confirm]
 *   node cli.mjs heatmap
 *   node cli.mjs sync [status|push|pull|auto]
 */

const BASE = process.env.JOURNAL_HOST || 'http://127.0.0.1:8765';

/* ─── HTTP helpers ────────────────────────────────────── */

async function request(method, path, body = null) {
  const url = `${BASE}${path}`;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== null) opts.body = JSON.stringify(withProvenance(method, body));
  try {
    const res = await fetch(url, opts);
    const json = await res.json();
    return json;
  } catch (e) {
    if (e.cause?.code === 'ECONNREFUSED') {
      return { ok: false, error: { code: 'HOST_OFFLINE', message: `host 未运行，请先启动：node E:/projects/journal/host/server.js` } };
    }
    return { ok: false, error: { code: 'FETCH_ERROR', message: e.message } };
  }
}

function out(result) { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); }
function fail(msg, code = 'CLI_ERROR') { out({ ok: false, error: { code, message: msg } }); process.exit(1); }

/** 本地时区日期 key（不用 toISOString，避免 UTC+8 凌晨偏移一天） */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 探测调用方来源上下文（provenance）。
 * - 在 Pi 会话内运行时：PI_CODING_AGENT / PI_MODEL / PI_PROVIDER 等环境变量由宿主注入 → agent-assisted
 * - 否则视为人类在终端直接执行 → human
 * 可用 --origin / --agent / --model / --project 显式覆盖。
 */
function detectProvenance() {
  const ctx = {
    origin: 'human',
    project: process.cwd(),
  };
  if (process.env.PI_CODING_AGENT) {
    ctx.origin = 'agent-assisted';
    ctx.agent = 'pi';
    ctx.model = process.env.PI_MODEL ?? null;
  } else if (process.env.CLAUDECODE) {
    ctx.origin = 'agent-assisted';
    ctx.agent = 'claude';
    ctx.model = process.env.ANTHROPIC_MODEL ?? null;
  }
  // 显式覆盖
  if (flags.origin) ctx.origin = flags.origin;
  if (flags.agent) ctx.agent = flags.agent;
  if (flags.model) ctx.model = flags.model;
  if (flags.project) ctx.project = flags.project;
  return ctx;
}

/**
 * 为写请求注入 provenance 上下文（GET/DELETE 不带）。
 */
function withProvenance(method, body) {
  if (!body || method === 'GET' || method === 'DELETE') return body;
  if (body.provenance) return body; // 已显式指定
  return { ...body, provenance: detectProvenance() };
}

/* ─── 参数解析 ────────────────────────────────────────── */

function parseArgs(argv) {
  const args = [];
  const flags = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    } else {
      args.push(argv[i]);
    }
  }
  return { args, flags };
}

/* ─── 命令 ────────────────────────────────────────────── */

const [,, cmd, sub] = process.argv;
const { args, flags } = parseArgs(process.argv);

function requireHostOnline(result) {
  if (!result.ok && result.error?.code === 'HOST_OFFLINE') {
    fail(result.error.message, 'HOST_OFFLINE');
  }
}

async function cmdToday() {
  const day = todayKey();
  const [journalRes, todosRes] = await Promise.all([
    request('GET', `/api/journals/${day}`),
    request('GET', '/api/todos'),
  ]);
  requireHostOnline(journalRes);
  const todos = todosRes.ok ? todosRes.data.filter(t => !t.done) : [];
  out({
    ok: true,
    data: {
      day,
      journal: journalRes.ok ? journalRes.data : '',
      pendingTodos: todos.map(t => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        due: t.due,
      })),
      pendingCount: todos.length,
    },
  });
}

async function cmdRead() {
  // args = [read, <day>] → 位置参数从 args[1] 开始
  const day = args[1] || todayKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail('日期格式须为 YYYY-MM-DD');
  const res = await request('GET', `/api/journals/${day}`);
  requireHostOnline(res);
  out(res);
}

async function cmdWrite() {
  // args = [write, <day>] → 位置参数从 args[1] 开始
  const day = args[1];
  const content = flags.content;
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) fail('用法: write <day> --content "..."（day 格式 YYYY-MM-DD）');
  if (content === undefined) fail('--content 参数必填');
  const res = await request('PUT', `/api/journals/${day}`, { markdown: content });
  requireHostOnline(res);
  out(res);
}

async function cmdDelete() {
  // args = [delete, <day>] → 位置参数从 args[1] 开始
  const day = args[1];
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) fail('用法: delete <day>（day 格式 YYYY-MM-DD）');
  const res = await request('DELETE', `/api/journals/${day}`);
  requireHostOnline(res);
  out(res);
}

async function cmdTodoList() {
  const filter = flags.filter || 'all';
  const res = await request('GET', '/api/todos');
  requireHostOnline(res);
  if (!res.ok) return out(res);
  const todos = res.data.filter(t =>
    filter === 'active' ? !t.done : filter === 'done' ? t.done : true
  );
  out({ ok: true, data: { todos, total: res.data.length, shown: todos.length } });
}

async function cmdTodoAdd() {
  // args = [todo, add, <title>] → 位置参数从 args[2] 开始
  const title = args.slice(2).join(' ');
  if (!title) fail('用法: todo add <title> [--priority high|medium|low] [--due YYYY-MM-DD] [--time HH:MM]');
  const body = {
    title,
    priority: ['high', 'medium', 'low'].includes(flags.priority) ? flags.priority : 'medium',
    due: /^\d{4}-\d{2}-\d{2}$/.test(flags.due) ? flags.due : null,
  };
  // 时间刻度：界面时间线只有 :00/:30 刻度，不打 --time 的待办会落进「全天」组
  if (typeof flags.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(flags.time)) body.time = flags.time;
  const res = await request('POST', '/api/todos', body);
  requireHostOnline(res);
  out(res);
}

async function cmdTodoDone() {
  // args = [todo, done, <id>] → 位置参数从 args[2] 开始
  const id = args[2];
  if (!id) fail('用法: todo done <id>');
  const res = await request('PUT', `/api/todos/${id}`, { done: true });
  requireHostOnline(res);
  out(res);
}

async function cmdTodoDelete() {
  // args = [todo, delete, <id>] → 位置参数从 args[2] 开始
  const id = args[2];
  if (!id) fail('用法: todo delete <id>');
  if (!flags.confirm) fail('请加 --confirm 参数确认删除（防误操作）');
  const res = await request('DELETE', `/api/todos/${id}`);
  requireHostOnline(res);
  out(res);
}

async function cmdHeatmap() {
  const res = await request('GET', '/api/heatmap');
  requireHostOnline(res);
  out(res);
}

/** sync [status|push|pull|auto] — 触发或查看跨设备同步（由 host 执行） */
async function cmdSync() {
  // args = [sync, <sub>]
  const sub = args[1];
  if (sub === 'status') {
    const res = await request('GET', '/api/sync/status');
    requireHostOnline(res);
    return out(res);
  }
  const direction = ['push', 'pull', 'auto'].includes(sub) ? sub : 'auto';
  const res = await request('POST', '/api/sync/now', { direction });
  requireHostOnline(res);
  out(res);
}

/* ─── 分发 ────────────────────────────────────────────── */

const commands = {
  today:      cmdToday,
  read:       cmdRead,
  write:      cmdWrite,
  delete:     cmdDelete,
  heatmap:    cmdHeatmap,
  sync:       cmdSync,
  todo: {
    list:   cmdTodoList,
    add:    cmdTodoAdd,
    done:   cmdTodoDone,
    delete: cmdTodoDelete,
  },
};

try {
  if (!cmd) fail('用法: journal <command>，命令见 SKILL.md');

  if (cmd === 'todo' && sub && typeof commands.todo[sub] === 'function') {
    await commands.todo[sub]();
  } else if (typeof commands[cmd] === 'function') {
    await commands[cmd]();
  } else {
    fail(`未知命令: ${cmd}。可用命令: today, read, write, delete, todo, heatmap, sync`);
  }
} catch (e) {
  fail(e.message);
}
