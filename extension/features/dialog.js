/**
 * dialog.js — 应用内对话框（features 层）
 *
 * 替代浏览器原生 `alert` / `confirm` / `prompt`：原生弹窗在侧边栏里样式不可控、
 * 文案无法本地化样式、且会阻塞整个扩展页面。这里提供 Promise 化的最小实现，
 * 复用设计 token 与既有浮层样式。
 *
 * 全部能力都收敛在这一个模块：新增弹窗不要再写原生 prompt/confirm。
 */

import {
  appDialog, appDialogTitle, appDialogBody, appDialogActions, appDialogClose,
} from '../components/dom-refs.js';

/** @type {((v:any)=>void)|null} */
let resolveCurrent = null;
/** @type {(()=>void)|null} */
let detach = null;

/** 关闭对话框并把结果交给等待方。 */
function settle(value) {
  const resolve = resolveCurrent;
  resolveCurrent = null;
  detach?.();
  detach = null;
  if (appDialog) appDialog.classList.add('hidden');
  if (appDialogBody) appDialogBody.replaceChildren();
  if (appDialogActions) appDialogActions.replaceChildren();
  if (resolve) resolve(value);
}

/** 当前是否有对话框打开。 */
export function isDialogOpen() {
  return Boolean(appDialog && !appDialog.classList.contains('hidden'));
}

/** 关闭当前对话框（等价于取消）。 */
export function closeDialog() {
  if (resolveCurrent) settle(null);
}

/**
 * 打开一个通用对话框。
 *
 * @param {object} opts
 * @param {string} opts.title 标题
 * @param {(body: HTMLElement) => void} [opts.render] 填充主体内容
 * @param {{label:string, value:any, primary?:boolean, danger?:boolean, getValue?:()=>any}[]} opts.actions
 *   按钮定义；`getValue` 给出时点击按钮会先取值再结算（用于输入框 + 确定）
 * @returns {Promise<any>} 被点按钮的 value（或 getValue 结果）；Esc / 点遮罩 / 关闭 → null
 */
export function openDialog({ title, render, actions }) {
  if (!appDialog || !appDialogBody || !appDialogActions || !appDialogTitle) return Promise.resolve(null);
  // 已有对话框：先取消旧的，避免挂起泄漏
  if (resolveCurrent) settle(null);

  appDialogTitle.textContent = title ?? '';
  appDialogBody.replaceChildren();
  appDialogActions.replaceChildren();
  render?.(appDialogBody);

  for (const a of actions ?? []) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = a.primary ? 'btn-primary' : 'btn-secondary';
    if (a.danger) btn.classList.add('is-danger');
    btn.textContent = a.label;
    btn.addEventListener('click', () => settle(a.getValue ? a.getValue() : (a.value ?? null)));
    appDialogActions.append(btn);
  }

  appDialog.classList.remove('hidden');

  // Esc 取消：capture 阶段抢先，避免编辑器等既有 Esc 处理同时响应
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      settle(null);
    }
  };
  const onOverlay = (e) => { if (e.target === appDialog) settle(null); };
  const onClose = () => settle(null);
  document.addEventListener('keydown', onKey, true);
  appDialog.addEventListener('click', onOverlay);
  appDialogClose?.addEventListener('click', onClose);
  detach = () => {
    document.removeEventListener('keydown', onKey, true);
    appDialog.removeEventListener('click', onOverlay);
    appDialogClose?.removeEventListener('click', onClose);
  };

  // 自动聚焦首个输入/按钮，键盘可直达
  const focusable = appDialogBody.querySelector('input, textarea, select') ?? appDialogActions.querySelector('button');
  focusable?.focus();
  if (focusable?.select) focusable.select();

  return new Promise((resolve) => { resolveCurrent = resolve; });
}

/**
 * 单行文本输入对话框。
 * @param {{title:string, label?:string, value?:string, placeholder?:string, okLabel?:string}} opts
 * @returns {Promise<string|null>} 去掉首尾空格的值；空串视为取消
 */
export function promptDialog({ title, label = '', value = '', placeholder = '', okLabel = '确定' }) {
  /** @type {HTMLInputElement|null} */
  let input = null;
  const read = () => {
    const v = (input?.value ?? '').trim();
    return v || null;
  };
  return openDialog({
    title,
    render(body) {
      if (label) {
        const lab = document.createElement('label');
        lab.className = 'app-dialog-label';
        lab.textContent = label;
        body.append(lab);
      }
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'app-dialog-input';
      input.value = value;
      input.placeholder = placeholder;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          settle(read());
        }
      });
      body.append(input);
    },
    actions: [
      { label: '取消', value: null },
      { label: okLabel, primary: true, getValue: read },
    ],
  });
}

/**
 * 确认对话框（替代原生 confirm）。
 * @param {{title:string, message:string, okLabel?:string, danger?:boolean}} opts
 * @returns {Promise<boolean>}
 */
export async function confirmDialog({ title, message, okLabel = '确定', danger = false }) {
  const r = await openDialog({
    title,
    render(body) {
      const p = document.createElement('p');
      p.className = 'app-dialog-message';
      p.textContent = message;
      body.append(p);
    },
    actions: [
      { label: '取消', value: null },
      // 主按钮始终是 primary（危险操作用 is-danger 变红）；
      // 否则危险确认框会出现两个外观相同的次要按钮，用户无法判断该点哪个。
      { label: okLabel, primary: true, danger, value: true },
    ],
  });
  return r === true;
}

/**
 * 选择对话框（替代「输入编号」式 prompt）。
 * @param {object} opts
 * @param {string} opts.title
 * @param {string[]} opts.items 选项文案（与返回的索引对应）
 * @param {boolean} [opts.multi] 允许多选（返回索引数组）
 * @param {string} [opts.okLabel]
 * @returns {Promise<number|number[]|null>}
 */
export function pickDialog({ title, items, multi = false, okLabel = '确定' }) {
  const boxes = [];
  const read = () => {
    const picked = boxes.map((b, i) => (b.checked ? i : -1)).filter((i) => i >= 0);
    if (!picked.length) return null;
    return multi ? picked : picked[0];
  };
  return openDialog({
    title,
    render(body) {
      const list = document.createElement('div');
      list.className = 'app-dialog-list';
      items.forEach((text, i) => {
        const row = document.createElement('label');
        row.className = 'app-dialog-item';
        const box = document.createElement('input');
        box.type = multi ? 'checkbox' : 'radio';
        box.name = 'app-dialog-pick';
        if (!multi && i === 0) box.checked = true;
        boxes.push(box);
        const span = document.createElement('span');
        span.textContent = text;
        row.append(box, span);
        list.append(row);
      });
      body.append(list);
    },
    actions: [
      { label: '取消', value: null },
      { label: okLabel, primary: true, getValue: read },
    ],
  });
}
