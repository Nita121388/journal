/**
 * merge.test.mjs — 合并引擎单测（纯函数，表驱动）
 * 运行：node --test host/test/merge.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCardSets, pickWinner, cardsEqual, normalizeCard } from '../sync/merge.js';

const card = (over) => normalizeCard({ id: 'c1', content: 'x', ...over });

test('远端新增：仅远端存在的卡片被并入（added）', () => {
  const { cards, stats } = mergeCardSets([], [card({ id: 'c_r', content: 'remote' })]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].content, 'remote');
  assert.equal(stats.added, 1);
});

test('本地新增：仅本地存在的卡片保留（kept）', () => {
  const { cards, stats } = mergeCardSets([card({ id: 'c_l', content: 'local' })], []);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].content, 'local');
  assert.equal(stats.kept, 1);
});

test('LWW：远端 updatedAt 更新 → 远端胜出', () => {
  const local = card({ id: 'c1', content: 'old', updatedAt: '2026-01-01T00:00:00.000Z' });
  const remote = card({ id: 'c1', content: 'new', updatedAt: '2026-02-01T00:00:00.000Z' });
  const { cards, stats, conflicts } = mergeCardSets([local], [remote]);
  assert.equal(cards[0].content, 'new');
  assert.equal(stats.updated, 1);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].winner, 'remote');
});

test('LWW：本地 updatedAt 更新 → 本地胜出', () => {
  const local = card({ id: 'c1', content: 'mine', updatedAt: '2026-03-01T00:00:00.000Z' });
  const remote = card({ id: 'c1', content: 'theirs', updatedAt: '2026-02-01T00:00:00.000Z' });
  const { cards, stats } = mergeCardSets([local], [remote]);
  assert.equal(cards[0].content, 'mine');
  assert.equal(stats.kept, 1);
});

test('墓碑传播：远端删除（更新时间更新）生效', () => {
  const local = card({ id: 'c1', content: 'alive', updatedAt: '2026-01-01T00:00:00.000Z' });
  const remote = card({ id: 'c1', content: 'alive', updatedAt: '2026-02-01T00:00:00.000Z', deleted: true });
  const { cards, stats } = mergeCardSets([local], [remote]);
  assert.equal(cards[0].deleted, true);
  assert.equal(stats.deleted, 1);
});

test('墓碑不复活：本地在远端删除后继续编辑（更新）→ 本地保留', () => {
  const local = card({ id: 'c1', content: 'edited later', updatedAt: '2026-05-01T00:00:00.000Z' });
  const remote = card({ id: 'c1', content: 'alive', updatedAt: '2026-02-01T00:00:00.000Z', deleted: true });
  const { cards } = mergeCardSets([local], [remote]);
  assert.equal(cards[0].deleted, false);
  assert.equal(cards[0].content, 'edited later');
});

test('同刻墓碑优先（防止复活）', () => {
  const ts = '2026-04-04T00:00:00.000Z';
  const local = card({ id: 'c1', content: 'a', updatedAt: ts });
  const remote = card({ id: 'c1', content: 'a', updatedAt: ts, deleted: true });
  assert.equal(pickWinner(local, remote).deleted, true);
  assert.equal(pickWinner(remote, local).deleted, true);
});

test('幂等：对已合并结果再合并，结果不变', () => {
  const local = [card({ id: 'c1', content: 'mine', updatedAt: '2026-03-01T00:00:00.000Z' })];
  const remote = [card({ id: 'c2', content: 'theirs', updatedAt: '2026-02-01T00:00:00.000Z' })];
  const first = mergeCardSets(local, remote);
  const second = mergeCardSets(first.cards, first.cards);
  assert.deepEqual(second.cards, first.cards);
  assert.equal(second.stats.added, 0);
  assert.equal(second.stats.updated, 0);
});

test('无冲突：同一条卡片两端完全一致不计冲突', () => {
  const c = card({ id: 'c1', updatedAt: '2026-01-01T00:00:00.000Z' });
  const { conflicts, stats } = mergeCardSets([c], [{ ...c }]);
  assert.equal(conflicts.length, 0);
  assert.equal(stats.kept, 1);
});

test('cardsEqual 忽略无关字段顺序/默认值', () => {
  assert.ok(cardsEqual({ id: 'c1', content: 'a', updatedAt: 't' }, { id: 'c1', content: 'a', type: 'text', updatedAt: 't' }));
  assert.ok(!cardsEqual({ id: 'c1', content: 'a', updatedAt: 't' }, { id: 'c1', content: 'b', updatedAt: 't' }));
});
