/**
 * toast.js — 轻量提示与写操作兜底（features 层）
 *
 * 自包含：直接取 `#toast` 元素并管理其显示/隐藏计时器；不依赖其他层。
 * 支持可选的「操作按钮」（用于删除后的撤销）。
 */

let toastTimer = null;

/** 当前 toast 操作按钮的回调（点击后即失效，防止重复执行）。 */
let toastAction = null;

/**
 * 显示一条 toast。
 * @param {string} msg
 * @param {''|'success'|'warn'|'error'} [kind]
 * @param {{action?: string, onAction?: () => void, durationMs?: number}} [opts]
 *   action/onAction 同时给出时渲染一个操作按钮（如「撤销」）。
 */
export function showToast(msg, kind = '', opts = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.replaceChildren();

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = msg;
  el.append(text);

  const hasAction = Boolean(opts.action && opts.onAction);
  toastAction = null;
  if (hasAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = opts.action;
    btn.setAttribute('aria-keyshortcuts', 'Control+Z Meta+Z');
    btn.addEventListener('click', () => {
      const fn = toastAction;
      toastAction = null;
      hideToast();
      try {
        fn?.();
      } catch (e) {
        console.error('[journal] toast action failed:', e);
      }
    });
    el.append(btn);
    toastAction = opts.onAction;
  }

  el.className = 'toast' + (kind ? ' toast-' + kind : '') + (hasAction ? ' has-action' : '');
  // 有「撤销」时必须能键盘到达：否则只有鼠标用户能撤销（a11y 缺口）。
  // 卡片池/时间线的删除按钮都可 Tab 聚焦，toast 上的撤销此前 tabIndex=-1 不可达。
  el.tabIndex = hasAction ? 0 : -1;
  if (toastTimer) clearTimeout(toastTimer);
  const ms = opts.durationMs ?? (kind === 'error' ? 12000 : hasAction ? 6000 : 2600);
  toastTimer = setTimeout(hideToast, ms);
}

/** 隐藏当前 toast。 */
export function hideToast() {
  const el = document.getElementById('toast');
  if (el) el.classList.add('hidden');
}

/**
 * 写操作统一兜底：失败时提示用户，而不是静默 `console.error` 或抛出
 * unhandled rejection（用户会以为操作成功了）。
 *
 * 所有会落 host 的交互（完成/改类型/删除/拖动排程/保存模板）都应经它调用。
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {string} [fallback='操作失败：本机服务未连接，改动未保存']
 * @returns {Promise<{ok: true, value: T} | {ok: false, error: any}>}
 *   用 `ok` 判定，不依赖返回值真假（写操作常常无返回值）。
 */
export async function runWrite(fn, fallback = '操作失败：本机服务未连接，改动未保存') {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    console.error('[journal] write failed:', e);
    showToast(e?.message || fallback, 'error');
    return { ok: false, error: e };
  }
}
