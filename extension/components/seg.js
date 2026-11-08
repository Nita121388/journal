/**
 * seg.js — 分段单选胶囊（components 层）
 *
 * 一套实现同时服务「状态」与「优先级」两组分段：
 * 二者逻辑完全同构，只差子按钮上的 dataset 键名（`status` / `priority`），
 * 历史上由 card-editor.js 写了两份近乎逐行相同的遍历，本组件负责收口。
 *
 * 纯 DOM 原子：不读存储、不写业务状态。点击只上报值，状态归属由调用方决定。
 * DOM 契约（不可改）：容器内子按钮为 `button.seg`，选中态类为 `is-active`，
 * 值存放在 `data-<dataKey>` 上 —— dev-loop 的 smoke/probe 场景按此选择器断言。
 */

/**
 * 把容器内所有 `.seg` 的选中态同步到 value。
 * 幂等：同值重复调用不产生 DOM 变更。
 * @param {HTMLElement|null|undefined} container
 * @param {string} dataKey 子按钮上存放值的 dataset 键（如 'status'）
 * @param {string} value 目标值
 * @returns {string} 实际落定的值（容器缺失时原样返回 value）
 */
export function syncSegValue(container, dataKey, value) {
  if (!container) return value;
  for (const btn of container.querySelectorAll('.seg')) {
    const on = btn.dataset[dataKey] === value;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-checked', String(on));
  }
  return value;
}

/**
 * 创建一个分段单选组的控制器。
 *
 * 事件用容器级委托注册**一次**，因此重复调用不会叠加监听器；
 * 回调只收到值，不接触业务状态。
 *
 * @param {HTMLElement|null|undefined} container `role="radiogroup"` 容器
 * @param {object} opts
 * @param {string} opts.dataKey 子按钮上的 dataset 键（如 'priority'）
 * @param {(value: string) => void} opts.onPick 用户点击某个分段后的回调
 * @param {string} [opts.initial] 初始值；省略则取容器内当前 `.is-active` 的值
 * @returns {{ setValue: (v: string) => void, getValue: () => string }}
 */
export function createSegGroup(container, { dataKey, onPick, initial }) {
  /** @type {string} */
  let current = initial ?? readActive(container, dataKey);

  if (container && typeof onPick === 'function') {
    container.addEventListener('click', (e) => {
      const btn = e.target instanceof HTMLElement ? e.target.closest('.seg') : null;
      const next = btn?.dataset?.[dataKey];
      if (!next || next === current) return;
      current = next;
      syncSegValue(container, dataKey, current);
      onPick(current);
    });
  }

  return {
    setValue(v) {
      current = v;
      syncSegValue(container, dataKey, v);
    },
    getValue() {
      return current;
    },
  };
}

/**
 * 读容器内当前选中分段的 dataset 值。
 * @param {HTMLElement|null|undefined} container
 * @param {string} dataKey
 * @returns {string} 无选中时返回空串
 */
function readActive(container, dataKey) {
  if (!container) return '';
  const active = container.querySelector('.seg.is-active');
  return active?.dataset?.[dataKey] ?? '';
}
