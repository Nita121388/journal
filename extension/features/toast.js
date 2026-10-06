/**
 * toast.js — 轻量提示（features 层）
 *
 * 自包含：直接取 `#toast` 元素并管理其显示/隐藏计时器；不依赖其他层。
 */

let toastTimer = null;

/**
 * 显示一条 toast。
 * @param {string} msg
 * @param {''|'success'|'warn'|'error'} [kind]
 */
export function showToast(msg, kind = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast' + (kind ? ' toast-' + kind : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), kind === 'error' ? 12000 : 2600);
}
