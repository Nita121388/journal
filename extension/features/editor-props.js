/**
 * editor-props.js — 编辑器自定义属性（features 层）

属性行渲染、属性控件构建、属性表单（新增/编辑）、属性库复用。
 */

import { propForm, propIcon, propKey, propOptions, propType, propsList } from '../components/dom-refs.js';
import { RESERVED_PROPS } from '../shared/model.js';
import { getPropLibrary, removePropDef, savePropLibrary, upsertPropDef } from '../state/prop-library.js';
import { showToast } from './toast.js';
import { editorProps } from './card-editor.js';

export function renderEditorProps() {
  if (propsList) propsList.replaceChildren();
  const keys = Object.keys(editorProps);
  if (!keys.length && propsList) {
    const hint = document.createElement('div');
    hint.className = 'props-empty';
    hint.textContent = '还没有自定义属性，点上方「＋ 添加属性」';
    propsList.append(hint);
    return;
  }
  for (const [key, val] of Object.entries(editorProps)) {
    const def = getPropLibrary()[key];
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.dataset.key = key;
    const label = document.createElement('span');
    label.className = 'prop-label';
    label.textContent = (def?.icon ? def.icon + ' ' : '') + (def?.label || key);
    label.title = key;
    const ctrl = buildPropControl(key, def, val);
    const edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'prop-edit'; edit.textContent = '✎';
    edit.title = '编辑属性定义（保存到属性库）';
    edit.addEventListener('click', () => openPropForm(key));
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'prop-del'; del.textContent = '✕';
    del.title = '从当前卡片删除该属性（保留属性库定义）';
    del.addEventListener('click', () => { delete editorProps[key]; renderEditorProps(); });
    row.append(label, ctrl, edit, del);
    propsList.append(row);
  }
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

let propEditKey = null;

/** 打开属性表单；defKey 传人则编辑属性库中既有定义 */
export function openPropForm(defKey = null) {
  if (!propForm) return;
  propEditKey = defKey;
  const d = defKey ? getPropLibrary()[defKey] : null;
  if (propKey) propKey.value = d?.key ?? '';
  if (propIcon) propIcon.value = d?.icon && d.icon !== '•' ? d.icon : '';
  if (propType) propType.value = d?.type ?? 'text';
  if (propOptions) propOptions.value = (d?.options || []).join(',');
  const wrap = propOptions?.closest('.prop-options-wrap');
  if (wrap) wrap.classList.toggle('hidden', d?.type !== 'select' && d?.type !== 'multi');
  propForm.classList.remove('hidden');
  propKey?.focus();
}
export function closePropForm() {
  if (propForm) propForm.classList.add('hidden');
  propEditKey = null;
}

/** 添加/编辑属性：校验保留字 → 加入当前卡（自动保存到属性库，便于复用/编辑） */
export function onPropFormOk() {
  const key = (propKey.value || '').trim().replace(/\s+/g, '_');
  if (!key) { showToast('属性名不能为空', 'error'); return; }
  if (RESERVED_PROPS.has(key)) { showToast(`「${key}」是保留字段，不能用作属性名`, 'error'); return; }
  const opts = propOptions.value ? propOptions.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];
  const def = { key, label: key, icon: propIcon.value || '•', type: propType.value, ...(opts.length ? { options: opts } : {}) };
  if (propEditKey && propEditKey !== key) {
    // 编辑且改名：迁移库定义 + 迁移当前卡值
    const oldKey = propEditKey;
    if (oldKey in editorProps) { editorProps[key] = editorProps[oldKey]; delete editorProps[oldKey]; }
    removePropDef(oldKey);
  }
  if (!(key in editorProps)) editorProps[key] = '';
  upsertPropDef(key, def);
  void savePropLibrary();
  const wasEdit = propEditKey !== null;
  renderEditorProps();
  closePropForm();
  propKey.value = ''; propIcon.value = ''; propOptions.value = ''; propType.value = 'text';
  showToast(wasEdit ? `已更新属性「${key}」` : `已添加属性「${key}」（已入库）`, 'success');
}

/** 从属性库复用属性到当前卡 */
export function openPropLibrary() {
  const keys = Object.keys(getPropLibrary());
  if (!keys.length) { showToast('属性库为空', ''); return; }
  const lines = keys.map((k, i) => `${i}. ${getPropLibrary()[k].icon || ''} ${getPropLibrary()[k].label || k}`).join('\n');
  const pick = prompt('从属性库选择（多个用逗号分隔）：\n' + lines, '0');
  if (pick === null) return;
  const idxs = pick.split(/[,，\s]+/).map(s => parseInt(s, 10))
    .filter(n => !Number.isNaN(n) && n >= 0 && n < keys.length);
  for (const i of idxs) { const k = keys[i]; if (!(k in editorProps)) editorProps[k] = ''; }
  renderEditorProps();
}
