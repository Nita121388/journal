/**
 * editor-props.js — 卡片编辑器的自定义属性（features 层）
 *
 * 2026-11-09 重做：交互与样式**对齐模板构建器**（用户拍板）。
 * 旧实现是「折叠 details + 属性列表 + 独立表单（名称/图标文本/类型/选项）」三层结构，
 * 点「添加属性」跳到表单里填字段，与模板构建器完全是两套语言。
 *
 * 现在：
 *   - 平面行：[图标][名称][值控件][✎][✕]，复用 .tpl-prop-row 的视觉与尺寸
 *   - 「添加属性」= 立刻新建一行并进入**行内命名**（Enter 提交 / Esc 取消）
 *   - 分割按钮的 caret = 从属性库选择已有定义
 *   - 点图标 = emoji 选择器（不再是手填 emoji 的文本框）
 *   - ✎ = 复用「属性定义」弹窗（显示名/图标/类型/选项），与模板构建器同源
 *   - ✕ = 从当前卡片移除（保留属性库定义）
 *
 * 数据形态不变：editorProps[key] = 值，定义存 propLibrary。
 */

import { propsList } from '../components/dom-refs.js';
import { icon as makeIcon } from '../components/icon.js';
import { RESERVED_PROPS } from '../shared/model.js';
import { dedupeKey } from '../shared/prop-infer.js';
import {
  getPropLibrary, removePropDef, savePropLibrary, upsertPropDef,
} from '../state/prop-library.js';
import { editorProps } from './card-editor.js';
import { pickDialog } from './dialog.js';
import { openRowIconPicker } from './template-fields.js';
import { openPropDefDialog } from './template-menu.js';
import { openNameEditor } from './template-rows.js';
import { runWrite, showToast } from './toast.js';
import { closeTplPropDialog } from './template-builder.js';

/** 空态提示（不是死路的「无数据」，给出下一步动作） */
function renderEmpty() {
  const hint = document.createElement('div');
  hint.className = 'props-empty';
  hint.textContent = '还没有自定义属性，点下方「添加属性」';
  propsList.append(hint);
}

/** 渲染一行自定义属性：结构与模板构建器的 .tpl-prop-row 一致 */
function buildRow(key) {
  const def = getPropLibrary()[key] || { key, label: key, type: 'text' };
  const row = document.createElement('div');
  row.className = 'tpl-prop-row ce-prop-row';
  row.dataset.key = key;

  // 图标：点开 emoji 选择器（内容 emoji，用户自选）
  const iconBtn = document.createElement('button');
  iconBtn.type = 'button';
  iconBtn.className = 'tpl-prop-icon';
  iconBtn.title = '点击更换图标';
  iconBtn.setAttribute('aria-label', `更换属性「${def.label || key}」的图标`);
  const setIcon = (ch) => { iconBtn.textContent = ch || '•'; };
  if (def.icon && def.icon !== '•') setIcon(def.icon);
  else iconBtn.append(makeIcon('tag', { size: 14 }));
  iconBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openRowIconPicker(iconBtn, def.icon === '•' ? '' : (def.icon || ''), (ch) => {
      upsertPropDef(key, { ...def, icon: ch });
      void runWrite(() => savePropLibrary(), '属性库保存失败：本机服务未连接');
      setIcon(ch);
    });
  });

  // 名称：双击行内改名（与模板构建器同一实现）
  const name = document.createElement('span');
  name.className = 'tpl-prop-name';
  name.textContent = def.label || key;
  name.title = `${key}（双击改名）`;
  name.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    openNameEditor(row, name, {
      initial: def.label || key,
      rerender: renderEditorProps,
      onCommit: (next) => renameEditorProp(key, next),
    });
  });

  const valWrap = document.createElement('div');
  valWrap.className = 'tpl-prop-value';
  valWrap.append(buildPropControl(key, def, editorProps[key]));

  // ✎ 打开属性定义弹窗（类型 / 选项 / 显示名 / 图标）
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'tpl-row-act tpl-row-edit';
  edit.append(makeIcon('pencil', { size: 13 }));
  edit.title = '编辑属性定义';
  edit.setAttribute('aria-label', `编辑属性 ${def.label || key}`);
  edit.addEventListener('click', (e) => {
    e.stopPropagation();
    openPropDefDialog({
      key,
      def,
      submit: (next) => {
        upsertPropDef(key, { ...next, key });
        void runWrite(() => savePropLibrary(), '属性库保存失败：本机服务未连接');
        closeTplPropDialog();
        renderEditorProps();
        showToast(`已更新属性「${next.label || key}」`, 'success');
      },
    });
  });

  // ✕ 从当前卡移除（保留属性库定义）
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'tpl-row-act tpl-row-del';
  del.append(makeIcon('trash', { size: 13 }));
  del.title = '从当前卡片删除该属性（保留属性库定义）';
  del.setAttribute('aria-label', `从当前卡片删除属性 ${def.label || key}`);
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    delete editorProps[key];
    renderEditorProps();
  });

  row.append(iconBtn, name, valWrap, edit, del);
  return row;
}

/** 渲染当前卡的自定义属性行 */
export function renderEditorProps() {
  if (!propsList) return;
  propsList.replaceChildren();
  const keys = Object.keys(editorProps);
  if (!keys.length) { renderEmpty(); return; }
  for (const key of keys) propsList.append(buildRow(key));
}

/**
 * 改名：key 也要跟着迁移（新建属性时 key 就是名字），避免数据断链。
 * 返回 false = 拒绝提交、保持编辑态（与模板构建器的 openNameEditor 约定一致）。
 * @param {string} oldKey
 * @param {string} next
 * @returns {boolean}
 */
function renameEditorProp(oldKey, next) {
  if (RESERVED_PROPS.has(next)) { showToast(`「${next}」是保留字段，换个名字`, 'error'); return false; }
  if (next !== oldKey && next in editorProps) { showToast(`「${next}」已存在`, 'error'); return false; }
  if (next === oldKey) {
    upsertPropDef(oldKey, { ...(getPropLibrary()[oldKey] || {}), key: oldKey, label: next });
  } else {
    editorProps[next] = editorProps[oldKey];
    delete editorProps[oldKey];
    const def = getPropLibrary()[oldKey] || {};
    removePropDef(oldKey);
    upsertPropDef(next, { ...def, key: next, label: next });
  }
  void runWrite(() => savePropLibrary(), '属性库保存失败：本机服务未连接');
  return true;
}

/**
 * 「添加属性」主按钮：立刻新建一行 + 行内命名。
 * 与模板构建器的 startAddProp 同一节奏，不再弹出独立表单。
 */
export function addEditorProp() {
  const key = dedupeKey('新属性', [...Object.keys(editorProps)]);
  editorProps[key] = '';
  upsertPropDef(key, { key, label: '新属性', icon: '•', type: 'text' });
  void runWrite(() => savePropLibrary(), '属性库保存失败：本机服务未连接');
  renderEditorProps();
  const row = propsList
    ? [...propsList.querySelectorAll('.ce-prop-row')].find(r => r.dataset.key === key)
    : null;
  const name = row?.querySelector('.tpl-prop-name');
  if (row && name) {
    openNameEditor(row, name, {
      initial: '新属性',
      rerender: renderEditorProps,
      onCommit: (next) => renameEditorProp(key, next),
    });
  }
}

/** 从属性库复用属性到当前卡（分割按钮的 caret 入口） */
export async function openPropLibrary() {
  const lib = getPropLibrary();
  const keys = Object.keys(lib).filter(k => !(k in editorProps));
  if (!keys.length) { showToast('属性库为空（或已全部添加）', ''); return; }
  const picked = await pickDialog({
    title: '从属性库添加',
    items: keys.map((k) => `${lib[k].icon && lib[k].icon !== '•' ? lib[k].icon + ' ' : ''}${lib[k].label || k}`),
    multi: true,
    okLabel: '添加',
  });
  if (!Array.isArray(picked) || !picked.length) return;
  for (const i of picked) {
    const k = keys[i];
    if (k && !(k in editorProps)) editorProps[k] = '';
  }
  renderEditorProps();
  showToast(`已添加 ${picked.length} 个属性`, 'success');
}

/** 按属性类型构建编辑控件，改动即写回 editorProps */
export function buildPropControl(key, def, val) {
  const type = def?.type ?? 'text';
  if (type === 'checkbox') {
    const input = document.createElement('input');
    input.type = 'checkbox'; input.className = 'prop-input';
    input.checked = Boolean(val);
    input.addEventListener('change', () => { editorProps[key] = input.checked; });
    return input;
  }
  if (type === 'select' || type === 'multi') {
    const sel = document.createElement('select');
    sel.className = 'prop-input';
    const opts = def?.options ?? [];
    if (!opts.length) sel.append(new Option('', ''));
    for (const o of opts) sel.append(new Option(o, o));
    if (type === 'multi') sel.multiple = true;
    if (type === 'select') sel.value = (val === null || val === undefined) ? '' : String(val);
    if (type === 'multi' && Array.isArray(val)) {
      for (const opt of sel.options) opt.selected = val.includes(opt.value);
    }
    sel.addEventListener('change', () => {
      editorProps[key] = type === 'multi'
        ? [...sel.selectedOptions].map(o => o.value)
        : sel.value;
    });
    return sel;
  }
  const input = document.createElement('input');
  input.className = 'prop-input';
  if (type === 'number') input.type = 'number';
  else if (type === 'date') input.type = 'date';
  else if (type === 'time') input.type = 'time';
  else input.type = 'text';
  input.value = (val === null || val === undefined) ? '' : String(val);
  input.addEventListener('change', () => {
    editorProps[key] = input.type === 'number' ? Number(input.value) : input.value;
  });
  return input;
}
