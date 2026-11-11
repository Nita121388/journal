/**
 * card-editor.js — 卡片编辑器（features 层）
 *
 * 建卡/改卡浮层：字段编辑、状态↔进度联动、标签、项目、自定义属性表单。
 * 编辑器状态（editorEmoji / editingCardId / editorProps）在本模块内闭环。
 * 重渲染经 state/actions.js 由组合根注入。
 */

import { cardEditorAddField, btnEmojiTile, editorContent, editorCreatedByEl, editorCreatedAtEl, editorDate, editorDuration, editorDurationMin, editorEnd, editorOverlay, editorPriority, editorPrioritySeg, editorProgress, editorProgressNumber, editorProjectInput, editorProvenanceEl, editorSave, editorStart, editorStatus, editorStatusCell, editorStatusText, editorTagChips, editorTagsCell, editorTitle, emojiPicker, emojiPreview, projectSuggest, editorUpdatedAtEl } from '../components/dom-refs.js';
import { createChip } from '../components/chip.js';
import { createSegGroup } from '../components/seg.js';
import { icon } from '../components/icon.js';
import { confirmDialog } from './dialog.js';
import { withBusy } from './busy.js';
import { recordRecentEmoji, renderEmojiPicker } from './emoji.js';
import { showToast } from './toast.js';
import { getPort } from '../platform/index.js';
import { formatDateTime, formatProvenance } from '../shared/format.js';
import { addMinutes, getCardEndTime, getCardStartTime, snapToQuarter, snapUpToQuarter, timeToMinutes } from '../shared/model.js';
import { getFieldDef } from '../shared/field-registry.js';
import { DEFAULT_HOST_BASE } from '../shared/protocol.js';
import { actions } from '../state/actions.js';

import { createCardEntry, updateCardEntry } from '../state/repository.js';
import { vs } from '../state/view-state.js';
import { CARD_TYPES, statusOptions, statusLabel } from '../shared/card-schema.js';
import { openValuePicker } from './value-picker.js';
import { addEditorProp, renderEditorProps } from './editor-props.js';
import { applyFields, fieldsWithValues, isLockedField, resolveFields } from './editor-fields.js';
import { closeEditorFieldPicker, openEditorFieldPicker } from './editor-field-picker.js';
import { closeTemplatePicker, openTemplatePicker } from './editor-template-picker.js';
import { popLayer, pushLayer } from './layer-stack.js';
export let editorEmoji = '';
let emojiPickerCleanup = null;

/** 编辑器自定义属性：key → 值 */
export let editorProps = {};
/** 卡片 type（text|task|idea）已退出 UI：编辑既有卡时保留原值，新建恒为 'text' */
let editorTypeValue = 'text';

function setEditorEmoji(emoji) {
  editorEmoji = emoji || '';
  if (!emojiPreview) return;
  // 未自选图标时给 note 线稿占位（类型退场后不再按类型给 📝/☑️/💡）
  if (editorEmoji) {
    emojiPreview.textContent = editorEmoji;
  } else {
    // 占位线稿 20px：对齐 emoji 字号（26px）的视觉重量，44px 瓦片里 14px 明显偏小
    emojiPreview.replaceChildren(icon('note', { size: 20 }));
  }
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
  // 登记：编辑器之上的一层，Esc / 外点（点瓦片除外）只关这个 picker，不动编辑器
  pushLayer({ id: 'editor-emoji', el: emojiPicker, close: closeEmojiPicker, ignore: [btnEmojiTile] });
}

function closeEmojiPicker() {
  popLayer('editor-emoji');
  if (emojiPicker) emojiPicker.classList.add('hidden');
  emojiPickerCleanup?.();
  emojiPickerCleanup = null;
}

// 点击外部关闭 picker（用 composedPath 判断，避免 tab 点击引发 render 重建 DOM
// 后被点击元素脱离文档导致 closest() 失效、误关 picker）
editorOverlay?.addEventListener('click', (e) => {
  const path = e.composedPath ? e.composedPath() : [e.target];
  if (path.some(el => el?.classList?.contains('ce-tile-wrap'))) return;
  closeEmojiPicker();
});

/** 正在编辑的卡片 ID（null = 新建模式） */
export let editingCardId = null;

/** 当前编辑器所选模板（null = 空白/默认属性集）。仅影响可见性，不影响数据形态。 */
let editorTemplate = { id: null, name: '空白', keys: [] };

/**
 * 本次编辑器会话里「手动加入」的内建可选字段 key（2026-11-10）。
 *
 * 与模板字段分开存：切模板时不丢（模板只决定默认集），关编辑器时随 openEditor 重置。
 * 只影响可见性：saveEditor() 本就无条件写全部内建字段，加了没填最多落字段默认值。
 */
let manualFieldKeys = [];

/** 当前应显示的属性行（模板字段 ∪ 手动字段，恒按 FIELD_ORDER 排序） */
function editorVisibleKeys() {
  return resolveFields([...editorTemplate.keys, ...manualFieldKeys]);
}

/** 把模板选中结果应用到属性区 + 头部标签（不重置手动加入的字段） */
function applyEditorTemplate({ id = null, name = '空白', keys = [] } = {}) {
  editorTemplate = { id, name, keys: keys ?? [] };
  applyFields(document.getElementById('card-editor-props'), editorVisibleKeys());
  const label = document.getElementById('card-editor-template-name');
  if (label) label.textContent = name || '空白';
  const btn = document.getElementById('card-editor-template');
  if (btn) btn.title = `当前模板：${name || '空白'}（点选切换）`;
}

/** 临时加入一个内建可选字段（仅本卡可见性，不写模板/属性库） */
function addEditorField(key) {
  if (!key || editorVisibleKeys().includes(key)) return;
  manualFieldKeys = [...manualFieldKeys, key];
  applyFields(document.getElementById('card-editor-props'), editorVisibleKeys());
  const row = document.querySelector(`#card-editor-props .prop-row[data-field="${key}"]`);
  row?.scrollIntoView({ block: 'nearest' });
  row?.querySelector('input:not([type="hidden"]), select, textarea, button')?.focus();
}

/** 从属性区隐藏一个字段（不清值；status/tags 锁定行不可隐藏） */
function removeEditorField(key) {
  if (!key || isLockedField(key)) return;
  editorTemplate = { ...editorTemplate, keys: editorTemplate.keys.filter(k => k !== key) };
  manualFieldKeys = manualFieldKeys.filter(k => k !== key);
  applyFields(document.getElementById('card-editor-props'), editorVisibleKeys());
}

/** 绑定「＋ 添加属性」入口（内建可选 / 属性库 / 新建，同一个浮层） */
function bindAddFieldEntry() {
  if (!cardEditorAddField) return;
  cardEditorAddField.addEventListener('click', (e) => {
    e.stopPropagation();
    openEditorFieldPicker(cardEditorAddField, {
      visibleBuiltinKeys: editorVisibleKeys(),
      onPickBuiltin: (def) => addEditorField(def.key),
      existingUserKeys: Object.keys(editorProps),
      onPickUser: (key) => {
        if (!(key in editorProps)) editorProps[key] = '';
        renderEditorProps();
      },
      onPickNew: () => {
        addEditorProp();
        document.getElementById('card-editor-props-list')?.scrollIntoView({ block: 'nearest' });
      },
    });
  });
}

/** 给可隐藏的属性行注入「✕」小按钮（锁定行 status/tags 不注入） */
function decoratePropRows() {
  const container = document.getElementById('card-editor-props');
  if (!container) return;
  for (const row of container.querySelectorAll('.prop-row[data-field]')) {
    const field = row.dataset.field;
    if (isLockedField(field)) continue;
    const keyCell = row.querySelector('.prop-key');
    if (!keyCell || keyCell.querySelector('.prop-key-hide')) continue;
    const label = getFieldDef(field)?.label || field;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'prop-key-hide';
    btn.title = `隐藏「${label}」（已填内容不会被清空）`;
    btn.setAttribute('aria-label', `从当前卡片隐藏属性「${label}」`);
    btn.append(icon('close', { size: 10 }));
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeEditorField(field);
    });
    keyCell.append(btn);
  }
}
decoratePropRows();
bindAddFieldEntry();

/** 编辑器头部的「切换模板」入口：只改可见性，不清空已填内容 */
function bindTemplateSwitch() {
  const btn = document.getElementById('card-editor-template');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openTemplatePicker(btn, {
      activeId: editorTemplate.id,
      onPick: pick => applyEditorTemplate(pick),
    });
  });
}
bindTemplateSwitch();

/**
 * 打开卡片编辑器
 * @param {object|null} card — null = 新建，否则编辑
 * @param {string|null} time — HH:MM（新建时作为开始时间的种子；null/空 = 不排具体时间）
 * @param {string|null} date — YYYY-MM-DD
 * @param {string|null} [assignedDate] — 新建时指定安排日期；null = 未安排（卡片池）
 * @param {{templateId?: string|null, templateName?: string, fields?: string[]}} [opts]
 *        opts.fields = 模板声明的字段 key（缺省 = 默认最小集）
 */
let editorTags = [];

/** 值格里的只读 chips 预览（增删在 value-picker 浮层里做，值格只展示） */
function renderEditorTags() {
  if (!editorTagChips) return;
  editorTagChips.replaceChildren();
  if (!editorTags.length) {
    // 空态占位：值格不能是一块看不见的空白（点击目标不明显）
    const ph = document.createElement('span');
    ph.className = 'pvc-placeholder';
    ph.textContent = '＋ 添加标签';
    editorTagChips.append(ph);
    return;
  }
  for (const name of editorTags) {
    editorTagChips.append(createChip({ label: name, static: true }));
  }
}

/** 全库标签候选：从 allCardsCache 聚合去重，按使用次数降序（同次数字典序）；当前卡已选也纳入 */
function collectTagOptions() {
  const counts = new Map();
  const bump = (t) => counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const card of vs.allCardsCache ?? []) {
    for (const t of (Array.isArray(card?.tags) ? card.tags : [])) bump(t);
  }
  for (const t of editorTags) bump(t); // 新建中的标签未必已入库，也要能被搜到
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);
}

/** 状态值格：点击打开单选 value-picker（可搜索四档，输入创建自定义状态） */
function bindStatusCell() {
  if (!editorStatusCell) return;
  editorStatusCell.addEventListener('click', (e) => {
    e.stopPropagation();
    const current = editorStatus?.value ?? 'none';
    openValuePicker(editorStatusCell, {
      selected: current !== 'none' ? [current] : [],
      options: statusOptions(),
      multiple: false,
      placeholder: '搜索或输入状态',
      onPick: (v) => {
        updateStatusSeg(v);
        onEditorStatusChange();
      },
    });
  });
}

/** 标签值格：点击打开多选 value-picker（输入即过滤全库候选，无匹配可创建） */
function bindTagsCell() {
  if (!editorTagsCell) return;
  editorTagsCell.addEventListener('click', (e) => {
    e.stopPropagation();
    openValuePicker(editorTagsCell, {
      selected: [...editorTags],
      options: collectTagOptions(),
      multiple: true,
      placeholder: '搜索或输入标签',
      onChange: (vals) => {
        editorTags = vals.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
        renderEditorTags();
      },
    });
  });
}
bindStatusCell();
bindTagsCell();

// ORIGIN_LABEL / formatProvenance 已提取到 shared/format.js（纯展示）。

/**
 * 渲染来源只读三行（创建人/创建时间/更新时间，2026-11-11）。
 *
 * 取代旧的项目行下一行灰字：① 三行恒显示（不进模板收敛/字段浮层）；
 * ② 新建未落库时占位「保存后生成」，不显示假数据 —— 落库前根本没有
 *    createdBy/createdAt，瞎编会误导「这张卡已经有了出生证明」。
 * ③ agent 名到具体模型：formatProvenance 已拼 origin/agent/model/project/device/at。
 *
 * @param {object|null} existing 正在编辑的卡片在真源里的快照（新建 = null）
 */
function renderEditorProvenance(existing) {
  if (!editorProvenanceEl) return;
  const m = existing?.meta ?? null;
  const createdBy = m?.createdBy ?? null;
  if (editorCreatedByEl) {
    editorCreatedByEl.textContent = createdBy
      ? formatProvenance(createdBy)
      : existing ? '—' : '保存后生成';
  }
  if (editorCreatedAtEl) {
    editorCreatedAtEl.textContent = existing?.createdAt
      ? formatDateTime(existing.createdAt)
      : existing ? '—' : '保存后生成';
  }
  if (editorUpdatedAtEl) {
    editorUpdatedAtEl.textContent = existing?.updatedAt
      ? formatDateTime(existing.updatedAt)
      : existing ? '—' : '保存后生成';
  }
  editorProvenanceEl.hidden = false;
}

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

export function openEditor(card, time, date, assignedDate = undefined, opts = {}) {
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
  editorTypeValue = CARD_TYPES.includes(card?.type) ? card.type : 'text';
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
  closeTemplatePicker();

  // 属性集：默认最小集 ∪ 模板字段 ∪ 卡片上已填的字段
  // 已有卡片要把已填属性拉出来，否则“模板收敛”会把旧卡的优先级/项目藏掉。
  // 手动加入的字段随会话重置（“只本次”语义，与「显示全部属性」一致）。
  const visibleKeys = [...(opts.fields ?? []), ...fieldsWithValues(card)];
  manualFieldKeys = [];
  applyEditorTemplate({
    id: opts.templateId ?? null,
    name: opts.templateName ?? '空白',
    keys: visibleKeys,
  });

  // 项目：优先沿用卡片已记录的（先看修改者、再看创建者），否则用上次填过的
  const recordedProject = existing?.meta?.updatedBy?.project ?? existing?.meta?.createdBy?.project ?? null;
  if (editorProjectInput) editorProjectInput.value = recordedProject ?? getPort().prefGet('journal.lastProject') ?? '';
  renderProjectSuggest();

  // 来源：只读三行（创建人/创建时间/更新时间，2026-11-11）
  renderEditorProvenance(existing);

  editorOverlay.classList.remove('hidden');
  // 登记进浮层栈：编辑器是模态层（外点不关，遮罩点击由 bind-editor 的遮罩 handler 负责）。
  // Esc 关闭走栈派发 → requestCloseEditor（脏检查确认也在 close 回调里，语义不变）。
  pushLayer({
    id: 'card-editor',
    el: editorOverlay,
    close: () => { void requestCloseEditor(); },
    dismissOnOutsideClick: false,
  });
  // 初始焦点：标题是新建卡片时第一个要填的字段（Notion 也是标题优先）。
  // 曾经聚焦正文 → 打开就出现正文焦点环，且标题要多点一次才能输入。
  (editorTitle || editorContent)?.focus();
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
    date: editorDate?.value ?? '',
    status: editorStatus?.value ?? '',
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
  // 时长与「时长(分)」输入框是同一个值的两种呈现：
  // 输入框已显示数字时不再重复写「N 分钟」文字，否则一行里出现两次时长（实测截图确认）。
  if (editorDuration) editorDuration.textContent = dur > 0 ? '' : '结束须晚于开始';
  if (editorDurationMin) editorDurationMin.value = dur > 0 ? dur : '';
}

/** 时长输入 → 反推结束时间（起止 ↔ 时长 双向） */
export function onEditorDurationInput() {
  const s = editorStart?.value;
  const dur = Number(editorDurationMin?.value || 0);
  if (s && editorEnd && Number.isFinite(dur) && dur >= 0) {
    editorEnd.value = addMinutes(s, dur);
    if (editorDuration) editorDuration.textContent = '';
  }
}

/** 状态 → 进度 联动：勾选完成 ⇒ 进度100 */
export function onEditorStatusChange() {
  const s = editorStatus?.value ?? 'none';
  if (s === 'done' && editorProgress && editorProgress.value !== '100') editorProgress.value = 100;
  if (s === 'none' && editorProgress && editorProgress.value === '100') editorProgress.value = 0;
  updateEditorProgressLabel();
}

const PRIORITY_PRESETS = ['high', 'medium', 'low'];

/**
 * 优先级分段胶囊的控制器。
 * 状态/标签已改为值格 + value-picker 浮层（2026-11-10），不再经 components/seg.js。
 * 惰性创建：DOM 引用在模块加载时已就绪，但回调需引用本模块函数，故首次使用时装配。
 * @type {{priority: {setValue(v:string):void,getValue():string}|null}}
 */
const segGroups = { priority: null };

function ensureSegGroups() {
  if (!segGroups.priority && editorPrioritySeg) {
    segGroups.priority = createSegGroup(editorPrioritySeg, {
      dataKey: 'priority',
      initial: editorPriority?.value ?? 'medium',
      onPick: (v) => updatePrioritySeg(v),
    });
  }
}

/**
 * 同步状态值：写 hidden input（值的唯一载体）+ 刷新值格展示文案。
 * 存量非常规状态（历史自定义值）原值显示，不静默改写；
 * 展示文案走 `statusLabel()`（唯一真值，未知值原样返回）。
 * @param {string} value
 */
export function updateStatusSeg(value) {
  const v = (typeof value === 'string' && value.trim()) ? value.trim() : 'none';
  if (editorStatus) editorStatus.value = v;
  if (editorStatusText) editorStatusText.textContent = statusLabel(v);
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
  ensureSegGroups();
  segGroups.priority?.setValue(v);
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
  popLayer('card-editor');
  editorSnapshot = '';
  editingCardId = null;
  editorTypeValue = 'text';
  closeTemplatePicker();
  closeEditorFieldPicker();
  manualFieldKeys = [];
  applyEditorTemplate({ id: null, name: '空白', keys: [] });
  editorContent.value = '';
  editorTags = [];
  renderEditorTags();
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
  if (editorProvenanceEl) editorProvenanceEl.hidden = true;
  if (editorCreatedByEl) editorCreatedByEl.textContent = '';
  if (editorCreatedAtEl) editorCreatedAtEl.textContent = '';
  if (editorUpdatedAtEl) editorUpdatedAtEl.textContent = '';
  editorProps = {};
  renderEditorProps();
  setEditorEmoji('');
  closeEmojiPicker();
}

/**
 * 保存编辑器（withBusy 入口守卫，修缺陷 1：双击/⌘⏎ + 双击重复建卡）。
 *
 * 按钮的 disabled 只挡得住鼠标连点；⌘⏎ 在 bind-editor.js 的 keydown 里**直调**
 * saveEditor，绕过 disabled —— 保存进行中再来一次会并发跑两遍 createCardEntry。
 * 所以去重必须落在函数入口：同 key 进行中时直接返回同一个 promise，不重复提交。
 */
export function saveEditor() {
  return withBusy('editor.save', doSaveEditor);
}

async function doSaveEditor() {
  const content = editorContent.value.trim();
  const title = editorTitle?.value?.trim() ?? '';
  // type 已退出 UI：保留编辑中卡片的原 type（旧任务卡不降级），新建恒为 'text'
  const type = editorTypeValue;
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

  // 保存中：按钮禁用 + 文案反馈（与 withBusy 入口守卫双保险 —— disabled 挡鼠标，
  // withBusy 挡 ⌘⏎ 等绕过 disabled 的直调路径）。finally 复原，失败后可直接重试。
  const saveBtn = editorSave;
  const saveLabel = saveBtn?.textContent ?? '保存';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中…';
  }
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
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = saveLabel;
    }
  }
}
