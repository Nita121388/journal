/**
 * property-row.js — 属性行（components 层）
 *
 * 编辑弹窗里「内建属性」（状态/进度/优先级/排程/标签/项目）与
 * 「自定义属性」（属性库字段）此前是两套结构：
 *   内建 —— `<section class="ce-section">` 卡片 + 大写标签 + 分隔线
 *   自定义 —— `.prop-row` flex 行 + `.prop-label`
 * 于是同一弹窗里出现两种行样式。本组件把两者收敛为同一结构：
 *
 *   <div class="prop-row" data-key="status">
 *     <div class="prop-key"><span class="prop-key-icon">⚙️</span><span class="prop-key-label">状态</span></div>
 *     <div class="prop-val">…控件…</div>
 *   </div>
 *
 * 纯 DOM 原子：不读存储、不写业务状态。
 */

/**
 * 创建一行属性（Notion 式两列：左键右值）。
 *
 * @param {object} opts
 * @param {string} opts.key 属性 key（写入 `data-key`，供 CSS 按属性分流）
 * @param {string} opts.label 属性显示名
 * @param {string} [opts.icon] 前置图标（emoji，仅作装饰）
 * @param {string} [opts.hint] 键名悬浮提示（自定义属性用原始 key）
 * @returns {{ row: HTMLDivElement, keyEl: HTMLDivElement, val: HTMLDivElement }}
 */
export function createPropRow({ key, label, icon, hint }) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  row.dataset.key = key;

  const keyEl = document.createElement('div');
  keyEl.className = 'prop-key';
  if (hint) keyEl.title = hint;

  if (icon) {
    const iconEl = document.createElement('span');
    iconEl.className = 'prop-key-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = icon;
    keyEl.append(iconEl);
  }

  const labelEl = document.createElement('span');
  labelEl.className = 'prop-key-label';
  labelEl.textContent = label;
  keyEl.append(labelEl);

  const val = document.createElement('div');
  val.className = 'prop-val';

  row.append(keyEl, val);
  return { row, keyEl, val };
}

/**
 * 属性行之间的细分隔线（Notion 只用一条线分隔属性区与正文）。
 * @returns {HTMLHRElement}
 */
export function createPropDivider() {
  const hr = document.createElement('hr');
  hr.className = 'prop-divider';
  return hr;
}
