/**
 * milkdown-mount.js — Milkdown 只读渲染的挂载器（views 层）
 *
 * 职责：懒加载打包产物 `dist/milkdown.bundle.js`，并**限制同时存活的实例数**。
 *
 * 为什么需要实例池：Milkdown 每个实例是一个完整 ProseMirror EditorView。
 * 月视图 42 格 × 平均 3 张卡 = 126 个块，若各挂一个实例会直接把侧边栏拖死
 * （见 .trellis/tasks/11-07-calendar-visual-refresh/design.md D2）。
 * 因此只有「展开态」才挂载，且同时存活上限 `MAX_MOUNTED`，超出按 LRU 释放。
 *
 * 降级：产物加载失败 / 渲染抛错时回落到 shared/md-lite.js 的纯文本渲染，
 * 视图渲染不因 Milkdown 不可用而失败。
 */

import { toLines } from '../shared/md-lite.js';

/** 同时存活的 Milkdown 实例上限。 */
export const MAX_MOUNTED = 2;

/**
 * 打包产物 URL。
 *
 * 用 `new URL(..., import.meta.url)` 而不是字面量 `import('../../dist/...')`：
 * ① 打包器（vite/vitest）不会把它当成静态依赖去解析 370KB 的 minified 产物；
 * ② MV3 下解析为 `chrome-extension://<id>/dist/milkdown.bundle.js`，符合 `script-src 'self'`。
 */
const BUNDLE_URL = new URL('../../dist/milkdown.bundle.js', import.meta.url).href;

/**
 * 默认加载器：动态 import 打包产物。
 * 测试通过 {@link __setLoaderForTest} 替换，避免依赖真实产物。
 * @returns {Promise<{mountReadonly: Function, unmount: Function}|null>}
 */
function defaultLoader() {
  return import(/* @vite-ignore */ BUNDLE_URL);
}

/** @type {() => Promise<any>} */
let loader = defaultLoader;

/** @type {Promise<any>|null} 产物模块加载 Promise（懒加载，只加载一次）。 */
let bundlePromise = null;
/** 产物是否加载失败（失败后不再重试，避免每次展开都等一次超时）。 */
let bundleFailed = false;
/** 是否已经 warn 过降级（只提示一次，不刷 console）。 */
let warned = false;

/**
 * 当前挂载表：element → { key }，插入顺序即 LRU 顺序（Map 保序）。
 * @type {Map<HTMLElement, {key: string}>}
 */
const active = new Map();

/** 把加载失败降级成 `null`，避免未捕获的 Promise rejection。 */
function loadBundle() {
  if (bundleFailed) return Promise.resolve(null);
  bundlePromise ??= loader()
    .catch((err) => {
      bundleFailed = true;
      warnOnce('Milkdown 产物不可用，卡片正文降级为纯文本渲染：', err);
      return null;
    });
  return bundlePromise;
}

/** 只提示一次的 console.warn（降级是预期内情况，不该刷屏）。 */
function warnOnce(msg, err) {
  if (warned) return;
  warned = true;
  console.warn(`[journal] ${msg}`, err?.message ?? err ?? '');
}

/** 用 md-lite 渲染纯文本（降级路径，同时用作挂载前的占位）。 */
function renderFallback(el, markdown) {
  el.replaceChildren();
  const lines = toLines(markdown, { maxLines: 12 });
  if (!lines.length) {
    const empty = document.createElement('p');
    empty.className = 'md-lite is-empty';
    empty.textContent = '暂无内容';
    el.append(empty);
    return;
  }
  for (const line of lines) {
    const p = document.createElement('p');
    p.className = 'md-lite';
    p.textContent = line;
    el.append(p);
  }
}

/**
 * 释放某个容器上的实例。
 * @param {HTMLElement} el
 */
export function release(el) {
  if (!active.has(el)) return;
  active.delete(el);
  // 产物模块可能尚未 resolve（首次挂载就切走），所以复用同一个加载 Promise
  loadBundle()
    .then((b) => b?.unmount?.(el))
    .catch(() => { /* 卸载失败不影响视图重建 */ });
}

/** 释放全部实例（视图切换 / 重渲染前调用）。 */
export function releaseAll() {
  for (const el of [...active.keys()]) release(el);
}

/** 当前挂载数量（测试 / dev-loop 断言用）。 */
export function mountedCount() {
  return active.size;
}

/**
 * 在容器里挂载只读 Markdown（自动做 LRU 淘汰与降级）。
 *
 * 同一容器重复调用会先释放旧实例；超上限时释放最早挂载的那个。
 * @param {HTMLElement} el 容器
 * @param {string} markdown 用户 Markdown
 * @param {{key?: string}} [opts] key 仅用于调试定位（通常传 card.id）
 * @returns {Promise<boolean>} true = Milkdown 渲染成功；false = 走了降级
 */
export async function acquire(el, markdown, opts = {}) {
  if (!el) return false;
  release(el);

  // 先占位：渲染完成前就显示内容，避免展开瞬间空白闪烁
  renderFallback(el, markdown);

  // LRU 淘汰：Map 保序，取最早插入的那个释放掉，保证新实例一定有位
  while (active.size >= MAX_MOUNTED) {
    const oldest = active.keys().next().value;
    if (oldest === undefined) break;
    release(oldest);
  }

  const mod = await loadBundle();
  if (!mod?.mountReadonly) {
    renderFallback(el, markdown);
    return false;
  }

  active.set(el, { key: opts.key ?? '' });
  try {
    await mod.mountReadonly(el, markdown ?? '');
    return true;
  } catch (err) {
    active.delete(el);
    warnOnce('Milkdown 渲染失败，降级为纯文本：', err);
    renderFallback(el, markdown);
    return false;
  }
}

/**
 * 测试注入点：替换产物加载器并重置内部状态。
 *
 * 生产代码不调用；测试用它避开对 370KB minified 产物的依赖。
 * @param {(() => Promise<any>)|null} fn 传 null 恢复默认加载器
 */
export function __setLoaderForTest(fn) {
  loader = fn ?? defaultLoader;
  active.clear();
  bundlePromise = null;
  bundleFailed = false;
  warned = false;
}
