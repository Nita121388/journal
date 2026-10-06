/**
 * sync-bridge.test.js — 启动 pull / 轮询刷新（三路径合一）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setPort } from '../platform/index.js';
import { makePort, apiOk } from '../test-helpers.mjs';
import * as repo from './repository.js';
import { pullFromHost, startHostSync } from './sync-bridge.js';

let port;
beforeEach(() => {
  port = makePort();
  setPort(port);
  repo.hydrate([]);
});

/** 让三端点全部成功。 */
function pushPullResponses(cards, journals = {}, todos = []) {
  port._pushResponse(apiOk(cards));
  port._pushResponse(apiOk(journals));
  port._pushResponse(apiOk(todos));
}

describe('pullFromHost', () => {
  it('三端点全成功 → 灌入真源 + 写缓存，返回 pulled:true', async () => {
    pushPullResponses([{ id: 'a' }], { j: 1 }, []);
    const r = await pullFromHost();
    expect(r.pulled).toBe(true);
    expect(repo.getAllCards().map((c) => c.id)).toEqual(['a']);
    expect(port._store.cards).toEqual([{ id: 'a' }]);
  });

  it('任一端点离线 → pulled:false 且回退缓存', async () => {
    setPort(makePort({ storage: { cards: [{ id: 'cached' }] } }));
    const r = await pullFromHost();
    expect(r.pulled).toBe(false);
    expect(repo.getAllCards().map((c) => c.id)).toEqual(['cached']);
  });
});

describe('startHostSync', () => {
  it('首轮只建基线不通知；内容变化才通知一次', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const id = startHostSync(onChange, 1000);

    // 首轮（基线）
    pushPullResponses([{ id: 'a' }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).not.toHaveBeenCalled();

    // 签名相同 → 不通知
    pushPullResponses([{ id: 'a' }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).not.toHaveBeenCalled();

    // 内容变化 → 通知并更新真源
    pushPullResponses([{ id: 'a' }, { id: 'b' }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(repo.getAllCards().map((c) => c.id)).toEqual(['a', 'b']);

    clearInterval(id);
    vi.useRealTimers();
  });

  it('host 离线时保留当前真源', async () => {
    vi.useFakeTimers();
    repo.hydrate([{ id: 'keep' }]);
    const onChange = vi.fn();
    const id = startHostSync(onChange, 1000);
    await vi.advanceTimersByTimeAsync(1000);   // 无响应 → 离线
    expect(repo.getAllCards().map((c) => c.id)).toEqual(['keep']);
    expect(onChange).not.toHaveBeenCalled();
    clearInterval(id);
    vi.useRealTimers();
  });

  it('响应在本地写入之后到达 → 丢弃陈旧快照（不会把刚保存的卡回退）', async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    repo.hydrate([{ id: 'a', content: 'base' }]);

    // 第 1 轮：建基线
    pushPullResponses([{ id: 'a', content: 'base' }]);
    const id = startHostSync(() => {}, 150);
    await sleep(220);

    // 第 2 轮：cards 响应挂起（模拟慢请求）
    let releaseGet = null;
    port._pushResponse(() => new Promise((res) => {
      releaseGet = () => res(apiOk([{ id: 'a', content: 'stale' }]));
    }));
    port._pushResponse(apiOk({}));
    port._pushResponse(apiOk([]));
    await sleep(220);
    expect(typeof releaseGet).toBe('function');

    // 请求在途期间发生本地写入
    port._pushResponse(apiOk({ id: 'a', content: 'local' }));
    await repo.updateCardEntry('a', { content: 'local' });
    expect(repo.getAllCards()[0].content).toBe('local');

    // 陈旧响应现在才到 —— 必须被丢弃
    releaseGet();
    await sleep(120);
    expect(repo.getAllCards()[0].content).toBe('local');

    clearInterval(id);
  });

  it('getWriteSeq 随 hydrate 与本地写入递增', () => {
    const before = repo.getWriteSeq();
    repo.hydrate([]);
    expect(repo.getWriteSeq()).toBeGreaterThan(before);
  });
});
