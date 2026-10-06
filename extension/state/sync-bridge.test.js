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
});
