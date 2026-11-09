/**
 * template-builder.js — 模板构建器外壳（features 层）
 *
 * 构建器状态与外壳：打开/关闭、字段规范化、渲染入口。
 * 属性行见 template-rows.js；字段选择/菜单/默认值编辑器见 template-fields.js；
 * 模板菜单与管理见 template-menu.js。
 */

import { getFieldDef, listFieldDefs } from '../shared/field-registry.js';
import { PROP_TYPES } from '../shared/prop-infer.js';
import {
  tplBuilderOverlay, tplBuilderName, tplBuilderEmoji, tplBuilderPicker, tplPropList,
  tplNpKey, tplNpLabel, tplNpIcon, tplNpType, tplNpOptions, tplNpOk,
  tplNpIconTile, tplNpIconPreview, tplNpIconPicker,
  tplPropOverlay, tplPropDialogTitle, tplPropClose,
} from '../components/dom-refs.js';
import { editorEmoji } from './card-editor.js';
import { recordRecentEmoji, renderEmojiPicker } from './emoji.js';
import { popLayer, pushLayer } from './layer-stack.js';
import { buildPropRow, buildAddRow, tplUserTouched } from './template-rows.js';
import {
  closeFieldPicker, closePropRowMenu, closeRowIconPicker, defaultTplValue,
} from './template-fields.js';

export const REQUIRED_DEFS = listFieldDefs({ required: true });
/** 是否内建字段（注册表 source==='builtin'） */
export function isBuiltinKey(key) { return getFieldDef(key)?.source === 'builtin'; }

// DOM 元素引用统一取自 components/dom-refs.js；此处 re-export 以保持既有调用方路径不变。
export {
  tplBuilderName, tplBuilderEmoji, tplBuilderPicker, tplPropList,
  tplNpKey, tplNpLabel, tplNpIcon, tplNpType, tplNpOptions, tplNpOk,
  tplNpIconTile, tplNpIconPreview, tplNpIconPicker,
  tplPropOverlay,
};

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
  // 登记：属性定义弹窗之上的一层，Esc / 外点（点瓦片除外）只关 picker 不关弹窗
  pushLayer({
    id: 'tpl-np-icon',
    el: tplNpIconPicker,
    close: closeTplNpIconPicker,
    ignore: [tplNpIconTile],
  });
}
function closeTplNpIconPicker() {
  popLayer('tpl-np-icon');
  tplNpIconPicker?.classList.add('hidden');
  tplNpIconCleanup?.();
  tplNpIconCleanup = null;
}
tplNpIconTile?.addEventListener('click', openTplNpIconPicker);

/** 关闭构建器默认图标选择器（emoji picker，幂等） */
export function closeTplBuilderPicker() {
  popLayer('tpl-builder-emoji');
  if (tplBuilderPicker) tplBuilderPicker.classList.add('hidden');
  tplBuilderCleanup?.();
  tplBuilderCleanup = null;
}

/** 打开属性编辑弹窗（新建 / 编辑共用） */
export function openTplPropDialog(title) {
  if (!tplPropOverlay) return;
  if (tplPropDialogTitle) tplPropDialogTitle.textContent = title;
  tplPropOverlay.classList.remove('hidden');
  // 登记：模态弹窗，外点不关（遮罩点击由下方 overlay click handler 承担）
  pushLayer({
    id: 'tpl-prop-dialog',
    el: tplPropOverlay,
    close: closeTplPropDialog,
    dismissOnOutsideClick: false,
  });
}

/** 关闭属性编辑弹窗 */
export function closeTplPropDialog() {
  popLayer('tpl-prop-dialog');
  // 属性弹窗内的图标 picker 若还开着，一并出栈（避免栈里留下已隐藏的层）
  closeTplNpIconPicker();
  if (tplPropOverlay) tplPropOverlay.classList.add('hidden');
  tplEditKey = null;
}
tplPropOverlay?.addEventListener('click', (e) => {
  if (e.target === tplPropOverlay) closeTplPropDialog();
});
// 元素引用已集中登记到 components/dom-refs.js。
tplPropClose?.addEventListener('click', closeTplPropDialog);
/** 构建器状态：extra 为有序可选属性 [{key, def}]，values 存默认值 */
export let tplBuilderState = { name: '', emoji: '🗂️', extra: [], values: {}, reqOv: {} };
export let tplBuilderCleanup = null;
export let tplEditingId = null;   // 编辑既有模板时的 id
export let tplEditKey = null;     // 编辑属性定义时的 key
export let tplDragKey = null;     // 排序拖拽中的 key

/**
 * 写入 setter：ESM 的 import 绑定是**只读视图**，别处 `tplEditKey = x` 会在运行时抛
 * `TypeError: Assignment to constant variable`（实测：模板构建器点「编辑属性」没反应、
 * 「从当前卡预填」也失效，两个都是这个原因）。跨模块改状态一律走 setter。
 */
export function setTplBuilderState(next) { tplBuilderState = next; }
export function setTplEditKey(next) { tplEditKey = next; }

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
  tplBuilderOverlay?.classList.remove('hidden');
  // 登记：模态层（外点不关，遮罩点击由 bind-editor 的遮罩 handler 负责）。
  // Esc 关闭走栈派发 → closeTemplateBuilder（连带关掉构建器内的全部子浮层）。
  pushLayer({
    id: 'template-builder',
    el: tplBuilderOverlay,
    close: closeTemplateBuilder,
    dismissOnOutsideClick: false,
  });
  tplBuilderName?.focus();
  tplBuilderName?.select();
}
export function closeTemplateBuilder() {
  popLayer('template-builder');
  tplBuilderOverlay?.classList.add('hidden');
  closePropRowMenu();
  closeRowIconPicker();
  closeTplPropDialog();
  closeTplNpIconPicker();
  closeTplBuilderPicker();
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

