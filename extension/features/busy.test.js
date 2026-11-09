/**
 * busy.test.js — withBusy in-flight 去重（node 环境，无 DOM）
 */

import { describe, expect, it } from 'vitest';
import { isBusy, withBusy } from './busy.js';

describe('withBusy', () => {
  it('并发两次只执行一次 fn（同 key 返回同一个 promise）', async () => {
    let calls = 0;
    let resolveFn;
    const fn = () => {
      calls += 1;
      return new Promise((r) => { resolveFn = r; });
    };
    const a = withBusy('editor.save', fn);
    const b = withBusy('editor.save', fn);
    expect(calls).toBe(1);
    expect(b).toBe(a);
    expect(isBusy('editor.save')).toBe(true);

    resolveFn('ok');
    await expect(a).resolves.toBe('ok');
    expect(isBusy('editor.save')).toBe(false);
  });

  it('fn reject 后 key 释放，下次可再执行', async () => {
    let calls = 0;
    const fn = () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('again');
    };
    await expect(withBusy('host.start', fn)).rejects.toThrow('boom');
    expect(isBusy('host.start')).toBe(false);
    await expect(withBusy('host.start', fn)).resolves.toBe('again');
    expect(calls).toBe(2);
  });

  it('fn 同步抛错也返回 rejected promise 且 key 释放', async () => {
    const fn = () => { throw new Error('sync boom'); };
    await expect(withBusy('k', fn)).rejects.toThrow('sync boom');
    expect(isBusy('k')).toBe(false);
  });

  it('不同 key 互不影响（并行执行）', async () => {
    let calls = 0;
    const fn = () => {
      calls += 1;
      return new Promise((r) => setTimeout(() => r(calls), 10));
    };
    const a = withBusy('a', fn);
    const b = withBusy('b', fn);
    expect(calls).toBe(2);
    expect(a).not.toBe(b);
    await expect(a).resolves.toBe(2);
    await expect(b).resolves.toBe(2);
    expect(isBusy('a')).toBe(false);
    expect(isBusy('b')).toBe(false);
  });

  it('key 释放后可再次执行（非一次性）', async () => {
    let calls = 0;
    const fn = async () => { calls += 1; };
    await withBusy('k', fn);
    await withBusy('k', fn);
    expect(calls).toBe(2);
  });
});
