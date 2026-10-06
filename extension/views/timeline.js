/**
 * timeline.js — 日程时间线视图（views 层）
 *
 * 画布按时段绝对定位；范围（vs.viewStartMin/EndMin）随当天卡片自动扩展。
 * 重渲染 / 打开编辑器经 state/actions.js 由组合根注入。
 */

import { todayKey, currentTime, timeToMinutes, minutesToTime, addMinutes, snapToQuarter, snapUpToQuarter, getCardStartTime, getCardEndTime, layoutScheduleLanes, getCardTypeCounts } from '../shared/model.js';
import { getCardsByDay, updateCardEntry } from '../state/repository.js';
import { formatDateLabel } from '../shared/format.js';
import { els } from '../components/dom-refs.js';
import { vs, DAY_START_MIN, DAY_END_MIN } from '../state/view-state.js';
import { renderTimelineCard } from './timeline-card.js';
import { actions } from '../state/actions.js';

// escapeHtml / typeIcon 等纯展示工具已统一到 shared/format.js（唯一实现处）。

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

    actions.openEditorRange(minutesToTime(s), minutesToTime(eSlot), date);
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
// 已提取到 views/timeline-card.js（见顶部 import）。

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
