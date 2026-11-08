// @vitest-environment jsdom
/**
 * milkdown-mount.test.js — 实例池 / 降级路径（jsdom）
 *
 * 不依赖真实的 370KB 打包产物：通过 `__setLoaderForTest` 注入假加载器，
 * 专注验证「上限、LRU、释放、降级」这四个契约。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_MOUNTED, __setLoaderForTest, acquire, mountedCount, release, releaseAll } from './milkdown-mount.js';

/** 造一个假产物模块：mountReadonly 可断言、unmount 记录调用。 */
function fakeBundle(overrides = {}) {
  const unmount = vi.fn();
  const mountReadonly = vi.fn(async () => ({}));
  return { mod: { mountReadonly, unmount, ...overrides }, unmount, mountReadonly };
}

beforeEach(() => {
  vi.restoreAllMocks();
  __setLoaderForTest(null);
});

describe('acquire / release', () => {
  it('挂载成功后计数为 1，release 后归零并调用产物 unmount', async () => {
    const { mod, unmount } = fakeBundle();
    __setLoaderForTest(async () => mod);
    const el = document.createElement('div');

    await expect(acquire(el, '# hi')).resolves.toBe(true);
    expect(mountedCount()).toBe(1);

    release(el);
    expect(mountedCount()).toBe(0);
    await vi.waitFor(() => expect(unmount).toHaveBeenCalledWith(el));
  });

  it('超过 MAX_MOUNTED 时按 LRU 淘汰最早挂载的实例', async () => {
    const { mod, unmount } = fakeBundle();
    __setLoaderForTest(async () => mod);
    // jsdom 的 DOM 节点按结构比较，三个空 div 视为「相等」；给不同 id 才能断言身份
    const els = [0, 1, 2].map((i) => {
      const el = document.createElement('div');
      el.id = `el-${i}`;
      return el;
    });

    for (const el of els) await acquire(el, 'x');

    expect(mountedCount()).toBe(MAX_MOUNTED);
    await vi.waitFor(() => expect(unmount).toHaveBeenCalledWith(els[0]));
    expect(unmount).not.toHaveBeenCalledWith(els[2]);
  });

  it('同一容器重复 acquire 不会累积实例', async () => {
    const { mod } = fakeBundle();
    __setLoaderForTest(async () => mod);
    const el = document.createElement('div');

    await acquire(el, 'a');
    await acquire(el, 'b');
    expect(mountedCount()).toBe(1);
  });

  it('releaseAll 释放全部实例', async () => {
    const { mod } = fakeBundle();
    __setLoaderForTest(async () => mod);
    await acquire(document.createElement('div'), 'a');
    await acquire(document.createElement('div'), 'b');

    expect(mountedCount()).toBe(2);
    releaseAll();
    expect(mountedCount()).toBe(0);
  });

  it('release 未挂载的元素是幂等的', () => {
    expect(() => release(document.createElement('div'))).not.toThrow();
  });
});

describe('降级路径', () => {
  it('产物加载失败时降级为纯文本，且不抛错', async () => {
    __setLoaderForTest(async () => { throw new Error('no bundle'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');

    await expect(acquire(el, '# 标题\n正文')).resolves.toBe(false);
    expect(el.textContent).toContain('标题');
    expect(el.textContent).toContain('正文');
    expect(mountedCount()).toBe(0);
  });

  it('渲染抛错时降级为纯文本并清掉挂载记录', async () => {
    __setLoaderForTest(async () => ({
      mountReadonly: async () => { throw new Error('boom'); },
      unmount: () => {},
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');

    await expect(acquire(el, 'hello')).resolves.toBe(false);
    expect(el.textContent).toContain('hello');
    expect(mountedCount()).toBe(0);
  });

  it('空内容降级渲染显示占位文案', async () => {
    __setLoaderForTest(async () => null);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');

    await acquire(el, '');
    expect(el.textContent).toContain('暂无内容');
  });

  it('降级警告只输出一次', async () => {
    __setLoaderForTest(async () => { throw new Error('no bundle'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await acquire(document.createElement('div'), 'a');
    await acquire(document.createElement('div'), 'b');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
