/**
 * milkdown-entry.js — Milkdown 只读渲染器的打包入口（不直接进扩展运行时）
 *
 * 只被 `build/build-milkdown.mjs` 当作 esbuild entry，产出 `dist/milkdown.bundle.js`。
 * 对外契约刻意收窄为四个函数：视图层拿不到 Milkdown 的任何内部对象。
 *
 * 安全约束：**不启用 HTML 解析**（不 import html preset），
 * 用户写的 Markdown 里的原始 HTML 会原样当文本节点渲染，杜绝注入面。
 */

import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';

/** 已挂载实例：element → editor（WeakMap 便于 GC；另用 Set 做计数）。 */
const mounted = new WeakMap();
/** 存活容器集合（WeakMap 无法枚举，计数需要强引用；卸载时删除，不会长期滞留）。 */
const live = new Set();

/**
 * 在容器里挂载只读 Markdown 渲染。
 *
 * @param {HTMLElement} el 容器元素（内容会被清空）
 * @param {string} markdown 用户 Markdown 原文
 * @returns {Promise<{el: HTMLElement}>}
 */
export async function mountReadonly(el, markdown) {
  if (!el) throw new Error('mountReadonly: element required');
  unmount(el);
  el.replaceChildren();

  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, el);
      ctx.set(defaultValueCtx, markdown ?? '');
      ctx.set(editorViewOptionsCtx, {
        editable: () => false,
        attributes: { class: 'md-readonly', 'aria-label': '卡片内容' },
      });
    })
    .use(commonmark)
    .create();

  mounted.set(el, editor);
  live.add(el);
  return { el };
}

/**
 * 卸载容器上的实例（幂等）。
 * @param {HTMLElement} el
 */
export function unmount(el) {
  const editor = mounted.get(el);
  live.delete(el);
  if (!editor) return;
  mounted.delete(el);
  try { editor.destroy(); } catch { /* 已销毁或未完成初始化：忽略 */ }
}

/** 当前存活实例数（仅供测试 / dev-loop 断言，不参与业务逻辑）。 */
export function liveCount() {
  return live.size;
}

/** 打包产物版本标记，便于 dev-loop 断言加载到的是预期产物。 */
export const version = '7.23.0';
