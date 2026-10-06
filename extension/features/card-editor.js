/**
 * card-editor.js — 卡片编辑器（features 层）
 *
 * 建卡/改卡浮层：字段编辑、状态↔进度联动、标签、项目、自定义属性表单。
 * 编辑器状态（editorEmoji / editingCardId / editorProps）在本模块内闭环。
 * 重渲染经 state/actions.js 由组合根注入。
 */

import {
  editorContent, editorDate, editorDuration, editorDurationMin, editorEnd, editorMetaEl,
  editorOverlay, editorProgress, editorProgressNumber, editorProjectInput, editorStart,
  editorStatus, editorStatusCustom, editorTitle, editorType, emojiFreeInput, emojiPicker,
  emojiPreview, projectSuggest, propForm, propIcon, propKey, propOptions, propType, propsList,
} from '../components/dom-refs.js';
import { recordRecentEmoji, renderEmojiPicker } from './emoji.js';
import { showToast } from './toast.js';
import { getPort } from '../platform/index.js';
import { formatProvenance, typeIcon } from '../shared/format.js';
import {
  RESERVED_PROPS, addMinutes, getCardEndTime, getCardStartTime, snapToQuarter, snapUpToQuarter,
  timeToMinutes,
} from '../shared/model.js';
import { DEFAULT_HOST_BASE } from '../shared/protocol.js';
import { actions } from '../state/actions.js';
import {
  getPropLibrary, removePropDef, savePropLibrary, upsertPropDef,
} from '../state/prop-library.js';
import { createCardEntry, updateCardEntry } from '../state/repository.js';
import { vs } from '../state/view-state.js';
export let editorEmoji = '';
let emojiPickerCleanup = null;

/** 编辑器自定义属性：key → 值 */
let editorProps = {};
/** 属性定义库已提取到 state/prop-library.js（getPropLibrary/upsertPropDef/…） */
/** 卡片编辑器：勾选完成 ⇒ 进度100 联动开关 */
let editorStatusValue = 'none';
let editorProgressValue = 0;

function setEditorEmoji(emoji) {
  editorEmoji = emoji || '';
  if (emojiPreview) emojiPreview.textContent = editorEmoji || typeIcon(editorType.value);
  if (emojiFreeInput) emojiFreeInput.value = editorEmoji;
}

export function openEmojiPicker() {
  if (!emojiPicker) return;
  emojiPicker.classList.remove('hidden');
  emojiPickerCleanup?.();
  emojiPickerCleanup = renderEmojiPicker(emojiPicker, (char) => {
    setEditorEmoji(char);
    recordRecentEmoji(char);
    closeEmojiPicker();
  }, { selected: editorEmoji });
}

function closeEmojiPicker() {
  if (emojiPicker) emojiPicker.classList.add('hidden');
  emojiPickerCleanup?.();
  emojiPickerCleanup = null;
}

editorType?.addEventListener('change', () => {
  // 未设置自定义 emoji 时，预览跟随类型默认图标
  if (!editorEmoji && emojiPreview) emojiPreview.textContent = typeIcon(editorType.value);
});
// 点击外部关闭 picker（用 composedPath 判断，避免 tab 点击引发 render 重建 DOM
// 后被点击元素脱离文档导致 closest() 失效、误关 picker）
editorOverlay?.addEventListener('click', (e) => {
  const path = e.composedPath ? e.composedPath() : [e.target];
  if (path.some(el => el?.classList?.contains('ce-tile-wrap'))) return;
  closeEmojiPicker();
});

/** 正在编辑的卡片 ID（null = 新建模式） */
export let editingCardId = null;

/**
 * 打开卡片编辑器
 * @param {object|null} card — null = 新建，否则编辑
 * @param {string|null} time — HH:MM（新建时作为开始时间的种子；null/空 = 不排具体时间）
 * @param {string|null} date — YYYY-MM-DD
 * @param {string|null} [assignedDate] — 新建时指定安排日期；null = 未安排（卡片池）
 */
let editorTags = [];

function renderEditorTags() {
  const box = document.getElementById('card-editor-tag-chips');
  if (!box) return;
  box.replaceChildren();
  for (const name of editorTags) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag-chip';
    chip.textContent = name + ' ×';
    chip.addEventListener('click', () => {
      editorTags = editorTags.filter(t => t !== name);
      renderEditorTags();
    });
    box.append(chip);
  }
}

export function addEditorTag(raw) {
  const name = String(raw ?? '').trim().toLowerCase();
  if (!name || editorTags.includes(name)) return;
  editorTags.push(name);
  renderEditorTags();
}

// ORIGIN_LABEL / formatProvenance 已提取到 shared/format.js（纯展示）。

/** 历史项目目录（用于 datalist 建议） */
function collectProjects() {
  const set = new Set();
  for (const c of vs.allCardsCache ?? []) {
    const p = c.meta?.createdBy?.project ?? c.meta?.updatedBy?.project;
    if (p) set.add(p);
  }
  return [...set].sort();
}

function renderProjectSuggest() {
  if (!projectSuggest) return;
  projectSuggest.replaceChildren();
  for (const p of collectProjects()) {
    const o = document.createElement('option');
    o.value = p;
    projectSuggest.append(o);
  }
}

export function openEditor(card, time, date, assignedDate = undefined) {
  editingCardId = card?.id ?? null;
  editorTags = Array.isArray(card?.tags) ? [...card.tags] : [];
  renderEditorTags();
  let start, end;
  if (card) {
    // 已有卡片：读其时间；全天卡片（无 startTime）保持时间框为空
    start = getCardStartTime(card) ?? null;
    end = getCardEndTime(card) ?? null;
  } else {
    // 新建：有种子时间则预填，否则留空（= 不排具体时间，全天卡片）
    start = time ? snapUpToQuarter(time) : null;
    end = start ? addMinutes(start, 15) : null;
  }
  if (editorStart) editorStart.value = start ?? '';
  if (editorEnd) editorEnd.value = end ?? '';
  updateEditorDuration();
  // 日期：编辑时读卡片 assignedDate；新建时用传入日期/选中日期；未安排(卡片池)则留空
  if (editorDate) {
    const d = card ? card.assignedDate ?? '' : (assignedDate === null ? '' : (date ?? vs.selectedDate));
    editorDate.value = d ?? '';
    // 未安排标记：卡片无日期时占位提示
    editorDate.title = d ? '' : '未安排（保存在卡片池）';
  }
  editorType.value = card?.type ?? 'text';
  editorContent.value = card?.content ?? '';
  // 阶段 C：标题 / 状态 / 进度 / 时长 / 自定义属性
  if (editorTitle) editorTitle.value = card?.title ?? '';
  if (editorStatus) updateStatusSeg(card?.status ?? 'none');
  if (editorProgress) editorProgress.value = card?.progress ?? 0;
  if (editorDurationMin) editorDurationMin.value = card?.duration ?? '';
  updateEditorProgressLabel();
  editorProps = { ...(card?.props ?? {}) };
  renderEditorProps();
  setEditorEmoji(card?.emoji ?? '');
  closeEmojiPicker();

  // 项目：已有卡片取现有值，否则取上次用过的
  const lastProject = getPort().prefGet('journal.lastProject') ?? '';
  const cardProject = (editingCardId ? (vs.allCardsCache.find(c => c.id === editingCardId)?.meta?.updatedBy ?? null) : null)
    ?.project ?? (editingCardId ? vs.allCardsCache.find(c => c.id === editingCardId)?.meta?.createdBy?.project ?? null : null);
  if (editorProjectInput) editorProjectInput.value = cardProject ?? lastProject ?? '';
  renderProjectSuggest();

  // 来源：仅编辑已有卡片时展示
  if (editorMetaEl) {
    const existing = editingCardId ? vs.allCardsCache.find(c => c.id === editingCardId) : null;
    const m = existing?.meta ?? null;
    editorMetaEl.textContent = m
      ? `创建：${formatProvenance(m.createdBy)}　修改：${formatProvenance(m.updatedBy)}`
      : '';
  }

  editorOverlay.classList.remove('hidden');
  editorContent.focus();
}

/** 编辑器持续时长显示（起止 → 时长 双向） */
export function updateEditorDuration() {
  const s = editorStart?.value;
  const e = editorEnd?.value;
  if (!s || !e) {
    if (editorDuration) editorDuration.textContent = '';
    if (editorDurationMin) editorDurationMin.value = '';
    return;
  }
  const dur = Math.max(0, timeToMinutes(e) - timeToMinutes(s));
  if (editorDuration) editorDuration.textContent = dur > 0 ? `${dur} 分钟` : '结束须晚于开始';
  if (editorDurationMin) editorDurationMin.value = dur > 0 ? dur : '';
}

/** 时长输入 → 反推结束时间（起止 ↔ 时长 双向） */
export function onEditorDurationInput() {
  const s = editorStart?.value;
  const dur = Number(editorDurationMin?.value || 0);
  if (s && editorEnd && Number.isFinite(dur) && dur >= 0) {
    editorEnd.value = addMinutes(s, dur);
    if (editorDuration) editorDuration.textContent = `${dur} 分钟`;
  }
}

/** 状态 → 进度 联动：勾选完成 ⇒ 进度100 */
export function onEditorStatusChange() {
  const s = editorStatus?.value ?? 'none';
  if (s === 'done' && editorProgress && editorProgress.value !== '100') editorProgress.value = 100;
  if (s === 'none' && editorProgress && editorProgress.value === '100') editorProgress.value = 0;
  updateEditorProgressLabel();
}

const STATUS_PRESETS = ['none', 'todo', 'doing', 'done'];

/** 同步分段状态胶囊 UI 到 hidden input（支持自定义状态字符串） */
export function updateStatusSeg(value) {
  const v = (typeof value === 'string' && value.trim()) ? value.trim() : 'none';
  if (editorStatus) editorStatus.value = v;
  const seg = document.getElementById('card-editor-status-seg');
  if (seg) {
    for (const b of seg.querySelectorAll('.seg')) b.classList.toggle('is-active', b.dataset.status === v);
  }
  if (editorStatusCustom) {
    editorStatusCustom.value = STATUS_PRESETS.includes(v) ? '' : v;
  }
}

/** 点击分段胶囊：设状态 + 进度联动 */
export function onStatusClicked(value) {
  updateStatusSeg(value);
  onEditorStatusChange();
}

/** 进度 → 状态 联动：拖到 100% ⇒ 完成；回退 ⇒ 进行中/待办 */
export function onEditorProgressChange() {
  const val = Number(editorProgress?.value ?? 0);
  updateEditorProgressLabel();
  if (editorStatus) {
    if (val >= 100 && editorStatus.value !== 'done') { editorStatus.value = 'done'; updateStatusSeg('done'); }
    else if (val < 100 && editorStatus.value === 'done') { editorStatus.value = val > 0 ? 'doing' : 'todo'; updateStatusSeg(editorStatus.value); }
  }
}

function updateEditorProgressLabel() {
  const p = Number(editorProgress?.value ?? 0);
  if (editorProgressNumber && editorProgressNumber.value !== String(p)) editorProgressNumber.value = p;
  if (editorProgress) editorProgress.style.setProperty('--ce-prog', p + '%');
}

/* ─── 自定义属性（编辑器） ───────────────────────────────── */

// loadPropLibrary / savePropLibrary 已提取到 state/prop-library.js

/** 渲染当前卡的属性行 */
function renderEditorProps() {
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
function buildPropControl(key, def, val) {
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

export function closeEditor() {
  editorOverlay.classList.add('hidden');
  editingCardId = null;
  editorContent.value = '';
  editorTags = [];
  renderEditorTags();
  const tagInput = document.getElementById('card-editor-tag-input');
  if (tagInput) tagInput.value = '';
  if (editorDate) { editorDate.value = ''; editorDate.title = '未安排（保存在卡片池）'; }
  if (editorStart) editorStart.value = '';
  if (editorEnd) editorEnd.value = '';
  if (editorDuration) editorDuration.textContent = '';
  if (editorDurationMin) editorDurationMin.value = '';
  if (editorTitle) editorTitle.value = '';
  if (editorStatus) updateStatusSeg('none');
  if (editorProgress) { editorProgress.value = 0; }
  updateEditorProgressLabel();
  if (editorMetaEl) editorMetaEl.textContent = '';
  editorProps = {};
  renderEditorProps();
  closePropForm();
  setEditorEmoji('');
  closeEmojiPicker();
}

export async function saveEditor() {
  const content = editorContent.value.trim();
  const type = editorType.value;
  const pendingTag = document.getElementById('card-editor-tag-input')?.value;
  if (pendingTag) addEditorTag(pendingTag);
  if (!content && !editingCardId) { closeEditor(); return; }

  // 时间：开始时间为空 → 不排具体时间（全天卡片，startTime/endTime = null）
  const startRaw = (editorStart?.value || '').trim();
  const endRaw = (editorEnd?.value || '').trim();
  let start = null, end = null;
  if (startRaw) {
    start = snapToQuarter(startRaw);
    end = snapToQuarter(endRaw || addMinutes(start, 15));
    if (timeToMinutes(end) <= timeToMinutes(start)) end = addMinutes(start, 15);
  }

  // 日期：date input 的值；空 = 未安排（卡片池）
  const assignedDate = editorDate?.value || null;

  try {
    // 项目目录：本次填写的（记住供下次预填）
    const project = editorProjectInput?.value?.trim() ?? '';
    if (project) getPort().prefSet('journal.lastProject', project);
    const provenance = { origin: 'human', project };

    // 阶段 C：状态 / 进度 / 时长 / 标题 / 自定义属性
    const status = editorStatus?.value ?? 'none';
    const progress = status === 'done' ? 100 : Number(editorProgress?.value || 0);
    const duration = (editorDurationMin?.value ?? '') !== '' ? Number(editorDurationMin.value) : null;
    const title = editorTitle?.value?.trim() ?? '';
    const props = editorProps;
    const basePatch = {
      content, type, title, status, progress, duration: duration ?? undefined, props,
      assignedDate, time: start, startTime: start, endTime: end,
      tags: editorTags, emoji: editorEmoji, provenance,
    };

    if (editingCardId) {
      await updateCardEntry(editingCardId, basePatch);
    } else {
      await createCardEntry(basePatch);
    }
    closeEditor();
    await actions.refreshAll();
  } catch (e) {
    console.error('[journal] save card failed:', e);
    showToast(`保存失败：host 服务未连接（${DEFAULT_HOST_BASE}）`, 'error');
  }
}
