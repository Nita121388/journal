/**
 * storage.test.mjs — host 存储层单测（SQLite / JSON 回退 / 旧数据迁移）
 * 运行：node --test host/test/storage.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createStore, normalizeTags, verifyNoDataLoss } from '../lib/storage.js';

function tmp() { return mkdtempSync(join(tmpdir(), 'jstore-')); }

test('SQLite：卡片 CRUD + 墓碑', async () => {
  const dir = tmp();
  const s = await createStore({ file: join(dir, 'j.db') });
  try {
    assert.equal(s.kind, 'sqlite');
    const c = await s.createCard({ content: 'hello', type: 'task', time: '09:00', assignedDate: '2026-09-22' });
    assert.match(c.id, /^c_/);
    assert.equal(c.startTime, '09:00');
    assert.equal((await s.listCards()).length, 1);

    const u = await s.updateCard(c.id, { content: 'changed', done: true });
    assert.equal(u.content, 'changed');
    assert.equal(u.done, true);

    // 删除 = 墓碑：API 视图隐藏，同步视图保留
    assert.equal(await s.deleteCard(c.id), true);
    assert.equal((await s.listCards()).length, 0);
    const all = await s.listAllCards();
    assert.equal(all.length, 1);
    assert.equal(all[0].deleted, true);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('tags：规范化 + 旧库加列不丢历史数据', async () => {
  assert.deepEqual(normalizeTags([' 工作 ', '工作', '', 'Idea']), ['工作', 'idea']);
  const dir = tmp();
  const file = join(dir, 'old.db');
  const raw = new DatabaseSync(file);
  raw.exec(`CREATE TABLE cards (
    id TEXT PRIMARY KEY, content TEXT, type TEXT, done INTEGER, assignedDate TEXT,
    time TEXT, startTime TEXT, endTime TEXT, priority TEXT,
    createdAt TEXT, updatedAt TEXT, deleted INTEGER
  );
  INSERT INTO cards (id, content, type, done, priority, deleted, createdAt, updatedAt)
  VALUES ('c_old', '历史内容', 'text', 0, 'high', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');`);
  raw.close();

  const s = await createStore({ file });
  try {
    const card = await s.getCard('c_old');
    assert.equal(card.content, '历史内容');
    assert.equal(card.priority, 'high');
    assert.deepEqual(card.tags, []);
    const updated = await s.updateCard('c_old', { tags: [' 工作 ', '工作'] });
    assert.deepEqual(updated.tags, ['工作']);
    const again = await createStore({ file });
    assert.deepEqual((await again.getCard('c_old')).tags, ['工作']);
    await again.close();
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('verifyNoDataLoss：字段变化判失败', () => {
  const before = [{ id: 'a', content: 'x', type: 'text', done: false, assignedDate: null, time: null, startTime: null, endTime: null, priority: 'medium', createdAt: 't', updatedAt: 't', deleted: false }];
  const ok = verifyNoDataLoss(before, before.map(c => ({ ...c, tags: [] })));
  assert.equal(ok.ok, true);
  const bad = verifyNoDataLoss(before, before.map(c => ({ ...c, content: 'changed' })));
  assert.equal(bad.ok, false);
});

test('SQLite：journals 由 c_mj_ 卡片派生', async () => {
  const dir = tmp();
  const s = await createStore({ file: join(dir, 'j.db') });
  try {
    await s.setJournal('2026-09-01', 'day one');
    assert.equal((await s.getJournal('2026-09-01')).content, 'day one');
    assert.deepEqual(Object.keys(await s.getJournals()), ['2026-09-01']);
    await s.deleteJournal('2026-09-01');
    assert.equal(await s.getJournal('2026-09-01'), '');
    assert.deepEqual(Object.keys(await s.getJournals()), []);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('SQLite：settings 与 deviceId 持久化', async () => {
  const dir = tmp();
  const s = await createStore({ file: join(dir, 'j.db') });
  try {
    await s.setSettings({ sync: { provider: 'github' }, theme: 'dark' });
    const settings = await s.getSettings();
    assert.equal(settings.sync.provider, 'github');
    assert.equal(settings.theme, 'dark');

    const id1 = await s.getDeviceId();
    assert.match(id1, /^dev_/);
    assert.equal(await s.getDeviceId(), id1);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('迁移：legacy JSON 的 journals/todos/cards/settings 全部入库，且幂等', async () => {
  const dir = tmp();
  const jsonFile = join(dir, 'journal-data.json');
  writeFileSync(jsonFile, JSON.stringify({
    journals: { '2026-09-01': 'string journal', '2026-09-02': { content: 'obj journal', createdAt: 'c', updatedAt: 'u' } },
    todos: [{ id: 'abc', title: 'legacy todo', done: false, due: '2026-09-03', priority: 'high' }],
    cards: [{ id: 'c_x', content: 'existing', type: 'idea', assignedDate: '2026-09-04' }],
    settings: { theme: 'dark' },
  }), 'utf-8');

  const s = await createStore({ file: join(dir, 'j.db'), jsonFile });
  try {
    const ids = (await s.listAllCards()).map(c => c.id).sort();
    assert.ok(ids.includes('c_mj_2026-09-01'));
    assert.ok(ids.includes('c_mj_2026-09-02'));
    assert.ok(ids.includes('c_mt_abc'));
    assert.ok(ids.includes('c_x'));
    assert.equal((await s.getJournal('2026-09-01')).content, 'string journal');
    assert.equal((await s.getJournal('2026-09-02')).content, 'obj journal');
    assert.equal((await s.getSettings()).theme, 'dark');
    assert.ok(existsSync(jsonFile + '.migrated.bak'));

    // 幂等：再次迁移不新增
    const { migrateLegacy } = await import('../lib/storage.js');
    const again = await migrateLegacy(s, jsonFile);
    assert.equal(again.cards, 0);
    assert.equal((await s.listAllCards()).length, 4);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('JSON 回退：与 SQLite 相同接口与语义', async () => {
  const dir = tmp();
  const s = await createStore({ file: join(dir, 'j.db'), forceJson: true });
  try {
    assert.equal(s.kind, 'json');
    const c = await s.createCard({ content: 'json card', type: 'text' });
    await s.setJournal('2026-09-05', 'json journal');
    assert.equal((await s.getJournal('2026-09-05')).content, 'json journal');
    await s.deleteCard(c.id);
    assert.equal((await s.listCards()).find(x => x.id === c.id), undefined);
    assert.equal((await s.listAllCards()).length, 2);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('exportJson：包含 journals/todos/cards/settings', async () => {
  const dir = tmp();
  const s = await createStore({ file: join(dir, 'j.db') });
  try {
    await s.createCard({ content: 'a task', type: 'task', assignedDate: '2026-09-06' });
    await s.setJournal('2026-09-07', 'note');
    const exp = await s.exportJson();
    assert.equal(exp.cards.length, 2);
    assert.equal(exp.todos.length, 1);
    assert.equal(exp.todos[0].title, 'a task');
    assert.ok(exp.journals['2026-09-07']);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});
