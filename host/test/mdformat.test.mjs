/**
 * mdformat.test.mjs — Journal md 序列化/解析 单测（纯函数）
 * 运行：node --test host/test/mdformat.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeDay, serializeInbox, serializeAll, parseDay, parseInbox, parseAll, INBOX_FILE } from '../sync/mdformat.js';

const sample = () => ([
  {
    id: 'c_mj_2026-09-24',
    content: '## 日志段落\n一段散文，带 **markdown** 格式',
    type: 'text',
    assignedDate: '2026-09-24',
    time: null, startTime: null, endTime: null,
    priority: 'medium', tags: [], deleted: false,
    meta: { createdBy: { origin: 'agent-assisted', agent: 'pi', model: 'deepseek-v4-pro', project: 'E:/projects/journal' } },
  },
  {
    id: 'c_1790228243977_376d9889',
    content: '排查同步 404',
    type: 'text',
    assignedDate: '2026-09-24',
    time: '09:00', startTime: '09:00', endTime: '09:30',
    priority: 'medium', tags: ['journal'], deleted: false,
    meta: { createdBy: { origin: 'agent-assisted', agent: 'pi', model: 'deepseek-v4-pro', project: 'E:/projects/journal' } },
  },
  {
    id: 'c_456',
    content: '未完成的任务',
    type: 'task',
    assignedDate: '2026-09-24',
    time: null, startTime: null, endTime: null,
    done: false,
    priority: 'high', tags: ['todo'], deleted: false,
    meta: { createdBy: { origin: 'human' } },
  },
]);

test('序列化：含 frontmatter 与三区段', () => {
  const md = serializeDay('2026-09-24', sample(), { project: 'E:/projects/journal', device: 'PC-1' });
  assert.match(md, /^---\r?\ndate: 2026-09-24/);
  assert.match(md, /project: E:\/projects\/journal/);
  assert.match(md, /device: PC-1/);
  assert.match(md, /## 日志/);
  assert.match(md, /## 时间线/);
  assert.match(md, /### 09:00/);
  assert.match(md, /## 待办/);
  assert.match(md, /- \[ \] 未完成的任务/);
  // 内联属性带 id 与来源
  assert.match(md, /`id:: c_1790228243977_376d9889`/);
  assert.match(md, /`by:: pi`/);
  assert.match(md, /`model:: deepseek-v4-pro`/);
});

test('往返：id / 内容 / 时间 / tags 全部保留', () => {
  const cards = sample();
  const md = serializeDay('2026-09-24', cards, { project: 'E:/projects/journal' });
  const parsed = parseDay(md, '2026-09-24');
  const byId = new Map(parsed.map(c => [c.id, c]));

  // 三张卡都能按原 id 找回
  for (const c of cards) assert.ok(byId.has(c.id), `id ${c.id} 应保留`);

  // 内容
  const timeline = byId.get('c_1790228243977_376d9889');
  assert.equal(timeline.content, '排查同步 404');
  assert.equal(timeline.startTime, '09:00');
  assert.equal(timeline.endTime, '09:30');
  assert.deepEqual(timeline.tags, ['journal']);

  const todo = byId.get('c_456');
  assert.equal(todo.type, 'task');
  assert.equal(todo.done, false);
  assert.deepEqual(todo.tags, ['todo']);
});

test('往返幂等：serialize(parse(x)) == x（结构稳定）', () => {
  const cards = sample();
  const md1 = serializeDay('2026-09-24', cards, { project: 'E:/projects/journal', device: 'PC-1' });
  const parsed = parseDay(md1, '2026-09-24');
  const md2 = serializeDay('2026-09-24', parsed, { project: 'E:/projects/journal', device: 'PC-1' });
  // 关键区段（时间/标题/属性）保持一致
  const times1 = md1.match(/^### .*$/gm) || [];
  const times2 = md2.match(/^### .*$/gm) || [];
  assert.deepEqual(times2, times1, '时间线小标题应一致');
});

test('无 id 新条目：生成稳定 id（重复解析不重复建卡）', () => {
  const md = serializeDay('2026-09-24', []);
  // 模拟人在 md 里新增一条（无 id）
  const withNew = md + '\n### 16:00\n\n人在 Obsidian 新增\n\n`type:: text` `end:: 16:30`\n';
  const a = parseDay(withNew, '2026-09-24');
  const b = parseDay(withNew, '2026-09-24');
  assert.equal(a.length, 1, '新增条目应解析为 1 张卡');
  assert.ok(a[0].id, '应自动生成 id');
  assert.equal(a[0].id, b[0].id, '同一输入 → 同一 id（确定性，避免重复建卡）');
  assert.ok(a[0].id.startsWith('c_md_'), 'md 生成的 id 应有 c_md_ 前缀');
});

test('不同内容 → 不同 id（不误合并）', () => {
  const md1 = serializeDay('2026-09-24', []) + '\n### 16:00\n\n条目A\n';
  const md2 = serializeDay('2026-09-24', []) + '\n### 16:00\n\n条目B\n';
  const a = parseDay(md1, '2026-09-24');
  const b = parseDay(md2, '2026-09-24');
  assert.notEqual(a[0].id, b[0].id);
});

test('inbox 往返：卡片池（无日期）', () => {
  const cards = [
    { id: 'c_pool1', content: '未安排的想法', type: 'text', assignedDate: null, tags: ['idea'], priority: 'medium', deleted: false },
    { id: 'c_pool2', content: '卡片池待办', type: 'task', done: true, assignedDate: null, tags: [], priority: 'low', deleted: false },
  ];
  const md = serializeInbox(cards);
  const parsed = parseInbox(md);
  assert.equal(parsed.length, 2);
  const byId = new Map(parsed.map(c => [c.id, c]));
  assert.equal(byId.get('c_pool1').content, '未安排的想法');
  assert.equal(byId.get('c_pool1').assignedDate, null);
  assert.equal(byId.get('c_pool2').done, true);
});

test('serializeAll 按日期分组 + inbox', () => {
  const cards = [
    { id: 'c_a', content: 'a', assignedDate: '2026-09-23', type: 'text', priority: 'medium', deleted: false, tags: [] },
    { id: 'c_b', content: 'b', assignedDate: '2026-09-24', type: 'text', priority: 'medium', deleted: false, tags: [] },
    { id: 'c_c', content: 'c', assignedDate: null, type: 'text', priority: 'medium', deleted: false, tags: [] },
  ];
  const files = serializeAll(cards);
  const names = Object.keys(files).sort();
  assert.deepEqual(names, ['2026-09-23.md', '2026-09-24.md', INBOX_FILE]);
});

test('parseAll：忽略非日期命名的 .md（保护用户自己的笔记）', () => {
  const files = {
    '2026-09-24.md': { text: serializeDay('2026-09-24', sample()), mtimeIso: new Date().toISOString() },
    '我的读书笔记.md': { text: '# 这是用户自己的笔记\n\n一些内容', mtimeIso: new Date().toISOString() },
    'README.md': { text: '# readme', mtimeIso: new Date().toISOString() },
  };
  const cards = parseAll(files);
  // 只解析出 2026-09-24.md 的卡（3 张），用户笔记不被解析
  assert.equal(cards.length, 3);
  assert.ok(cards.every(c => c.assignedDate === '2026-09-24'));
});

test('meta 不在 md 中产生（md 不是 meta 权威源）', () => {
  const md = serializeDay('2026-09-24', sample());
  const parsed = parseDay(md, '2026-09-24');
  // 解析出的卡不应带完整 meta（merge 会用本地 meta 保护），只可带 frontmatter 的 project/device 作为 _fm
  for (const c of parsed) {
    assert.equal(c.meta, undefined, 'md 解析不应生成 meta');
  }
});
