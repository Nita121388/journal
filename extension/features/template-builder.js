/**
 * template-builder.js — 模板构建器（features 层）
 *
 * 模板（一组字段定义）的增删改查、扁平 Notion 式属性行、字段选择器、
 * 属性行右键菜单、行内图标选择、默认值编辑器、从模板建卡。
 * 模板与属性库存 host meta。
 */

import { els } from '../components/dom-refs.js';
import { editingCardId, editorEmoji, openEditor } from './card-editor.js';
import { recordRecentEmoji, renderEmojiPicker } from './emoji.js';
import { inferPropWithLLM } from './prop-llm.js';
import { showToast } from './toast.js';
import { getFieldDef, isReservedKey, listFieldDefs, writeValueToCard } from '../shared/field-registry.js';
import { RESERVED_PROPS, currentTime } from '../shared/model.js';
import { PROP_TYPES, dedupeKey, defaultValueForType, inferProp } from '../shared/prop-infer.js';
import { actions } from '../state/actions.js';
import { getHostMeta, setHostMeta } from '../state/host-client.js';
import { savePropLibrary, upsertPropDef } from '../state/prop-library.js';
import { createCardEntry } from '../state/repository.js';
import { getSettings } from '../state/settings.js';
import { vs } from '../state/view-state.js';
const REQUIRED_DEFS = listFieldDefs({ required: true });
/** 是否内建字段（注册表 source==='builtin'） */
export function isBuiltinKey(key) { return getFieldDef(key)?.source === 'builtin'; }

const tplBuilderName = document.getElementById('tpl-builder-name');
const tplBuilderEmoji = document.getElementById('tpl-builder-emoji');
const tplBuilderPicker = document.getElementById('tpl-builder-picker');
const tplPropList = document.getElementById('tpl-prop-list');
const tplNpKey = document.getElementById('tpl-np-key');
const tplNpLabel = document.getElementById('tpl-np-label');
const tplNpIcon = document.getElementById('tpl-np-icon');
export const tplNpType = document.getElementById('tpl-np-type');
export const tplNpOptions = document.getElementById('tpl-np-options');
const tplNpOk = document.getElementById('tpl-np-ok');
const tplNpCancel = document.getElementById('tpl-np-cancel');
const tplNpIconTile = document.getElementById('tpl-np-icon-tile');
const tplNpIconPreview = document.getElementById('tpl-np-icon-preview');
const tplNpIconPicker = document.getElementById('tpl-np-icon-picker');

// 模板构建器：属性图标 emoji 选择器（复用现有 picker）
let tplNpIconCleanup = null;
function openTplNpIconPicker() {
  if (!tplNpIconPicker || !tplNpIconTile) return;
  tplNpIconPicker.classList.remove('hidden');
  tplNpIconCleanup?.();
  tplNpIconCleanup = renderEmojiPicker(tplNpIconPicker, (char) => {
    if (tplNpIcon) tplNpIcon.value = char;
    if (tplNpIconPreview) tplNpIconPreview.textContent = char || '•';
    recordRecentEmoji(char);
    closeTplNpIconPicker();
  }, { selected: tplNpIcon?.value || '' });
}
function closeTplNpIconPicker() {
  tplNpIconPicker?.classList.add('hidden');
  tplNpIconCleanup?.();
  tplNpIconCleanup = null;
}
tplNpIconTile?.addEventListener('click', openTplNpIconPicker);
export const tplPropOverlay = document.getElementById('tpl-prop-overlay');
const tplPropDialogTitle = document.getElementById('tpl-prop-dialog-title');

/** 打开属性编辑弹窗（新建 / 编辑共用） */
export function openTplPropDialog(title) {
  if (!tplPropOverlay) return;
  if (tplPropDialogTitle) tplPropDialogTitle.textContent = title;
  tplPropOverlay.classList.remove('hidden');
}

/** 关闭属性编辑弹窗 */
export function closeTplPropDialog() {
  if (tplPropOverlay) tplPropOverlay.classList.add('hidden');
  tplEditKey = null;
}
tplPropOverlay?.addEventListener('click', (e) => {
  if (e.target === tplPropOverlay) closeTplPropDialog();
});
document.getElementById('tpl-prop-close')?.addEventListener('click', closeTplPropDialog);
/** 构建器状态：extra 为有序可选属性 [{key, def}]，values 存默认值 */
let tplBuilderState = { name: '', emoji: '🗂️', extra: [], values: {}, reqOv: {} };
let tplBuilderCleanup = null;
let tplEditingId = null;   // 编辑既有模板时的 id
let tplEditKey = null;     // 编辑属性定义时的 key
let tplDragKey = null;     // 排序拖拽中的 key

/** 找属性定义：统一走注册表（内建 + 属性库） */
export function findPropDef(key) { return getFieldDef(key); }

/** 模板 → 有序 fields（兼容旧扁平 propsDefaults 结构；确保必备三件套 title/content/tags 在最前） */
export function normalizeTemplateFields(tpl) {
  let fields;
  if (Array.isArray(tpl?.fields)) {
    fields = tpl.fields.filter(f => f && f.key).map(f => ({ ...f }));
  } else {
    const out = [];
    const push = (key, value) => { if (value !== undefined && value !== null && value !== '') out.push({ key, value }); };
    push('title', tpl?.title);
    push('status', tpl?.status);
    push('progress', tpl?.progress);
    push('duration', tpl?.duration);
    push('project', tpl?.project);
    if (Array.isArray(tpl?.tags) && tpl.tags.length) push('tags', tpl.tags);
    for (const [k, v] of Object.entries(tpl?.propsDefaults ?? {})) push(k, v);
    fields = out;
  }
  const have = new Set(fields.map(f => f.key));
  for (const def of REQUIRED_DEFS) {
    if (!have.has(def.key)) fields.push({ key: def.key, value: defaultTplValue(def) });
  }
  const reqOrder = REQUIRED_DEFS.map(d => d.key);
  const reqFields = reqOrder.map(k => fields.find(f => f.key === k)).filter(Boolean);
  const optFields = fields.filter(f => !reqOrder.includes(f.key));
  return [...reqFields, ...optFields];
}

/** 打开模板构建器；existing 传人则编辑既有模板 */
export function openTemplateBuilder(existing = null) {
  tplEditingId = existing?.id ?? null;
  tplBuilderState = { name: existing?.name ?? '', emoji: existing?.emoji ?? (editorEmoji || '🗂️'), extra: [], values: {}, reqOv: {} };
  if (existing) {
    for (const f of normalizeTemplateFields(existing)) {
      if (REQUIRED_DEFS.some(d => d.key === f.key)) {
        tplBuilderState.values[f.key] = f.value;
        if (f.label || f.icon) tplBuilderState.reqOv[f.key] = { label: f.label, icon: f.icon };
        continue;
      }
      const base = findPropDef(f.key);
      tplBuilderState.extra.push({
        key: f.key,
        def: {
          key: f.key,
          label: f.label ?? base?.label ?? f.key,
          icon: f.icon ?? base?.icon ?? '•',
          type: f.type ?? base?.type ?? 'text',
          ...(f.options ? { options: f.options } : (base?.options ? { options: base.options } : {})),
        },
      });
      tplBuilderState.values[f.key] = f.value;
    }
  }
  if (tplBuilderName) tplBuilderName.value = tplBuilderState.name;
  if (tplBuilderEmoji) tplBuilderEmoji.textContent = tplBuilderState.emoji;
  renderTemplateBuilder();
  document.getElementById('template-builder-overlay').classList.remove('hidden');
  tplBuilderName?.focus();
  tplBuilderName?.select();
}
export function closeTemplateBuilder() {
  document.getElementById('template-builder-overlay').classList.add('hidden');
  closePropRowMenu();
  closeRowIconPicker();
  closeTplPropDialog();
  if (tplBuilderPicker) tplBuilderPicker.classList.add('hidden');
  tplBuilderCleanup?.();
  tplEditingId = null;
  tplEditKey = null;
  tplUserTouched.clear();
}

/* ─── 模板构建器：属性行（扁平 · Notion 式） ───────────────────── */

/** 内置三件套的显示名/图标覆盖（key 永不改变，仅展示层） */
function reqOverride(key) { return tplBuilderState.reqOv?.[key] || {}; }
function setReqOverride(key, patch) {
  if (!tplBuilderState.reqOv) tplBuilderState.reqOv = {};
  tplBuilderState.reqOv[key] = { ...(tplBuilderState.reqOv[key] || {}), ...patch };
}
/** 合并覆盖后的展示定义 */
function effectiveDef(base) {
  const ov = reqOverride(base.key);
  return { ...base, label: ov.label || base.label, icon: ov.icon || base.icon };
}
function typeLabel(v) { return PROP_TYPES.find(t => t.value === v)?.label || v || '文本'; }

/** 渲染构建器：扁平列表 = 内置行 + 自定义行 + 一行式添加行（无分组边框 / 无标题） */
export function renderTemplateBuilder() {
  if (!tplPropList) return;
  closePropRowMenu();
  closeFieldPicker();
  closeRowIconPicker();
  tplPropList.replaceChildren();
  for (const def of REQUIRED_DEFS) tplPropList.append(buildPropRow(def.key, effectiveDef(def), true));
  for (const entry of tplBuilderState.extra) tplPropList.append(buildPropRow(entry.key, entry.def, false));
  tplPropList.append(buildAddRow());
}

/** 属性行：图标(点击换) + 名称(双击改) + 默认值(可编辑) + 悬停操作 + 右键菜单 */
function buildPropRow(key, def, locked) {
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
function startNameEdit(row, nameEl, key, def, locked) {
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
function startNewNameEdit(row, nameEl, entry) {
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
const tplUserTouched = new Set();
function markUserTouched(key) {
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
async function requestLlmSuggestion(row, entry, { force = false } = {}) {
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

function buildAddRow() {
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

/* ── 现有字段选择浮层（内建可选 + 属性库）─────────────────── */

export let fieldPickerEl = null;
let fieldPickerCleanup = null;

export function closeFieldPicker() {
  fieldPickerCleanup?.();
  fieldPickerCleanup = null;
  fieldPickerEl?.remove();
  fieldPickerEl = null;
}

/** 模板里已占用的 key（必选锁定行 + 已加入的 extra） */
function tplUsedKeys() {
  return new Set([...REQUIRED_DEFS.map(d => d.key), ...tplBuilderState.extra.map(e => e.key)]);
}

/** 选中一个现有字段 → 加入模板 */
function addExistingPropToTemplate(def) {
  if (tplBuilderState.extra.some(e => e.key === def.key)) { showToast(`「${def.label}」已在模板中`, ''); return; }
  tplBuilderState.extra.push({ key: def.key, def: { ...def } });
  tplBuilderState.values[def.key] = defaultValueForType(def.type);
  closeFieldPicker();
  renderTemplateBuilder();
  showToast(`已添加属性「${def.label || def.key}」`, 'success');
}

export function openFieldPicker(anchor) {
  closeFieldPicker();
  const menu = document.createElement('div');
  menu.className = 'tpl-ctx-menu tpl-field-picker';
  fieldPickerEl = menu;

  const used = tplUsedKeys();
  const group = (title) => {
    const h = document.createElement('div');
    h.className = 'tpl-picker-group';
    h.textContent = title;
    return h;
  };
  const defItem = (def) => {
    const added = used.has(def.key);
    const label = `${def.icon || ''} ${def.label || def.key}`;
    const item = ctxItem(added ? `${label}  ✓` : label, () => {
      if (added) { showToast(`「${def.label || def.key}」已在模板中`, ''); return; }
      addExistingPropToTemplate(def);
    });
    if (added) item.disabled = true;
    return item;
  };

  // 顶部：新建（默认高亮）
  const newItem = ctxItem('＋ 新建自定义属性…', () => { closeFieldPicker(); startAddProp(); });
  newItem.classList.add('is-active');
  menu.append(newItem, menuSep());

  // 内建可选
  const optional = listFieldDefs({ source: 'builtin', required: false });
  if (optional.length) {
    menu.append(group('内建可选'));
    for (const def of optional) menu.append(defItem(def));
  }

  // 属性库
  const userDefs = listFieldDefs({ source: 'user' });
  menu.append(menuSep(), group('属性库'));
  if (userDefs.length) for (const def of userDefs) menu.append(defItem(def));
  else {
    const empty = document.createElement('div');
    empty.className = 'tpl-picker-empty';
    empty.textContent = '（空）';
    menu.append(empty);
  }

  document.body.append(menu);
  // 定位：贴 anchor 下方，超出视口则上翻
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8)) + 'px';
  const onDown = (e) => { if (!menu.contains(e.target) && e.target !== anchor) closeFieldPicker(); };
  const onKey = (e) => { if (e.key === 'Escape') closeFieldPicker(); };
  setTimeout(() => {
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
  }, 0);
  fieldPickerCleanup = () => {
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('keydown', onKey);
  };
}

/** 新增属性：先给一个默认行，再进入命名编辑（输入即自动推断） */
function startAddProp() {
  const used = [...REQUIRED_DEFS.map(d => d.key), ...tplBuilderState.extra.map(x => x.key)];
  const seed = inferProp('新属性', { existingKeys: used });
  const entry = {
    key: seed.key,
    def: { key: seed.key, label: '新属性', icon: seed.icon, type: seed.type, ...(seed.options ? { options: seed.options } : {}) },
  };
  tplBuilderState.extra.push(entry);
  tplBuilderState.values[entry.key] = seed.defaultValue;
  renderTemplateBuilder();
  const rows = tplPropList.querySelectorAll('.tpl-extra-row');
  const row = rows[rows.length - 1];
  const nameEl = row?.querySelector('.tpl-prop-name');
  if (row && nameEl) startNewNameEdit(row, nameEl, entry);
}

/* ── 排序 / 移除 ──────────────────────────────────────────── */

function reorderExtra(from, to) {
  const arr = tplBuilderState.extra;
  const i = arr.findIndex(x => x.key === from);
  const j = arr.findIndex(x => x.key === to);
  if (i < 0 || j < 0) return;
  const [it] = arr.splice(i, 1);
  arr.splice(j, 0, it);
  renderTemplateBuilder();
}
function moveExtra(key, dir) {
  const arr = tplBuilderState.extra;
  const i = arr.findIndex(x => x.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return;
  const [it] = arr.splice(i, 1);
  arr.splice(j, 0, it);
  renderTemplateBuilder();
}
function removeExtra(key) {
  tplBuilderState.extra = tplBuilderState.extra.filter(x => x.key !== key);
  delete tplBuilderState.values[key];
  renderTemplateBuilder();
}

/** 修改属性类型：旧默认值不再适用 → 重置为该类型空值 */
function changePropType(key, type) {
  const entry = tplBuilderState.extra.find(x => x.key === key);
  if (!entry || entry.def.type === type) return;
  const label = entry.def.label || key;
  entry.def.type = type;
  if (type !== 'select' && type !== 'multi' && type !== 'status') delete entry.def.options;
  tplBuilderState.values[key] = defaultValueForType(type);
  markUserTouched(key);
  renderTemplateBuilder();
  showToast(`已将「${label}」改为${typeLabel(type)}`, '');
}

/* ── 行右键菜单 ───────────────────────────────────────────── */

export let propRowMenuEl = null;
let propRowMenuCleanup = null;

export function closePropRowMenu() {
  propRowMenuCleanup?.();
  propRowMenuCleanup = null;
  propRowMenuEl?.remove();
  propRowMenuEl = null;
}
function menuSep() { const s = document.createElement('div'); s.className = 'tpl-ctx-sep'; return s; }
function ctxItem(text, onClick, cls = '') {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'tpl-ctx-item' + (cls ? ' ' + cls : '');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

export function openPropRowMenu(row, key, def, locked, x, y) {
  closePropRowMenu();
  const menu = document.createElement('div');
  menu.id = 'tpl-prop-menu';
  menu.className = 'tpl-ctx-menu';
  propRowMenuEl = menu;

  const buildActions = () => {
    menu.replaceChildren();
    menu.append(ctxItem(locked ? '编辑属性（名称 / 图标）' : '编辑属性…', () => {
      closePropRowMenu();
      const n = row.querySelector('.tpl-prop-name');
      if (locked) { if (n) startNameEdit(row, n, key, def, true); }
      else openTplEditProp(key);
    }));
    if (locked) return;
    menu.append(ctxItem(`修改属性类型（当前：${typeLabel(def.type)}）▸`, () => buildTypes(), 'tpl-ctx-sub'));
    menu.append(ctxItem('✨ AI 重新推断', () => {
      closePropRowMenu();
      const entry = tplBuilderState.extra.find(x => x.key === key);
      if (entry) void requestLlmSuggestion(row, entry, { force: true });
    }, 'tpl-ctx-ai'));
    menu.append(menuSep());
    const up = ctxItem('↑ 上移', () => { closePropRowMenu(); moveExtra(key, -1); });
    const down = ctxItem('↓ 下移', () => { closePropRowMenu(); moveExtra(key, 1); });
    if (tplBuilderState.extra[0]?.key === key) up.disabled = true;
    if (tplBuilderState.extra[tplBuilderState.extra.length - 1]?.key === key) down.disabled = true;
    menu.append(up, down);
    menu.append(menuSep());
    menu.append(ctxItem('✕ 从模板移除', () => { closePropRowMenu(); removeExtra(key); }, 'tpl-ctx-del'));
  };

  const buildTypes = () => {
    menu.replaceChildren();
    const back = ctxItem('‹ 返回', () => buildActions(), 'tpl-ctx-back');
    menu.append(back, menuSep());
    for (const t of PROP_TYPES) {
      menu.append(ctxItem(`${t.value === def.type ? '●' : '○'} ${t.label}`, () => {
        closePropRowMenu();
        changePropType(key, t.value);
      }, t.value === def.type ? 'is-active' : ''));
    }
  };

  buildActions();
  document.body.append(menu);
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8)) + 'px';
  const onDown = (e) => { if (!menu.contains(e.target)) closePropRowMenu(); };
  const onKey = (e) => { if (e.key === 'Escape') closePropRowMenu(); };
  setTimeout(() => {
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
  }, 0);
  propRowMenuCleanup = () => {
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('keydown', onKey);
  };
}

/* ── 行内图标选择器（浮层） ───────────────────────────────── */

export let rowIconPop = null;
let rowIconCleanup = null;

export function closeRowIconPicker() {
  rowIconCleanup?.();
  rowIconCleanup = null;
  rowIconPop?.remove();
  rowIconPop = null;
}

export function openRowIconPicker(anchor, current, onPick) {
  closeRowIconPicker();
  const pop = document.createElement('div');
  pop.className = 'tpl-prop-icon-pop';
  rowIconPop = pop;
  document.body.append(pop);
  const pickerCleanup = renderEmojiPicker(pop, (char) => {
    recordRecentEmoji(char);
    onPick(char);
    closeRowIconPicker();
  }, { selected: current || '' });
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = Math.min(r.bottom + 4, Math.max(8, window.innerHeight - pop.offsetHeight - 8)) + 'px';
  const onDown = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) closeRowIconPicker(); };
  const onKey = (e) => { if (e.key === 'Escape') closeRowIconPicker(); };
  setTimeout(() => {
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
  }, 0);
  rowIconCleanup = () => {
    pickerCleanup?.();
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('keydown', onKey);
  };
}

/** 按属性类型构建默认值编辑器，改动写入 tplBuilderState.values */
export function buildTplDefaultEditor(def) {
  const key = def.key;
  const set = (v) => { tplBuilderState.values[key] = v; };
  const cur = tplBuilderState.values[key];
  if (def.type === 'status' || def.type === 'select') {
    const sel = document.createElement('select'); sel.className = 'prop-input';
    sel.append(new Option('', ''));
    for (const o of def.options || []) sel.append(new Option(o, o));
    sel.value = cur ?? '';
    sel.addEventListener('change', () => set(sel.value));
    return sel;
  }
  if (def.type === 'multi') {
    const sel = document.createElement('select'); sel.className = 'prop-input'; sel.multiple = true;
    for (const o of def.options || []) sel.append(new Option(o, o));
    if (Array.isArray(cur)) for (const op of sel.options) op.selected = cur.includes(op.value);
    sel.addEventListener('change', () => set([...sel.selectedOptions].map(o => o.value)));
    return sel;
  }
  if (def.type === 'checkbox') {
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'prop-input'; cb.checked = Boolean(cur);
    cb.addEventListener('change', () => set(cb.checked));
    return cb;
  }
  if (def.type === 'schedule') {
    const v = cur && typeof cur === 'object' ? cur : {};
    const w = document.createElement('div'); w.className = 'tpl-schedule';
    const s = document.createElement('input'); s.type = 'time'; s.className = 'prop-input'; s.value = v.start || ''; s.title = '开始';
    const e = document.createElement('input'); e.type = 'time'; e.className = 'prop-input'; e.value = v.end || ''; e.title = '结束';
    const d = document.createElement('input'); d.type = 'number'; d.className = 'prop-input'; d.min = 0; d.value = v.duration ?? ''; d.title = '时长(分)';
    const sync = () => set({ start: s.value, end: e.value, duration: d.value === '' ? null : Number(d.value) });
    [s, e, d].forEach(x => x.addEventListener('change', sync));
    w.append(s, e, d);
    return w;
  }
  if (def.type === 'tags') {
    const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'prop-input'; inp.placeholder = '逗号分隔';
    inp.value = Array.isArray(cur) ? cur.join(', ') : (cur ?? '');
    inp.addEventListener('change', () => set(inp.value.trim() ? inp.value.split(/[,，]/).map(x => x.trim()).filter(Boolean) : []));
    return inp;
  }
  if (def.type === 'textarea') {
    const ta = document.createElement('textarea');
    ta.className = 'prop-input'; ta.rows = 2;
    ta.value = (cur === null || cur === undefined) ? '' : String(cur);
    ta.addEventListener('change', () => set(ta.value));
    return ta;
  }
  const inp = document.createElement('input');
  inp.type = def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : def.type === 'time' ? 'time' : 'text';
  inp.className = 'prop-input';
  inp.value = (cur === null || cur === undefined) ? '' : String(cur);
  inp.addEventListener('change', () => set(inp.type === 'number' ? Number(inp.value) : inp.value));
  return inp;
}

/** 默认值兜底 */
export function defaultTplValue(def) {
  if (def.type === 'status' || def.type === 'select') return '';
  if (def.type === 'checkbox') return false;
  if (def.type === 'tags') return [];
  if (def.type === 'schedule') return null;
  return '';
}

/** 保存 / 更新模板 */
export async function saveTemplateBuilder() {
  const name = (tplBuilderName?.value || '').trim();
  if (!name) { showToast('模板名称不能为空', 'error'); return; }
  const requiredFields = REQUIRED_DEFS.map(def => {
    const f = { key: def.key, value: tplBuilderState.values[def.key] ?? defaultTplValue(def) };
    const ov = tplBuilderState.reqOv?.[def.key] || {};
    if (ov.label && ov.label !== def.label) f.label = ov.label;
    if (ov.icon && ov.icon !== def.icon) f.icon = ov.icon;
    return f;
  });
  const extraFields = tplBuilderState.extra.map(e => {
    const f = { key: e.key, value: tplBuilderState.values[e.key] ?? defaultTplValue(e.def) };
    const base = findPropDef(e.key);
    const ov = {};
    if (e.def.label && e.def.label !== e.key && e.def.label !== base?.label) ov.label = e.def.label;
    if (e.def.icon && e.def.icon !== '•' && e.def.icon !== base?.icon) ov.icon = e.def.icon;
    if (e.def.type && e.def.type !== base?.type) ov.type = e.def.type;
    if (e.def.options && JSON.stringify(e.def.options) !== JSON.stringify(base?.options ?? [])) ov.options = e.def.options;
    return Object.assign(f, ov);
  });
  const fields = [...requiredFields, ...extraFields];
  const tpl = { id: tplEditingId || ('t_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)), name, emoji: tplBuilderState.emoji, fields };
  const templates = (await getHostMeta('templates')) || [];
  const idx = templates.findIndex(t => t.id === tpl.id);
  const next = idx === -1 ? [...templates, tpl] : templates.map(t => (t.id === tpl.id ? tpl : t));
  await setHostMeta('templates', next);
  closeTemplateBuilder();
  showToast(idx === -1 ? '✅ 已保存模板：' + name : '✅ 已更新模板：' + name, 'success');
}

/** 以当前卡片为蓝本预填构建器 */
export function prefillTemplateFromCard() {
  const card = editingCardId ? vs.allCardsCache.find(c => c.id === editingCardId) : null;
  if (!card) { showToast('没有正在编辑的卡片', ''); return; }
  tplBuilderState = { name: tplBuilderState.name, emoji: card.emoji || tplBuilderState.emoji, extra: [], values: {}, reqOv: {} };
  const putReq = (key, value) => { if (value !== undefined && value !== null && value !== '') tplBuilderState.values[key] = value; };
  const putOpt = (key, value) => {
    if (value !== undefined && value !== null && value !== '' && !tplBuilderState.extra.some(x => x.key === key)) {
      const def = findPropDef(key);
      if (def) { tplBuilderState.extra.push({ key, def }); tplBuilderState.values[key] = value; }
    }
  };
  putReq('title', card.title);
  putReq('content', card.content);
  putReq('tags', (card.tags && card.tags.length) ? card.tags : []);
  putOpt('status', card.status && card.status !== 'none' ? card.status : undefined);
  putOpt('progress', card.progress);
  putOpt('priority', card.priority && card.priority !== 'medium' ? card.priority : undefined);
  putOpt('assignedDate', card.assignedDate);
  if (card.startTime || card.endTime || card.duration) putOpt('schedule', { start: card.startTime || '', end: card.endTime || '', duration: card.duration ?? null });
  putOpt('project', card.project);
  for (const [k, v] of Object.entries(card.props || {})) putOpt(k, v);
  if (tplBuilderName) tplBuilderName.value = tplBuilderState.name;
  if (tplBuilderEmoji) tplBuilderEmoji.textContent = tplBuilderState.emoji;
  renderTemplateBuilder();
}

/** 构建器内新建属性（打开表单） */
/** 编辑可选属性的定义（内建=仅此模板覆盖；自定义=写回属性库） */
function openTplEditProp(key) {
  const entry = tplBuilderState.extra.find(x => x.key === key);
  if (!entry) return;
  tplEditKey = key;
  const isBuiltin = isBuiltinKey(key);
  const disp = entry.def.label && entry.def.label !== key ? entry.def.label : '';
  if (tplNpLabel) tplNpLabel.value = disp;
  if (tplNpKey) { tplNpKey.value = key; tplNpKey.disabled = true; tplNpKey.title = '属性键在编辑时不可改（避免破坏已有数据）'; }
  if (tplNpIcon) tplNpIcon.value = (entry.def.icon && entry.def.icon !== '•') ? entry.def.icon : '';
  if (tplNpIconPreview) tplNpIconPreview.textContent = tplNpIcon.value || '•';
  if (tplNpType) tplNpType.value = entry.def.type || 'text';
  if (tplNpOptions) tplNpOptions.value = (entry.def.options || []).join(',');
  const wrap = tplNpOptions?.closest('.prop-options-wrap');
  if (wrap) wrap.classList.toggle('hidden', entry.def.type !== 'select' && entry.def.type !== 'multi');
  if (tplNpOk) tplNpOk.textContent = isBuiltin ? '保存（仅此模板）' : '保存到属性库';
  openTplPropDialog(`编辑属性「${key}」`);
  tplNpLabel?.focus();
}

/** 新建/编辑属性提交 */
export function onTplNewPropOk() {
  if (tplEditKey) {
    const key = tplEditKey;
    const opts = tplNpOptions?.value ? tplNpOptions.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];
    const def = { key, label: tplNpLabel?.value.trim() || key, icon: tplNpIcon?.value || '•', type: tplNpType?.value || 'text', ...(opts.length ? { options: opts } : {}) };
    const entry = tplBuilderState.extra.find(x => x.key === key);
    if (entry) entry.def = def;
    if (!isBuiltinKey(key)) { upsertPropDef(key, def); void savePropLibrary(); }
    closeTplPropDialog();
    renderTemplateBuilder();
    showToast(`已更新属性「${key}」`, 'success');
    return;
  }
  addTplNewProp();
}

/** 新建属性：造定义 → 入库 + 加入模板 */
export function addTplNewProp() {
  const key = (tplNpKey?.value || '').trim().replace(/\s+/g, '_');
  if (!key) { showToast('属性名不能为空', 'error'); return; }
  if (RESERVED_PROPS.has(key)) { showToast(`「${key}」是保留字段，不能用作属性名`, 'error'); return; }
  const opts = tplNpOptions?.value ? tplNpOptions.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];
  const def = { key, label: tplNpLabel?.value.trim() || key, icon: tplNpIcon?.value || '•', type: tplNpType?.value || 'text', ...(opts.length ? { options: opts } : {}) };
  upsertPropDef(key, def);
  void savePropLibrary();
  if (!tplBuilderState.extra.some(x => x.key === key)) tplBuilderState.extra.push({ key, def });
  if (!(key in tplBuilderState.values)) tplBuilderState.values[key] = defaultTplValue(def);
  closeTplPropDialog();
  renderTemplateBuilder();
  showToast(`已新建属性「${key}」并加入模板`, 'success');
}

/** 构建器默认图标选择器 */
export function toggleTplBuilderPicker() {
  if (!tplBuilderPicker) return;
  if (!tplBuilderPicker.classList.contains('hidden')) { tplBuilderPicker.classList.add('hidden'); return; }
  tplBuilderPicker.classList.remove('hidden');
  tplBuilderCleanup?.();
  tplBuilderCleanup = renderEmojiPicker(tplBuilderPicker, (char) => {
    tplBuilderState.emoji = char;
    if (tplBuilderEmoji) tplBuilderEmoji.textContent = char;
    recordRecentEmoji(char);
    tplBuilderPicker.classList.add('hidden');
  }, { selected: tplBuilderState.emoji });
}

/* ─── 模板菜单（阶段 D 完善） ──────────────────────────── */

export async function openTemplateMenu() {
  const templates = (await getHostMeta('templates')) || [];
  renderTemplateMenu(templates);
}

/** 关闭模板下拉 */
export function closeTemplateMenu() {
  document.getElementById('template-menu')?.remove();
}

/** 用模板新建卡片：按注册表 storage 把模板字段落到卡片一级字段或 card.props */
export async function createFromTemplate(tpl) {
  const fields = normalizeTemplateFields(tpl);
  const patch = { content: '', emoji: tpl.emoji || '', props: {}, provenance: { origin: 'human' } };
  for (const f of fields) {
    writeValueToCard(patch, f?.key, f?.value);
  }
  const card = await createCardEntry(patch);
  await actions.refreshAll();
  openEditor(card, currentTime(), null, null);
}

/** 渲染模板下拉菜单（空白 + 模板 + 管理） */
export function renderTemplateMenu(templates) {
  closeTemplateMenu();
  const btn = els.btnTemplate;
  if (!btn) return;
  const menu = document.createElement('div');
  menu.id = 'template-menu';
  menu.className = 'template-menu';

  if (!templates.length) {
    const hint = document.createElement('div');
    hint.className = 'tpl-empty';
    hint.textContent = '还没有模板，先创建一个';
    menu.append(hint);
  }

  for (const t of templates) {
    const it = document.createElement('button');
    it.type = 'button'; it.className = 'tpl-item';
    const emoji = document.createElement('span');
    emoji.textContent = t.emoji || '🗂️';
    const nm = document.createElement('span');
    nm.textContent = t.name;
    it.append(emoji, nm);
    if (t.fields?.length || t.tags?.length) {
      const tags = Array.isArray(t.fields)
        ? t.fields.filter(f => f.key === 'tags' && Array.isArray(f.value)).flatMap(f => f.value)
        : (t.tags ?? []);
      const summary = t.fields?.length
        ? `${t.fields.length} 属性` + (tags.length ? ' · #' + tags.join(' #') : '')
        : (tags.length ? '#' + tags.join(' #') : '');
      const chips = document.createElement('span');
      chips.className = 'tpl-chips';
      chips.textContent = summary;
      it.append(chips);
    }
    it.addEventListener('click', () => { closeTemplateMenu(); createFromTemplate(t); });
    menu.append(it);
  }

  const create = document.createElement('button');
  create.type = 'button'; create.className = 'tpl-item tpl-create' + (!templates.length ? ' tpl-create-cta' : '');
  create.textContent = '＋ 新建模板' + (templates.length ? '…' : '');
  create.addEventListener('click', () => { closeTemplateMenu(); openTemplateBuilder(); });
  menu.append(create);

  if (templates.length) {
    const mgmt = document.createElement('button');
    mgmt.type = 'button'; mgmt.className = 'tpl-item tpl-manage';
    mgmt.textContent = '⚙️ 管理模板…';
    mgmt.addEventListener('click', () => { closeTemplateMenu(); manageTemplates(templates); });
    menu.append(mgmt);
  }

  const rect = btn.getBoundingClientRect();
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.left = rect.left + 'px';
  document.body.append(menu);
  setTimeout(() => {
    const handler = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', handler); } };
    document.addEventListener('click', handler);
  }, 0);
}

/** 模板管理：重命名 / 删除 / 编辑 */
export async function manageTemplates(templates) {
  if (!templates.length) return;
  const lines = templates.map((t, i) => `${i}. ${t.emoji || ''} ${t.name}`).join('\n');
  const pick = prompt('选择要管理的模板（输入编号）：\n' + lines, '');
  const i = pick === null ? -1 : parseInt(pick, 10);
  if (i < 0 || i >= templates.length) return;
  const action = prompt(`「${templates[i].name}」 — 输入操作：\n1 重命名  2 删除  3 编辑属性`, '1');
  if (action === null) return;
  let list = [...templates];
  const tpl = list[i];
  if (action === '2') {
    if (confirm(`删除模板「${tpl.name}」？`)) list = list.filter(t => t.id !== tpl.id);
  } else if (action === '1') {
    const nn = (prompt('新名称：', tpl.name) || '').trim();
    if (nn) list[i] = { ...tpl, name: nn };
  } else if (action === '3') {
    closeTemplateMenu();
    openTemplateBuilder(tpl);
    return;
  } else {
    return;
  }
  await setHostMeta('templates', list);
  showToast('✅ 模板已更新', 'success');
}

/** 保存当前卡片为模板 → 打开模板构建器（默认空白，可挑属性/新建属性） */
export function saveEditorAsTemplate() {
  openTemplateBuilder();
}
