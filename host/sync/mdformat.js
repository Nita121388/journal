/**
 * mdformat.js — Journal 卡片 ↔ Obsidian Markdown 的纯函数转换（无 IO）
 *
 * 定位：SQLite 是权威源；Markdown 是**给人看/人改**的投影（可编辑、可回流）。
 *
 * 文件格式（一天一个文件，`journal/<YYYY-MM-DD>.md`）：
 *  - 文件级：YAML frontmatter 承载「这一天」的属性（date/type/project/device/tags）
 *  - 块级：正文后跟内联属性 `` `key:: value` ``（反引号包裹=阅读模式干净，双冒号=Dataview/Obsidian 可识别）
 *
 * 三个分区，互不污染：
 *  - `## 日志`   : journal 散文卡（id 前缀 c_mj_），整段文本
 *  - `## 时间线` : 有时间的卡片，`### HH:MM` 小标题 + 正文
 *  - `## 待办`   : 无时间卡片，`- [ ]` / `- [x]` 勾选框
 *
 * 无日期卡片（卡片池）→ `journal/inbox.md`
 */

export const MD_SCHEMA = 'journal-md/1';
export const INBOX_FILE = 'inbox.md';

/** journal 散文卡前缀（与 lib/storage.js 的 JOURNAL_PREFIX 一致） */
const JOURNAL_PREFIX = 'c_mj_';

/* ─── 小工具 ─────────────────────────────────────────── */

/** 内联属性值转义：去掉反引号/换行，避免破坏行结构 */
function propVal(v) {
  if (v === null || v === undefined || v === '') return null;
  return String(v).replace(/[`\r\n]/g, ' ').trim() || null;
}

/**
 * 为 md 里新建的、无 id 的条目生成**稳定** id。
 *
 * 关键：必须确定性（同内容同 id），否则每次 pull 都当新卡重复创建。
 * 用「日期 + 时间 + 内容」算 32 位哈希，冲突概率极低且可复现。
 * @param {string} seed 唯一性种子（如 assignedDate + startTime）
 */
function genId(seed = '') {
  const s = 'md|' + seed;
  // FNV-1a 32 位哈希（确定性、无依赖）
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'c_md_' + h.toString(36) + '_' + s.length.toString(36);
}

/** 生成内联属性串：`` `k:: v` `` 空格分隔 */
function inlineProps(obj) {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    const val = propVal(v);
    if (val) parts.push('`' + k + ':: ' + val + '`');
  }
  return parts.join(' ');
}

/** 解析一行末尾的内联属性 `` `k:: v` `` → {k: v} */
function parseInlineProps(line) {
  const out = {};
  const re = /`([A-Za-z_][\w-]*)\s*::\s*([^`]*)`/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/** 去掉行尾内联属性，只留正文 */
function stripInlineProps(line) {
  return line.replace(/`([A-Za-z_][\w-]*)\s*::\s*[^`]*`/g, '').trim();
}

/** ISO → YYYY-MM-DD（本地时区） */
function isoToDay(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD → 周三 */
function weekdayOf(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(y, m - 1, d).getDay()];
}

/** 卡片 → 归属分区 */
function bucketOf(card) {
  if (!card.assignedDate) return 'inbox';
  if (String(card.id ?? '').startsWith(JOURNAL_PREFIX)) return 'journal';
  if (card.startTime || card.time) return 'timeline';
  if (card.type === 'task') return 'todo';
  return 'timeline'; // 有日期但无时间的普通卡片，放时间线末尾
}

/* ─── 序列化（cards → markdown） ─────────────────────── */

/**
 * 生成一天的 markdown 文件内容。
 * @param {string} dayKey YYYY-MM-DD
 * @param {object[]} cards 属于这一天的卡片
 * @param {{project?:string, device?:string}} [opts]
 */
export function serializeDay(dayKey, cards = [], opts = {}) {
  cards = (cards || []).filter(c => !c.deleted); // 防御：墓碑不导出
  const fm = [
    '---',
    `date: ${dayKey}`,
    `weekday: ${weekdayOf(dayKey)}`,
    'type: journal-day',
    `schema: ${MD_SCHEMA}`,
  ];
  const proj = propVal(opts.project);
  if (proj) fm.push(`project: ${proj}`);
  const dev = propVal(opts.device);
  if (dev) fm.push(`device: ${dev}`);
  fm.push('tags: [journal]', '---', '');

  const out = [...fm, `# ${dayKey} ${weekdayOf(dayKey)}`, ''];

  const buckets = { journal: [], timeline: [], todo: [] };
  for (const c of cards) {
    const b = bucketOf(c);
    if (b === 'inbox') continue;
    buckets[b].push(c);
  }

  // ── 日志（散文）──
  if (buckets.journal.length) {
    out.push('## 日志', '');
    for (const c of buckets.journal) {
      out.push(c.content ?? '');
      out.push('');
      const p = inlineProps({
        id: c.id,
        type: c.type,
        by: c.meta?.createdBy?.agent ?? c.meta?.createdBy?.origin,
        model: c.meta?.createdBy?.model,
        project: c.meta?.createdBy?.project,
      });
      if (p) out.push(p, '');
    }
  }

  // ── 时间线 ──
  if (buckets.timeline.length) {
    out.push('## 时间线', '');
    const sorted = [...buckets.timeline].sort((a, b) =>
      String(a.startTime ?? a.time ?? '').localeCompare(String(b.startTime ?? b.time ?? '')));
    for (const c of sorted) {
      const t = c.startTime ?? c.time ?? '全天';
      out.push(`### ${t}`, '');
      out.push(c.content ?? '');
      out.push('');
      const p = inlineProps({
        id: c.id,
        type: c.type,
        end: c.endTime,
        tags: (c.tags ?? []).join(','),
        by: c.meta?.createdBy?.agent ?? c.meta?.createdBy?.origin,
        model: c.meta?.createdBy?.model,
        project: c.meta?.createdBy?.project,
      });
      if (p) out.push(p, '');
    }
  }

  // ── 待办 ──
  if (buckets.todo.length) {
    out.push('## 待办', '');
    for (const c of buckets.todo) {
      const mark = c.done ? '[x]' : '[ ]';
      out.push(`- ${mark} ${(c.content ?? '').replace(/\n/g, ' ')}`);
      const p = inlineProps({
        id: c.id,
        type: c.type,
        tags: (c.tags ?? []).join(','),
        by: c.meta?.createdBy?.agent ?? c.meta?.createdBy?.origin,
      });
      if (p) out.push('  ' + p);
    }
    out.push('');
  }

  return out.join('\n');
}

/** 卡片池（无日期）→ inbox.md */
export function serializeInbox(cards = []) {
  cards = (cards || []).filter(c => !c.deleted);
  const out = [
    '---',
    'type: journal-inbox',
    `schema: ${MD_SCHEMA}`,
    'tags: [journal, inbox]',
    '---',
    '',
    '# 卡片池（未安排）',
    '',
    '> 在这里新建的条目会回到 Journal 卡片池；分配到某天后请移到对应日期文件。',
    '',
  ];
  for (const c of cards) {
    const p = inlineProps({ id: c.id, type: c.type, tags: (c.tags ?? []).join(',') });
    if (c.type === 'task') {
      out.push(`- ${c.done ? '[x]' : '[ ]'} ${(c.content ?? '').replace(/\n/g, ' ')}`);
    } else {
      out.push(`- ${(c.content ?? '').replace(/\n/g, ' ')}`);
    }
    if (p) out.push('  ' + p);
  }
  out.push('');
  return out.join('\n');
}

/**
 * 全量卡片 → 文件映射 { '2026-09-24.md': '...', 'inbox.md': '...' }
 * @param {object[]} cards
 * @param {{project?:string, device?:string}} [opts]
 */
export function serializeAll(cards = [], opts = {}) {
  const byDay = new Map();
  const inbox = [];
  for (const c of cards) {
    if (c.deleted) continue; // 已删除（墓碑）不导出 —— 人删的不留在 Obsidian
    if (!c.assignedDate) { inbox.push(c); continue; }
    if (!byDay.has(c.assignedDate)) byDay.set(c.assignedDate, []);
    byDay.get(c.assignedDate).push(c);
  }
  const files = {};
  for (const [day, list] of byDay) files[`${day}.md`] = serializeDay(day, list, opts);
  if (inbox.length) files[INBOX_FILE] = serializeInbox(inbox);
  return files;
}

/* ─── 解析（markdown → cards） ───────────────────────── */

/** 解析 YAML frontmatter（只支持简单 k: v 与 tags: [a, b]） */
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, '');
    }
    out[kv[1]] = v;
  }
  return out;
}

/**
 * 解析一个日期文件 → cards[]（尽量保留原 id/updatedAt，供 LWW 合并）
 * @param {string} text 文件内容
 * @param {string} dayKey YYYY-MM-DD（文件名推断）
 * @param {string} [mtimeIso] 文件修改时间（用于「人改过」判定）
 */
export function parseDay(text, dayKey, mtimeIso = null) {
  const cards = [];
  const fm = parseFrontmatter(text);
  const body = text.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/, '');

  const lines = body.split(/\r?\n/);
  let section = null;      // 'journal' | 'timeline' | 'todo'
  let current = null;      // 当前收集中的卡片

  const flush = () => {
    if (current && (current.content || current.id)) {
      const rawId = (current.id ?? '').trim();
      // 无 id → 用「日期+时间+内容」生成稳定 id（重复 pull 不会重复建卡）
      const seed = `${dayKey}|${current.time ?? ''}|${(current.content ?? '').trim()}`;
      const c = {
        id: rawId || genId(seed),
        content: (current.content ?? '').trim(),
        type: current.type ?? 'text',
        done: current.done ?? false,
        assignedDate: dayKey,
        time: current.time ?? null,
        startTime: current.time ?? null,
        endTime: current.end ?? null,
        priority: current.priority ?? 'medium',
        tags: current.tags ?? [],
        updatedAt: current.at ?? mtimeIso ?? null,
        deleted: false,
      };
      cards.push(c);
    }
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // 分区标题
    if (/^##\s+/.test(line)) {
      flush();
      const h = line.replace(/^##\s+/, '').trim();
      if (h.includes('日志')) section = 'journal';
      else if (h.includes('时间线')) section = 'timeline';
      else if (h.includes('待办')) section = 'todo';
      else section = null;
      continue;
    }
    if (/^#\s+/.test(line)) { flush(); continue; } // 一级标题（日期）跳过

    // 时间线小标题 ### HH:MM（不要求一定有 `## 时间线` 头，人手写也能识别）
    if (/^###\s+\d{1,2}:\d{2}/.test(line)) {
      flush();
      const t = line.replace(/^###\s+/, '').trim().split(/\s+/)[0];
      current = { time: /^\d{1,2}:\d{2}$/.test(t) ? t : null, content: '' };
      section = section ?? 'timeline';
      continue;
    }

    // 缩进的续属性行（上一条卡片/待办的属性，归属该卡）：  `id:: xxx` `tags:: ...`
    if (current && /^\s+`[A-Za-z_][\w-]*\s*::/.test(raw)) {
      const props = parseInlineProps(raw);
      if (props.id && !current.id) current.id = props.id.trim();
      if (props.type && !current.type) current.type = props.type;
      if (props.tags) current.tags = props.tags.split(',').map(s => s.trim()).filter(Boolean);
      if (props.end && !current.end) current.end = props.end;
      if (props.at && !current.at) current.at = props.at;
      continue;
    }

    // 待办勾选行
    if (/^\s*-\s+\[[ xX]\]/.test(line)) {
      flush();
      const props = parseInlineProps(line);
      const txt = stripInlineProps(line.replace(/^\s*-\s+\[[ xX]\]\s*/, ''));
      current = {
        id: (props.id ?? '').trim() || null, // 可能在下一行缩进续行
        content: txt,
        type: props.type ?? 'task',
        done: /^\s*-\s+\[[xX]\]/.test(line),
        tags: props.tags ? props.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
        at: props.at ?? null,
      };
      continue;
    }

    // 日志区：先收集正文，紧跟其后的属性行归属该卡
    if (section === 'journal') {
      const props = parseInlineProps(line);
      if (props.id && current) {
        Object.assign(current, {
          id: props.id,
          type: props.type ?? 'text',
          at: props.at ?? null,
        });
        continue;
      }
      if (!line.trim()) { if (current?.content) continue; continue; }
      if (/^`/.test(line.trim())) continue; // 纯属性行（无 id）跳过
      if (!current) current = { content: '' };
      current.content += (current.content ? '\n' : '') + line;
      continue;
    }

    // 时间线正文/属性
    if (section === 'timeline' && current) {
      const props = parseInlineProps(line);
      if (props.id || props.end) {
        Object.assign(current, {
          id: current.id ?? props.id,
          end: props.end ?? current.end,
          tags: props.tags ? props.tags.split(',').map(s => s.trim()).filter(Boolean) : (current.tags ?? []),
          at: props.at ?? current.at,
        });
        continue;
      }
      if (line.trim() && !/^`/.test(line.trim())) {
        current.content += (current.content ? '\n' : '') + line;
      }
      continue;
    }

    // inbox / 普通列表行
    if (/^\s*-\s+/.test(line) && !/^\s*-\s+\[/.test(line)) {
      flush();
      const props = parseInlineProps(line);
      const txt = stripInlineProps(line.replace(/^\s*-\s+/, ''));
      const seed = `inbox|${txt}`;
      current = {
        id: (props.id ?? '').trim() || genId(seed),
        content: txt,
        type: props.type ?? 'text',
        assignedDate: null,
        tags: props.tags ? props.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
        at: props.at ?? null,
      };
    }
  }
  flush();

  // frontmatter 里的 project/device 作为「人没改过时的兜底」注入（不覆盖卡片已有 meta）
  return cards.map(c => ({ ...c, _fm: { project: fm.project ?? null, device: fm.device ?? null } }));
}

/** 解析 inbox.md（无日期卡片） */
export function parseInbox(text, mtimeIso = null) {
  const cards = [];
  const body = text.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/, '');
  const lines = body.split(/\r?\n/);
  let current = null; // 当前收集中的卡片

  const flush = () => {
    if (current && (current.content || current.id)) {
      const rid = (current.id ?? '').trim() || genId('inbox|' + current.content.trim()); // 无 id = 人新建，稳定指纹
      cards.push({
        id: rid,
        content: current.content.trim(),
        type: current.type ?? 'text',
        done: current.done ?? false,
        assignedDate: null,
        tags: current.tags ?? [],
        updatedAt: current.at ?? mtimeIso ?? null,
        deleted: false,
      });
    }
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    // 缩进续属性行：归属上一条卡
    if (current && /^\s+`[A-Za-z_][\w-]*\s*::/.test(raw)) {
      const props = parseInlineProps(raw);
      if (props.id && !current.id) current.id = props.id.trim();
      if (props.type && !current.type) current.type = props.type;
      if (props.tags) current.tags = props.tags.split(',').map(s => s.trim()).filter(Boolean);
      if (props.at && !current.at) current.at = props.at;
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      flush();
      const props = parseInlineProps(line);
      const txt = stripInlineProps(line.replace(/^\s*-\s+\[[ xX]\]\s*/, '').replace(/^\s*-\s+/, ''));
      current = {
        id: (props.id ?? '').trim() || null,
        content: txt,
        type: props.type ?? (/^\s*-\s+\[[ xX]\]/.test(line) ? 'task' : 'text'),
        done: /^\s*-\s+\[[xX]\]/.test(line),
        tags: props.tags ? props.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
        at: props.at ?? null,
      };
      continue;
    }
    // 其他行（说明文字等）忽略
  }
  flush();
  return cards;
}

/** 扫描目录里所有 journal md 文件 → cards[]（含 inbox） */
export function parseAll(files /* { filename: {text, mtimeIso} } */) {
  const cards = [];
  for (const [name, { text, mtimeIso }] of Object.entries(files)) {
    if (!name.endsWith('.md')) continue;
    if (name === INBOX_FILE) {
      cards.push(...parseInbox(text, mtimeIso));
      continue;
    }
    const day = name.replace(/\.md$/, '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue; // 非日期文件忽略（用户自己的笔记）
    cards.push(...parseDay(text, day, mtimeIso));
  }
  return cards;
}
