/**
 * host-client.test.js — host HTTP 客户端（用假端口验证路由与包络解包）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setPort } from '../platform/index.js';
import { makePort, apiOk } from '../test-helpers.mjs';
import { ROUTES } from '../shared/protocol.js';
import * as host from './host-client.js';

let port;
beforeEach(() => {
  port = makePort();
  setPort(port);
});

function lastCall() { return port.calls.filter((c) => c.kind === 'hostFetch').at(-1); }

describe('cards', () => {
  it('listCards 成功返回数组；离线返回 null', async () => {
    port._pushResponse(apiOk([{ id: 'a' }]));
    expect(await host.listCards()).toEqual([{ id: 'a' }]);
    expect(lastCall().path).toBe(ROUTES.cards);

    setPort(makePort()); // 无响应队列 → 离线
    expect(await host.listCards()).toBeNull();
  });

  it('createCardToHost / updateCardToHost / deleteCardFromHost', async () => {
    port._pushResponse(apiOk({ id: 'c1' }));
    expect(await host.createCardToHost({ content: 'x' })).toEqual({ ok: true, card: { id: 'c1' } });
    expect(lastCall().method).toBe('POST');

    port._pushResponse(apiOk({ id: 'c1' }));
    expect(await host.updateCardToHost('c1', { title: 't' })).toEqual({ ok: true, card: { id: 'c1' } });
    expect(lastCall().path).toBe('/api/cards/c1');

    port._pushResponse(apiOk(null));
    expect(await host.deleteCardFromHost('c1')).toEqual({ ok: true });
  });

  it('失败时返回 {ok:false,error}', async () => {
    port._pushResponse({ ok: false, error: { code: 'X', message: 'boom' } });
    const r = await host.createCardToHost({});
    expect(r.ok).toBe(false);
    expect(r.error.message).toBe('boom');
  });
});

describe('journals / todos', () => {
  it('listJournals / listTodos 离线返回 null', async () => {
    setPort(makePort());
    expect(await host.listJournals()).toBeNull();
    expect(await host.listTodos()).toBeNull();
  });
  it('saveJournalToHost / saveTodosToHost 返回布尔', async () => {
    port._pushResponse(apiOk(null));
    expect(await host.saveJournalToHost('2026-01-01', 'md')).toBe(true);
    port._pushResponse(apiOk(null));
    expect(await host.saveTodosToHost([])).toBe(true);
  });
});

describe('meta', () => {
  it('getHostMeta / setHostMeta', async () => {
    port._pushResponse(apiOk({ a: 1 }));
    expect(await host.getHostMeta('templates')).toEqual({ a: 1 });
    expect(lastCall().path).toBe('/api/meta/templates');

    port._pushResponse(apiOk({ ok: 1 }));
    expect(await host.setHostMeta('savedViews', [])).toEqual({ ok: 1 });
    expect(lastCall().method).toBe('PUT');
  });
  it('getHostMeta 离线返回 null', async () => {
    setPort(makePort());
    expect(await host.getHostMeta('templates')).toBeNull();
  });

  it('setHostMeta 离线必须抛错（否则 UI 会谎报已保存并继续）', async () => {
    setPort(makePort());
    await expect(host.setHostMeta('templates', {})).rejects.toThrow();
  });

  it('updateHostMeta：读不到已有值就拒绝写入（防离线覆盖）', async () => {
    setPort(makePort());
    let mutated = false;
    await expect(host.updateHostMeta('templates', () => { mutated = true; return []; })).rejects.toThrow();
    expect(mutated).toBe(false);
  });

  it('updateHostMeta：读到后基于当前值改再写', async () => {
    port._pushResponse(apiOk([{ id: 't1' }]));
    port._pushResponse(apiOk([{ id: 't1' }, { id: 't2' }]));
    const next = await host.updateHostMeta('templates', (cur) => [...cur, { id: 't2' }]);
    expect(next).toEqual([{ id: 't1' }, { id: 't2' }]);
    expect(lastCall().method).toBe('PUT');
  });
});

describe('sync', () => {
  it('getSyncStatus / getSyncConfig 离线返回 null', async () => {
    setPort(makePort());
    expect(await host.getSyncStatus()).toBeNull();
    expect(await host.getSyncConfig()).toBeNull();
  });
  it('syncNow 成功透传 data；失败抛错', async () => {
    port._pushResponse(apiOk({ pushed: true }));
    expect(await host.syncNow('push')).toEqual({ pushed: true });
    expect(lastCall().body).toEqual({ direction: 'push' });

    port._pushResponse({ ok: false, error: { code: 'SYNC_DISABLED', message: '同步未开启' } });
    await expect(host.syncNow()).rejects.toThrow('同步未开启');
  });
  it('saveSyncConfig / testSync 失败抛错', async () => {
    port._pushResponse({ ok: false, error: { message: 'nope' } });
    await expect(host.saveSyncConfig({})).rejects.toThrow('nope');
    port._pushResponse({ ok: false, error: { message: 'bad' } });
    await expect(host.testSync()).rejects.toThrow('bad');
  });
});

describe('hostApi', () => {
  it('透传 method/path/body 到端口', async () => {
    port._pushResponse(apiOk(1));
    await host.hostApi('GET', '/x');
    expect(lastCall()).toMatchObject({ method: 'GET', path: '/x' });
  });
});
