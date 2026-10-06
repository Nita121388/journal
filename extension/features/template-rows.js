/**
 * template-rows.js — 模板构建器的属性行（扁平 Notion 式）与行内编辑（features 层）

属性行渲染、拖拽排序、行内改名、LLM 建议、添加行。
 */

import { isReservedKey } from '../shared/field-registry.js';
import { RESERVED_PROPS } from '../shared/model.js';
import { dedupeKey, defaultValueForType, inferProp } from '../shared/prop-infer.js';
import { savePropLibrary, upsertPropDef } from '../state/prop-library.js';
import { getSettings } from '../state/settings.js';
import { inferPropWithLLM } from './prop-llm.js';
import { showToast } from './toast.js';
import {
  buildTplDefaultEditor, openFieldPicker, openPropRowMenu, openRowIconPicker,
  removeExtra, reorderExtra, startAddProp,
} from './template-fields.js';
import { openTplEditProp } from './template-menu.js';
import { REQUIRED_DEFS, isBuiltinKey, renderTemplateBuilder, setReqOverride, tplBuilderState, tplDragKey, tplPropList, typeLabel } from './template-builder.js';

export function buildPropRow(key, def, locked) {
  const row = document.createElement('div');
  row.className = locked ? 'tpl-prop-row is-locked' : 'tpl-prop-row tpl-extra-row';
  row.dataset.key = key;
  if (!locked) row.draggable = true;

  const icon = document.createElement('button');
  icon.type = 'button'; icon.className = 'tpl-prop-icon'; icon.draggable = false;
  icon.textContent = def.icon || '•';
  icon.title = '点击更换图标';
  icon.setAttribute('aria-label', `更换属性「${def.label || key}」的图标`);
  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    openRowIconPicker(icon, def.icon || '', (ch) => applyRowIcon(key, ch, locked));
  });

  const name = document.createElement('span');
  name.className = 'tpl-prop-name'; name.draggable = false;
  name.textContent = def.label || key;
  name.title = `${key}（双击改名）`;
  name.addEventListener('dblclick', (e) => { e.stopPropagation(); startNameEdit(row, name, key, def, locked); });

  const valWrap = document.createElement('div');
  valWrap.className = 'tpl-prop-value';
  valWrap.append(buildTplDefaultEditor({ ...def, key }));

  row.append(icon, name, valWrap);

  if (!locked) {
    const edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'tpl-row-act tpl-row-edit'; edit.draggable = false;
    edit.textContent = '✎'; edit.title = '编辑属性';
    edit.setAttribute('aria-label', `编辑属性「${def.label || key}」`);
    edit.addEventListener('click', (e) => { e.stopPropagation(); openTplEditProp(key); });
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'tpl-row-act tpl-row-del'; del.draggable = false;
    del.textContent = '✕'; del.title = '从模板移除';
    del.setAttribute('aria-label', `从模板移除属性「${def.label || key}」`);
    del.addEventListener('click', (e) => { e.stopPropagation(); removeExtra(key); });
    row.append(edit, del);
    attachDragHandlers(row, key);
  }

  row.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    openPropRowMenu(row, key, def, locked, e.clientX, e.clientY);
  });
  return row;
}

function attachDragHandlers(row, key) {
  const clearOver = () => row.classList.remove('is-drag-over');
  row.addEventListener('dragstart', (e) => { tplDragKey = key; e.dataTransfer.effectAllowed = 'move'; row.classList.add('is-dragging'); document.body.classList.add('tpl-dragging'); });
  row.addEventListener('dragend', () => { tplDragKey = null; row.classList.remove('is-dragging'); document.body.classList.remove('tpl-dragging'); document.querySelectorAll('.tpl-extra-row').forEach(r => r.classList.remove('is-drag-over')); });
  row.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('is-drag-over'); });
  row.addEventListener('dragleave', clearOver);
  row.addEventListener('drop', (e) => { e.preventDefault(); clearOver(); if (tplDragKey && tplDragKey !== key) reorderExtra(tplDragKey, key); });
}

function applyRowIcon(key, char, locked) {
  if (locked) setReqOverride(key, { icon: char });
  else {
    const entry = tplBuilderState.extra.find(x => x.key === key);
    if (entry) entry.def.icon = char;
  }
  markUserTouched(key);
  renderTemplateBuilder();
}

/* ── 行内名称编辑（双击改名 / 新建属性命名） ────────────────── */

/** 通用行内名称编辑器：Enter / blur 提交，Esc 取消 */
function openNameEditor(row, nameEl, { initial, onCommit, onCancel, onInput }) {
  if (row.querySelector('.tpl-prop-name-input')) return;
  const input = document.createElement('input');
  input.type = 'text'; input.className = 'tpl-prop-name-input';
  input.maxLength = 24; input.autocomplete = 'off';
  input.setAttribute('aria-label', '属性名');
  input.draggable = false;
  input.value = initial;
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const next = input.value.trim();
    if (commit && next && next !== initial) {
      // onCommit 返回 false 表示拒绝（保留字等），保持编辑态不重建
      if (onCommit?.(next) === false) { done = false; return; }
    } else onCancel?.();
    renderTemplateBuilder();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  if (onInput) input.addEventListener('input', () => onInput(input.value));
  nameEl.replaceWith(input);
  input.focus();
  input.select();
}

/** 已有行改名：只改显示名，key 永不变（已有卡片数据不丢） */
export function startNameEdit(row, nameEl, key, def, locked) {
  openNameEditor(row, nameEl, {
    initial: def.label || key,
    onCommit: (next) => {
      markUserTouched(key);
      if (locked) { setReqOverride(key, { label: next }); return; }
      const entry = tplBuilderState.extra.find(x => x.key === key);
      if (entry) entry.def.label = next;
    },
  });
}

/** 新建属性命名：输入过程实时推断图标 / 类型 / 选项；提交时用属性名作 key 并入库 */
export function startNewNameEdit(row, nameEl, entry) {
  const usedKeys = () => [
    ...REQUIRED_DEFS.map(d => d.key),
    ...tplBuilderState.extra.filter(x => x !== entry).map(x => x.key),
  ];
  openNameEditor(row, nameEl, {
    initial: entry.def.label,
    onInput: (val) => {
      const g = inferProp(val, { existingKeys: usedKeys() });
      const typeChanged = g.type !== entry.def.type;
      entry.def.icon = g.icon;
      entry.def.type = g.type;
      if (g.options) entry.def.options = g.options; else delete entry.def.options;
      if (typeChanged) tplBuilderState.values[entry.key] = g.defaultValue;
      // 局部刷新（不重建列表，避免打断输入焦点）
      const iconEl = row.querySelector('.tpl-prop-icon');
      if (iconEl) iconEl.textContent = g.icon;
      const valWrap = row.querySelector('.tpl-prop-value');
      if (valWrap) valWrap.replaceChildren(buildTplDefaultEditor({ ...entry.def, key: entry.key }));
    },
    onCommit: (next) => {
      // 保留字段拦截：用户命名本身就是保留字时，提示且不采用
      // （dedupeKey 会加后缀绕过，故这里先判原始名；isReservedKey 统一覆盖内建 key + RESERVED_PROPS）
      if (isReservedKey(next, RESERVED_PROPS)) {
        showToast(`「${next}」是保留字段，不能用作属性名`, 'error');
        return false;
      }
      const finalKey = dedupeKey(next, usedKeys());
      if (finalKey !== entry.key) {
        tplBuilderState.values[finalKey] = tplBuilderState.values[entry.key] ?? defaultValueForType(entry.def.type);
        delete tplBuilderState.values[entry.key];
        entry.key = finalKey;
        entry.def.key = finalKey;
      }
      entry.def.label = next;
      if (!isBuiltinKey(finalKey)) {
        upsertPropDef(finalKey, { ...entry.def });
        void savePropLibrary();
      }
      // 后台 LLM 增强（不阻塞：本地结果已应用，到达后以「AI 建议」提示）
      // 注意：提交后 openNameEditor 会重建列表，旧 row 已失效，须按 key 重查
      setTimeout(() => {
        const freshRow = tplPropList?.querySelector(`[data-key="${finalKey}"]`);
        void requestLlmSuggestion(freshRow, entry);
      }, 0);
    },
    onCancel: () => {
      tplBuilderState.extra = tplBuilderState.extra.filter(x => x !== entry);
      delete tplBuilderState.values[entry.key];
    },
  });
}

/* ── LLM 增强建议（后台异步，不覆盖用户） ─────────────────── */

/** 标记行「用户手动改过」→ 不再提示 AI 建议（按 key 存储，跨重建保留） */
export const tplUserTouched = new Set();
export function markUserTouched(key) {
  tplUserTouched.add(key);
}

/** 行是否被用户手动改过 */
function isUserTouched(key) {
  return tplUserTouched.has(key);
}

/**
 * 新建属性提交后（或手动「✨ AI 重新推断」），按触发策略决定是否后台调 LLM；
 * 结果到达且条件满足时，在行尾渲染「✨ AI 建议」徽标（采纳/忽略）。
 * @param {HTMLElement} row 行 DOM（可能因重建失效，函数内会重查）
 * @param {{key:string, def:object}} entry 属性条目
 * @param {{force?:boolean}} [opts] force=true 时绕过 auto（即使高置信也问 LLM）
 */
export async function requestLlmSuggestion(row, entry, { force = false } = {}) {
  if (!entry) return;
  const settings = await getSettings().catch(() => null);
  const mode = settings?.ai?.inferMode ?? 'auto';
  const res = await inferPropWithLLM(entry.def.label || entry.key, { mode, force });

  // 提交后行可能被重建 → 按 key 重查当前行
  const cur = tplPropList?.querySelector(`[data-key="${entry.key}"]`);
  if (!cur) return;                       // 行已被移除 → 放弃
  if (isUserTouched(entry.key)) return;   // 用户已手动改过 → 不打扰
  if (res.source !== 'llm' && res.source !== 'cached') return; // 本地/兜底 → 无建议
  if (!res.llm) return;

  // 与当前类型/选项不同才有建议价值
  const cur2 = entry.def;
  const same = res.llm.type === cur2.type
    && JSON.stringify(res.llm.options ?? null) === JSON.stringify(cur2.options ?? null);
  if (same) return;

  renderLlmSuggestion(cur, entry, res.llm);
}

/** 渲染 AI 建议徽标（DOM API，无 innerHTML） */
function renderLlmSuggestion(row, entry, llmDef) {
  row.querySelector('.tpl-llm-suggestion')?.remove();
  const badge = document.createElement('span');
  badge.className = 'tpl-llm-suggestion';

  const txt = document.createElement('span');
  txt.className = 'tpl-llm-text';
  txt.setAttribute('role', 'status');   // 只对文本做 live region，不包裹按钮
  txt.setAttribute('aria-live', 'polite');
  const typeName = typeLabel(llmDef.type);
  txt.textContent = llmDef.options?.length
    ? `✨ AI 建议：${typeName}（${llmDef.options.slice(0, 3).join(' / ')}${llmDef.options.length > 3 ? '…' : ''}）`
    : `✨ AI 建议：${typeName}`;

  const accept = document.createElement('button');
  accept.type = 'button'; accept.className = 'tpl-llm-act';
  accept.draggable = false;
  accept.textContent = '采纳';
  accept.title = '采用 AI 推断的类型与选项';
  accept.addEventListener('click', () => {
    applyLlmSuggestion(row, entry, llmDef);
    badge.remove();
  });

  const ignore = document.createElement('button');
  ignore.type = 'button'; ignore.className = 'tpl-llm-act tpl-llm-ignore';
  ignore.draggable = false;
  ignore.textContent = '忽略';
  ignore.title = '保持当前设置';
  ignore.addEventListener('click', () => badge.remove());

  badge.append(txt, accept, ignore);
  row.append(badge);
}

/** 采纳 AI 建议：应用类型/选项，重置默认值为该类型空值 */
function applyLlmSuggestion(row, entry, llmDef) {
  entry.def.type = llmDef.type;
  if (llmDef.options?.length) entry.def.options = [...llmDef.options];
  else delete entry.def.options;
  if (llmDef.icon && llmDef.icon !== '•') entry.def.icon = llmDef.icon;
  tplBuilderState.values[entry.key] = defaultValueForType(llmDef.type);
  markUserTouched(entry.key);
  renderTemplateBuilder();
  showToast(`已应用 AI 建议：${typeLabel(llmDef.type)}`, '');
}

/* ── 一行式添加行 ─────────────────────────────────────────── */

export function buildAddRow() {
  // 分裂按钮：主体 = 新建属性（行为不变）；▾ = 从现有字段选择
  const wrap = document.createElement('div');
  wrap.className = 'tpl-add-row-wrap';

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'tpl-prop-row tpl-add-row tpl-add-main';
  main.title = '新增一行属性';
  main.setAttribute('aria-label', '添加属性');
  const ico = document.createElement('span'); ico.className = 'tpl-add-ico'; ico.textContent = '＋';
  const txt = document.createElement('span'); txt.className = 'tpl-add-text'; txt.textContent = '添加属性';
  main.append(ico, txt);
  main.addEventListener('click', startAddProp);

  const caret = document.createElement('button');
  caret.type = 'button';
  caret.className = 'tpl-add-caret';
  caret.title = '从现有属性选择';
  caret.setAttribute('aria-label', '从现有属性选择');
  caret.innerHTML = '<span aria-hidden="true">▾</span>';
  caret.addEventListener('click', (e) => { e.stopPropagation(); openFieldPicker(caret); });

  wrap.append(main, caret);
  return wrap;
}
