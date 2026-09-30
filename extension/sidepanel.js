/**
 * sidepanel.js — 主界面胶水层（卡片时间线版）
 * 职责：DOM 事件绑定 → 调用 lib/store.js → 渲染
 * 规则：不直接碰 chrome.storage.*（走 lib/store.js），不 mix storage + render
 */

import {
  todayKey, currentTime, aggregateHeatmap,
  countCardsByDay, groupCardsForTimeline, getCardTypeCounts,
  todoSummary, dateRange, getMonthMatrix, toDayKey,
  timeToMinutes, minutesToTime, addMinutes, snapToQuarter, snapUpToQuarter,
  getCardStartTime, getCardEndTime, getCardDuration, layoutScheduleLanes,
  RESERVED_PROPS, normalizeProgress,
} from './lib/model.js';
import {
  getAllCards, getCardsByDay, getPoolCards, getHeatmapData,
  createCardEntry, updateCardEntry, deleteCardEntry, getSettings,
} from './lib/store.js';
import { pullFromHost, startHostSync, getHostMeta, setHostMeta } from './lib/host-sync.js';
import { renderEmojiPicker, recordRecentEmoji } from './lib/emoji.js';

/* ─── 工具函数 ──────────────────────────────────────── */

function debounce(fn, ms = 500) {
  let timer = null;
  const wrapped = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  wrapped.cancel = () => { clearTimeout(timer); timer = null; };
  return wrapped;
}

function genId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

function isOverdue(due) { return due != null && due < todayKey(); }

function monthOf(dayKey) {
  const [y, m] = dayKey.split('-').map(Number);
  return { year: y, month: m - 1 };
}

function formatDateLabel(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
}

/** 渲染字数 */
function wordCount(text) { return text ? text.length : 0; }

/** 渲染今天/昨天/具体日期 */
function shortDate(dayKey) {
  const t = todayKey();
  if (dayKey === t) return '今天';
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey === yesterday.toISOString().slice(0, 10)) return '昨天';
  return dayKey;
}

/** 类型图标：卡片有自定义 emoji 时优先用 emoji，否则用类型默认 */
function typeIcon(type, emoji = '') {
  if (emoji) return emoji;
  return type === 'task' ? '☑️' : '📝'; // idea 并入文本显示
}

/* ─── 状态 ──────────────────────────────────────────── */

let selectedDate = todayKey();
let calendarMonth = monthOf(todayKey());
let heatmapCache = {};
let allCardsCache = [];
let switchSeq = 0;

/** @type {'month'|'week'|'timeline'} 右侧主视图模式 */
let viewMode = localStorage.getItem('journal.viewMode') || 'timeline';
/** 周历的基准日期（该周的某一天） */
let weekAnchor = selectedDate;
/** @type {'default'|'full'} 时间线展示范围：默认 08-22，full=24 小时 */
let timelineSpan = localStorage.getItem('journal.timelineSpan') || 'default';

/** @type {'active'|'all'|'done'} 旧待办筛选（已并入卡片池状态筛选，保留变量兼容过渡期渲染） */
/** 卡片池状态筛选：''全部 | 'active'待办(todo∪doing) | 'todo' | 'doing' | 'done' | 'none'纯文本 */
let poolStatusFilter = '';
/** 卡片池标签筛选 */
let poolTagFilter = '';
/** 卡片池项目筛选 */
let poolProjectFilter = '';
/** 卡片池布局：'card' 卡片视图 | 'list' 列表视图 */
let poolLayout = localStorage.getItem('journal.poolLayout') || 'card';
/** 命名视图清单 */
let savedViews = [];
/** 当前命名的视图 id（'' = 未命名/手动） */
let activeViewId = '';

/* ─── 卡片编辑器 ──────────────────────────────────────── */

const editorOverlay = document.getElementById('card-editor-overlay');
const editorDate = document.getElementById('card-editor-date');
const editorType = document.getElementById('card-editor-type');
const editorContent = document.getElementById('card-editor-content');
const editorStart = document.getElementById('card-editor-start');
const editorEnd = document.getElementById('card-editor-end');
const editorDuration = document.getElementById('card-editor-duration');
const editorTitle = document.getElementById('card-editor-title');
const editorStatus = document.getElementById('card-editor-status');
const editorProgress = document.getElementById('card-editor-progress');
const editorProgressNumber = document.getElementById('card-editor-progress-number');
const editorStatusCustom = document.getElementById('card-editor-status-custom');
const editorDurationMin = document.getElementById('card-editor-duration-min');
const propsList = document.getElementById('card-editor-props-list');
const btnAddProp = document.getElementById('btn-add-prop');
const btnPropLib = document.getElementById('btn-prop-lib');
const propForm = document.getElementById('prop-form');
const propKey = document.getElementById('prop-key');
const propIcon = document.getElementById('prop-icon');
const propType = document.getElementById('prop-type');
const propOptions = document.getElementById('prop-options');
const propFormOk = document.getElementById('prop-form-ok');
const propFormCancel = document.getElementById('prop-form-cancel');
const saveTemplateBtn = document.getElementById('card-editor-save-template');
const editorSave = document.getElementById('card-editor-save');
const editorCancel = document.getElementById('card-editor-cancel');
const editorClose = document.getElementById('card-editor-close');
const editorTagInput = document.getElementById('card-editor-tag-input');
const editorProjectInput = document.getElementById('card-editor-project');
const editorMetaEl = document.getElementById('card-editor-meta');
const projectSuggest = document.getElementById('project-suggest');
const emojiPreview = document.getElementById('emoji-preview');
const emojiPicker = document.getElementById('emoji-picker');
const emojiFreeInput = null; // 已移除自由输入框（图标选择由头部瓦片负责），保留占位兼容 setEditorEmoji
editorTagInput?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  addEditorTag(editorTagInput.value);
  editorTagInput.value = '';
});

/** 编辑器当前选择的 emoji（'' = 用类型默认图标） */
let editorEmoji = '';
let emojiPickerCleanup = null;

/** 编辑器自定义属性：key → 值 */
let editorProps = {};
/** 属性定义库（host meta）缓存 */
let propLibrary = {};
/** 卡片编辑器：勾选完成 ⇒ 进度100 联动开关 */
let editorStatusValue = 'none';
let editorProgressValue = 0;

function setEditorEmoji(emoji) {
  editorEmoji = emoji || '';
  if (emojiPreview) emojiPreview.textContent = editorEmoji || typeIcon(editorType.value);
  if (emojiFreeInput) emojiFreeInput.value = editorEmoji;
}

function openEmojiPicker() {
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
let editingCardId = null;

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

function addEditorTag(raw) {
  const name = String(raw ?? '').trim().toLowerCase();
  if (!name || editorTags.includes(name)) return;
  editorTags.push(name);
  renderEditorTags();
}

const ORIGIN_LABEL = {
  human: '👤 人类',
  'agent-assisted': '🤖 人类驱动 agent',
  'agent-auto': '⚙️ 自动',
};

/** 来源事件 → 展示文案 */
function formatProvenance(ev, fallback = '—') {
  if (!ev) return fallback;
  const label = ORIGIN_LABEL[ev.origin] ?? '👤 人类';
  const parts = [label];
  if (ev.agent) parts.push(ev.agent);
  if (ev.model) parts.push(ev.model);
  if (ev.project) parts.push(ev.project);
  if (ev.device?.hostname) parts.push(ev.device.hostname);
  if (ev.at) parts.push(new Date(ev.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }));
  return parts.join(' · ');
}

/** 历史项目目录（用于 datalist 建议） */
function collectProjects() {
  const set = new Set();
  for (const c of allCardsCache ?? []) {
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

function openEditor(card, time, date, assignedDate = undefined) {
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
    const d = card ? card.assignedDate ?? '' : (assignedDate === null ? '' : (date ?? selectedDate));
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
  const lastProject = localStorage.getItem('journal.lastProject') ?? '';
  const cardProject = (editingCardId ? (allCardsCache.find(c => c.id === editingCardId)?.meta?.updatedBy ?? null) : null)
    ?.project ?? (editingCardId ? allCardsCache.find(c => c.id === editingCardId)?.meta?.createdBy?.project ?? null : null);
  if (editorProjectInput) editorProjectInput.value = cardProject ?? lastProject ?? '';
  renderProjectSuggest();

  // 来源：仅编辑已有卡片时展示
  if (editorMetaEl) {
    const existing = editingCardId ? allCardsCache.find(c => c.id === editingCardId) : null;
    const m = existing?.meta ?? null;
    editorMetaEl.textContent = m
      ? `创建：${formatProvenance(m.createdBy)}　修改：${formatProvenance(m.updatedBy)}`
      : '';
  }

  editorOverlay.classList.remove('hidden');
  editorContent.focus();
}

/** 编辑器持续时长显示（起止 → 时长 双向） */
function updateEditorDuration() {
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
function onEditorDurationInput() {
  const s = editorStart?.value;
  const dur = Number(editorDurationMin?.value || 0);
  if (s && editorEnd && Number.isFinite(dur) && dur >= 0) {
    editorEnd.value = addMinutes(s, dur);
    if (editorDuration) editorDuration.textContent = `${dur} 分钟`;
  }
}

/** 状态 → 进度 联动：勾选完成 ⇒ 进度100 */
function onEditorStatusChange() {
  const s = editorStatus?.value ?? 'none';
  if (s === 'done' && editorProgress && editorProgress.value !== '100') editorProgress.value = 100;
  if (s === 'none' && editorProgress && editorProgress.value === '100') editorProgress.value = 0;
  updateEditorProgressLabel();
}

const STATUS_PRESETS = ['none', 'todo', 'doing', 'done'];

/** 同步分段状态胶囊 UI 到 hidden input（支持自定义状态字符串） */
function updateStatusSeg(value) {
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
function onStatusClicked(value) {
  updateStatusSeg(value);
  onEditorStatusChange();
}

/** 进度 → 状态 联动：拖到 100% ⇒ 完成；回退 ⇒ 进行中/待办 */
function onEditorProgressChange() {
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

async function loadPropLibrary() { propLibrary = (await getHostMeta('propertyLibrary')) || {}; }
async function savePropLibrary() { await setHostMeta('propertyLibrary', propLibrary); }

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
    const def = propLibrary[key];
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
function openPropForm(defKey = null) {
  if (!propForm) return;
  propEditKey = defKey;
  const d = defKey ? propLibrary[defKey] : null;
  if (propKey) propKey.value = d?.key ?? '';
  if (propIcon) propIcon.value = d?.icon && d.icon !== '•' ? d.icon : '';
  if (propType) propType.value = d?.type ?? 'text';
  if (propOptions) propOptions.value = (d?.options || []).join(',');
  const wrap = propOptions?.closest('.prop-options-wrap');
  if (wrap) wrap.classList.toggle('hidden', d?.type !== 'select' && d?.type !== 'multi');
  propForm.classList.remove('hidden');
  propKey?.focus();
}
function closePropForm() {
  if (propForm) propForm.classList.add('hidden');
  propEditKey = null;
}

/** 添加/编辑属性：校验保留字 → 加入当前卡（自动保存到属性库，便于复用/编辑） */
function onPropFormOk() {
  const key = (propKey.value || '').trim().replace(/\s+/g, '_');
  if (!key) { showToast('属性名不能为空', 'error'); return; }
  if (RESERVED_PROPS.has(key)) { showToast(`「${key}」是保留字段，不能用作属性名`, 'error'); return; }
  const opts = propOptions.value ? propOptions.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];
  const def = { key, label: key, icon: propIcon.value || '•', type: propType.value, ...(opts.length ? { options: opts } : {}) };
  if (propEditKey && propEditKey !== key) {
    // 编辑且改名：迁移库定义 + 迁移当前卡值
    const oldKey = propEditKey;
    if (oldKey in editorProps) { editorProps[key] = editorProps[oldKey]; delete editorProps[oldKey]; }
    propLibrary = { ...propLibrary };
    delete propLibrary[oldKey];
  }
  if (!(key in editorProps)) editorProps[key] = '';
  propLibrary = { ...propLibrary, [key]: def };
  void savePropLibrary();
  const wasEdit = propEditKey !== null;
  renderEditorProps();
  closePropForm();
  propKey.value = ''; propIcon.value = ''; propOptions.value = ''; propType.value = 'text';
  showToast(wasEdit ? `已更新属性「${key}」` : `已添加属性「${key}」（已入库）`, 'success');
}

/** 从属性库复用属性到当前卡 */
function openPropLibrary() {
  const keys = Object.keys(propLibrary);
  if (!keys.length) { showToast('属性库为空', ''); return; }
  const lines = keys.map((k, i) => `${i}. ${propLibrary[k].icon || ''} ${propLibrary[k].label || k}`).join('\n');
  const pick = prompt('从属性库选择（多个用逗号分隔）：\n' + lines, '0');
  if (pick === null) return;
  const idxs = pick.split(/[,，\s]+/).map(s => parseInt(s, 10))
    .filter(n => !Number.isNaN(n) && n >= 0 && n < keys.length);
  for (const i of idxs) { const k = keys[i]; if (!(k in editorProps)) editorProps[k] = ''; }
  renderEditorProps();
}

function closeEditor() {
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

async function saveEditor() {
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
    if (project) localStorage.setItem('journal.lastProject', project);
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
    await refreshAll();
  } catch (e) {
    console.error('[journal] save card failed:', e);
    showToast('保存失败：host 服务未连接（127.0.0.1:8766）', 'error');
  }
}

/* ─── Toast 提示 ────────────────────────────────────── */

let toastTimer = null;
function showToast(msg, kind = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast' + (kind ? ' toast-' + kind : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), kind === 'error' ? 12000 : 2600);
}

/* ─── DOM 引用 ────────────────────────────────────────── */

const els = {
  todayDisplay: document.getElementById('today-display'),
  heatmap: document.getElementById('heatmap-container'),
  heatmapStreak: document.getElementById('heatmap-streak'),
  calPrev: document.getElementById('cal-prev'),
  calNext: document.getElementById('cal-next'),
  calToday: document.getElementById('cal-today'),
  calMonthLabel: document.getElementById('cal-month-label'),
  calendarGrid: document.getElementById('calendar-grid'),
  timelineContainer: document.getElementById('timeline-container'),
  timelineDateHeader: document.getElementById('timeline-date-header'),
  viewPrev: document.getElementById('view-prev'),
  viewNext: document.getElementById('view-next'),
  viewToday: document.getElementById('view-today'),
  viewModeBtns: document.querySelectorAll('.view-mode-btn'),
  btnSpan: document.getElementById('btn-span'),
  btnWide: document.getElementById('btn-wide-mode'),
  cardpoolList: document.getElementById('cardpool-list'),
  cardpoolCount: document.getElementById('cardpool-count'),
  btnNewCard: document.getElementById('btn-new-card'),
  btnTemplate: document.getElementById('btn-template'),
  poolLayoutBtn: document.getElementById('btn-pool-layout'),
  saveViewBtn: document.getElementById('btn-save-view'),
  viewSelect: document.getElementById('pool-view-select'),
  poolFilterRow: document.getElementById('pool-filter-row'),

  // skills
  skillsSection: document.getElementById('skills-section'),
  skillsCount: document.getElementById('skills-count'),
  skillsToggle: document.getElementById('btn-skills-toggle'),
  skillsPanel: document.getElementById('skills-panel'),
  skillsOverall: document.getElementById('skills-overall'),
  skillsList: document.getElementById('skills-list'),
  skillsCopyAll: document.getElementById('btn-skills-copy'),
  hostStatusBtn: document.getElementById('btn-host-status'),
  btnPanels: document.getElementById('btn-panels'),
  board: document.getElementById('board'),
  btnQuickAdd: document.getElementById('btn-quick-add'),
  poolExtra: document.getElementById('pool-extra'),
  poolExtraFilter: document.getElementById('pool-extra-filter'),
};

const HOST_HEALTH_URL = 'http://127.0.0.1:8766/api/health';

async function checkHostHealth() {
  try {
    const res = await fetch(HOST_HEALTH_URL, { signal: AbortSignal.timeout(1200) });
    const data = await res.json();
    const online = data.ok || data.status === 'running';
    setHostStatus(online ? 'online' : 'offline');
    return online;
  } catch {
    setHostStatus('offline');
    return false;
  }
}

/** 切换 header 右上角 host 状态按钮外观 */
function setHostStatus(status) {
  const btn = els.hostStatusBtn;
  if (!btn) return;
  btn.classList.toggle('is-online', status === 'online');
  btn.classList.toggle('is-offline', status === 'offline');
  btn.classList.toggle('is-starting', status === 'starting');
  btn.disabled = status === 'starting';
  if (status === 'online') {
    btn.textContent = '🟢';
    btn.title = 'Host 在线';
    btn.setAttribute('aria-label', 'Host 在线');
  } else if (status === 'offline') {
    btn.textContent = '🔴';
    btn.title = 'Host 未连接，点击启动';
    btn.setAttribute('aria-label', 'Host 未连接，点击启动');
  } else { // starting
    btn.textContent = '⏳';
    btn.title = '正在启动 Host…';
    btn.setAttribute('aria-label', '正在启动 Host…');
  }
}

async function waitForHost(timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await checkHostHealth()) return true;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

async function startHost() {
  if (!els.hostStatusBtn) return;
  setHostStatus('starting');
  try {
    const result = await chrome.runtime.sendMessage({ type: 'journal:start-host' });
    if (!result?.ok) throw new Error(result?.error || 'Native Host 未注册，请先运行 host\\install-host.bat');
    const online = await waitForHost();
    if (!online) throw new Error('启动超时，请确认已运行 host\\install-host.bat');
    await pullFromHost();
    await refreshAll();
    showToast('Host 已启动', 'success');
  } catch (e) {
    setHostStatus('offline');
    showToast(`启动失败：${e.message || '请先运行 host\\install-host.bat'}`, 'error');
  } finally {
    if (els.hostStatusBtn) els.hostStatusBtn.disabled = false;
  }
}

/* ─── 渲染：右视图（月历 / 周历 / 日程） ──────────────────────────────── */

/** dayKey ± n 天 → dayKey（本地时区） */
function addDays(dayKey, n) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toDayKey(dt);
}

/** 右侧头部标题文案 */
function viewHeaderLabel() {
  if (viewMode === 'month') {
    const { year, month } = calendarMonth;
    return `${year}年${month + 1}月`;
  }
  if (viewMode === 'week') {
    const [y, m, d] = weekAnchor.split('-').map(Number);
    const sun = new Date(y, m - 1, d); sun.setDate(sun.getDate() - sun.getDay());
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    return `${toDayKey(sun).slice(5).replace('-', '/')} – ${toDayKey(sat).slice(5).replace('-', '/')} · ${toDayKey(sun).slice(0, 4)}`;
  }
  const date = selectedDate;
  const typeCounts = getCardTypeCounts(allCardsCache, date);
  const parts = [];
  if (typeCounts.text) parts.push(`${typeCounts.text}📝`);
  if (typeCounts.task) parts.push(`${typeCounts.task}☑️`);
  const countStr = parts.length ? ` · ${parts.join(' ')}` : ' · 无卡片';
  return `📅 ${formatDateLabel(date)}${countStr}`;
}

/** 同步取某天卡片（从缓存，按时间排序） */
function getCardsByDaySync(date) {
  if (!Array.isArray(allCardsCache)) return [];
  return allCardsCache
    .filter(c => c.assignedDate === date)
    .sort((a, b) => {
      const sa = getCardStartTime(a), sb = getCardStartTime(b);
      if (sa && sb) return sa.localeCompare(sb);
      if (sa) return -1;
      if (sb) return 1;
      return 0;
    });
}

/** 高亮当前视图模式按钮 */
function markViewMode() {
  els.viewModeBtns?.forEach(b => b.classList.toggle('is-active', b.dataset.mode === viewMode));
}

/** 右侧视图统一入口 */
/**
 * 一次性聚焦滚动：打开面板 / 切换日期 / 切换视图后，让「当前时刻」垂直居中。
 * 不足以居中时钳制到边界（顶部 0 / 底部 maxScroll），不强拽；非今天则聚焦
 * 当天最早一张定时卡（无卡则不滚）。消费后不再干预用户滚动与每分钟 marker 刷新。
 */
let pendingFocusScroll = false;
function requestFocusScroll() { pendingFocusScroll = true; }

function scrollTimelineToFocus(container, prevScroll = 0) {
  if (!container) return;
  if (viewMode === 'month') return; // 月视图无时间轴，也不恢复（整月网格）

  if (pendingFocusScroll) {
    pendingFocusScroll = false;
    let targetY = null;
    if (selectedDate === todayKey()) {
      const now = new Date();
      const nowMin = Math.max(viewStartMin, Math.min(viewEndMin, now.getHours() * 60 + now.getMinutes()));
      targetY = scheduleHeight(nowMin);
    } else {
      // 非今天：聚焦当天最早一张定时卡
      const cards = getCardsByDaySync(selectedDate).filter((c) => getCardStartTime(c));
      if (cards.length) {
        const s = timeToMinutes(getCardStartTime(cards[0]));
        targetY = scheduleHeight(Math.max(viewStartMin, s));
      }
    }
    if (targetY === null) { container.scrollTop = 0; return; }
    const clientH = container.clientHeight;
    const maxScroll = Math.max(0, container.scrollHeight - clientH);
    if (maxScroll === 0) return; // 内容不足一屏，不滚
    // 钳制到边界：贴顶/贴底时停在自然位置，不强行居中
    container.scrollTop = Math.max(0, Math.min(maxScroll, targetY - clientH / 2));
    return;
  }

  // 常规重渲染（host 同步/数据变化）：恢复此前滚动位置，避免 replaceChildren 重置回顶部
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTop = Math.min(Math.max(0, prevScroll), maxScroll);
}

async function renderRightView() {
  markViewMode();
  if (els.timelineDateHeader) els.timelineDateHeader.textContent = viewHeaderLabel();
  const container = els.timelineContainer;
  const prevScroll = container.scrollTop; // 渲染前捕获，供恢复（replaceChildren 会重置滚动）
  container.replaceChildren();
  container.classList.toggle('calview-week-wrap', viewMode === 'week');
  if (viewMode === 'month') { renderMonthGrid(container); return; }
  if (viewMode === 'week') { renderWeekGrid(container); scrollTimelineToFocus(container, prevScroll); return; }
  await renderTimeline();
  scrollTimelineToFocus(container, prevScroll);
}

/** 月历网格 */
function renderMonthGrid(container) {
  const matrix = getMonthMatrix(calendarMonth.year, calendarMonth.month);
  const weekday = document.createElement('div');
  weekday.className = 'calview-weekdays';
  for (const name of ['日', '一', '二', '三', '四', '五', '六']) {
    const s = document.createElement('span');
    s.textContent = name;
    weekday.append(s);
  }
  const grid = document.createElement('div');
  grid.className = 'calview-month-grid';
  const today = todayKey();
  for (const week of matrix) {
    for (const cell of week) {
      const dayEl = document.createElement('div');
      dayEl.className = 'calview-day';
      dayEl.dataset.day = cell.dayKey;
      if (!cell.isCurrentMonth) dayEl.classList.add('is-out-month');
      if (cell.isToday) dayEl.classList.add('is-today');
      if (cell.dayKey === selectedDate) dayEl.classList.add('is-selected');
      const num = document.createElement('div');
      num.className = 'calview-day-num';
      num.textContent = String(cell.day);
      dayEl.append(num);
      const cards = getCardsByDaySync(cell.dayKey);
      const list = document.createElement('div');
      list.className = 'calview-day-cards';
      for (const card of cards.slice(0, 3)) list.append(buildCalSummary(card));
      if (cards.length > 3) {
        const more = document.createElement('div');
        more.className = 'calview-more';
        more.textContent = `+${cards.length - 3}`;
        list.append(more);
      }
      dayEl.append(list);
      dayEl.addEventListener('click', async (e) => {
        if (e.target.closest('.calview-summary')) return;
        selectedDate = cell.dayKey;
        weekAnchor = cell.dayKey;
        calendarMonth = monthOf(cell.dayKey);
        viewMode = 'timeline';
        await refreshAll();
      });
      grid.append(dayEl);
    }
  }
  container.append(weekday, grid);
}

/** 周历 7 列 */
/**
 * 绑定「拖动框选创建时间范围」交互（周视图列 body）。
 * mousedown 起点 → mousemove 实时选区 → mouseup 松手以选中起止时间创建。
 * 纯点击（拖动 < 3px）不触发，由调用方的 click 处理单格创建。
 * @param {HTMLElement} el 容器
 * @param {(startMin:number, endMin:number)=>void} onRange 框选完成回调（分钟）
 */
function bindRangeSelect(el, onRange) {
  let sel = null; // { startM, overlay, dragging }
  let suppressClick = false; // 框选后抑制随后的 click（避免又开一个编辑器）

  const removeSel = () => {
    if (sel?.overlay) sel.overlay.remove();
    sel = null;
  };

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // 仅左键
    if (e.target.closest('.timeline-card, .timeline-now-marker, .card-add-btn')) return;
    const rect = el.getBoundingClientRect();
    const startMin = viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15;
    const startM = Math.max(viewStartMin, Math.min(viewEndMin, startMin));
    const overlay = document.createElement('div');
    overlay.className = 'selection-overlay';
    overlay.style.top = `${scheduleHeight(Math.floor(startM / 15) * 15)}px`;
    overlay.style.height = '0px';
    el.append(overlay);
    sel = { startM, overlay, dragging: false };
  });

  el.addEventListener('mousemove', (e) => {
    if (!sel) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const endMin = viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15;
    const endM = Math.max(viewStartMin, Math.min(viewEndMin, endMin));
    if (Math.abs(endM - sel.startM) * (SLOT_HEIGHT / 15) < 3) return; // 拖动 < 3px 不算框选
    sel.dragging = true;
    const s = Math.floor(Math.min(sel.startM, endM) / 15) * 15;
    const eSlot = Math.ceil(Math.max(sel.startM, endM) / 15) * 15;
    sel.overlay.style.top = `${scheduleHeight(s)}px`;
    sel.overlay.style.height = `${scheduleHeight(eSlot) - scheduleHeight(s)}px`;
    sel.endM = endM;
  });

  el.addEventListener('mouseup', (e) => {
    if (!sel) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const endMin = viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15;
    const endM = Math.max(viewStartMin, Math.min(viewEndMin, endMin));
    const { startM, dragging } = sel;
    removeSel();
    if (!dragging) return; // 纯点击 → 走 click 单格创建
    suppressClick = true;
    // 起止对齐 15 分钟网格，最小 15 分钟，不超出视图范围
    let s = Math.floor(Math.min(startM, endM) / 15) * 15;
    let eSlot = Math.ceil(Math.max(startM, endM) / 15) * 15;
    if (eSlot - s < 15) eSlot = s + 15;
    eSlot = Math.min(viewEndMin, eSlot);
    if (eSlot - s < 15) s = Math.max(viewStartMin, eSlot - 15);
    onRange(s, eSlot);
  });

  // capture：抢在单格 click 之前抑制一次
  el.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; e.stopPropagation(); }
  }, true);
}

/**
 * 周视图：Google Calendar 风格 —— 垂直占满容器 + 左侧小时刻度尺 +
 * 7 天列按真实时间比例定位卡片（复用日视图时间线引擎，保证两视图像素一致）
 */
function renderWeekGrid(container) {
  const [y, m, d] = weekAnchor.split('-').map(Number);
  const sunday = new Date(y, m - 1, d); sunday.setDate(sunday.getDate() - sunday.getDay());
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(sunday); dt.setDate(sunday.getDate() + i);
    days.push(toDayKey(dt));
  }
  const today = todayKey();
  const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekShort = ['日', '一', '二', '三', '四', '五', '六'];

  // ── 全周时间范围：跟随 timelineSpan（08–22 / 24h）+ 全周数据自动扩展（与日视图同逻辑）
  viewStartMin = timelineSpan === 'full' ? 0 : DAY_START_MIN;
  viewEndMin = timelineSpan === 'full' ? 24 * 60 : DAY_END_MIN;
  const allTimed = [];
  for (const dayKey of days) {
    for (const c of getCardsByDaySync(dayKey)) {
      if (!getCardStartTime(c)) continue;
      const s = timeToMinutes(getCardStartTime(c));
      const e = timeToMinutes(getCardEndTime(c) ?? addMinutes(getCardStartTime(c), 15));
      viewStartMin = Math.min(viewStartMin, Math.floor(s / 15) * 15);
      viewEndMin = Math.max(viewEndMin, Math.ceil(e / 15) * 15);
      allTimed.push({ card: c, dayKey, start: s, end: e });
    }
  }
  viewStartMin = Math.max(0, viewStartMin);
  viewEndMin = Math.min(24 * 60, viewEndMin);
  const bodyH = scheduleHeight(viewEndMin);

  const weekEl = document.createElement('div');
  weekEl.className = 'calview-week-grid';

  // ── 左侧刻度尺
  const ruler = document.createElement('div');
  ruler.className = 'calview-week-ruler';
  const rulerHead = document.createElement('div');
  rulerHead.className = 'calview-week-ruler-head';
  ruler.append(rulerHead);
  const rulerBody = document.createElement('div');
  rulerBody.className = 'calview-week-ruler-body';
  rulerBody.style.height = `${bodyH}px`;
  for (let mm = viewStartMin; mm <= viewEndMin; mm += 60) {
    const lbl = document.createElement('div');
    lbl.className = 'calview-week-ruler-label';
    lbl.style.top = `${scheduleHeight(mm)}px`;
    lbl.textContent = minutesToTime(mm);
    rulerBody.append(lbl);
  }
  ruler.append(rulerBody);
  weekEl.append(ruler);

  // ── 7 天列
  for (const dayKey of days) {
    const col = document.createElement('div');
    col.className = 'calview-week-col';
    col.dataset.day = dayKey;
    if (dayKey === today) col.classList.add('is-today');
    if (dayKey === selectedDate) col.classList.add('is-selected');

    const head = document.createElement('div');
    head.className = 'calview-week-head';
    const dt = new Date(Number(dayKey.slice(0, 4)), Number(dayKey.slice(5, 7)) - 1, Number(dayKey.slice(8, 10)));
    const cards = getCardsByDaySync(dayKey);
    // 紧凑表头：单字星期 + 日号（窄列 7 天宽度有限，省去月份）
    head.innerHTML = `<span title="${weekNames[dt.getDay()]} ${dayKey}">${weekShort[dt.getDay()]} ${dt.getDate()}</span><span class="calview-week-count">${cards.length}</span>`;
    head.addEventListener('click', async () => {
      selectedDate = dayKey;
      weekAnchor = dayKey;
      calendarMonth = monthOf(dayKey);
      viewMode = 'timeline';
      requestFocusScroll(); // 跳到该日时间线后聚焦
      await refreshAll();
    });
    col.append(head);

    const body = document.createElement('div');
    body.className = 'calview-week-body';
    body.style.height = `${bodyH}px`;

    // 网格线：每 15 分钟一条，整点加粗
    for (let mm = viewStartMin; mm <= viewEndMin; mm += 15) {
      const line = document.createElement('div');
      line.className = 'calview-week-gridline' + (mm % 60 === 0 ? ' is-hour' : '');
      line.style.top = `${scheduleHeight(mm)}px`;
      body.append(line);
    }

    // 当前时刻线（仅今天列）
    if (dayKey === today) {
      const now = new Date();
      const nowMin = Math.max(viewStartMin, Math.min(viewEndMin, now.getHours() * 60 + now.getMinutes()));
      const marker = document.createElement('div');
      marker.className = 'timeline-now-marker';
      marker.style.top = `${scheduleHeight(nowMin)}px`;
      const tag = document.createElement('span');
      tag.className = 'timeline-now-tag';
      tag.textContent = `● 现在 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      marker.append(tag);
      const lineEl = document.createElement('span');
      lineEl.className = 'timeline-now-line';
      marker.append(lineEl);
      marker.title = '点击在当前时间新建卡片';
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditor(null, snapUpToQuarter(currentTime()), dayKey);
      });
      body.append(marker);
    }

    // 卡片：按天分道后复用 renderTimelineCard（绝对定位到列内对应时刻）
    const dayTimed = allTimed.filter((t) => t.dayKey === dayKey);
    const laneMap = layoutScheduleLanes(dayTimed.map((t) => ({ id: t.card.id, start: t.start, end: t.end })));
    for (const t of dayTimed) {
      const cardEl = renderTimelineCard(t.card, laneMap.get(t.card.id) ?? null, false, dayKey);
      body.append(cardEl);
      // 卡片 hover「＋」：在同一时间新建（对齐日视图 .card-add-btn 交互）
      const addBtn = document.createElement('button');
      addBtn.className = 'card-add-btn';
      addBtn.title = '在同一时间新建卡片';
      addBtn.textContent = '＋';
      addBtn.style.top = `${scheduleHeight((t.start + t.end) / 2)}px`;
      addBtn.style.left = 'auto';
      addBtn.style.right = '2px';
      body.append(addBtn);
      const showAdd = () => { cardEl.classList.add('is-hover-add'); addBtn.classList.add('is-visible'); };
      const hideAdd = () => { cardEl.classList.remove('is-hover-add'); addBtn.classList.remove('is-visible'); };
      cardEl.addEventListener('mouseenter', showAdd);
      cardEl.addEventListener('mouseleave', hideAdd);
      addBtn.addEventListener('mouseenter', showAdd);
      addBtn.addEventListener('mouseleave', hideAdd);
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditor(null, getCardStartTime(t.card) ?? currentTime(), dayKey);
      });
    }

    // 点击空白单格创建 + 拖动框选创建时间范围
    const onRange = (sMin, eMin) => {
      openEditor(null, minutesToTime(sMin), dayKey);
      const endEl = document.getElementById('card-editor-end');
      if (endEl) {
        endEl.value = minutesToTime(eMin); // 覆盖默认 start+15，预填选区时长
        updateEditorDuration(); // 时长标签需随之重算，否则仍显示默认 15 分钟
      }
    };
    bindRangeSelect(body, onRange);
    body.addEventListener('click', (e) => {
      if (e.target.closest('.timeline-card, .timeline-now-marker')) return;
      const rect = body.getBoundingClientRect();
      const mins = viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15;
      openEditor(null, snapToQuarter(minutesToTime(mins)), dayKey);
    });

    col.append(body);

    // 无时间/全天卡片：置于表头正下方（列高可达 1700px，放底部等于藏起来）
    const noTimeCards = cards.filter((c) => !getCardStartTime(c));
    if (noTimeCards.length) {
      const all = document.createElement('div');
      all.className = 'schedule-allday';
      const head = document.createElement('div');
      head.className = 'schedule-allday-label';
      head.textContent = '全天';
      all.append(head);
      const wrap = document.createElement('div');
      wrap.className = 'schedule-allday-cards';
      for (const card of noTimeCards) wrap.append(renderTimelineCard(card, null, true, dayKey));
      all.append(wrap);
      col.insertBefore(all, body);
    }

    weekEl.append(col);
  }

  container.append(weekEl);
}

/** 卡片摘要（月历/周历共用）：时间 + 类型图标 + 内容截断，点击进编辑器 */
function buildCalSummary(card) {
  const el = document.createElement('div');
  el.className = `calview-summary type-${card.type || 'text'}` + (card.type === 'task' && card.done ? ' is-done' : '');
  const start = getCardStartTime(card);
  const timeHtml = start ? `<span class="calview-summary-time">${start}</span>` : '';
  el.innerHTML = `${timeHtml}<span class="card-type-icon">${typeIcon(card.type, card.emoji)}</span><span class="calview-summary-text">${escapeHtml(card.content || '(空卡片)')}</span>`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    openEditor(card, start ?? currentTime(), card.assignedDate ?? selectedDate);
  });
  return el;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ─── 渲染：时间线 ──────────────────────────────────────── */

async function renderTimeline() {
  const date = selectedDate;
  const dayCards = await getCardsByDay(date);
  const typeCounts = getCardTypeCounts(allCardsCache, date);

  // ── 视图切换：timeline 模式才写入 dateHeader ──
  if (viewMode === 'timeline') {
    // 标题
    const parts = [];
    if (typeCounts.text) parts.push(`${typeCounts.text}📝`);
    if (typeCounts.task) parts.push(`${typeCounts.task}☑️`);
    const countStr = parts.length ? ` · ${parts.join(' ')}` : ' · 无卡片';
    els.timelineDateHeader.textContent = `📅 ${formatDateLabel(date)}${countStr}`;
  }

  // 日程画布（08:00–22:30，15 分钟网格）
  const container = els.timelineContainer;
  container.replaceChildren();

  const timedCards = dayCards.filter(c => getCardStartTime(c));

  // 视图边界：默认 08:00–22:30，timelineSpan='full' 时 00:00–24:00；数据超出时自动扩展
  viewStartMin = timelineSpan === 'full' ? 0 : DAY_START_MIN;
  viewEndMin = timelineSpan === 'full' ? 24 * 60 : DAY_END_MIN;
  for (const c of timedCards) {
    const s = timeToMinutes(getCardStartTime(c));
    const e = timeToMinutes(getCardEndTime(c) ?? addMinutes(getCardStartTime(c), 15));
    viewStartMin = Math.min(viewStartMin, Math.floor(s / 15) * 15);
    viewEndMin = Math.max(viewEndMin, Math.ceil(e / 15) * 15);
  }
  viewStartMin = Math.max(0, viewStartMin);
  viewEndMin = Math.min(24 * 60, viewEndMin);

  const canvas = document.createElement('div');
  canvas.className = 'schedule-canvas';
  canvas.style.height = `${scheduleHeight(viewEndMin)}px`;
  container.append(canvas);

  // 当天无卡片：空态引导（点击画布仍可新建）
  if (!dayCards.length) {
    const hint = document.createElement('div');
    hint.className = 'timeline-empty-hint';
    const b = document.createElement('b');
    b.textContent = '今天还没有安排';
    const sub = document.createElement('span');
    sub.textContent = '点击空白处新建卡片';
    hint.append(b, sub);
    container.append(hint);
  }

  // 背景网格线（每 15 分钟，整点加粗并显示标签）
  for (let m = viewStartMin; m <= viewEndMin; m += 15) {
    const line = document.createElement('div');
    const isHour = m % 60 === 0;
    line.className = 'schedule-grid-line' + (isHour ? ' is-hour' : '');
    line.style.top = `${scheduleHeight(m)}px`;
    if (isHour) {
      const lbl = document.createElement('span');
      lbl.className = 'schedule-grid-label';
      lbl.textContent = minutesToTime(m);
      line.append(lbl);
    }
    line.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditor(null, snapToQuarter(minutesToTime(m)), date);
    });
    canvas.append(line);
  }

  // 点击画布空白区域：根据 Y 坐标计算时间，打开新建编辑器
  // 卡片/marker 内部冒泡上来的点击直接忽略，否则会覆盖已打开的编辑态
  canvas.addEventListener('click', (e) => {
    if (e.target.closest('.timeline-card, .timeline-now-marker')) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const mins = viewStartMin + (y / SLOT_HEIGHT) * 15;
    const snapped = snapToQuarter(minutesToTime(mins));
    openEditor(null, snapped, date);
  });

  // ── 框选创建时间范围：空白区 mousedown → 拖动 → mouseup ──
  // 拖动后选区代表一个时间段，松手弹编辑器预填起止时间；纯点击保持单格创建
  let sel = null; // { startMin, overlay }
  let suppressCanvasClick = false; // 框选后抑制 canvas 的 click（避免二次创建）
  const removeSel = () => {
    if (sel?.overlay) sel.overlay.remove();
    sel = null;
  };

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // 仅左键
    // 在卡片/marker/网格标签上按下不框选（网格线单击创建走原有逻辑）
    if (e.target.closest('.timeline-card, .timeline-now-marker, .schedule-grid-label, .card-add-btn')) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const startMin = viewStartMin + (y / SLOT_HEIGHT) * 15;
    // 钳制到视图范围内
    const startM = Math.max(viewStartMin, Math.min(viewEndMin, startMin));
    const overlay = document.createElement('div');
    overlay.className = 'selection-overlay';
    overlay.style.top = `${scheduleHeight(Math.floor(startM / 15) * 15)}px`;
    overlay.style.height = '0px';
    canvas.append(overlay);
    sel = { startM, overlay, dragging: false };
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!sel) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const endMin = viewStartMin + (y / SLOT_HEIGHT) * 15;
    const endM = Math.max(viewStartMin, Math.min(viewEndMin, endMin));
    // 拖动超过 3px 才视为框选（否则是单击）
    const delta = endM - sel.startM;
    if (Math.abs(delta) * (SLOT_HEIGHT / 15) < 3) return;
    sel.dragging = true;
    // 选区：起点到终点的 15 分钟网格范围
    const s = Math.min(sel.startM, endM);
    const e2 = Math.max(sel.startM, endM);
    const sSlot = Math.floor(s / 15) * 15;
    const eSlot = Math.ceil(e2 / 15) * 15;
    sel.overlay.style.top = `${scheduleHeight(sSlot)}px`;
    sel.overlay.style.height = `${scheduleHeight(eSlot) - scheduleHeight(sSlot)}px`;
    sel.endM = endM;
  });

  canvas.addEventListener('mouseup', async (e) => {
    if (!sel) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const endMin = viewStartMin + (y / SLOT_HEIGHT) * 15;
    const endM = Math.max(viewStartMin, Math.min(viewEndMin, endMin));
    const { startM, dragging } = sel;
    removeSel();

    if (!dragging) return; // 纯点击 → 走 canvas click（单格创建）
    suppressCanvasClick = true;

    // 起止时间：向上取整/向下取整到 15 分钟，保证最小 15 分钟
    const s = Math.floor(Math.min(startM, endM) / 15) * 15;
    const e2 = Math.max(startM, endM);
    let eSlot = Math.ceil(e2 / 15) * 15;
    if (eSlot - s < 15) eSlot = s + 15;
    eSlot = Math.min(viewEndMin, eSlot);
    if (eSlot - s < 15) s = Math.max(viewStartMin, eSlot - 15);

    const startTime = minutesToTime(s);
    openEditor(null, startTime, date);
    // 编辑器预填结束时间（openEditor 自动算 end = start + 15，需覆盖为选区时长）
    const endEl = document.getElementById('card-editor-end');
    if (endEl) endEl.value = minutesToTime(eSlot);
  });

  // 框选后抑制一次 canvas click（mouseup 已触发编辑器，避免 click 再开一个）
  canvas.addEventListener('click', (e) => {
    if (suppressCanvasClick) { suppressCanvasClick = false; e.stopPropagation(); }
  }, true); // capture：抢在原有 click 之前

  // ── 拖拽来自卡片池的卡片：根据 Y 坐标设置时间槽 ──
  canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    canvas.classList.add('drag-over');
  });
  canvas.addEventListener('dragleave', () => {
    canvas.classList.remove('drag-over');
  });
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    canvas.classList.remove('drag-over');
    const cardId = e.dataTransfer.getData('text/plain');
    if (!cardId) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMins = viewStartMin + (y / SLOT_HEIGHT) * 15;
    const snapped = snapToQuarter(minutesToTime(Math.max(viewStartMin, Math.min(viewEndMin - 15, rawMins))));
    updateCardEntry(cardId, {
      assignedDate: date,
      time: snapped,
      startTime: snapped,
      endTime: addMinutes(snapped, 15),
    }).then(async () => {
      await refreshAll();
      // 拖拽放置后直接打开编辑器（「拖到单元格进行编辑」）
      const dropped = allCardsCache.find(c => c.id === cardId);
      if (dropped) openEditor(dropped, snapped, date);
    })
      .catch(err => console.error('[journal] drop move failed:', err));
  });

  // 重叠区间 lane 分配
  const laneItems = timedCards.map(c => ({
    id: c.id,
    start: timeToMinutes(getCardStartTime(c)),
    end: timeToMinutes(getCardEndTime(c) ?? addMinutes(getCardStartTime(c), 15)),
  }));
  const lanes = layoutScheduleLanes(laneItems);

  for (const card of timedCards) {
    const laneInfo = lanes.get(card.id);
    const cardEl = renderTimelineCard(card, laneInfo);
    canvas.append(cardEl);

    // 最右侧卡片：hover 时在右侧滑入"同一时间新建"按钮
    // 按钮直接放在 canvas 上（避免 overflow 裁剪），通过 JS 鼠标联动控制显示
    if (laneInfo) {
      const laneCount = Math.max(1, laneInfo.laneCount);
      if (laneInfo.lane >= laneCount - 1) {
        const startMin = timeToMinutes(getCardStartTime(card));
        const endMin = timeToMinutes(getCardEndTime(card) ?? addMinutes(getCardStartTime(card), 15));
        const midMin = (startMin + endMin) / 2;

        const addBtn = document.createElement('button');
        addBtn.className = 'card-add-btn';
        addBtn.title = '在同一时间新建卡片';
        addBtn.textContent = '＋';
        addBtn.style.top = `${scheduleHeight(midMin)}px`;
        addBtn.style.left = `calc(${((laneInfo.lane + 1) / laneCount) * 100}% - 29px)`;
        canvas.append(addBtn);

        const showAdd = () => {
          cardEl.classList.add('is-hover-add');
          addBtn.classList.add('is-visible');
        };
        const hideAdd = () => {
          cardEl.classList.remove('is-hover-add');
          addBtn.classList.remove('is-visible');
        };
        cardEl.addEventListener('mouseenter', showAdd);
        cardEl.addEventListener('mouseleave', hideAdd);
        addBtn.addEventListener('mouseenter', showAdd);
        addBtn.addEventListener('mouseleave', hideAdd);
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openEditor(null, getCardStartTime(card) ?? currentTime(), selectedDate);
        });
      }
    }
  }
  renderCurrentTimeMarker();

  // 无时间的卡片（置底，全天区）
  const noTimeCards = dayCards.filter(c => !getCardStartTime(c));
  if (noTimeCards.length) {
    const all = document.createElement('div');
    all.className = 'schedule-allday';
    const head = document.createElement('div');
    head.className = 'schedule-allday-label';
    head.textContent = '全天';
    all.append(head);
    const wrap = document.createElement('div');
    wrap.className = 'schedule-allday-cards';
    for (const card of noTimeCards) wrap.append(renderTimelineCard(card, null, true));
    all.append(wrap);
    container.append(all);
  }
}

/** 日程画布默认范围（分钟）：08:00–22:30 */
const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 22 * 60 + 30;
/** 当前视图范围（分钟）：默认 08:00–22:30；当天卡片超出时由 renderTimeline 扩展 */
let viewStartMin = DAY_START_MIN;
let viewEndMin = DAY_END_MIN;
/** 15 分钟一格的高度（px） */
const SLOT_HEIGHT = 30;

/** 时间分钟数 → 画布 top 偏移（px，基于当前视图范围） */
function scheduleHeight(mins) {
  return (mins - viewStartMin) / 15 * SLOT_HEIGHT;
}

/**
 * 渲染单张日程卡片（绝对定位在画布上）
 * @param {object} card
 * @param {{lane:number, laneCount:number}|null} lane — null 表示全天卡片
 * @param {boolean} [allday=false]
 * @param {string} [dateOverride] — 周/月视图指定目标日期（默认用全局 selectedDate）
 */
function renderTimelineCard(card, lane = null, allday = false, dateOverride = null) {
  const el = document.createElement('div');
  el.className = 'timeline-card' + (allday ? ' is-allday' : '');
  el.dataset.id = card.id;

  if (!allday && lane) {
    const start = getCardStartTime(card);
    const end = getCardEndTime(card) ?? addMinutes(start, 15);
    const dur = Math.max(15, timeToMinutes(end) - timeToMinutes(start));
    // 短卡片（时长 ≤ 30 分钟）紧凑横向布局：单行展示时间+内容前缀；拖拽时保持紧凑
    if (dur <= 30) el.classList.add('is-short');
    const laneCount = Math.max(1, lane.laneCount);
    el.style.top = `${scheduleHeight(timeToMinutes(start))}px`;
    el.style.height = `${(dur / 15) * SLOT_HEIGHT}px`;
    el.style.left = `calc(${(lane.lane / laneCount) * 100}% + 3px)`;
    el.style.setProperty('--lane-w', `calc(${100 / laneCount}% - 6px)`);
    el.style.width = 'var(--lane-w)';
    el.dataset.start = start;
    el.dataset.end = end;
  }

  const isShort = el.classList.contains('is-short');

  // 来源角标：标在 header，title 为完整 provenance（hover 可见）
  const originIcon = { human: '👤', 'agent-assisted': '🤖', 'agent-auto': '⚙️' };
  const by = card.meta?.createdBy ?? null;
  const originBadge = by?.origin ? `<span class="card-origin" title="${formatProvenance(by)}">${originIcon[by.origin] ?? '👤'}</span>` : '';

  // Header（短卡片只显示开始时间，把横向空间让给内容）
  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `
    ${originBadge}
    <span class="card-type-icon">${typeIcon(card.type, card.emoji)}</span>
    <span class="card-time">${allday ? '全天' : isShort ? getCardStartTime(card) : `${getCardStartTime(card)}–${getCardEndTime(card) ?? addMinutes(getCardStartTime(card), 15)}`}</span>
    <span class="card-meta">${!allday && !isShort ? `${Math.max(15, getCardDuration(card))} 分钟` : ''}</span>
  `;

  // Body
  const body = document.createElement('div');
  body.className = 'card-body' + (card.type === 'task' && card.done ? ' is-done' : '');
  body.textContent = card.content || '(空卡片)';

  // Footer
  const footer = buildCardFooter(card);

  // 点击卡片编辑（拖拽后抑制一次；阻止冒泡到 canvas，避免二次打开空编辑器）
  let suppressClick = false;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (suppressClick) { suppressClick = false; return; }
    openEditor(card, getCardStartTime(card) ?? currentTime(), dateOverride ?? selectedDate);
  });

  // 非全天卡片：底部 resize 手柄调整结束时间
  if (!allday && lane) {
    const handle = document.createElement('div');
    handle.className = 'card-resize-handle';
    handle.title = '拖动调整时长（15 分钟吸附）';
    let dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      e.preventDefault();
      const rect = el.parentElement.getBoundingClientRect();
      const rawMins = viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15;
      let endMin = Math.round(rawMins / 15) * 15;
      const startMin = timeToMinutes(getCardStartTime(card));
      endMin = Math.max(startMin + 15, endMin);
      endMin = Math.min(viewEndMin, endMin);
      const end = minutesToTime(endMin);
      const dur = endMin - startMin;
      el.dataset.end = end;
      el.style.height = `${(dur / 15) * SLOT_HEIGHT}px`;
      const time = el.querySelector('.card-time');
      const isShort = el.classList.contains('is-short');
      if (time) time.textContent = isShort ? getCardStartTime(card) : `${getCardStartTime(card)}–${end}`;
      const meta = el.querySelector('.card-meta');
      if (meta) meta.textContent = isShort ? '' : `${dur} 分钟`;
    };
    const onUp = async (e) => {
      if (!dragging) return;
      dragging = false;
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('is-resizing');
      suppressClick = true;
      const start = getCardStartTime(card);
      // 若 pointerup 未经过 pointermove（如只点了 handle），从当前高度反推结束时间
      let end = el.dataset.end;
      if (!end) {
        const heightPx = el.getBoundingClientRect().height || SLOT_HEIGHT;
        const dur = Math.max(15, Math.round((heightPx / SLOT_HEIGHT) * 15 / 15) * 15);
        end = minutesToTime(timeToMinutes(start) + dur);
      }
      if (start && end) {
        try {
          await updateCardEntry(card.id, { time: start, startTime: start, endTime: end });
          await refreshAll();
        } catch (err) {
          console.error('[journal] resize save failed:', err);
        }
      }
    };
    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      document.body.classList.add('is-resizing');
      handle.setPointerCapture(e.pointerId);
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });
    el.append(handle);
  }

  // 非全天卡片：拖动主体（header/body 区域）纵向移动，改变开始时间、时长不变
  // 15 分钟吸附、钳制到画布范围，拖放后持久化并刷新（lane 自动重排）
  if (!allday && lane) {
    const startMin = timeToMinutes(getCardStartTime(card));
    const endMin = timeToMinutes(getCardEndTime(card) ?? addMinutes(getCardStartTime(card), 15));
    const dur = Math.max(15, endMin - startMin);
    let dragging = false;
    let moved = false;
    let grabOffsetMin = 0;
    let startY = 0;
    const MOVE_THRESHOLD_PX = 4; // 忽略点击时的微小抖动，避免误判为拖动
    const onMove = (e) => {
      if (!dragging) return;
      if (!moved && Math.abs(e.clientY - startY) < MOVE_THRESHOLD_PX) return;
      e.preventDefault();
      moved = true;
      const rect = el.parentElement.getBoundingClientRect();
      const rawMins = viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15 - grabOffsetMin;
      const snappedMin = Math.round(rawMins / 15) * 15;
      // 钳制：开始时间 ∈ [视图上界, 视图下界 - dur]，保证卡片始终在画布内
      const newStartMin = Math.max(viewStartMin, Math.min(viewEndMin - dur, snappedMin));
      const newStart = minutesToTime(newStartMin);
      const newEnd = minutesToTime(newStartMin + dur);
      el.dataset.start = newStart;
      el.dataset.end = newEnd;
      el.style.top = `${scheduleHeight(newStartMin)}px`;
      const time = el.querySelector('.card-time');
      const isShort = el.classList.contains('is-short');
      if (time) time.textContent = isShort ? newStart : `${newStart}–${newEnd}`;
      const meta = el.querySelector('.card-meta');
      if (meta) meta.textContent = isShort ? '' : `${dur} 分钟`;
    };
    const onUp = async () => {
      if (!dragging) return;
      dragging = false;
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('is-dragging');
      el.classList.remove('is-dragging');
      // 仅在真正发生位移时才抑制点击并持久化；纯点击保持编辑功能
      if (!moved) return;
      suppressClick = true;
      const newStart = el.dataset.start;
      const newEnd = el.dataset.end;
      if (newStart && newEnd) {
        try {
          await updateCardEntry(card.id, { time: newStart, startTime: newStart, endTime: newEnd });
          await refreshAll();
        } catch (err) {
          console.error('[journal] card move save failed:', err);
        }
      }
    };
    el.addEventListener('pointerdown', (e) => {
      // 不拦截 footer 按钮与 resize 手柄的交互
      if (e.target.closest('.card-footer, .card-resize-handle')) return;
      dragging = true;
      moved = false;
      startY = e.clientY;
      const grabY = e.clientY - el.getBoundingClientRect().top;
      grabOffsetMin = (grabY / SLOT_HEIGHT) * 15;
      document.body.classList.add('is-dragging');
      el.classList.add('is-dragging');
      el.setPointerCapture(e.pointerId);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    });
  }

  el.append(header, body, footer);
  return el;
}

/** 构建卡片底部操作区（完成/类型/删除） */
function buildCardFooter(card) {
  const footer = document.createElement('div');
  footer.className = 'card-footer';

  if (Array.isArray(card.tags) && card.tags.length) {
    const chips = document.createElement('span');
    chips.className = 'card-tags';
    for (const name of card.tags) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip is-static';
      chip.textContent = name;
      chips.append(chip);
    }
    footer.append(chips);
  }

  if (card.type === 'task') {
    const doneBtn = document.createElement('button');
    doneBtn.className = 'card-footer-btn done-btn';
    doneBtn.textContent = card.done ? '↩️ 撤销' : '✅ 完成';
    doneBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await updateCardEntry(card.id, { done: !card.done });
      await refreshAll();
    });
    footer.append(doneBtn);
  }

  const typeBtn = document.createElement('button');
  typeBtn.className = 'card-footer-btn';
  typeBtn.textContent = '🔄';
  typeBtn.title = '切换类型';
  typeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const next = card.type === 'text' || card.type === 'idea' ? 'task' : 'text';
    await updateCardEntry(card.id, { type: next });
    await refreshAll();
  });
  footer.append(typeBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'card-footer-btn';
  delBtn.textContent = '🗑️';
  delBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm('删除这张卡片？')) {
      await deleteCardEntry(card.id);
      await refreshAll();
    }
  });
  footer.append(delBtn);
  return footer;
}

/**
 * 今日当前时间刻度 marker：只在今天显示，绝对定位在画布对应 Y 坐标，绿色横线 + 「现在 HH:mm」。
 * 范围外钳制到画布顶部/底部，保证可见。
 */
function renderCurrentTimeMarker() {
  const canvas = els.timelineContainer.querySelector('.schedule-canvas');
  if (!canvas) return;

  // 移除上一次的 marker，避免每次 refreshAll 叠加
  canvas.querySelectorAll('.timeline-now-marker').forEach(el => el.remove());

  // 仅今天显示
  if (selectedDate !== todayKey()) return;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const clamped = Math.max(viewStartMin, Math.min(viewEndMin, nowMin));
  const nowLabel =
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');

  const marker = document.createElement('div');
  marker.className = 'timeline-now-marker';
  marker.style.top = `${scheduleHeight(clamped)}px`;
  const tag = document.createElement('span');
  tag.className = 'timeline-now-tag';
  tag.textContent = `● 现在 ${nowLabel}`;
  marker.append(tag);
  const line = document.createElement('span');
  line.className = 'timeline-now-line';
  marker.append(line);
  marker.title = '点击在当前时间新建卡片';
  marker.setAttribute('role', 'button');
  marker.tabIndex = 0;
  const createAtNow = () => openEditor(null, snapUpToQuarter(currentTime()), selectedDate);
  marker.addEventListener('click', (e) => {
    e.stopPropagation();
    createAtNow();
  });
  marker.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      createAtNow();
    }
  });
  canvas.append(marker);
}

/** 每分钟更新今日当前时间 marker（不影响已有时间槽/卡片） */
function startNowMarkerTimer() {
  setInterval(() => {
    renderCurrentTimeMarker();
  }, 60 * 1000);
}

/* ─── 渲染：统一卡片池（文本/待办统一，待办只是状态筛选） ─────── */

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'active', label: '⏳ 待办' },
  { value: 'todo', label: '📌 未开始' },
  { value: 'doing', label: '🔥 进行中' },
  { value: 'done', label: '✅ 已完成' },
  { value: 'none', label: '📝 纯记录' },
];
const STATUS_LABEL = { todo: '待办', doing: '进行中', done: '已完成', none: '纯记录' };

/** 状态匹配：active = todo ∪ doing（待办视图） */
function statusMatches(card, f) {
  if (!f) return true;
  if (f === 'active') return card.status === 'todo' || card.status === 'doing';
  return card.status === f;
}

/** 卡片池状态 + 项目 筛选条（渲染到 pool-filter-row） */
function renderPoolFilters() {
  const row = els.poolFilterRow;
  if (!row) return;
  row.replaceChildren();
  for (const { value, label } of STATUS_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (poolStatusFilter === value ? ' is-active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      poolStatusFilter = value;
      activeViewId = '';
      renderCardPool();
    });
    row.append(btn);
  }
  // 筛选区（项目/标签，渐进披露）：静态容器，JS 只填内容
  const extra = els.poolExtra;
  if (extra) {
    extra.replaceChildren();
    // 项目筛选
    const projects = [...new Set((allCardsCache ?? []).map(c => c.project).filter(Boolean))];
    if (projects.length) {
      const label = document.createElement('span');
      label.className = 'pool-extra-label';
      label.textContent = '项目';
      extra.append(label);
      const sel = document.createElement('select');
      sel.className = 'pool-project-select';
      sel.title = '按项目筛选';
      const none = document.createElement('option');
      none.value = ''; none.textContent = '全部';
      sel.append(none);
      for (const p of projects) {
        const o = document.createElement('option');
        o.value = p; o.textContent = p;
        sel.append(o);
      }
      sel.value = poolProjectFilter;
      sel.addEventListener('change', () => { poolProjectFilter = sel.value; activeViewId = ''; renderCardPool(); });
      extra.append(sel);
    }
  }
}

/** 卡片池标签筛选（填充到筛选区 #pool-extra） */
function renderPoolTagFilters(pool) {
  const extra = els.poolExtra;
  if (!extra) return;
  const names = [...new Set(pool.flatMap(c => c.tags ?? []))];
  if (!names.length) {
    if (els.poolExtraFilter) els.poolExtraFilter.hidden = !extra.querySelector('.pool-project-select');
    return;
  }
  if (els.poolExtraFilter) els.poolExtraFilter.hidden = false;
  const label = document.createElement('span');
  label.className = 'pool-extra-label';
  label.textContent = '标签';
  extra.append(label);
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'chip' + (poolTagFilter ? '' : ' is-active');
  all.textContent = '# 全部';
  all.addEventListener('click', () => { poolTagFilter = ''; activeViewId = ''; renderCardPool(); });
  extra.append(all);
  for (const name of names) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (poolTagFilter === name ? ' is-active' : '');
    btn.textContent = '#' + name;
    btn.addEventListener('click', () => { poolTagFilter = name; activeViewId = ''; renderCardPool(); });
    extra.append(btn);
  }
}

/** 小芯片（属性/日期展示） */
function chipSpan(cls, text) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

async function renderCardPool() {
  const all = allCardsCache.filter(c => !c.deleted);
  const pool = all.filter(c => {
    const sOk = statusMatches(c, poolStatusFilter);
    const tagOk = !poolTagFilter || (c.tags ?? []).includes(poolTagFilter);
    const projOk = !poolProjectFilter || (c.project ?? '') === poolProjectFilter;
    return sOk && tagOk && projOk;
  });
  els.cardpoolCount.textContent = pool.length;
  els.cardpoolList.replaceChildren();
  els.cardpoolList.classList.toggle('is-list', poolLayout === 'list');
  renderPoolFilters();
  renderPoolTagFilters(all);

  if (!pool.length) {
    const li = document.createElement('li');
    li.className = 'todo-empty';
    const filtering = !!(poolStatusFilter || poolTagFilter || poolProjectFilter || activeViewId);
    const title = document.createElement('div');
    title.className = 'empty-title';
    if (filtering) {
      title.textContent = '没有符合当前筛选的卡片';
      const act = document.createElement('button');
      act.type = 'button';
      act.className = 'empty-action';
      act.textContent = '清除筛选';
      act.addEventListener('click', () => {
        poolStatusFilter = ''; poolTagFilter = ''; poolProjectFilter = ''; activeViewId = '';
        renderCardPool();
      });
      li.append(title, act);
    } else {
      title.textContent = all.length ? '还没有卡片' : '今天还没有记录';
      const act = document.createElement('button');
      act.type = 'button';
      act.className = 'empty-action';
      act.textContent = '＋ 新建卡片';
      act.addEventListener('click', () => openEditor(null, currentTime(), selectedDate));
      li.append(title, act);
    }
    els.cardpoolList.append(li);
    return;
  }

  for (const card of pool) {
    const li = document.createElement('li');
    li.className = 'cardpool-item status-' + (card.status || 'none');
    if (card.status === 'done') li.classList.add('is-done');
    li.dataset.id = card.id;
    // 键盘可达：卡片可 Tab 聚焦，Enter/空格打开编辑器
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `${card.title || card.content || '空卡片'}${card.status ? '，' + card.status : ''}`);
    // 支持拖拽到今日时间线（HTML5 DnD）
    li.draggable = true;
    let cardDragged = false; // 真拖拽后抑制 click 打开编辑器
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.id);
      e.dataTransfer.effectAllowed = 'move';
      li.classList.add('is-dragging');
      cardDragged = false;
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('is-dragging');
      cardDragged = true;
      setTimeout(() => { cardDragged = false; }, 0);
    });

    const icon = document.createElement('span');
    icon.className = 'cardpool-type-icon';
    icon.textContent = typeIcon(card.type, card.emoji);

    const text = document.createElement('span');
    text.className = 'cardpool-text';
    text.textContent = (card.title || card.content || '(空)');

    li.append(icon, text);

    // 状态 + 进度 + 优先级
    const metaRow = document.createElement('span');
    metaRow.className = 'cardpool-meta';
    metaRow.append(chipSpan('cardpool-status-badge', STATUS_LABEL[card.status] || card.status || '纯记录'));
    if (card.priority && card.priority !== 'medium') metaRow.append(chipSpan('cardpool-prio', card.priority === 'high' ? '🔴' : '🟢'));
    if (card.progress != null) metaRow.append(chipSpan('cardpool-progress', `${card.progress}%`));
    li.append(metaRow);

    // 日期 / 项目 / 自定义属性
    const chips = document.createElement('span');
    chips.className = 'cardpool-chips';
    if (card.assignedDate) chips.append(chipSpan('cardpool-chip', shortDate(card.assignedDate)));
    if (card.project) chips.append(chipSpan('cardpool-chip', '📁 ' + card.project));
    if (card.duration != null && card.duration > 0) chips.append(chipSpan('cardpool-chip', `⏱ ${card.duration}分`));
    for (const [k, v] of Object.entries(card.props ?? {})) {
      if (v === null || v === undefined || v === '') continue;
      chips.append(chipSpan('cardpool-chip', `•${k}: ${v}`));
    }
    if (chips.childNodes.length) li.append(chips);

    // 只读系统元数据：修改时间 + 来源（AI/人工）
    const sysmeta = document.createElement('span');
    sysmeta.className = 'cardpool-sysmeta';
    const ub = card.meta?.updatedBy;
    const origin = ub?.origin === 'human' ? '👤人工' : (ub?.agent || ub?.model) ? '🤖AI' : '';
    const at = card.updatedAt ? shortDate(card.updatedAt.slice(0, 10)) : '';
    sysmeta.textContent = [at, origin].filter(Boolean).join(' · ');
    if (sysmeta.textContent) li.append(sysmeta);

    const schedBtn = document.createElement('button');
    schedBtn.className = 'cardpool-schedule-btn';
    schedBtn.textContent = '📅';
    schedBtn.title = '安排到某天';
    schedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const st = snapUpToQuarter(currentTime());
      updateCardEntry(card.id, { assignedDate: selectedDate, time: st, startTime: st, endTime: addMinutes(st, 15) })
        .then(() => refreshAll())
        .catch(err => console.error('[journal] schedule card failed:', err));
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'cardpool-delete-btn';
    delBtn.textContent = '🗑️';
    delBtn.title = '删除卡片';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('删除这张卡片？')) {
        deleteCardEntry(card.id)
          .then(() => refreshAll())
          .catch(err => console.error('[journal] delete card failed:', err));
      }
    });

    // 点击编辑（拖拽后抑制一次，避免 drop 后误触）
    li.addEventListener('click', () => { if (!cardDragged) openEditor(card, currentTime(), selectedDate); });
    li.addEventListener('keydown', (e) => {
      // 只响应 li 自身获得焦点的情况：子按钮（安排/删除）聚焦时 Enter/空格应走其原生激活，
      // 否则会被 preventDefault 拦下、误开编辑器
      if (e.target !== li) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openEditor(card, currentTime(), selectedDate);
      }
    });

    li.append(schedBtn, delBtn);
    els.cardpoolList.append(li);
  }
}

/* ─── 渲染：热力图 ──────────────────────────────────────── */

function renderHeatmap(container, heatmap) {
  container.replaceChildren();
  const today = todayKey();
  for (const day of dateRange(365)) {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.dataset.day = day;
    const count = heatmap[day] ?? 0;
    // 6 档着色
    const level = count >= 5 ? 5 : count;
    if (level > 0) cell.classList.add(`level-${level}`);
    if (day === today) cell.classList.add('is-today');
    cell.title = count > 0 ? `${day} · ${count} 张卡片` : `${day}（无记录）`;
    container.append(cell);
  }

  // 更新连续打卡数
  if (els.heatmapStreak) {
    let streak = 0;
    const d = new Date();
    while (true) {
      const dk = d.toISOString().slice(0, 10);
      if ((heatmap[dk] ?? 0) > 0) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    els.heatmapStreak.textContent = streak > 0 ? `🔥 ${streak} 天` : '';
  }

  // 默认滚到最右侧（今天在最右）
  container.scrollLeft = container.scrollWidth;
}

/* ─── 渲染：日历 ──────────────────────────────────────── */

function renderCalendar(container, matrix, selectedDate, heatmap) {
  container.replaceChildren();
  for (const week of matrix) {
    for (const cell of week) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-day';
      btn.dataset.day = cell.dayKey;

      const count = heatmap[cell.dayKey] ?? 0;

      // 日期数字
      const numSpan = document.createElement('span');
      numSpan.textContent = String(cell.day);
      btn.append(numSpan);

      // 卡片数指示器（只在有卡片时显示）
      if (count > 0) {
        const countEl = document.createElement('span');
        countEl.className = 'cal-count';
        countEl.textContent = count > 5 ? '5+' : `${count}`;
        btn.append(countEl);
      }

      btn.setAttribute('aria-label',
        `${cell.dayKey}${cell.isCurrentMonth ? '' : '（非本月）'}${cell.isToday ? '，今天' : ''}${count > 0 ? `，${count}张卡片` : ''}`
      );

      if (!cell.isCurrentMonth) btn.classList.add('is-out-month');
      if (cell.isToday) btn.classList.add('is-today');
      if (cell.dayKey === selectedDate) btn.classList.add('is-selected');
      // 键盘可达：roving tabindex（仅选中/今天可 Tab，其余方向键导航）
      btn.tabIndex = (cell.isToday || cell.dayKey === selectedDate) ? 0 : -1;
      // 卡片数量背景色
      const bgLevel = count >= 5 ? 5 : count;
      if (bgLevel > 0) btn.classList.add(`count-${bgLevel}`);

      container.append(btn);
    }
  }
}

function renderCalendarView() {
  const matrix = getMonthMatrix(calendarMonth.year, calendarMonth.month);
  if (els.calMonthLabel) {
    els.calMonthLabel.textContent = `${calendarMonth.year}年${calendarMonth.month + 1}月`;
  }
  renderCalendar(els.calendarGrid, matrix, selectedDate, heatmapCache);
  bindCalendarKeys();
}

/** 日历方向键导航（roving tabindex）—— 只绑定一次 */
let calKeysBound = false;
function bindCalendarKeys() {
  const grid = els.calendarGrid;
  if (!grid || calKeysBound) return;
  calKeysBound = true;
  grid.addEventListener('keydown', (e) => {
    const cells = [...grid.querySelectorAll('.cal-day')];
    const i = cells.indexOf(document.activeElement);
    if (i < 0) return;
    const cols = 7;
    let n = -1;
    switch (e.key) {
      case 'ArrowRight': n = i + 1; break;
      case 'ArrowLeft': n = i - 1; break;
      case 'ArrowDown': n = i + cols; break;
      case 'ArrowUp': n = i - cols; break;
      case 'Home': n = 0; break;
      case 'End': n = cells.length - 1; break;
      default: return;
    }
    if (n < 0 || n >= cells.length) return;
    e.preventDefault();
    for (const c of cells) c.tabIndex = -1;
    cells[n].tabIndex = 0;
    cells[n].focus();
  });
}

function updateHeaderDate() {
  if (els.todayDisplay) {
    els.todayDisplay.textContent = formatDateLabel(selectedDate);
  }
}

/* ─── 渲染：TODO ──────────────────────────────────────── */

/* ─── 全局刷新 ────────────────────────────────────────── */

async function refreshAll() {
  allCardsCache = await getAllCards();
  heatmapCache = countCardsByDay(allCardsCache);
  renderHeatmap(els.heatmap, heatmapCache);
  renderCalendarView();
  await renderRightView();
  await renderCardPool();
}

/* ─── 命名视图 ────────────────────────────────────────── */

/** 从 host 拉取命名视图并渲染到下拉 */
async function loadPoolViews() {
  savedViews = (await getHostMeta('savedViews')) || [];
  const sel = els.viewSelect;
  if (!sel) return;
  sel.replaceChildren();
  const optAll = document.createElement('option');
  optAll.value = ''; optAll.textContent = '全部卡片';
  sel.append(optAll);
  for (const v of savedViews) {
    const o = document.createElement('option');
    o.value = v.id; o.textContent = v.name;
    sel.append(o);
  }
  sel.value = activeViewId;
}

/** 把当前筛选 + 布局存成命名视图 */
async function saveCurrentView() {
  const name = (prompt('视图名称：', '我的视图') || '').trim();
  if (!name) return;
  const id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const view = {
    id, name,
    status: poolStatusFilter,
    tag: poolTagFilter,
    project: poolProjectFilter,
    layout: poolLayout,
  };
  savedViews = [...savedViews, view];
  await setHostMeta('savedViews', savedViews);
  activeViewId = id;
  await loadPoolViews();
  showToast('✅ 已保存视图：' + name, 'success');
}

/** 应用一个命名视图 */
function applyView(view) {
  poolStatusFilter = view.status ?? '';
  poolTagFilter = view.tag ?? '';
  poolProjectFilter = view.project ?? '';
  poolLayout = view.layout ?? 'card';
  localStorage.setItem('journal.poolLayout', poolLayout);
  activeViewId = view.id;
  renderCardPool();
}

/* ─── 模板构建器 ───────────────────────────────────── */

const REQUIRED_DEFS = [
  { key: 'title', icon: '🏷', label: '标题', type: 'text' },
  { key: 'content', icon: '📄', label: '内容', type: 'textarea' },
  { key: 'tags', icon: '#️⃣', label: '标签', type: 'tags' },
];
const OPTIONAL_DEFS = [
  { key: 'status', icon: '📌', label: '状态', type: 'status', options: ['none', 'todo', 'doing', 'done'] },
  { key: 'progress', icon: '📊', label: '进度', type: 'number', min: 0, max: 100 },
  { key: 'priority', icon: '⭐', label: '优先级', type: 'select', options: ['high', 'medium', 'low'] },
  { key: 'assignedDate', icon: '🗓', label: '日期', type: 'date' },
  { key: 'schedule', icon: '⏱', label: '起止时间/时长', type: 'schedule' },
  { key: 'project', icon: '📁', label: '项目', type: 'text' },
];
const BUILTIN_DEFS = [...REQUIRED_DEFS, ...OPTIONAL_DEFS];

const tplBuilderName = document.getElementById('tpl-builder-name');
const tplBuilderEmoji = document.getElementById('tpl-builder-emoji');
const tplBuilderPicker = document.getElementById('tpl-builder-picker');
const tplPropList = document.getElementById('tpl-prop-list');
const tplNpKey = document.getElementById('tpl-np-key');
const tplNpLabel = document.getElementById('tpl-np-label');
const tplNpIcon = document.getElementById('tpl-np-icon');
const tplNpType = document.getElementById('tpl-np-type');
const tplNpOptions = document.getElementById('tpl-np-options');
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
const tplNewPropForm = document.getElementById('tpl-newprop-form');
/** 构建器状态：extra 为有序可选属性 [{key, def}]，values 存默认值 */
let tplBuilderState = { name: '', emoji: '🗂️', extra: [], values: {} };
let tplBuilderCleanup = null;
let tplEditingId = null;   // 编辑既有模板时的 id
let tplEditKey = null;     // 编辑属性定义时的 key
let tplDragKey = null;     // 排序拖拽中的 key

/** 找属性定义：内建 或 属性库 */
function findPropDef(key) {
  const b = BUILTIN_DEFS.find(d => d.key === key);
  if (b) return b;
  const c = propLibrary[key];
  return c ? { key, icon: c.icon || '•', label: c.label || key, type: c.type || 'text', options: c.options } : null;
}

/** 模板 → 有序 fields（兼容旧扁平 propsDefaults 结构；确保必备三件套 title/content/tags 在最前） */
function normalizeTemplateFields(tpl) {
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
function openTemplateBuilder(existing = null) {
  tplEditingId = existing?.id ?? null;
  tplBuilderState = { name: existing?.name ?? '', emoji: existing?.emoji ?? (editorEmoji || '🗂️'), extra: [], values: {} };
  if (existing) {
    for (const f of normalizeTemplateFields(existing)) {
      if (REQUIRED_DEFS.some(d => d.key === f.key)) { tplBuilderState.values[f.key] = f.value; continue; }
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
function closeTemplateBuilder() {
  document.getElementById('template-builder-overlay').classList.add('hidden');
  document.getElementById('tpl-add-panel')?.classList.add('hidden');
  if (tplNewPropForm) tplNewPropForm.classList.add('hidden');
  if (tplBuilderPicker) tplBuilderPicker.classList.add('hidden');
  tplBuilderCleanup?.();
  tplEditingId = null;
  tplEditKey = null;
}

/** 渲染构建器：必备（锁定） + 额外（可编辑列表） */
function renderTemplateBuilder() {
  if (!tplPropList) return;
  tplPropList.replaceChildren();
  // 必备：默认折叠为一摘要行（降低窄栏占高），展开可编辑默认值
  const gReq = document.createElement('details');
  gReq.className = 'tpl-group tpl-group-req';
  const sumReq = document.createElement('summary');
  sumReq.className = 'tpl-group-title tpl-group-summary';
  sumReq.textContent = '✓ 必备';
  const reqFields = document.createElement('div'); reqFields.className = 'tpl-req-fields';
  gReq.append(sumReq);
  for (const def of REQUIRED_DEFS) reqFields.append(buildReqRow(def));
  gReq.append(reqFields);
  tplPropList.append(gReq);
  // 额外
  const gOpt = document.createElement('div'); gOpt.className = 'tpl-group';
  const h2 = document.createElement('div'); h2.className = 'tpl-group-title'; h2.textContent = '额外属性（可选 · 可增删改排序）';
  gOpt.append(h2);
  if (!tplBuilderState.extra.length) {
    const hint = document.createElement('div'); hint.className = 'tpl-extra-empty';
    hint.textContent = '尚未添加额外属性，点下方「＋ 添加属性」';
    gOpt.append(hint);
  }
  for (const entry of tplBuilderState.extra) gOpt.append(buildExtraRow(entry));
  // F1 修复：「＋ 添加属性」常驻可见（此前被包在初始 hidden 面板内，永久不可点）
  const { addBtn, panel } = buildAddPanel();
  gOpt.append(addBtn, panel);
  tplPropList.append(gOpt);
}

/** 必备行（锁定 + 恒显默认值编辑器） */
function buildReqRow(def) {
  const row = document.createElement('div'); row.className = 'tpl-prop-row is-locked';
  const ck = document.createElement('input'); ck.type = 'checkbox'; ck.className = 'tpl-prop-check'; ck.checked = true; ck.disabled = true;
  const lbl = document.createElement('span'); lbl.className = 'tpl-prop-label'; lbl.textContent = `${def.icon} ${def.label}`;
  const valWrap = document.createElement('div'); valWrap.className = 'tpl-prop-value'; valWrap.append(buildTplDefaultEditor(def));
  row.append(ck, lbl, valWrap);
  return row;
}

/** 可选属性行：排序柄 + 默认值 + 编辑定义 + 移出 */
function buildExtraRow(entry) {
  const row = document.createElement('div'); row.className = 'tpl-prop-row tpl-extra-row'; row.dataset.key = entry.key; row.draggable = true;
  const handle = document.createElement('span'); handle.className = 'tpl-drag'; handle.textContent = '⋮'; handle.title = '拖拽排序';
  const lbl = document.createElement('span'); lbl.className = 'tpl-prop-label'; lbl.textContent = `${entry.def.icon || '•'} ${entry.def.label || entry.key}`;
  const valWrap = document.createElement('div'); valWrap.className = 'tpl-prop-value'; valWrap.append(buildTplDefaultEditor(entry.def));
  const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'tpl-row-act'; edit.textContent = '✎'; edit.title = '编辑属性定义';
  edit.addEventListener('click', (e) => { e.stopPropagation(); openTplEditProp(entry.key); });
  const del = document.createElement('button'); del.type = 'button'; del.className = 'tpl-row-act tpl-row-del'; del.textContent = '✕'; del.title = '从模板移出';
  del.addEventListener('click', (e) => { e.stopPropagation(); removeExtra(entry.key); });
  row.append(handle, lbl, valWrap, edit, del);
  const clearOver = () => { row.classList.remove('is-drag-over'); };
  row.addEventListener('dragstart', (e) => { tplDragKey = entry.key; e.dataTransfer.effectAllowed = 'move'; row.classList.add('is-dragging'); document.body.classList.add('tpl-dragging'); });
  row.addEventListener('dragend', () => { tplDragKey = null; row.classList.remove('is-dragging'); document.body.classList.remove('tpl-dragging'); document.querySelectorAll('.tpl-extra-row').forEach(r => r.classList.remove('is-drag-over')); });
  row.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('is-drag-over'); });
  row.addEventListener('dragleave', clearOver);
  row.addEventListener('drop', (e) => { e.preventDefault(); clearOver(); if (tplDragKey && tplDragKey !== entry.key) reorderExtra(tplDragKey, entry.key); });
  return row;
}

function reorderExtra(from, to) {
  const arr = tplBuilderState.extra;
  const i = arr.findIndex(x => x.key === from);
  const j = arr.findIndex(x => x.key === to);
  if (i < 0 || j < 0) return;
  const [it] = arr.splice(i, 1);
  arr.splice(j, 0, it);
  renderTemplateBuilder();
}
function removeExtra(key) {
  tplBuilderState.extra = tplBuilderState.extra.filter(x => x.key !== key);
  delete tplBuilderState.values[key];
  renderTemplateBuilder();
}

/** 「＋ 添加属性」按钮（常驻）+ 候选面板（点击才展开） */
function buildAddPanel() {
  const panel = document.createElement('div'); panel.id = 'tpl-add-panel'; panel.className = 'tpl-add-panel hidden';
  const addBtn = document.createElement('button'); addBtn.type = 'button'; addBtn.className = 'tpl-add-btn';
  addBtn.textContent = '＋ 添加属性';
  addBtn.setAttribute('aria-expanded', 'false');
  addBtn.addEventListener('click', () => {
    const nowHidden = panel.classList.toggle('hidden');
    addBtn.setAttribute('aria-expanded', String(!nowHidden));
  });
  const inExtra = new Set(tplBuilderState.extra.map(x => x.key));
  const available = [
    ...OPTIONAL_DEFS.filter(d => !inExtra.has(d.key)).map(d => ({ key: d.key, icon: d.icon, label: d.label, kind: '内建' })),
    ...Object.entries(propLibrary).filter(([k]) => !inExtra.has(k)).map(([k, d]) => ({ key: k, icon: d.icon || '•', label: d.label || k, kind: '自定义' })),
  ];
  const list = document.createElement('div'); list.className = 'tpl-add-list';
  if (!available.length) {
    const none = document.createElement('div'); none.className = 'tpl-add-none'; none.textContent = '可选属性都已加入';
    list.append(none);
  }
  for (const a of available) {
    const it = document.createElement('button'); it.type = 'button'; it.className = 'tpl-add-item'; it.title = a.kind;
    it.textContent = `${a.icon} ${a.label}`;
    it.addEventListener('click', () => addPropToExtra(a.key));
    list.append(it);
  }
  const newBtn = document.createElement('button'); newBtn.type = 'button'; newBtn.className = 'tpl-add-item tpl-add-new';
  newBtn.textContent = '＋ 新建属性…';
  newBtn.addEventListener('click', () => { openTplNewPropForm(); });
  list.append(newBtn);
  panel.append(list);
  return { addBtn, panel };
}

function addPropToExtra(key) {
  const def = findPropDef(key);
  if (!def || tplBuilderState.extra.some(x => x.key === key)) return;
  tplBuilderState.extra.push({ key, def });
  if (!(key in tplBuilderState.values)) tplBuilderState.values[key] = defaultTplValue(def);
  document.getElementById('tpl-add-panel')?.classList.add('hidden');
  renderTemplateBuilder();
}

/** 按属性类型构建默认值编辑器，改动写入 tplBuilderState.values */
function buildTplDefaultEditor(def) {
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
function defaultTplValue(def) {
  if (def.type === 'status' || def.type === 'select') return '';
  if (def.type === 'checkbox') return false;
  if (def.type === 'tags') return [];
  if (def.type === 'schedule') return null;
  return '';
}

/** 保存 / 更新模板 */
async function saveTemplateBuilder() {
  const name = (tplBuilderName?.value || '').trim();
  if (!name) { showToast('模板名称不能为空', 'error'); return; }
  const requiredFields = REQUIRED_DEFS.map(def => ({ key: def.key, value: tplBuilderState.values[def.key] ?? defaultTplValue(def) }));
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
function prefillTemplateFromCard() {
  const card = editingCardId ? allCardsCache.find(c => c.id === editingCardId) : null;
  if (!card) { showToast('没有正在编辑的卡片', ''); return; }
  tplBuilderState = { name: tplBuilderState.name, emoji: card.emoji || tplBuilderState.emoji, extra: [], values: {} };
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
function openTplNewPropForm() {
  tplEditKey = null;
  if (tplNpLabel) tplNpLabel.value = '';
  if (tplNpKey) { tplNpKey.disabled = false; tplNpKey.value = ''; }
  if (tplNpIcon) tplNpIcon.value = '';
  if (tplNpIconPreview) tplNpIconPreview.textContent = '•';
  if (tplNpType) tplNpType.value = 'text';
  if (tplNpOptions) tplNpOptions.value = '';
  if (tplNpOk) tplNpOk.textContent = '加入模板';
  if (tplNewPropForm) tplNewPropForm.classList.remove('hidden');
  tplNpKey?.focus();
}

/** 编辑可选属性的定义（内建=仅此模板覆盖；自定义=写回属性库） */
function openTplEditProp(key) {
  const entry = tplBuilderState.extra.find(x => x.key === key);
  if (!entry) return;
  tplEditKey = key;
  const isBuiltin = !!BUILTIN_DEFS.find(d => d.key === key);
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
  if (tplNewPropForm) tplNewPropForm.classList.remove('hidden');
  tplNpLabel?.focus();
}

/** 新建/编辑属性提交 */
function onTplNewPropOk() {
  if (tplEditKey) {
    const key = tplEditKey;
    const opts = tplNpOptions?.value ? tplNpOptions.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];
    const def = { key, label: tplNpLabel?.value.trim() || key, icon: tplNpIcon?.value || '•', type: tplNpType?.value || 'text', ...(opts.length ? { options: opts } : {}) };
    const entry = tplBuilderState.extra.find(x => x.key === key);
    if (entry) entry.def = def;
    if (!BUILTIN_DEFS.find(d => d.key === key)) { propLibrary = { ...propLibrary, [key]: def }; void savePropLibrary(); }
    tplEditKey = null;
    if (tplNewPropForm) tplNewPropForm.classList.add('hidden');
    renderTemplateBuilder();
    showToast(`已更新属性「${key}」`, 'success');
    return;
  }
  addTplNewProp();
}

/** 新建属性：造定义 → 入库 + 加入模板 */
function addTplNewProp() {
  const key = (tplNpKey?.value || '').trim().replace(/\s+/g, '_');
  if (!key) { showToast('属性名不能为空', 'error'); return; }
  if (RESERVED_PROPS.has(key)) { showToast(`「${key}」是保留字段，不能用作属性名`, 'error'); return; }
  const opts = tplNpOptions?.value ? tplNpOptions.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];
  const def = { key, label: tplNpLabel?.value.trim() || key, icon: tplNpIcon?.value || '•', type: tplNpType?.value || 'text', ...(opts.length ? { options: opts } : {}) };
  propLibrary = { ...propLibrary, [key]: def };
  void savePropLibrary();
  if (!tplBuilderState.extra.some(x => x.key === key)) tplBuilderState.extra.push({ key, def });
  if (!(key in tplBuilderState.values)) tplBuilderState.values[key] = defaultTplValue(def);
  if (tplNewPropForm) tplNewPropForm.classList.add('hidden');
  renderTemplateBuilder();
  showToast(`已新建属性「${key}」并加入模板`, 'success');
}

/** 构建器默认图标选择器 */
function toggleTplBuilderPicker() {
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

async function openTemplateMenu() {
  const templates = (await getHostMeta('templates')) || [];
  renderTemplateMenu(templates);
}

/** 关闭模板下拉 */
function closeTemplateMenu() {
  document.getElementById('template-menu')?.remove();
}

/** 用模板新建卡片：按模板 fields（内建 key 映射到卡片字段，自定义 key → card.props） */
async function createFromTemplate(tpl) {
  const fields = normalizeTemplateFields(tpl);
  const patch = { content: '', emoji: tpl.emoji || '', props: {}, provenance: { origin: 'human' } };
  for (const f of fields) {
    const v = f?.value;
    switch (f?.key) {
      case 'title': patch.title = v ?? ''; break;
      case 'content': patch.content = v ?? ''; break;
      case 'status': patch.status = v ?? 'none'; break;
      case 'progress': patch.progress = v ?? null; break;
      case 'priority': patch.priority = v ?? 'medium'; break;
      case 'assignedDate': patch.assignedDate = v ?? null; break;
      case 'schedule':
        if (v && typeof v === 'object') {
          patch.startTime = v.start || null;
          patch.endTime = v.end || null;
          patch.duration = v.duration ?? null;
        }
        break;
      case 'project': patch.project = v ?? null; break;
      case 'tags': patch.tags = Array.isArray(v) ? v : []; break;
      default: if (v !== undefined && v !== null && v !== '') patch.props[f.key] = v; break;
    }
  }
  const card = await createCardEntry(patch);
  await refreshAll();
  openEditor(card, currentTime(), null, null);
}

/** 渲染模板下拉菜单（空白 + 模板 + 管理） */
function renderTemplateMenu(templates) {
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
async function manageTemplates(templates) {
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
function saveEditorAsTemplate() {
  openTemplateBuilder();
}

/* ─── 本机 Skills ────────────────────────────────────── */

let skillsCache = null;

async function loadSkillStatus() {
  try {
    const res = await fetch('http://127.0.0.1:8766/api/skill-status');
    const data = await res.json();
    skillsCache = data?.data ?? null;
  } catch (e) {
    skillsCache = null;
  }
  renderSkillStatus();
}

function renderSkillStatus() {
  const s = skillsCache;
  els.skillsList.replaceChildren();

  if (!s) {
    els.skillsCount.textContent = '—';
    els.skillsOverall.textContent = '⚠️ host 未连接，无法检测';
    return;
  }

  els.skillsCount.textContent = s.installed ? '✅' : '❌';
  els.skillsOverall.textContent = s.installed
    ? `journal skill：✅ 已安装（${s.installedCount}/${s.total}）`
    : `journal skill：❌ 未安装（${s.installedCount}/${s.total}）`;

  for (const loc of s.locations) {
    const li = document.createElement('li');
    li.className = 'skills-item';

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;gap:5px;';
    const dot = document.createElement('span');
    dot.textContent = loc.installed ? '✅' : '❌';
    const name = document.createElement('span');
    name.className = 'skills-item-name';
    name.style.flex = '';
    name.textContent = loc.platform;
    top.append(dot, name);
    info.append(top);

    const path = document.createElement('div');
    path.className = 'skills-item-desc';
    path.textContent = loc.path;
    path.title = loc.path;
    info.append(path);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'skills-copy-btn';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(loc.path);
        showToast(`✅ 已复制 ${loc.platform} 路径`, 'success');
      } catch (e) {
        showToast('复制失败，请手动复制', 'error');
      }
    });

    li.append(info, copyBtn);
    els.skillsList.append(li);
  }
}

/* ─── 初始化 ────────────────────────────────────────── */

const WIDE_QUERY = matchMedia('(min-width: 1100px)');
const WIDE_STATE_KEY = 'journal.wideMode'; // 'auto' | 'on' | 'off'（缺失视为 auto）

/** 当前生效的宽屏状态：手动 on/off 优先，否则跟随视口宽度 */
function widePreference() {
  return localStorage.getItem(WIDE_STATE_KEY); // null | 'on' | 'off' | 'auto'
}
function computeWide() {
  const p = widePreference();
  if (p === 'on') return true;
  if (p === 'off') return false;
  return WIDE_QUERY.matches; // auto
}
function applyWide() {
  document.documentElement.classList.toggle('wide-mode', computeWide());
  updateWideButton();
}
function updateWideButton() {
  if (!els.btnWide) return;
  const p = widePreference();
  const isOn = computeWide();
  els.btnWide.classList.toggle('is-on', p === 'on');
  els.btnWide.classList.toggle('is-off', p === 'off');
  els.btnWide.title = isOn
    ? '宽屏布局已开启' + (p === 'on' ? '（手动）' : '（自动跟随窗口）')
    : '宽屏布局未开启（点击切换：自动/强制宽屏/强制窄屏）';
}

async function init() {
  // 主题
  const settings = await getSettings();
  if (settings.theme === 'dark' ||
      (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.dataset.theme = 'dark';
  }

  // 宽屏模式（初始 + 视口变化时跟随）
  applyWide();
  WIDE_QUERY.addEventListener('change', () => {
    // 非手动模式才需要跟随视口变化
    const p = widePreference();
    if (p !== 'on' && p !== 'off') applyWide();
  });

  // 侧栏抽屉（窄栏默认收起；宽屏时 CSS 自动隐藏按钮）
  const setPanels = (open) => {
    document.body.classList.toggle('panels-open', open);
    els.btnPanels.setAttribute('aria-expanded', String(open));
  };
  setPanels(localStorage.getItem('journal.panelsOpen') === '1');
  els.btnPanels.addEventListener('click', () => {
    const open = !document.body.classList.contains('panels-open');
    setPanels(open);
    localStorage.setItem('journal.panelsOpen', open ? '1' : '0');
  });
  // 点击遮罩关闭抽屉
  els.board?.addEventListener?.('click', (e) => {
    if (e.target === els.board) setPanels(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('panels-open')) {
      setPanels(false);
      els.btnPanels.focus();
    }
  });

  // 快捷新建（今天/当前视图日期）
  els.btnQuickAdd?.addEventListener('click', () => {
    openEditor(null, currentTime(), selectedDate);
  });

  // 项目/标签筛选：展开/收起「筛选」区（渐进披露）
  if (els.poolExtraFilter && els.poolExtra) {
    const setExtra = (open) => {
      els.poolExtra.classList.toggle('is-open', open);
      els.poolExtraFilter.setAttribute('aria-expanded', String(open));
    };
    els.poolExtraFilter.addEventListener('click', () => setExtra(!els.poolExtra.classList.contains('is-open')));
  }

  // 拉取 host 数据
  const pulled = await pullFromHost();
  if (!pulled.pulled) {
    showToast('⚠️ host 服务未连接，数据可能无法保存', 'warn');
  }
  await checkHostHealth();
  startHostSync(() => {
    // 拖拽/缩放中不打断；其余情况外部变化就全量重渲染
    if (document.body.classList.contains('is-dragging') ||
        document.body.classList.contains('is-resizing')) return;
    refreshAll();
  });

  // 首次全量渲染
  updateHeaderDate();
  markViewMode();
  requestFocusScroll(); // 打开时聚焦当前时刻
  await refreshAll();
  await loadPoolViews();

  // ── 右视图导航 / 模式切换 ──
  els.viewPrev.addEventListener('click', async () => {
    requestFocusScroll(); // 切换日期后聚焦
    if (viewMode === 'month') {
      let { year, month } = calendarMonth;
      month -= 1;
      if (month < 0) { month = 11; year -= 1; }
      calendarMonth = { year, month };
      renderCalendarView();
    } else if (viewMode === 'week') {
      weekAnchor = addDays(weekAnchor, -7);
    } else {
      selectedDate = addDays(selectedDate, -1);
      weekAnchor = selectedDate;
      calendarMonth = monthOf(selectedDate);
      updateHeaderDate();
      renderCalendarView();
    }
    await renderRightView();
  });

  els.viewNext.addEventListener('click', async () => {
    requestFocusScroll(); // 切换日期后聚焦
    if (viewMode === 'month') {
      let { year, month } = calendarMonth;
      month += 1;
      if (month > 11) { month = 0; year += 1; }
      calendarMonth = { year, month };
      renderCalendarView();
    } else if (viewMode === 'week') {
      weekAnchor = addDays(weekAnchor, 7);
    } else {
      selectedDate = addDays(selectedDate, 1);
      weekAnchor = selectedDate;
      calendarMonth = monthOf(selectedDate);
      updateHeaderDate();
      renderCalendarView();
    }
    await renderRightView();
  });

  els.viewToday.addEventListener('click', async () => {
    requestFocusScroll(); // 切换日期后聚焦
    calendarMonth = monthOf(todayKey());
    weekAnchor = todayKey();
    selectedDate = todayKey();
    updateHeaderDate();
    renderCalendarView();
    await renderRightView();
  });

  els.viewModeBtns?.forEach(btn => {
    btn.addEventListener('click', async () => {
      viewMode = btn.dataset.mode;
      localStorage.setItem('journal.viewMode', viewMode);
      markViewMode();
      requestFocusScroll(); // 切换视图后重新聚焦当前时刻
      await renderRightView();
    });
  });

  // 24h / 08-22 时间线范围切换
  const updateSpanBtn = () => {
    if (els.btnSpan) els.btnSpan.textContent = timelineSpan === 'full' ? '24h' : '08–22';
  };
  updateSpanBtn();
  els.btnSpan?.addEventListener('click', async () => {
    timelineSpan = timelineSpan === 'full' ? 'default' : 'full';
    localStorage.setItem('journal.timelineSpan', timelineSpan);
    updateSpanBtn();
    // 时间范围影响时间线与周视图（周视图复用同一天范围逻辑）
    await renderRightView();
  });

  // 今日当前时间 marker 每分钟更新
  startNowMarkerTimer();

  // ── 宽屏模式：三态循环 auto → on → off → auto ──
  els.btnWide?.addEventListener('click', () => {
    const order = ['auto', 'on', 'off'];
    const cur = widePreference() || 'auto';
    const next = order[(order.indexOf(cur) + 1) % order.length] || 'auto';
    if (next === 'auto') localStorage.removeItem(WIDE_STATE_KEY);
    else localStorage.setItem(WIDE_STATE_KEY, next);
    applyWide();
  });

  // ── 编辑器事件 ──
  // ── 键盘快捷键（Esc 关闭 / ⌘⏎ 保存） ──
  document.addEventListener('keydown', (e) => {
    const tplOv = document.getElementById('template-builder-overlay');
    const cardOpen = editorOverlay && !editorOverlay.classList.contains('hidden');
    const tplOpen = tplOv && !tplOv.classList.contains('hidden');
    if (!cardOpen && !tplOpen) return;
    // 模板构建器内属性表单开着时，Esc 先关表单
    if (tplOpen && e.key === 'Escape' && tplNewPropForm && !tplNewPropForm.classList.contains('hidden')) {
      e.preventDefault(); tplNewPropForm.classList.add('hidden'); tplEditKey = null; return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (tplOpen) closeTemplateBuilder(); else closeEditor();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (tplOpen) void saveTemplateBuilder(); else void saveEditor();
    }
  });
  editorSave.addEventListener('click', saveEditor);
  editorCancel.addEventListener('click', closeEditor);
  editorClose.addEventListener('click', closeEditor);
  editorStart?.addEventListener('change', updateEditorDuration);
  editorEnd?.addEventListener('change', updateEditorDuration);
  editorDurationMin?.addEventListener('change', onEditorDurationInput);
  editorStatus?.addEventListener('change', onEditorStatusChange);
  // 分段状态胶囊
  document.getElementById('card-editor-status-seg')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg');
    if (btn?.dataset.status) onStatusClicked(btn.dataset.status);
  });
  // 自定义状态：输入即设为自定义状态，清空回退纯记录
  editorStatusCustom?.addEventListener('input', (e) => {
    const v = e.target.value.trim();
    if (v) { editorStatus.value = v; updateStatusSeg(v); onEditorStatusChange(); }
    else { editorStatus.value = 'none'; updateStatusSeg('none'); onEditorStatusChange(); }
  });
  // 进度：手输数值（滑块/手输双向）
  editorProgressNumber?.addEventListener('change', () => {
    const p = Math.max(0, Math.min(100, Math.round(Number(editorProgressNumber.value) || 0)));
    if (editorProgress) editorProgress.value = p;
    onEditorProgressChange();
  });
  // 点击头部图标瓦片打开 emoji picker
  document.getElementById('btn-emoji-tile')?.addEventListener('click', openEmojiPicker);
  editorProgress?.addEventListener('change', onEditorProgressChange);
  editorProgress?.addEventListener('input', onEditorProgressChange);
  btnAddProp?.addEventListener('click', openPropForm);
  btnPropLib?.addEventListener('click', openPropLibrary);
  propFormCancel?.addEventListener('click', closePropForm);
  propFormOk?.addEventListener('click', onPropFormOk);
  propType?.addEventListener('change', () => {
    const wrap = propOptions?.closest('.prop-options-wrap');
    if (wrap) wrap.classList.toggle('hidden', propType.value !== 'select' && propType.value !== 'multi');
  });
  saveTemplateBtn?.addEventListener('click', saveEditorAsTemplate);
  editorOverlay.addEventListener('click', (e) => {
    if (e.target === editorOverlay) saveEditor();
  });
  await loadPropLibrary();

  // ── 卡片池新建 ──
  els.btnNewCard.addEventListener('click', () => {
    // 直接开空白编辑器，保存时才落库（assignedDate = null → 未安排），取消不产生空卡片
    openEditor(null, currentTime(), null, null);
  });

  // ── 日历月份导航（左侧小日历）──
  els.calPrev.addEventListener('click', () => {
    let { year, month } = calendarMonth;
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
    calendarMonth = { year, month };
    renderCalendarView();
    if (viewMode === 'month') renderRightView();
  });

  els.calNext.addEventListener('click', () => {
    let { year, month } = calendarMonth;
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    calendarMonth = { year, month };
    renderCalendarView();
    if (viewMode === 'month') renderRightView();
  });

  els.calToday.addEventListener('click', async () => {
    calendarMonth = monthOf(todayKey());
    selectedDate = todayKey();
    weekAnchor = todayKey();
    updateHeaderDate();
    renderCalendarView();
    await renderRightView();
  });

  // ── 日历点击切换日期 ──
  els.calendarGrid.addEventListener('click', async (e) => {
    const cell = e.target.closest('.cal-day');
    if (!cell || !cell.dataset.day) return;
    selectedDate = cell.dataset.day;
    weekAnchor = cell.dataset.day;
    updateHeaderDate();
    renderCalendarView();
    await renderRightView();
  });

  // ── 热力图点击切换日期 ──
  els.heatmap.addEventListener('click', (e) => {
    const cell = e.target.closest('.heatmap-cell');
    if (!cell || !cell.dataset.day) return;
    selectedDate = cell.dataset.day;
    weekAnchor = cell.dataset.day;
    // 跳到对应月份
    calendarMonth = monthOf(cell.dataset.day);
    updateHeaderDate();
    renderCalendarView();
    renderRightView();
  });

  // ── 卡片池：布局切换（卡片视图 / 列表视图） ──
  els.poolLayoutBtn?.addEventListener('click', () => {
    poolLayout = poolLayout === 'card' ? 'list' : 'card';
    localStorage.setItem('journal.poolLayout', poolLayout);
    els.poolLayoutBtn.textContent = poolLayout === 'card' ? '⊞' : '☰';
    renderCardPool();
  });

  // ── 卡片池：命名视图（保存 / 切换） ──
  els.saveViewBtn?.addEventListener('click', saveCurrentView);
  els.viewSelect?.addEventListener('change', () => {
    const id = els.viewSelect.value;
    const view = savedViews.find(v => v.id === id);
    if (view) applyView(view);
  });

  // ── 卡片池：模板（阶段 D） ──
  els.btnTemplate?.addEventListener('click', openTemplateMenu);

  // ── 模板构建器事件 ──
  document.getElementById('tpl-builder-close')?.addEventListener('click', closeTemplateBuilder);
  document.getElementById('tpl-cancel')?.addEventListener('click', closeTemplateBuilder);
  document.getElementById('tpl-save')?.addEventListener('click', saveTemplateBuilder);
  document.getElementById('tpl-prefill')?.addEventListener('click', prefillTemplateFromCard);
  document.getElementById('tpl-builder-tile')?.addEventListener('click', toggleTplBuilderPicker);
  document.getElementById('tpl-np-ok')?.addEventListener('click', onTplNewPropOk);
  document.getElementById('tpl-np-cancel')?.addEventListener('click', () => { if (tplNewPropForm) tplNewPropForm.classList.add('hidden'); tplEditKey = null; });
  document.getElementById('tpl-np-type')?.addEventListener('change', () => {
    const wrap = tplNpOptions?.closest('.prop-options-wrap');
    if (wrap) wrap.classList.toggle('hidden', tplNpType.value !== 'select' && tplNpType.value !== 'multi');
  });
  document.getElementById('template-builder-overlay')?.addEventListener('click', (e) => {
    // 点击外部关闭；点击瓦片容器内的 emoji picker 不关
    const path = e.composedPath ? e.composedPath() : [e.target];
    if (path.some(el => el?.classList?.contains('ce-tile-wrap') || el?.classList?.contains('template-builder'))) return;
    closeTemplateBuilder();
  });
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  els.hostStatusBtn?.addEventListener('click', startHost);

  // ── AI Skill 状态 ──
  els.skillsToggle.addEventListener('click', () => {
    const isOpen = !els.skillsPanel.classList.contains('hidden');
    els.skillsPanel.classList.toggle('hidden', isOpen);
    els.skillsToggle.classList.toggle('open', !isOpen);
    if (!isOpen && !skillsCache) loadSkillStatus();
  });
  els.skillsCopyAll.addEventListener('click', async () => {
    if (!skillsCache) return;
    const text = skillsCache.locations.map(l => l.path).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast('✅ 已复制全部路径', 'success');
    } catch (e) {
      showToast('复制失败，请手动复制', 'error');
    }
  });
  await loadSkillStatus();

  // ── 外部存储变更刷新 ──
  // 已被 startHostSync（host → 缓存 → 重渲染）取代，storage.onChanged 会在上面的回调里统一刷新
}

init().catch(err => console.error('[journal] init failed:', err));
