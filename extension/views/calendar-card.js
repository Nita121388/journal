/**
 * calendar-card.js — 日历公共卡片组件（views 层）
 *
 * 月/周/日三视图共用同一套卡片渲染，样式与交互不再分叉：
 * - `renderCardPill`   月格 / 全天行的紧凑 pill（L0，md-lite 纯文本）
 * - `renderCardBlock`  周/日时间网格块（L1，md-lite 多行）—— 复用 timeline-card 的拖拽/缩放内核
 * - `renderCardDetail` 展开态：header + Milkdown 正文（L2）+ footer
 * - `renderDayHeader`  日期头（大号数字 + 节日副标 + 今天标）
 *
 * 渲染函数一律**纯**：不读存储、不写存储，数据由调用方传入；
 * 用户内容一律 textContent（spec: component-guidelines）。
 */

import { cardColorKey } from '../shared/format.js';
import { festivalOf } from '../shared/lunar-lite.js';
import { toPlainLine } from '../shared/md-lite.js';
import { addMinutes, getCardEndTime, getCardStartTime, getCardDuration } from '../shared/model.js';
import { CARD_TYPES } from '../shared/card-schema.js';
import { typeIcon } from '../shared/format.js';
import { actions } from '../state/actions.js';
import { acquire, release } from './milkdown-mount.js';
import { renderTimelineCard } from './timeline-card.js';

/** 单个格内 pill 最多显示条数，超出显示 `+N`。 */
export const MAX_PILLS_PER_DAY = 3;

/** pill 内标题截断长度（窄侧栏下 320px 一格只有 ~40px 宽）。 */
const PILL_TITLE_MAX = 14;

/** 类型 → 中文标签（`aria-label` / 详情头部用）。 */
const TYPE_LABEL = { task: '任务', text: '记录', idea: '想法' };

/** 建一个带 class 与文本的 `<span>`（文本走 textContent，天然安全）。 */
function spanEl(className, text) {
  const s = document.createElement('span');
  s.className = className;
  if (text !== undefined) s.textContent = text;
  return s;
}

/** 卡片正文里「可展示的内容」：优先 content，退化到 title。 */
function cardBodyMd(card) {
  return card?.content || card?.title || '';
}

/**
 * 卡片配色键。
 *
 * 优先级：显式 `props.color` > 类型（task/text）> 首个标签兜底 > gray。
 * @param {object} card
 * @returns {'red'|'green'|'blue'|'purple'|'gray'}
 */
export function pillColorKey(card) {
  return cardColorKey(card);
}

/**
 * 时间文案：`09:00` / `09:00–10:00` / `全天`。
 * @param {object} card
 * @param {{range?: boolean}} [opts] range=false 时只给开始时间（窄格用）
 * @returns {string}
 */
export function cardTimeText(card, opts = {}) {
  const start = getCardStartTime(card);
  if (!start) return '全天';
  if (opts.range === false) return start;
  return `${start}–${getCardEndTime(card) ?? addMinutes(start, 15)}`;
}

/**
 * 月格 / 全天行的紧凑 pill。
 *
 * @param {object} card
 * @param {{showTime?: boolean, compact?: boolean, onOpen?: (card:object)=>void}} [opts]
 * @returns {HTMLElement}
 */
export function renderCardPill(card, opts = {}) {
  const showTime = opts.showTime !== false;
  const type = CARD_TYPES.includes(card?.type) ? card.type : 'text';
  const color = pillColorKey(card);

  const el = document.createElement('button');
  el.type = 'button';
  el.className = `cc-pill cc-color-${color} type-${type}`;
  if (type === 'task' && card?.done) el.classList.add('is-done');
  el.dataset.cardId = card?.id ?? '';
  if (card?.id) el.dataset.id = card.id;

  const icon = spanEl('cc-pill-icon', typeIcon(type, card?.emoji));
  icon.setAttribute('aria-hidden', 'true');

  const title = spanEl('cc-pill-title', toPlainLine(cardBodyMd(card), { maxLen: PILL_TITLE_MAX }) || '(空卡片)');

  el.append(icon, title);
  if (showTime) el.append(spanEl('cc-pill-time', cardTimeText(card, { range: false })));

  const timeText = cardTimeText(card);
  el.title = `${TYPE_LABEL[type] ?? '卡片'} · ${timeText}\n${toPlainLine(cardBodyMd(card)) || '(空卡片)'}`;
  el.setAttribute('aria-label', `${TYPE_LABEL[type] ?? '卡片'}，${timeText}，${toPlainLine(cardBodyMd(card)) || '空卡片'}`);

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (opts.onOpen) { opts.onOpen(card); return; }
    actions.openEditor(card, getCardStartTime(card) ?? '', card.assignedDate ?? '');
  });

  return el;
}

/**
 * 日期头：大号日号 + 节日副标 + 今天标记。
 *
 * @param {string} dayKey YYYY-MM-DD
 * @param {{count?: number, isToday?: boolean, isSelected?: boolean, compact?: boolean, subLabel?: string}} [opts]
 * @returns {HTMLElement}
 */
export function renderDayHeader(dayKey, opts = {}) {
  const day = Number(dayKey.slice(8, 10));
  const festival = opts.subLabel ?? festivalOf(dayKey);

  const el = document.createElement('div');
  el.className = 'cc-dayheader';
  if (opts.isToday) el.classList.add('is-today');
  if (opts.isSelected) el.classList.add('is-selected');

  const num = spanEl('cc-dayheader-num', String(day));
  el.append(num);

  if (opts.isToday) {
    // 文字而非单靠红色：窄侧栏（44px 格宽）下「今天」两个字会折行，
    // 用单字「今」+ aria-label 保留完整语义
    el.append(spanEl('cc-dayheader-today', opts.compact ? '今' : '今天'));
  } else if (festival) {
    el.append(spanEl('cc-dayheader-sub', festival));
  }

  if (typeof opts.count === 'number' && opts.count > 0) {
    el.append(spanEl('cc-dayheader-count', String(opts.count)));
  }

  // 读屏语义：视觉上是数字 + 「今天」，文字节点已能读出，这里补日期全称
  el.setAttribute('aria-label', `${dayKey}${opts.isToday ? '，今天' : ''}${festival ? `，${festival}` : ''}`);

  return el;
}

/**
 * 日期格内的事件列表：最多 `MAX_PILLS_PER_DAY` 条 pill + `+N` 溢出提示。
 *
 * @param {Array<object>} cards
 * @param {{onOpen?: (card:object)=>void, max?: number}} [opts]
 * @returns {HTMLElement}
 */
export function renderDayCardList(cards, opts = {}) {
  const max = opts.max ?? MAX_PILLS_PER_DAY;
  const list = document.createElement('div');
  list.className = 'cc-daylist';
  for (const card of cards.slice(0, max)) {
    list.append(renderCardPill(card, { onOpen: opts.onOpen }));
  }
  if (cards.length > max) {
    list.append(spanEl('cc-daylist-more', `+${cards.length - max}`));
  }
  return list;
}

/**
 * 展开态卡片详情：header（类型/时间/时长）+ Milkdown 正文 + 操作。
 *
 * 正文用 Milkdown 真实渲染（L2）；产物不可用时由 milkdown-mount 自动降级为纯文本。
 * @param {object} card
 * @param {{onClose?: ()=>void}} [opts]
 * @returns {HTMLElement}
 */
export function renderCardDetail(card, opts = {}) {
  const type = CARD_TYPES.includes(card?.type) ? card.type : 'text';
  const el = document.createElement('div');
  el.className = `cc-detail cc-color-${pillColorKey(card)} type-${type}`;
  el.dataset.cardId = card?.id ?? '';

  // ── header
  const header = document.createElement('div');
  header.className = 'cc-detail-header';
  const icon = spanEl('cc-pill-icon', typeIcon(type, card?.emoji));
  icon.setAttribute('aria-hidden', 'true');
  header.append(icon);
  header.append(spanEl('cc-detail-title', toPlainLine(card?.title ?? '', { maxLen: 60 }) || '未命名'));
  header.append(spanEl('cc-detail-time', cardTimeText(card)));

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'cc-detail-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', '收起详情');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.onClose?.();
  });
  header.append(closeBtn);
  el.append(header);

  // ── 正文（Milkdown 异步挂载；先放占位避免跳动）
  const body = document.createElement('div');
  body.className = 'cc-detail-body';
  const placeholder = spanEl('md-lite is-placeholder', '加载内容…');
  body.append(placeholder);
  el.append(body);
  void acquire(body, cardBodyMd(card), { key: card?.id ?? '' });

  // ── footer：时长 + 打开编辑器
  const footer = document.createElement('div');
  footer.className = 'cc-detail-footer';
  if (getCardStartTime(card)) {
    footer.append(spanEl('cc-detail-meta', `${Math.max(15, getCardDuration(card))} 分钟`));
  }
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'cc-detail-edit';
  editBtn.textContent = '编辑';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    actions.openEditor(card, getCardStartTime(card) ?? '', card.assignedDate ?? '');
  });
  footer.append(editBtn);
  el.append(footer);

  return el;
}

/**
 * 展开态是否已挂载正文：给视图层在重渲染前统一释放用。
 * @param {HTMLElement} el
 */
export function releaseCardDetail(el) {
  if (!el) return;
  release(el);
}

/**
 * 周/日时间网格块。
 *
 * 这里刻意**不重写**拖拽/缩放内核：`views/timeline-card.js` 的 `renderTimelineCard`
 * 已经承载 lane 定位、`is-short` 紧凑态、拖拽改时间、底部缩放等实测过的逻辑
 * （含 spec 里记录的 `.is-dragging` 过渡互斥 gotcha）。
 * 本函数只负责「内容区用 md-lite 多行渲染」这一层增强，其余原样委托。
 *
 * @param {object} card
 * @param {{lane:number,laneCount:number}|null} lane
 * @param {boolean} [allday=false]
 * @param {string|null} [dateOverride=null]
 * @returns {HTMLElement}
 */
export function renderCardBlock(card, lane = null, allday = false, dateOverride = null) {
  const el = renderTimelineCard(card, lane, allday, dateOverride);
  el.classList.add('cc-block');
  el.classList.add(`cc-color-${pillColorKey(card)}`);
  return el;
}
