/**
 * repository.test.js — 内容真源（查询 / 写入 / 订阅 / 缓存回填）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setPort } from '../platform/index.js';
import { makePort, apiOk } from '../test-helpers.mjs';
import * as repo from './repository.js';

let port;
beforeEach(() => {
  port = makePort();
  setPort(port);
  repo.hydrate([]);
});

describe('查询', () => {
  it('getAllCards 返回内存真源', () => {
    const cards = [{ id: 'a', assignedDate: '2026-01-01' }];
    repo.hydrate(cards);
    expect(repo.getAllCards()).toBe(cards);
  });
  it('getCardsByDay 按日过滤，非日期→空', () => {
    repo.hydrate([{ id: 'a', assignedDate: '2026-01-01' }, { id: 'b', assignedDate: '2026-01-02' }]);
    expect(repo.getCardsByDay('2026-01-01').map((c) => c.id)).toEqual(['a']);
    expect(repo.getCardsByDay('2026-01-03')).toEqual([]);
  });
  it('hydrate 非数组 → 空', () => {
    repo.hydrate(null);
    expect(repo.getAllCards()).toEqual([]);
  });
});

describe('订阅', () => {
  it('hydrate 触发订阅者；退订后不再触发', () => {
    let n = 0;
    const off = repo.subscribe(() => { n++; });
    repo.hydrate([{ id: 'a' }]);
    expect(n).toBe(1);
    off();
    repo.hydrate([{ id: 'b' }]);
    expect(n).toBe(1);
  });
  it('订阅者抛错不影响其他订阅者与调用方', () => {
    let ok = 0;
    repo.subscribe(() => { throw new Error('boom'); });
    repo.subscribe(() => { ok++; });
    expect(() => repo.hydrate([])).not.toThrow();
    expect(ok).toBe(1);
  });
});

describe('缓存回填（host 离线降级）', () => {
  it('有 cards 缓存 → 直接回填', async () => {
    setPort(makePort({ storage: { cards: [{ id: 'cached' }] } }));
    const out = await repo.hydrateFromCache();
    expect(out.map((c) => c.id)).toEqual(['cached']);
  });
  it('无 cards 但有旧 journals/todos → 迁移为卡片', async () => {
    setPort(makePort({ storage: { journals: { '2026-01-01': 'x' }, todos: [{ id: 't', title: 'T', done: false }] } }));
    const out = await repo.hydrateFromCache();
    expect(out.some((c) => c.assignedDate === '2026-01-01')).toBe(true);
    expect(out.some((c) => c.type === 'task')).toBe(true);
  });
});

describe('写入（host 权威优先）', () => {
  it('createCardEntry 成功后写入内存并持久化缓存', async () => {
    port._pushResponse(apiOk({ id: 'new', content: 'x', type: 'text' }));
    const saved = await repo.createCardEntry({ content: 'x' });
    expect(saved.id).toBe('new');
    expect(repo.getAllCards().map((c) => c.id)).toEqual(['new']);
    expect(port._store.cards.map((c) => c.id)).toEqual(['new']);
  });
  it('createCardEntry 失败抛错且不写入内存', async () => {
    port._pushResponse({ ok: false, error: { message: 'x' } });
    await expect(repo.createCardEntry({ content: 'x' })).rejects.toThrow('createCard failed');
    expect(repo.getAllCards()).toEqual([]);
  });

  it('updateCardEntry 合并 host 返回与 patch（防字段回弹）', async () => {
    repo.hydrate([{ id: 'a', title: 'old' }]);
    port._pushResponse(apiOk({ id: 'a', title: 'new' }));   // host 忽略 endTime
    const merged = await repo.updateCardEntry('a', { endTime: '10:00' });
    expect(merged.title).toBe('new');
    expect(merged.endTime).toBe('10:00');
    expect(repo.getAllCards()[0]).toMatchObject({ title: 'new', endTime: '10:00' });
  });
  it('updateCardEntry 目标不存在时插入', async () => {
    port._pushResponse(apiOk({ id: 'zzz', title: 't' }));
    await repo.updateCardEntry('zzz', {});
    expect(repo.getAllCards().map((c) => c.id)).toContain('zzz');
  });
  it('updateCardEntry 失败抛错', async () => {
    port._pushResponse({ ok: false, error: {} });
    await expect(repo.updateCardEntry('a', {})).rejects.toThrow('updateCard failed');
  });

  it('deleteCardEntry 成功后从内存与缓存移除', async () => {
    repo.hydrate([{ id: 'a' }, { id: 'b' }]);
    port._pushResponse(apiOk(null));
    await repo.deleteCardEntry('a');
    expect(repo.getAllCards().map((c) => c.id)).toEqual(['b']);
  });
  it('deleteCardEntry 失败抛错', async () => {
    port._pushResponse({ ok: false, error: {} });
    await expect(repo.deleteCardEntry('a')).rejects.toThrow('deleteCard failed');
  });
});
