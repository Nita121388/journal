/**
 * editor-field-picker.js — 编辑器属性区的「＋ 添加属性」浮层（features 层）
 *
 * 存在理由（2026-11-10）：内建可选字段此前只能经「模板」引入 —— 想用一次「优先级」
 * 也要先建模板，或用「显示全部属性」一次性全上；而属性库字段在编辑器里反而随时可加。
 * 本浮层把两种字段统一到同一个入口：内建可选（逐个引入，仅影响本卡可见性）+ 属性库。
 *
 * 边界：只负责「选哪个字段」，不写数据、不改模板。选中后由调用方
 * （`features/card-editor.js`）决定是解除隐藏还是加入 `editorProps`。
 */

import { icon } from '../components/icon.js';
import { getFieldDef } from '../shared/field-registry.js';
import { getPropLibrary } from '../state/prop-library.js';
import { BUILTIN_FIELD_ICONS, OPTIONAL_BUILTIN_FIELDS } from './editor-fields.js';

const PICKER_ID = 'editor-field-picker';

let pickerEl = null;
let pickerCleanup = null;

/** 关闭浮层（幂等） */
export function closeEditorFieldPicker() {
  pickerCleanup?.();
  pickerCleanup = null;
  pickerEl?.remove();
  pickerEl = null;
}

function groupTitle(text) {
  const el = document.createElement('div');
  el.className = 'tpl-picker-group';
  el.textContent = text;
  return el;
}

function separator() {
  const el = document.createElement('div');
  el.className = 'tpl-ctx-sep';
  return el;
}

/**
 * 一个菜单项：图标 + 文案。
 * @param {string} text
 * @param {(() => void)|null} onClick
 * @param {{ disabled?: boolean, iconNode?: Element|null }} [opts]
 */
function item(text, onClick, { disabled = false, iconNode = null } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tpl-ctx-item';
  btn.disabled = disabled;
  if (iconNode) btn.append(iconNode);
  const label = document.createElement('span');
  label.textContent = text;
  btn.append(label);
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

/** 把浮层贴到锚点下方，越界时上翻 / 左右夹紧 */
function place(menu, anchor) {
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  const below = rect.bottom + 4;
  const overflow = below + menu.offsetHeight > window.innerHeight - 8;
  menu.style.top = `${Math.max(8, overflow ? rect.top - menu.offsetHeight - 4 : below)}px`;
}

/**
 * 打开「添加属性」浮层。
 *
 * @param {HTMLElement|null} anchor 锚点（属性区的添加按钮）
 * @param {{
 *   visibleBuiltinKeys?: string[],
 *   onPickBuiltin?: (def: { key: string, label: string }) => void,
 *   existingUserKeys?: string[],
 *   onPickUser?: (key: string, def: object) => void,
 *   onPickNew?: () => void,
 * }} [opts]
 */
export function openEditorFieldPicker(anchor, {
  visibleBuiltinKeys = [],
  onPickBuiltin,
  existingUserKeys = [],
  onPickUser,
  onPickNew,
} = {}) {
  closeEditorFieldPicker();
  if (!anchor) return;

  const menu = document.createElement('div');
  menu.id = PICKER_ID;
  menu.className = 'tpl-ctx-menu tpl-field-picker';
  menu.setAttribute('role', 'menu');
  pickerEl = menu;

  // ── 内建可选（已在属性区显示的置灰）──
  // 功能图标一律 SVG（注册表里的 emoji 是历史数据，只用于模板/属性行的图标位）
  const visible = new Set(visibleBuiltinKeys);
  menu.append(groupTitle('内建可选'));
  for (const key of OPTIONAL_BUILTIN_FIELDS) {
    const def = getFieldDef(key);
    if (!def) continue;
    const glyph = icon(BUILTIN_FIELD_ICONS[key] || 'tag', { size: 12 });
    glyph.classList.add('tpl-ctx-icon');
    const used = visible.has(key);
    menu.append(item(used ? `${def.label}  ✓` : def.label, used ? null : () => {
      closeEditorFieldPicker();
      onPickBuiltin?.({ key, label: def.label || key });
    }, { disabled: used, iconNode: glyph }));
  }

  // ── 属性库（已在自定义属性区的置灰）──
  menu.append(separator(), groupTitle('属性库'));
  const lib = getPropLibrary() || {};
  const usedUser = new Set(existingUserKeys);
  const userKeys = Object.keys(lib).filter(k => !usedUser.has(k));
  if (!userKeys.length) {
    const empty = document.createElement('div');
    empty.className = 'tpl-picker-empty';
    empty.textContent = '（空）';
    menu.append(empty);
  } else {
    for (const key of userKeys) {
      const def = lib[key] || {};
      // 自定义属性图标是**内容**（用户自选 emoji），保留原样
      const badge = document.createElement('span');
      badge.className = 'tpl-ctx-emoji';
      badge.textContent = def.icon && def.icon !== '•' ? def.icon : '';
      menu.append(item(def.label || key, () => {
        closeEditorFieldPicker();
        onPickUser?.(key, def);
      }, { iconNode: badge.textContent ? badge : null }));
    }
  }

  // ── 新建自定义属性（与正文下方的添加按钮同一流程，不另起一套语言）──
  menu.append(separator(), item('＋ 新建自定义属性…', () => {
    closeEditorFieldPicker();
    onPickNew?.();
  }));

  document.body.append(menu);
  place(menu, anchor);

  const onDown = (e) => {
    if (!menu.contains(e.target) && e.target !== anchor) closeEditorFieldPicker();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') closeEditorFieldPicker();
  };
  setTimeout(() => {
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
  }, 0);
  pickerCleanup = () => {
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('keydown', onKey);
  };
}
