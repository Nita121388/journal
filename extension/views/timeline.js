/**
 * timeline.js — 日程时间线视图（views 层）
 *
 * 画布按时段绝对定位；范围（vs.viewStartMin/EndMin）随当天卡片自动扩展。
 * 重渲染 / 打开编辑器经 state/actions.js 由组合根注入。
 */

import {
  todayKey, currentTime,
  timeToMinutes, minutesToTime, addMinutes, snapToQuarter, snapUpToQuarter,
  getCardStartTime, getCardEndTime, getCardDuration, layoutScheduleLanes, getCardTypeCounts,
} from '../shared/model.js';
import { getCardsByDay, updateCardEntry, deleteCardEntry } from '../state/repository.js';
import { typeIcon, formatProvenance, formatDateLabel } from '../shared/format.js';
import { els } from '../components/dom-refs.js';
import { vs, DAY_START_MIN, DAY_END_MIN } from '../state/view-state.js';
import { actions } from '../state/actions.js';

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ─── 渲染：时间线 ──────────────────────────────────────── */

export async function renderTimeline() {
  const date = vs.selectedDate;
  const dayCards = await getCardsByDay(date);
  const typeCounts = getCardTypeCounts(vs.allCardsCache, date);

  // ── 视图切换：timeline 模式才写入 dateHeader ──
  if (vs.viewMode === 'timeline') {
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
  vs.viewStartMin = vs.timelineSpan === 'full' ? 0 : DAY_START_MIN;
  vs.viewEndMin = vs.timelineSpan === 'full' ? 24 * 60 : DAY_END_MIN;
  for (const c of timedCards) {
    const s = timeToMinutes(getCardStartTime(c));
    const e = timeToMinutes(getCardEndTime(c) ?? addMinutes(getCardStartTime(c), 15));
    vs.viewStartMin = Math.min(vs.viewStartMin, Math.floor(s / 15) * 15);
    vs.viewEndMin = Math.max(vs.viewEndMin, Math.ceil(e / 15) * 15);
  }
  vs.viewStartMin = Math.max(0, vs.viewStartMin);
  vs.viewEndMin = Math.min(24 * 60, vs.viewEndMin);

  const canvas = document.createElement('div');
  canvas.className = 'schedule-canvas';
  canvas.style.height = `${scheduleHeight(vs.viewEndMin)}px`;
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
  for (let m = vs.viewStartMin; m <= vs.viewEndMin; m += 15) {
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
      actions.openEditor(null, snapToQuarter(minutesToTime(m)), date);
    });
    canvas.append(line);
  }

  // 点击画布空白区域：根据 Y 坐标计算时间，打开新建编辑器
  // 卡片/marker 内部冒泡上来的点击直接忽略，否则会覆盖已打开的编辑态
  canvas.addEventListener('click', (e) => {
    if (e.target.closest('.timeline-card, .timeline-now-marker')) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const mins = vs.viewStartMin + (y / SLOT_HEIGHT) * 15;
    const snapped = snapToQuarter(minutesToTime(mins));
    actions.openEditor(null, snapped, date);
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
    const startMin = vs.viewStartMin + (y / SLOT_HEIGHT) * 15;
    // 钳制到视图范围内
    const startM = Math.max(vs.viewStartMin, Math.min(vs.viewEndMin, startMin));
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
    const endMin = vs.viewStartMin + (y / SLOT_HEIGHT) * 15;
    const endM = Math.max(vs.viewStartMin, Math.min(vs.viewEndMin, endMin));
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
    const endMin = vs.viewStartMin + (y / SLOT_HEIGHT) * 15;
    const endM = Math.max(vs.viewStartMin, Math.min(vs.viewEndMin, endMin));
    const { startM, dragging } = sel;
    removeSel();

    if (!dragging) return; // 纯点击 → 走 canvas click（单格创建）
    suppressCanvasClick = true;

    // 起止时间：向上取整/向下取整到 15 分钟，保证最小 15 分钟
    const s = Math.floor(Math.min(startM, endM) / 15) * 15;
    const e2 = Math.max(startM, endM);
    let eSlot = Math.ceil(e2 / 15) * 15;
    if (eSlot - s < 15) eSlot = s + 15;
    eSlot = Math.min(vs.viewEndMin, eSlot);
    if (eSlot - s < 15) s = Math.max(vs.viewStartMin, eSlot - 15);

    const startTime = minutesToTime(s);
    actions.openEditor(null, startTime, date);
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
    const rawMins = vs.viewStartMin + (y / SLOT_HEIGHT) * 15;
    const snapped = snapToQuarter(minutesToTime(Math.max(vs.viewStartMin, Math.min(vs.viewEndMin - 15, rawMins))));
    updateCardEntry(cardId, {
      assignedDate: date,
      time: snapped,
      startTime: snapped,
      endTime: addMinutes(snapped, 15),
    }).then(async () => {
      await actions.refreshAll();
      // 拖拽放置后直接打开编辑器（「拖到单元格进行编辑」）
      const dropped = vs.allCardsCache.find(c => c.id === cardId);
      if (dropped) actions.openEditor(dropped, snapped, date);
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
          actions.openEditor(null, getCardStartTime(card) ?? currentTime(), vs.selectedDate);
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

/** 当前视图范围见 state/view-state.js 的 vs.vs.viewStartMin / vs.vs.viewEndMin */
/** 15 分钟一格的高度（px） */
export const SLOT_HEIGHT = 30;

/** 时间分钟数 → 画布 top 偏移（px，基于当前视图范围） */
export function scheduleHeight(mins) {
  return (mins - vs.viewStartMin) / 15 * SLOT_HEIGHT;
}

/**
 * 渲染单张日程卡片（绝对定位在画布上）
 * @param {object} card
 * @param {{lane:number, laneCount:number}|null} lane — null 表示全天卡片
 * @param {boolean} [allday=false]
 * @param {string} [dateOverride] — 周/月视图指定目标日期（默认用全局 selectedDate）
 */
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
          await actions.refreshAll();
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
        try {
          await updateCardEntry(card.id, { time: newStart, startTime: newStart, endTime: newEnd });
          await actions.refreshAll();
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
      await actions.refreshAll();
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
    await actions.refreshAll();
  });
  footer.append(typeBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'card-footer-btn';
  delBtn.textContent = '🗑️';
  delBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm('删除这张卡片？')) {
      await deleteCardEntry(card.id);
      await actions.refreshAll();
    }
  });
  footer.append(delBtn);
  return footer;
}

/**
 * 今日当前时间刻度 marker：只在今天显示，绝对定位在画布对应 Y 坐标，绿色横线 + 「现在 HH:mm」。
 * 范围外钳制到画布顶部/底部，保证可见。
 */
export function renderCurrentTimeMarker() {
  const canvas = els.timelineContainer.querySelector('.schedule-canvas');
  if (!canvas) return;

  // 移除上一次的 marker，避免每次 refreshAll 叠加
  canvas.querySelectorAll('.timeline-now-marker').forEach(el => el.remove());

  // 仅今天显示
  if (vs.selectedDate !== todayKey()) return;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const clamped = Math.max(vs.viewStartMin, Math.min(vs.viewEndMin, nowMin));
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
  const createAtNow = () => actions.openEditor(null, snapUpToQuarter(currentTime()), vs.selectedDate);
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
export function startNowMarkerTimer() {
  setInterval(() => {
    renderCurrentTimeMarker();
  }, 60 * 1000);
}
