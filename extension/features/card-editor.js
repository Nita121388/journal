/**
 * card-editor.js — 卡片编辑器（features 层）
 *
 * 建卡/改卡浮层：字段编辑、状态↔进度联动、标签、项目、自定义属性表单。
 * 编辑器状态（editorEmoji / editingCardId / editorProps）在本模块内闭环。
 * 重渲染经 state/actions.js 由组合根注入。
 */

import { editorContent, editorDate, editorDuration, editorDurationMin, editorEnd, editorMetaEl, editorOverlay, editorProgress, editorProgressNumber, editorProjectInput, editorStart, editorStatus, editorStatusCustom, editorTitle, editorType, emojiFreeInput, emojiPicker, emojiPreview, projectSuggest } from '../components/dom-refs.js';
import { recordRecentEmoji, renderEmojiPicker } from './emoji.js';
import { showToast } from './toast.js';
import { getPort } from '../platform/index.js';
import { formatProvenance, typeIcon } from '../shared/format.js';
import { addMinutes, getCardEndTime, getCardStartTime, snapToQuarter, snapUpToQuarter, timeToMinutes } from '../shared/model.js';
import { DEFAULT_HOST_BASE } from '../shared/protocol.js';
import { actions } from '../state/actions.js';

import { createCardEntry, updateCardEntry } from '../state/repository.js';
import { vs } from '../state/view-state.js';
import { renderEditorProps, closePropForm } from './editor-props.js';
export let editorEmoji = '';
let emojiPickerCleanup = null;

/** 编辑器自定义属性：key → 值 */
export let editorProps = {};
/** 属性定义库已提取到 state/prop-library.js（getPropLibrary/upsertPropDef/…） */
/** 卡片编辑器：勾选完成 ⇒ 进度100 联动开关 */

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
// 已提取到 features/editor-props.js（见顶部 import）。

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
