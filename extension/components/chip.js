/**
 * chip.js — 标签 chip（components 层）
 *
 * 历史上 `.tag-chip` 在 card-editor.js（可删除）与 views/timeline-card.js（只读）
 * 各手写一份，删除用 `textContent = name + ' ×'` 把符号拼进文本里，
 * 导致读屏念出「乘号」、且整块点击即删除（无法只选中文本）。本组件统一两者。
 *
 * 输出类名保持 `tag-chip`（既有 CSS 与 views 复用），新增 `chip-atom` 作为行为钩子。
 */

/**
 * 创建一个标签 chip。
 *
 * - 可删除时内部追加 `<span class="chip-x" aria-hidden="true">×</span>`，
 *   由 CSS 在 hover / focus-visible 时显示；`aria-label` 说明删除语义。
 * - 不可删除（只读展示）时输出 `<span>` 而非 `<button>`：它不可点击，
 *   用 button 会让键盘用户 Tab 到一个无动作的控件。加 `is-static`。
 *
 * @param {object} opts
 * @param {string} opts.label 标签文本（用户内容，只用 textContent 写入）
 * @param {() => void} [opts.onRemove] 删除回调；提供则可删除
 * @param {boolean} [opts.active] 是否处于选中态（筛选场景）
 * @param {string} [opts.title] 悬浮提示
 * @param {boolean} [opts.static] 强制只读（覆盖 onRemove）
 * @returns {HTMLElement}
 */
export function createChip({ label, onRemove, active = false, title, static: isStatic = false }) {
  const removable = !isStatic && typeof onRemove === 'function';
  const el = document.createElement(removable ? 'button' : 'span');
  if (removable) el.type = 'button';
  el.className = 'tag-chip chip-atom';
  if (!removable) el.classList.add('is-static');
  if (active) el.classList.add('is-active');
  if (title) el.title = title;
  if (removable) el.setAttribute('aria-label', `移除标签 ${label}`);

  const text = document.createElement('span');
  text.className = 'chip-label';
  text.textContent = label;
  el.append(text);

  if (removable) {
    const x = document.createElement('span');
    x.className = 'chip-x';
    x.setAttribute('aria-hidden', 'true');
    x.textContent = '×';
    el.append(x);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove();
    });
  }

  return el;
}
