/**
 * card-editor.js — 卡片编辑器（features 层）
 *
 * 建卡/改卡浮层：字段编辑、状态↔进度联动、标签、项目、自定义属性表单。
 * 编辑器状态（editorEmoji / editingCardId / editorProps）在本模块内闭环。
 * 重渲染经 state/actions.js 由组合根注入。
 */

import { editorContent, editorDate, editorDuration, editorDurationMin, editorEnd, editorMetaEl, editorOverlay, editorPriority, editorPrioritySeg, editorProgress, editorProgressNumber, editorProjectInput, editorStart, editorStatus, editorStatusCustom, editorStatusSeg, editorTagChips, editorTagInput, editorTitle, editorType, emojiPicker, emojiPreview, projectSuggest } from '../components/dom-refs.js';
import { confirmDialog } from './dialog.js';
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
  if (!editorTagChips) return;
  editorTagChips.replaceChildren();
  for (const name of editorTags) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag-chip';
    chip.textContent = name + ' ×';
    chip.addEventListener('click', () => {
      editorTags = editorTags.filter(t => t !== name);
      renderEditorTags();
    });
    editorTagChips.append(chip);
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
  // 正在编辑的卡片在真源里的快照：项目预填与来源展示共用（只查一次）
  const existing = editingCardId ? vs.allCardsCache.find(c => c.id === editingCardId) ?? null : null;
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
  // 阶段 C：标题 / 状态 / 进度 / 优先级 / 时长 / 自定义属性
  if (editorTitle) editorTitle.value = card?.title ?? '';
  if (editorStatus) updateStatusSeg(card?.status ?? 'none');
  updatePrioritySeg(card?.priority ?? 'medium');
  if (editorProgress) editorProgress.value = card?.progress ?? 0;
  if (editorDurationMin) editorDurationMin.value = card?.duration ?? '';
  updateEditorProgressLabel();
  editorProps = { ...(card?.props ?? {}) };
  renderEditorProps();
  setEditorEmoji(card?.emoji ?? '');
  closeEmojiPicker();

  // 项目：优先沿用卡片已记录的（先看修改者、再看创建者），否则用上次填过的
  const recordedProject = existing?.meta?.updatedBy?.project ?? existing?.meta?.createdBy?.project ?? null;
  if (editorProjectInput) editorProjectInput.value = recordedProject ?? getPort().prefGet('journal.lastProject') ?? '';
  renderProjectSuggest();

  // 来源：仅编辑已有卡片时展示
  if (editorMetaEl) {
    const m = existing?.meta ?? null;
    editorMetaEl.textContent = m
      ? `创建：${formatProvenance(m.createdBy)}　修改：${formatProvenance(m.updatedBy)}`
      : '';
  }

  editorOverlay.classList.remove('hidden');
  editorContent.focus();
  editorSnapshot = formSnapshot();
}

/* ─── 脏检查与关闭确认 ─────────────────────────────────── */

/** 打开编辑器时的表单快照；用于判断是否存在未保存改动。 */
let editorSnapshot = '';

/** 当前表单字段的规范化快照（只看用户可改的字段）。 */
function formSnapshot() {
  return JSON.stringify({
    title: editorTitle?.value ?? '',
    content: editorContent?.value ?? '',
    type: editorType?.value ?? '',
    date: editorDate?.value ?? '',
    status: editorStatus?.value ?? '',
    statusCustom: editorStatusCustom?.value ?? '',
    progress: editorProgress?.value ?? '',
    priority: editorPriority?.value ?? '',
    start: editorStart?.value ?? '',
    end: editorEnd?.value ?? '',
    duration: editorDurationMin?.value ?? '',
    project: editorProjectInput?.value ?? '',
    tags: editorTags,
    emoji: editorEmoji,
    props: editorProps,
  });
}

/**
 * 编辑器是否有未保存改动。
 * @returns {boolean}
 */
export function isEditorDirty() {
  return formSnapshot() !== editorSnapshot;
}

/**
 * 请求关闭编辑器：有未保存改动时先确认。
 *
 * 遮罩点击、Esc、取消按钮**统一走这条路径** ——
 * 之前是「点遮罩=保存、按 Esc=丢弃」，同一动作两种相反结果，极易误存/误丢；
 * 且 closeEditor 会直接清空表单，没有二次确认。
 */
export async function requestCloseEditor() {
  if (isEditorDirty()) {
    const yes = await confirmDialog({
      title: '放弃修改？',
      message: '编辑器里有未保存的改动，关闭后不会保存。',
      okLabel: '放弃',
      danger: true,
    });
    if (!yes) return;
  }
  closeEditor();
}

/**
 * 打开编辑器并**显式指定结束时间**（时间线/周视图框选创建时间范围用）。
 * 视图不应直接摸编辑器 DOM，故把「预填结束时间 + 重算时长」收在编辑器模块内。
 * @param {string} start HH:MM
 * @param {string} end HH:MM
 * @param {string|null} date YYYY-MM-DD
 * @param {string|null} [assignedDate]
 */
export function openEditorRange(start, end, date, assignedDate = undefined) {
  openEditor(null, start, date, assignedDate);
  if (editorEnd) editorEnd.value = end;
  updateEditorDuration();
  // 快照必须在**所有**预填完成之后重取：否则「刚打开就是脏状态」，
  // 点取消会弹确认框（拖选建卡后按取消 = 被问“要放弃修改吗”，很荒谬）。
  editorSnapshot = formSnapshot();
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
const PRIORITY_PRESETS = ['high', 'medium', 'low'];

/** 同步分段状态胶囊 UI 到 hidden input（支持自定义状态字符串） */
export function updateStatusSeg(value) {
  const v = (typeof value === 'string' && value.trim()) ? value.trim() : 'none';
  if (editorStatus) editorStatus.value = v;
  if (editorStatusSeg) {
    for (const b of editorStatusSeg.querySelectorAll('.seg')) b.classList.toggle('is-active', b.dataset.status === v);
  }
  if (editorStatusCustom) {
    editorStatusCustom.value = STATUS_PRESETS.includes(v) ? '' : v;
  }
}

/**
 * 同步优先级分段 UI 到 hidden input（高/中/低）。
 * 优先级是注册表里的内建可选字段（`behavior: 'priority'`），
 * 卡片池按它渲染徽标；此处提供唯一的手动设置入口。
 * @param {string} value
 */
export function updatePrioritySeg(value) {
  const v = PRIORITY_PRESETS.includes(value) ? value : 'medium';
  if (editorPriority) editorPriority.value = v;
  if (editorPrioritySeg) {
    for (const b of editorPrioritySeg.querySelectorAll('.seg')) b.classList.toggle('is-active', b.dataset.priority === v);
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
  editorSnapshot = '';
  editingCardId = null;
  editorContent.value = '';
  editorTags = [];
  renderEditorTags();
  if (editorTagInput) editorTagInput.value = '';
  if (editorDate) { editorDate.value = ''; editorDate.title = '未安排（保存在卡片池）'; }
  if (editorStart) editorStart.value = '';
  if (editorEnd) editorEnd.value = '';
  if (editorDuration) editorDuration.textContent = '';
  if (editorDurationMin) editorDurationMin.value = '';
  if (editorTitle) editorTitle.value = '';
  if (editorStatus) updateStatusSeg('none');
  updatePrioritySeg('medium');
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
  const title = editorTitle?.value?.trim() ?? '';
  const type = editorType.value;
  const pendingTag = editorTagInput?.value;
  if (pendingTag) addEditorTag(pendingTag);
  // 新建：标题或内容至少填一个。
  // 曾经只判 content → 用户只填了「标题」（编辑器第一个字段）点保存会**静默丢弃**整张卡。
  if (!content && !title && !editingCardId) {
    showToast('标题和内容至少要填一个', 'warn');
    return;
  }

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
    const priority = PRIORITY_PRESETS.includes(editorPriority?.value) ? editorPriority.value : 'medium';
    const progress = status === 'done' ? 100 : Number(editorProgress?.value || 0);
    const duration = (editorDurationMin?.value ?? '') !== '' ? Number(editorDurationMin.value) : null;
    // title 已在函数开头读取（用于「标题或内容至少填一个」校验）
    const props = editorProps;
    const basePatch = {
      content, type, title, status, priority, progress, duration: duration ?? undefined, props,
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
