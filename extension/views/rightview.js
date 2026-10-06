/**
 * rightview.js — 右侧主视图调度 + 月历/周历（views 层）
 *
 * renderRightView 按 vs.viewMode 分派到 renderMonthGrid / renderWeekGrid / renderTimeline；
 * 周视图复用 timeline 的卡片渲染与刻度，并支持拖拽/框选建卡。
 */

import { els } from '../components/dom-refs.js';
import { formatDateLabel, typeIcon } from '../shared/format.js';
import {
  addMinutes, currentTime, getCardEndTime, getCardStartTime, getCardTypeCounts,
  getMonthMatrix, layoutScheduleLanes, minutesToTime, snapToQuarter, snapUpToQuarter,
  timeToMinutes, toDayKey, todayKey,
} from '../shared/model.js';
import { actions } from '../state/actions.js';
import { DAY_END_MIN, DAY_START_MIN, monthOf, vs } from '../state/view-state.js';
import { SLOT_HEIGHT, escapeHtml, renderTimeline, renderTimelineCard, scheduleHeight } from './timeline.js';
export function addDays(dayKey, n) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toDayKey(dt);
}

/** 右侧头部标题文案 */
function viewHeaderLabel() {
  if (vs.viewMode === 'month') {
    const { year, month } = vs.calendarMonth;
    return `${year}年${month + 1}月`;
  }
  if (vs.viewMode === 'week') {
    const [y, m, d] = vs.weekAnchor.split('-').map(Number);
    const sun = new Date(y, m - 1, d); sun.setDate(sun.getDate() - sun.getDay());
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    return `${toDayKey(sun).slice(5).replace('-', '/')} – ${toDayKey(sat).slice(5).replace('-', '/')} · ${toDayKey(sun).slice(0, 4)}`;
  }
  const date = vs.selectedDate;
  const typeCounts = getCardTypeCounts(vs.allCardsCache, date);
  const parts = [];
  if (typeCounts.text) parts.push(`${typeCounts.text}📝`);
  if (typeCounts.task) parts.push(`${typeCounts.task}☑️`);
  const countStr = parts.length ? ` · ${parts.join(' ')}` : ' · 无卡片';
  return `📅 ${formatDateLabel(date)}${countStr}`;
}

/** 同步取某天卡片（从缓存，按时间排序） */
function getCardsByDaySync(date) {
  if (!Array.isArray(vs.allCardsCache)) return [];
  return vs.allCardsCache
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
export function markViewMode() {
  els.viewModeBtns?.forEach(b => b.classList.toggle('is-active', b.dataset.mode === vs.viewMode));
}

/** 右侧视图统一入口 */
/**
 * 一次性聚焦滚动：打开面板 / 切换日期 / 切换视图后，让「当前时刻」垂直居中。
 * 不足以居中时钳制到边界（顶部 0 / 底部 maxScroll），不强拽；非今天则聚焦
 * 当天最早一张定时卡（无卡则不滚）。消费后不再干预用户滚动与每分钟 marker 刷新。
 */
// pendingFocusScroll 已并入 state/view-state.js 的 vs.pendingFocusScroll
export function requestFocusScroll() { vs.pendingFocusScroll = true; }

function scrollTimelineToFocus(container, prevScroll = 0) {
  if (!container) return;
  if (vs.viewMode === 'month') return; // 月视图无时间轴，也不恢复（整月网格）

  if (vs.pendingFocusScroll) {
    vs.pendingFocusScroll = false;
    let targetY = null;
    if (vs.selectedDate === todayKey()) {
      const now = new Date();
      const nowMin = Math.max(vs.viewStartMin, Math.min(vs.viewEndMin, now.getHours() * 60 + now.getMinutes()));
      targetY = scheduleHeight(nowMin);
    } else {
      // 非今天：聚焦当天最早一张定时卡
      const cards = getCardsByDaySync(vs.selectedDate).filter((c) => getCardStartTime(c));
      if (cards.length) {
        const s = timeToMinutes(getCardStartTime(cards[0]));
        targetY = scheduleHeight(Math.max(vs.viewStartMin, s));
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

export async function renderRightView() {
  markViewMode();
  if (els.timelineDateHeader) els.timelineDateHeader.textContent = viewHeaderLabel();
  const container = els.timelineContainer;
  const prevScroll = container.scrollTop; // 渲染前捕获，供恢复（replaceChildren 会重置滚动）
  container.replaceChildren();
  container.classList.toggle('calview-week-wrap', vs.viewMode === 'week');
  if (vs.viewMode === 'month') { renderMonthGrid(container); return; }
  if (vs.viewMode === 'week') { renderWeekGrid(container); scrollTimelineToFocus(container, prevScroll); return; }
  await renderTimeline();
  scrollTimelineToFocus(container, prevScroll);
}

/** 月历网格 */
function renderMonthGrid(container) {
  const matrix = getMonthMatrix(vs.calendarMonth.year, vs.calendarMonth.month);
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
      if (cell.dayKey === vs.selectedDate) dayEl.classList.add('is-selected');
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
        vs.selectedDate = cell.dayKey;
        vs.weekAnchor = cell.dayKey;
        vs.calendarMonth = monthOf(cell.dayKey);
        vs.viewMode = 'timeline';
        await actions.refreshAll();
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
    const startMin = vs.viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15;
    const startM = Math.max(vs.viewStartMin, Math.min(vs.viewEndMin, startMin));
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
    const endMin = vs.viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15;
    const endM = Math.max(vs.viewStartMin, Math.min(vs.viewEndMin, endMin));
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
    const endMin = vs.viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15;
    const endM = Math.max(vs.viewStartMin, Math.min(vs.viewEndMin, endMin));
    const { startM, dragging } = sel;
    removeSel();
    if (!dragging) return; // 纯点击 → 走 click 单格创建
    suppressClick = true;
    // 起止对齐 15 分钟网格，最小 15 分钟，不超出视图范围
    let s = Math.floor(Math.min(startM, endM) / 15) * 15;
    let eSlot = Math.ceil(Math.max(startM, endM) / 15) * 15;
    if (eSlot - s < 15) eSlot = s + 15;
    eSlot = Math.min(vs.viewEndMin, eSlot);
    if (eSlot - s < 15) s = Math.max(vs.viewStartMin, eSlot - 15);
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
  const [y, m, d] = vs.weekAnchor.split('-').map(Number);
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
  vs.viewStartMin = vs.timelineSpan === 'full' ? 0 : DAY_START_MIN;
  vs.viewEndMin = vs.timelineSpan === 'full' ? 24 * 60 : DAY_END_MIN;
  const allTimed = [];
  for (const dayKey of days) {
    for (const c of getCardsByDaySync(dayKey)) {
      if (!getCardStartTime(c)) continue;
      const s = timeToMinutes(getCardStartTime(c));
      const e = timeToMinutes(getCardEndTime(c) ?? addMinutes(getCardStartTime(c), 15));
      vs.viewStartMin = Math.min(vs.viewStartMin, Math.floor(s / 15) * 15);
      vs.viewEndMin = Math.max(vs.viewEndMin, Math.ceil(e / 15) * 15);
      allTimed.push({ card: c, dayKey, start: s, end: e });
    }
  }
  vs.viewStartMin = Math.max(0, vs.viewStartMin);
  vs.viewEndMin = Math.min(24 * 60, vs.viewEndMin);
  const bodyH = scheduleHeight(vs.viewEndMin);

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
  for (let mm = vs.viewStartMin; mm <= vs.viewEndMin; mm += 60) {
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
    if (dayKey === vs.selectedDate) col.classList.add('is-selected');

    const head = document.createElement('div');
    head.className = 'calview-week-head';
    const dt = new Date(Number(dayKey.slice(0, 4)), Number(dayKey.slice(5, 7)) - 1, Number(dayKey.slice(8, 10)));
    const cards = getCardsByDaySync(dayKey);
    // 紧凑表头：单字星期 + 日号（窄列 7 天宽度有限，省去月份）
    head.innerHTML = `<span title="${weekNames[dt.getDay()]} ${dayKey}">${weekShort[dt.getDay()]} ${dt.getDate()}</span><span class="calview-week-count">${cards.length}</span>`;
    head.addEventListener('click', async () => {
      vs.selectedDate = dayKey;
      vs.weekAnchor = dayKey;
      vs.calendarMonth = monthOf(dayKey);
      vs.viewMode = 'timeline';
      requestFocusScroll(); // 跳到该日时间线后聚焦
      await actions.refreshAll();
    });
    col.append(head);

    const body = document.createElement('div');
    body.className = 'calview-week-body';
    body.style.height = `${bodyH}px`;

    // 网格线：每 15 分钟一条，整点加粗
    for (let mm = vs.viewStartMin; mm <= vs.viewEndMin; mm += 15) {
      const line = document.createElement('div');
      line.className = 'calview-week-gridline' + (mm % 60 === 0 ? ' is-hour' : '');
      line.style.top = `${scheduleHeight(mm)}px`;
      body.append(line);
    }

    // 当前时刻线（仅今天列）
    if (dayKey === today) {
      const now = new Date();
      const nowMin = Math.max(vs.viewStartMin, Math.min(vs.viewEndMin, now.getHours() * 60 + now.getMinutes()));
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
        actions.openEditor(null, snapUpToQuarter(currentTime()), dayKey);
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
        actions.openEditor(null, getCardStartTime(t.card) ?? currentTime(), dayKey);
      });
    }

    // 点击空白单格创建 + 拖动框选创建时间范围
    const onRange = (sMin, eMin) => {
      actions.openEditor(null, minutesToTime(sMin), dayKey);
      const endEl = document.getElementById('card-editor-end');
      if (endEl) {
        endEl.value = minutesToTime(eMin); // 覆盖默认 start+15，预填选区时长
        actions.updateEditorDuration(); // 时长标签需随之重算，否则仍显示默认 15 分钟
      }
    };
    bindRangeSelect(body, onRange);
    body.addEventListener('click', (e) => {
      if (e.target.closest('.timeline-card, .timeline-now-marker')) return;
      const rect = body.getBoundingClientRect();
      const mins = vs.viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15;
      actions.openEditor(null, snapToQuarter(minutesToTime(mins)), dayKey);
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
    actions.openEditor(card, start ?? currentTime(), card.assignedDate ?? vs.selectedDate);
  });
  return el;
}
