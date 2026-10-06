/**
 * template-builder.js — 模板构建器外壳（features 层）
 *
 * 构建器状态与外壳：打开/关闭、字段规范化、渲染入口。
 * 属性行见 template-rows.js；字段选择/菜单/默认值编辑器见 template-fields.js；
 * 模板菜单与管理见 template-menu.js。
 */

import { getFieldDef, listFieldDefs } from '../shared/field-registry.js';
import { PROP_TYPES } from '../shared/prop-infer.js';
import { editorEmoji } from './card-editor.js';
import { recordRecentEmoji, renderEmojiPicker } from './emoji.js';
import { buildPropRow, buildAddRow, tplUserTouched } from './template-rows.js';
import {
  closeFieldPicker, closePropRowMenu, closeRowIconPicker, defaultTplValue,
} from './template-fields.js';
export const REQUIRED_DEFS = listFieldDefs({ required: true });
/** 是否内建字段（注册表 source==='builtin'） */
export function isBuiltinKey(key) { return getFieldDef(key)?.source === 'builtin'; }

export const tplBuilderName = document.getElementById('tpl-builder-name');
export const tplBuilderEmoji = document.getElementById('tpl-builder-emoji');
export const tplBuilderPicker = document.getElementById('tpl-builder-picker');
export const tplPropList = document.getElementById('tpl-prop-list');
export const tplNpKey = document.getElementById('tpl-np-key');
export const tplNpLabel = document.getElementById('tpl-np-label');
export const tplNpIcon = document.getElementById('tpl-np-icon');
export const tplNpType = document.getElementById('tpl-np-type');
export const tplNpOptions = document.getElementById('tpl-np-options');
export const tplNpOk = document.getElementById('tpl-np-ok');
const tplNpCancel = document.getElementById('tpl-np-cancel');
const tplNpIconTile = document.getElementById('tpl-np-icon-tile');
export const tplNpIconPreview = document.getElementById('tpl-np-icon-preview');
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
export let tplBuilderState = { name: '', emoji: '🗂️', extra: [], values: {}, reqOv: {} };
export let tplBuilderCleanup = null;
export let tplEditingId = null;   // 编辑既有模板时的 id
export let tplEditKey = null;     // 编辑属性定义时的 key
export let tplDragKey = null;     // 排序拖拽中的 key

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
export function setReqOverride(key, patch) {
  if (!tplBuilderState.reqOv) tplBuilderState.reqOv = {};
  tplBuilderState.reqOv[key] = { ...(tplBuilderState.reqOv[key] || {}), ...patch };
}
/** 合并覆盖后的展示定义 */
function effectiveDef(base) {
  const ov = reqOverride(base.key);
  return { ...base, label: ov.label || base.label, icon: ov.icon || base.icon };
}
export function typeLabel(v) { return PROP_TYPES.find(t => t.value === v)?.label || v || '文本'; }

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
// 已提取到 features/template-rows.js（见顶部 import）。



/* ── 现有字段选择浮层（内建可选 + 属性库）─────────────────── */

// 已提取到 features/template-fields.js（见顶部 import）。



/** 保存 / 更新模板 */
// 已提取到 features/template-menu.js（见顶部 import）。


