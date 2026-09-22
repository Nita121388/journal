/**
 * engine.test.mjs — 同步引擎端到端（两台「设备」+ 共享 backplane）
 * 运行：node --test host/test/engine.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../lib/storage.js';
import { MemoryBackplane } from '../sync/backplane.js';
import { runSync, syncStatus } from '../sync/engine.js';

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'jengine-'));
  const A = await createStore({ file: join(dir, 'a.db') });
  const B = await createStore({ file: join(dir, 'b.db') });
  const backplane = new MemoryBackplane();
  const cleanup = async () => { await A.close(); await B.close(); rmSync(dir, { recursive: true, force: true }); };
  return { A, B, backplane, cleanup };
}

test('首次同步：A push 后 B pull 能看到 A 的数据', async () => {
  const { A, B, backplane, cleanup } = await fixture();
  try {
    const c = await A.createCard({ content: 'A 的卡片', type: 'task', assignedDate: '2026-09-22' });
    await runSync({ store: A, backplane, direction: 'push' });
    const r = await runSync({ store: B, backplane, direction: 'pull' });
    assert.equal(r.pulled, true);
    const got = (await B.listCards()).find(x => x.id === c.id);
    assert.ok(got, 'B 应看到 A 的卡片');
    assert.equal(got.content, 'A 的卡片');
  } finally { await cleanup(); }
});

test('双向收敛：A 改 c1、B 改 c2 → 两端最终一致', async () => {
  const { A, B, backplane, cleanup } = await fixture();
  try {
    const c1 = await A.createCard({ content: 'c1 初始', type: 'text' });
    const c2 = await A.createCard({ content: 'c2 初始', type: 'text' });
    await runSync({ store: A, backplane, direction: 'push' });
    await runSync({ store: B, backplane, direction: 'pull' });

    await A.updateCard(c1.id, { content: 'A 改的 c1' });
    await B.updateCard(c2.id, { content: 'B 改的 c2' });

    await runSync({ store: A, backplane, direction: 'auto' });
    await runSync({ store: B, backplane, direction: 'auto' });
    // B 已把 c2 的改动推回，A 再拉一轮即两端收敛
    await runSync({ store: A, backplane, direction: 'auto' });

    const a1 = await A.getCard(c1.id), b1 = await B.getCard(c1.id);
    const a2 = await A.getCard(c2.id), b2 = await B.getCard(c2.id);
    assert.equal(a1.content, 'A 改的 c1');
    assert.equal(b1.content, 'A 改的 c1');
    assert.equal(a2.content, 'B 改的 c2');
    assert.equal(b2.content, 'B 改的 c2');
  } finally { await cleanup(); }
});

test('删除传播：A 删除后 B 同步也删除', async () => {
  const { A, B, backplane, cleanup } = await fixture();
  try {
    const c = await A.createCard({ content: 'will delete', type: 'text' });
    await runSync({ store: A, backplane, direction: 'auto' });
    await runSync({ store: B, backplane, direction: 'auto' });
    assert.ok(await B.getCard(c.id));

    await A.deleteCard(c.id);
    await runSync({ store: A, backplane, direction: 'auto' });
    await runSync({ store: B, backplane, direction: 'auto' });

    const bCard = await B.getCard(c.id);
    assert.equal(bCard.deleted, true, 'B 应收到墓碑');
    assert.equal((await B.listCards()).find(x => x.id === c.id), undefined, 'B 的可见列表应隐藏它');
  } finally { await cleanup(); }
});

test('幂等：连续同步第二次无变更', async () => {
  const { A, backplane, cleanup } = await fixture();
  try {
    await A.createCard({ content: 'x', type: 'text' });
    await runSync({ store: A, backplane, direction: 'auto' });
    const second = await runSync({ store: A, backplane, direction: 'auto' });
    assert.equal(second.merged.added, 0);
    assert.equal(second.merged.updated, 0);
    assert.equal(second.merged.deleted, 0);
  } finally { await cleanup(); }
});

test('pull 方向不应写回远端', async () => {
  const { A, B, backplane, cleanup } = await fixture();
  try {
    await A.createCard({ content: 'only A', type: 'text' });
    await runSync({ store: A, backplane, direction: 'push' });
    const before = await backplane.pull();
    const r = await runSync({ store: B, backplane, direction: 'pull' });
    assert.equal(r.pushed, false);
    assert.equal((await backplane.pull()).generatedAt, before.generatedAt, '远端快照不应被 pull 改写');
  } finally { await cleanup(); }
});

test('syncStatus 反映 provider 与设备 id', async () => {
  const { A, cleanup } = await fixture();
  try {
    await A.setSettings({ sync: { provider: 'github' } });
    const st = await syncStatus(A);
    assert.equal(st.provider, 'github');
    assert.equal(st.enabled, true);
    assert.match(st.deviceId, /^dev_/);
  } finally { await cleanup(); }
});

test('backplane 抛错时 runSync 向上传递错误', async () => {
  const { A, cleanup } = await fixture();
  try {
    const boom = { name: 'boom', async pull() { throw new Error('offline'); }, async push() { throw new Error('offline'); } };
    await assert.rejects(() => runSync({ store: A, backplane: boom, direction: 'auto' }), /offline/);
  } finally { await cleanup(); }
});
