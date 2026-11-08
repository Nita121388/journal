/**
 * week.js — 周视图（views 层）
 *
 * 周网格渲染（时间刻度 + 分道卡片 + 拖拽/框选建卡）。
 *
 * 结构（grid，3 行 × 8 列）：
 *   行1  ruler 表头占位 + 7 个公共日期头（sticky 吸附顶部）
 *   行2  全天行（无全天卡时留空，保证 7 列行高一致）
 *   行3  小时刻度尺 + 7 天时间画布
 *
 * 为什么把日期头提到独立行：它原先放在每天列内部，而列高 = 内容高，
 * `position: sticky` 没有可移动空间 + 外层 `overflow:hidden`，
 * 结果滚动到当前时刻后表头直接消失（dev-loop 截图可见）。
 */

import { addMinutes, currentTime, getCardEndTime, getCardStartTime, layoutScheduleLanes, minutesToTime, snapToQuarter, snapUpToQuarter, timeToMinutes, toDayKey, todayKey } from '../shared/model.js';
import { actions } from '../state/actions.js';
import { DAY_END_MIN, DAY_START_MIN, monthOf, vs } from '../state/view-state.js';
import { SLOT_HEIGHT, scheduleHeight } from './timeline.js';
import { renderCardBlock, renderDayHeader } from './calendar-card.js';
import { getCardsByDaySync } from './day-cards.js';
import { requestFocusScroll } from './rightview.js';

// 框选交互已收敛到 views/range-select.js（与日视图时间线共用同一实现）。
import { bindRangeSelect } from './range-select.js';
export { bindRangeSelect };

const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEK_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

/** 给 grid 子项指定行列（显式赋值比依赖 DOM 顺序更抗改动）。 */
function place(el, row, col) {
  el.style.gridRow = String(row);
  el.style.gridColumn = String(col);
  return el;
}

/**
 * 周视图：垂直占满容器 + 左侧小时刻度尺 + 7 天列按真实时间比例定位卡片
 * （复用日视图时间线引擎，保证两视图像素一致）。
 * @param {HTMLElement} container
 */
export function renderWeekGrid(container) {
  const [y, m, d] = vs.weekAnchor.split('-').map(Number);
  const sunday = new Date(y, m - 1, d); sunday.setDate(sunday.getDate() - sunday.getDay());
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(sunday); dt.setDate(sunday.getDate() + i);
    days.push(toDayKey(dt));
  }
  const today = todayKey();

  // ── 全周时间范围：跟随 timelineSpan（08–22 / 24h）+ 全周数据自动扩展
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

  // ── 行1：刻度尺表头占位 + 7 个日期头
  const rulerHead = document.createElement('div');
  rulerHead.className = 'calview-week-ruler-head';
  weekEl.append(place(rulerHead, 1, 1));

  days.forEach((dayKey, i) => {
    const dt = new Date(Number(dayKey.slice(0, 4)), Number(dayKey.slice(5, 7)) - 1, Number(dayKey.slice(8, 10)));
    const head = document.createElement('div');
    head.className = 'calview-week-head';
    if (dayKey === today) head.classList.add('is-today');
    if (dayKey === vs.selectedDate) head.classList.add('is-selected');

    const weekdayEl = document.createElement('span');
    weekdayEl.className = 'calview-week-weekday';
    weekdayEl.title = `${WEEK_NAMES[dt.getDay()]} ${dayKey}`;
    weekdayEl.textContent = WEEK_SHORT[dt.getDay()];
    head.append(weekdayEl);
    head.append(renderDayHeader(dayKey, {
      isToday: dayKey === today,
      isSelected: dayKey === vs.selectedDate,
      count: getCardsByDaySync(dayKey).length,
      compact: true,
    }));

    head.addEventListener('click', async () => {
      vs.selectedDate = dayKey;
      vs.weekAnchor = dayKey;
      vs.calendarMonth = monthOf(dayKey);
      vs.viewMode = 'timeline';
      requestFocusScroll(); // 跳到该日时间线后聚焦
      await actions.refreshAll();
    });
    weekEl.append(place(head, 1, i + 2));
  });

  // ── 行2：全天行（每天一格；无卡也占位，保证行高一致）
  const rulerAllday = document.createElement('div');
  rulerAllday.className = 'calview-week-ruler-allday';
  rulerAllday.textContent = '全天';
  weekEl.append(place(rulerAllday, 2, 1));
  days.forEach((dayKey, i) => {
    const noTimeCards = getCardsByDaySync(dayKey).filter((c) => !getCardStartTime(c));
    const cell = document.createElement('div');
    cell.className = 'calview-week-allday';
    cell.dataset.day = dayKey;
    if (dayKey === today) cell.classList.add('is-today');
    if (noTimeCards.length) {
      for (const card of noTimeCards) cell.append(renderCardBlock(card, null, true, dayKey));
    }
    weekEl.append(place(cell, 2, i + 2));
  });

  // ── 行3：刻度尺 + 7 天时间画布
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
  weekEl.append(place(rulerBody, 3, 1));

  days.forEach((dayKey, i) => {
    weekEl.append(place(buildDayBody(dayKey, allTimed, bodyH, today), 3, i + 2));
  });

  container.append(weekEl);
}

/**
 * 单天的时间画布（网格线 + 当前时刻线 + 分道卡片 + 框选建卡）。
 * @param {string} dayKey
 * @param {Array<{card:object,dayKey:string,start:number,end:number}>} allTimed
 * @param {number} bodyH
 * @param {string} today
 * @returns {HTMLElement}
 */
function buildDayBody(dayKey, allTimed, bodyH, today) {
  const body = document.createElement('div');
  body.className = 'calview-week-body';
  body.dataset.day = dayKey;
  body.style.height = `${bodyH}px`;
  if (dayKey === today) body.classList.add('is-today');
  if (dayKey === vs.selectedDate) body.classList.add('is-selected');

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

  // 卡片：按天分道后走公共组件 renderCardBlock（绝对定位到列内对应时刻）
  const dayTimed = allTimed.filter((t) => t.dayKey === dayKey);
  const laneMap = layoutScheduleLanes(dayTimed.map((t) => ({ id: t.card.id, start: t.start, end: t.end })));
  for (const t of dayTimed) {
    const cardEl = renderCardBlock(t.card, laneMap.get(t.card.id) ?? null, false, dayKey);
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
  bindRangeSelect(body, (sMin, eMin) => {
    actions.openEditorRange(minutesToTime(sMin), minutesToTime(eMin), dayKey);
  });
  body.addEventListener('click', (e) => {
    if (e.target.closest('.timeline-card, .timeline-now-marker')) return;
    const rect = body.getBoundingClientRect();
    const mins = vs.viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15;
    actions.openEditor(null, snapToQuarter(minutesToTime(mins)), dayKey);
  });

  return body;
}
