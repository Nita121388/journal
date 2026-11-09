/**
 * editor-template-picker.js — 编辑器内的「切换模板」下拉（features 层）
 *
 * 只做一件事：列出「空白 + 已保存模板」，回传 `{ id, name, keys }`。
 * 变更后的可见性/顺序由 `features/editor-fields.js` 负责；
 * 本模块**不**建卡、不写库、不改数据（避免与 `template-menu.js` 的建卡路径纠缠成环）。
 *
 * 依赖方向：只依赖 `state/host-client.js`（读 host meta）与 `components/icon.js`。
 */

import { icon } from '../components/icon.js';
import { FIELD_ORDER } from './editor-fields.js';
import { getHostMeta } from '../state/host-client.js';

const MENU_ID = 'editor-template-menu';

/** 关闭下拉（幂等） */
export function closeTemplatePicker() {
  document.getElementById(MENU_ID)?.remove();
}

/**
 * 取模板字段 key 列表。旧格式（无 fields 数组）按已知一级字段兜底。
 * 不复用 `template-builder.js:normalizeTemplateFields` —— 那条链路 import 了 card-editor.js，
 * 反向引用会形成循环依赖。
 * @param {object} tpl
 * @returns {string[]}
 */
export function templateFieldKeys(tpl) {
  if (Array.isArray(tpl?.fields)) {
    return tpl.fields.filter(f => f && f.key).map(f => f.key);
  }
  const out = [];
  for (const key of ['status', 'priority', 'progress', 'assignedDate', 'project']) {
    if (tpl?.[key] !== undefined && tpl?.[key] !== null && tpl?.[key] !== '') out.push(key);
  }
  if (tpl?.startTime || tpl?.endTime || tpl?.duration) out.push('schedule');
  return out;
}

/**
 * 打开模板下拉。
 *
 * @param {HTMLElement|null} anchor 定位锚点（编辑器头部的模板按钮）
 * @param {{ onPick?: (pick: {id: string|null, name: string, keys: string[]}) => void, activeId?: string|null }} [opts]
 */
export async function openTemplatePicker(anchor, { onPick, activeId = null } = {}) {
  closeTemplatePicker();
  if (!anchor) return;

  let templates = [];
  try {
    templates = (await getHostMeta('templates')) || [];
  } catch {
    templates = []; // host 离线：仍给「空白」，不让下拉消失
  }

  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'template-menu editor-template-menu';
  menu.setAttribute('role', 'menu');

  const addItem = (id, name, keys, hintLabel) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tpl-item' + (id && id === activeId ? ' is-active' : '');
    btn.setAttribute('role', 'menuitem');

    const glyph = icon('template', { size: 14 });
    glyph.classList.add('tpl-item-icon');
    const label = document.createElement('span');
    label.className = 'tpl-item-name';
    label.textContent = name;
    btn.append(glyph, label);

    if (hintLabel) {
      const hint = document.createElement('span');
      hint.className = 'tpl-chips';
      hint.textContent = hintLabel;
      btn.append(hint);
    }

    btn.addEventListener('click', () => {
      closeTemplatePicker();
      onPick?.({ id, name, keys });
    });
    menu.append(btn);
  };

  addItem(null, '空白（默认属性）', [], '状态 · 标签');
  for (const tpl of templates) {
    const keys = templateFieldKeys(tpl);
    addItem(tpl.id, tpl.name || '未命名模板', keys, keys.length ? `${keys.length} 个属性` : '无额外属性');
  }
  // 没有合适模板时的逃生口：一次性显示全部内建属性（不建模板、不改数据）
  addItem(null, '显示全部属性', FIELD_ORDER, '一次性');

  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 240))}px`;
  document.body.append(menu);

  // 点外部关闭：延后注册，避免本次点击立刻关掉
  setTimeout(() => {
    const handler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }, 0);
}
