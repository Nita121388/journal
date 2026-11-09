/**
 * timeline-card.js — 日程卡片渲染（views 层）

单张时间线卡片（含拖拽/缩放交互）与卡片底部操作区。
 */

import { createChip } from '../components/chip.js';
import { cardIconEl } from '../components/card-icon.js';
import { cardPrimaryText, formatProvenance } from '../shared/format.js';
import { addMinutes, currentTime, getCardDuration, getCardEndTime, getCardStartTime, minutesToTime, timeToMinutes } from '../shared/model.js';
import { actions } from '../state/actions.js';
import { patchCard, deleteCardWithUndo } from '../features/card-actions.js';
import { vs } from '../state/view-state.js';
import { SLOT_HEIGHT, scheduleHeight } from './timeline.js';
import { bindPointerDrag } from './gesture.js';
import { toggleCardDetail } from './card-expand.js';

const ORIGIN_ICON = { human: '👤', 'agent-assisted': '🤖', 'agent-auto': '⚙️' };

/** 建一个带 class 与文本的 `<span>`（文本走 textContent，天然安全）。 */
function spanEl(className, text) {
  const s = document.createElement('span');
  s.className = className;
  s.textContent = text;
  return s;
}

/**
 * Header 时间文案：全天 / 短卡片只显示开始 / 完整区间。
 * @param {object} card
 * @param {boolean} allday
 * @param {boolean} isShort
 * @returns {string}
 */
function headerTimeText(card, allday, isShort) {
  if (allday) return '全天';
  const start = getCardStartTime(card);
  if (isShort) return start;
  return `${start}–${getCardEndTime(card) ?? addMinutes(start, 15)}`;
}

/**
 * 来源角标（标在 header，`title` 为完整 provenance，hover 可见）。无来源信息时不追加。
 * @param {HTMLElement} header
 * @param {object} card
 */
function appendOriginBadge(header, card) {
  const by = card.meta?.createdBy ?? null;
  if (!by?.origin) return;
  const badge = document.createElement('span');
  badge.className = 'card-origin';
  badge.title = formatProvenance(by); // DOM 属性赋值：不经过 HTML 解析，无注入面
  badge.textContent = ORIGIN_ICON[by.origin] ?? '👤';
  header.append(badge);
}

export function renderTimelineCard(card, lane = null, allday = false, dateOverride = null) {
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

  // Header：**图标 + 标题**（视觉向参考图对齐——块内首行是标题，次行才是时间）。
  // 全部用 DOM API 构建：`provenance.project` 与 `card.emoji` 都可能来自用户输入 / AI 建卡 /
  // 多端同步的任意文本，拼 innerHTML 会形成注入面（spec: 用户内容一律走 textContent）。
  const header = document.createElement('div');
  header.className = 'card-header';
  appendOriginBadge(header, card);
  header.append(
    cardIconEl(card, { cls: 'card-type-icon', size: 12 }),
    spanEl('card-primary', cardPrimaryText(card, '(空卡片)')),
  );
  // 展开入口：hover/聚焦时在 header 右侧露出，点开用 Milkdown 渲染正文
  // （单击卡片主体仍是「打开编辑器」，保持既有交互不回归）
  const expandBtn = document.createElement('button');
  expandBtn.type = 'button';
  expandBtn.className = 'card-expand-btn';
  expandBtn.textContent = '◱';
  expandBtn.title = '展开内容预览（Markdown 渲染）';
  expandBtn.setAttribute('aria-label', '展开内容预览');
  expandBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCardDetail(card.id);
  });
  header.append(expandBtn);

  // Body：**时间行 + 次要内容**（时间放在标题下面，与参考图一致；
  // 时间节点仍用 .card-time / .card-meta 类名，拖拽与缩放的实时文本更新不必改）。
  const body = document.createElement('div');
  // 完成态由 status 单真值决定（type 已退出 UI；done 字段仍同步写入保持兼容）
  body.className = 'card-body' + (card.status === 'done' ? ' is-done' : '');
  const timeRow = document.createElement('div');
  timeRow.className = 'card-timerow';
  timeRow.append(spanEl('card-time', headerTimeText(card, allday, isShort)));
  if (!allday && !isShort) {
    timeRow.append(spanEl('card-meta', `${Math.max(15, getCardDuration(card))} 分钟`));
  }
  body.append(timeRow);
  // 次要内容：有标题时 content 作为正文；只填 content 的卡不再重复一遍
  if (card.title && card.content) {
    const sub = document.createElement('div');
    sub.className = 'card-secondary';
    sub.textContent = card.content;
    body.append(sub);
  }

  // Footer
  const footer = buildCardFooter(card);

  // 点击卡片编辑（拖拽后由 gesture 的 suppressNextClick 吞掉一次；
  // 阻止冒泡到 canvas，避免二次打开空编辑器）
  const openFromCard = () => actions.openEditor(card, getCardStartTime(card) ?? currentTime(), dateOverride ?? vs.selectedDate);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    openFromCard();
  });
  // 键盘可达：与卡片池项一致（Tab 聚焦 + Enter/Space 打开）
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${cardPrimaryText(card, '空卡片')}${!allday && getCardStartTime(card) ? `，${getCardStartTime(card)}` : ''}`);
  el.addEventListener('keydown', (e) => {
    if (e.target !== el) return; // 内部按钮自行处理
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFromCard();
    }
  });

  // 非全天卡片：底部 resize 手柄调整结束时间。
  // 拖拽内核归 views/gesture.js（body is-resizing 标志 + suppressClick + finally 自愈），
  // 吸附/钳制/高度反推等业务逻辑留在这里。
  if (!allday && lane) {
    const handle = document.createElement('div');
    handle.className = 'card-resize-handle';
    handle.title = '拖动调整时长（15 分钟吸附）';
    bindPointerDrag(handle, {
      gestureKind: 'resize',
      suppressClickOnEnd: true,
      // 吞的是**卡片本体**上的 click（不是手柄）：click 目标是 mousedown/mouseup
      // 命中元素的公共祖先，拖到卡片内部抬起时就是卡片；而「点卡片 = 打开编辑器」
      // 也挂在卡片上 —— 与原实现的 suppressClick 作用域一致。
      suppressClickTarget: el,
      onStart: (e) => {
        handle.setPointerCapture(e.pointerId);
      },
      onMove: (e) => {
        e.preventDefault();
        const rect = el.parentElement.getBoundingClientRect();
        const rawMins = vs.viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15;
        let endMin = Math.round(rawMins / 15) * 15;
        const startMin = timeToMinutes(getCardStartTime(card));
        endMin = Math.max(startMin + 15, endMin);
        endMin = Math.min(vs.viewEndMin, endMin);
        const end = minutesToTime(endMin);
        const dur = endMin - startMin;
        el.dataset.end = end;
        el.style.height = `${(dur / 15) * SLOT_HEIGHT}px`;
        const time = el.querySelector('.card-time');
        const isShort = el.classList.contains('is-short');
        if (time) time.textContent = isShort ? getCardStartTime(card) : `${getCardStartTime(card)}–${end}`;
        const meta = el.querySelector('.card-meta');
        if (meta) meta.textContent = isShort ? '' : `${dur} 分钟`;
      },
      onEnd: () => {
        const start = getCardStartTime(card);
        // 若 pointerup 未经过 pointermove（如只点了 handle），从当前高度反推结束时间
        let end = el.dataset.end;
        if (!end) {
          const heightPx = el.getBoundingClientRect().height || SLOT_HEIGHT;
          const dur = Math.max(15, Math.round((heightPx / SLOT_HEIGHT) * 15 / 15) * 15);
          end = minutesToTime(timeToMinutes(start) + dur);
        }
        if (start && end) {
          void patchCard(
            card.id,
            { time: start, startTime: start, endTime: end },
            '缩放保存失败：本机服务未连接',
          );
        }
      },
    });
    el.append(handle);
  }

  // 非全天卡片：拖动主体（header/body 区域）纵向移动，改变开始时间、时长不变。
  // 15 分钟吸附、钳制到画布范围，拖放后持久化并刷新（lane 自动重排）；
  // 阈值（4px）与「纯点击保持编辑」判定是本地逻辑，留在这里。
  if (!allday && lane) {
    const startMin = timeToMinutes(getCardStartTime(card));
    const endMin = timeToMinutes(getCardEndTime(card) ?? addMinutes(getCardStartTime(card), 15));
    const dur = Math.max(15, endMin - startMin);
    let moved = false;
    let grabOffsetMin = 0;
    let startY = 0;
    const MOVE_THRESHOLD_PX = 4; // 忽略点击时的微小抖动，避免误判为拖动
    bindPointerDrag(el, {
      gestureKind: 'drag',
      // 不拦截 footer 按钮与 resize 手柄的交互
      shouldStart: (e) => !e.target.closest('.card-footer, .card-resize-handle'),
      suppressClickOnEnd: () => moved, // 仅真拖动后吞一次 click；纯点击保持编辑功能
      onStart: (e) => {
        moved = false;
        startY = e.clientY;
        const grabY = e.clientY - el.getBoundingClientRect().top;
        grabOffsetMin = (grabY / SLOT_HEIGHT) * 15;
        el.classList.add('is-dragging');
        el.setPointerCapture(e.pointerId);
      },
      onMove: (e) => {
        if (!moved && Math.abs(e.clientY - startY) < MOVE_THRESHOLD_PX) return;
        e.preventDefault();
        moved = true;
        const rect = el.parentElement.getBoundingClientRect();
        const rawMins = vs.viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15 - grabOffsetMin;
        const snappedMin = Math.round(rawMins / 15) * 15;
        // 钳制：开始时间 ∈ [视图上界, 视图下界 - dur]，保证卡片始终在画布内
        const newStartMin = Math.max(vs.viewStartMin, Math.min(vs.viewEndMin - dur, snappedMin));
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
      },
      onEnd: () => {
        el.classList.remove('is-dragging');
        if (!moved) return; // 纯点击（<4px）不持久化，交由 click 打开编辑
        const newStart = el.dataset.start;
        const newEnd = el.dataset.end;
        if (newStart && newEnd) {
          void patchCard(
            card.id,
            { time: newStart, startTime: newStart, endTime: newEnd },
            '拖动保存失败：本机服务未连接',
          );
        }
      },
    });
  }

  el.append(header, body, footer);
  return el;
}

/** 构建卡片底部操作区（完成 / 删除） */
export function buildCardFooter(card) {
  const footer = document.createElement('div');
  footer.className = 'card-footer';

  if (Array.isArray(card.tags) && card.tags.length) {
    const chips = document.createElement('span');
    chips.className = 'card-tags';
    for (const name of card.tags) {
      // 只读展示：createChip 的 static 分支输出 span（不产生无动作的 Tab 停靠点）
      chips.append(createChip({ label: name, static: true }));
    }
    footer.append(chips);
  }

  // 完成动作常驻：类型退场后「完成」只能由 status 表达（done 字段同步写入）
  const isDone = card.status === 'done';
  const doneBtn = document.createElement('button');
  doneBtn.className = 'card-footer-btn done-btn' + (isDone ? ' is-done' : '');
  doneBtn.textContent = isDone ? '撤销完成' : '标记完成';
  doneBtn.setAttribute('aria-label', isDone ? '标记为未完成' : '标记为完成');
  doneBtn.setAttribute('aria-pressed', isDone ? 'true' : 'false');
  doneBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await patchCard(card.id, isDone
      ? { status: 'todo', done: false, progress: card.progress === 100 ? 0 : (card.progress ?? 0) }
      : { status: 'done', done: true, progress: 100 });
  });
  footer.append(doneBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'card-footer-btn';
  delBtn.textContent = '🗑️';
  delBtn.title = '删除卡片';
  delBtn.setAttribute('aria-label', '删除卡片');
  delBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await deleteCardWithUndo(card);
  });
  footer.append(delBtn);
  return footer;
}
