/**
 * timeline-card.js — 日程卡片渲染（views 层）

单张时间线卡片（含拖拽/缩放交互）与卡片底部操作区。
 */

import { formatProvenance, typeIcon } from '../shared/format.js';
import { addMinutes, currentTime, getCardDuration, getCardEndTime, getCardStartTime, minutesToTime, timeToMinutes } from '../shared/model.js';
import { actions } from '../state/actions.js';
import { patchCard, deleteCardWithUndo } from '../features/card-actions.js';
import { vs } from '../state/view-state.js';
import { SLOT_HEIGHT, scheduleHeight } from './timeline.js';

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

  // Header（短卡片只显示开始时间，把横向空间让给内容）
  // 全部用 DOM API 构建：`provenance.project` 与 `card.emoji` 都可能来自用户输入 / AI 建卡 /
  // 多端同步的任意文本，拼 innerHTML 会形成注入面（spec: 用户内容一律走 textContent）。
  const header = document.createElement('div');
  header.className = 'card-header';
  appendOriginBadge(header, card);
  header.append(
    spanEl('card-type-icon', typeIcon(card.type, card.emoji)),
    spanEl('card-time', headerTimeText(card, allday, isShort)),
    spanEl('card-meta', !allday && !isShort ? `${Math.max(15, getCardDuration(card))} 分钟` : ''),
  );

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
    actions.openEditor(card, getCardStartTime(card) ?? currentTime(), dateOverride ?? vs.selectedDate);
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
    };
    const onUp = async () => {
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
        await patchCard(
          card.id,
          { time: start, startTime: start, endTime: end },
          '缩放保存失败：本机服务未连接',
        );
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
        await patchCard(
          card.id,
          { time: newStart, startTime: newStart, endTime: newEnd },
          '拖动保存失败：本机服务未连接',
        );
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
export function buildCardFooter(card) {
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
    doneBtn.setAttribute('aria-label', card.done ? '标记为未完成' : '标记为完成');
    doneBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await patchCard(card.id, { done: !card.done });
    });
    footer.append(doneBtn);
  }

  const typeBtn = document.createElement('button');
  typeBtn.className = 'card-footer-btn';
  typeBtn.textContent = '🔄';
  typeBtn.title = '切换类型';
  typeBtn.setAttribute('aria-label', '切换卡片类型');
  typeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const next = card.type === 'text' || card.type === 'idea' ? 'task' : 'text';
    await patchCard(card.id, { type: next });
  });
  footer.append(typeBtn);

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
