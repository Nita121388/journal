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

import { addMinutes, currentTime, getCardEndTime, getCardStartTime, layoutScheduleLanes, minutesToTime, snapToQuarter, timeToMinutes, toDayKey, todayKey } from '../shared/model.js';
import { actions } from '../state/actions.js';
import { DAY_END_MIN, DAY_START_MIN, monthOf, vs } from '../state/view-state.js';
import { SLOT_HEIGHT, scheduleHeight } from './timeline.js';
import { renderCardBlock, renderDayHeader } from './calendar-card.js';
import { getCardsByDaySync } from './day-cards.js';
import { requestFocusScroll } from './rightview.js';
import { createNowMarker, nowLabel } from './now-marker.js';

// 框选交互已收敛到 views/range-select.js（与日视图时间线共用同一实现）。
import { bindRangeSelect } from './range-select.js';
export { bindRangeSelect };

const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEK_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

/** 单道可用宽度下限（px）：低于它就不再横向分道（design.md §5.2 / prd R7）。 */
const MIN_LANE_W = 26;

/** 列宽低于此值只保留标题（时间行/正文/来源角标让位），避免被挤成逐字竖排。 */
const NARROW_COL_W = 56;

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

  // 每日列先建空壳（网格线 + 当前时刻线）；卡片**在布局完成后**再放：
  // 「分道还是叠放」取决于实测列宽，而列宽只有入 DOM 后才拿得到（见 layoutDayCards）。
  const bodies = days.map((dayKey, i) => {
    const body = buildDayBody(dayKey, today, bodyH);
    weekEl.append(place(body, 3, i + 2));
    return body;
  });

  container.append(weekEl);

  days.forEach((dayKey, i) => {
    layoutDayCards(bodies[i], allTimed.filter((t) => t.dayKey === dayKey), dayKey);
  });
}

/**
 * 单天的时间画布壳（网格线 + 当前时刻线）；卡片由 layoutDayCards 在布局后放入。
 *
 * @param {string} dayKey
 * @param {string} today
 * @param {number} bodyH
 * @returns {HTMLElement}
 */
function buildDayBody(dayKey, today, bodyH) {
  const body = document.createElement('div');
  body.className = 'calview-week-body';
  body.dataset.day = dayKey;
  body.style.height = `${bodyH}px`;
  if (dayKey === today) body.classList.add('is-today');
  if (dayKey === vs.selectedDate) body.classList.add('is-selected');

  // 网格线：每 15 分钟一条（15 分钟线不可见，仅整点画 1px 实线 —— prd R1/R2）
  for (let mm = vs.viewStartMin; mm <= vs.viewEndMin; mm += 15) {
    const line = document.createElement('div');
    line.className = 'calview-week-gridline' + (mm % 60 === 0 ? ' is-hour' : '');
    line.style.top = `${scheduleHeight(mm)}px`;
    body.append(line);
  }

  // 当前时刻线（仅今天列；窄列里胶囊由 CSS 隐藏，只留线与圆点）
  if (dayKey === today) {
    const now = new Date();
    const nowMin = Math.max(vs.viewStartMin, Math.min(vs.viewEndMin, now.getHours() * 60 + now.getMinutes()));
    // 同时间线：贴边时把 top 夹在 [8, 高-8]，否则线与圆点会被 overflow 裁掉一半
    const top = Math.max(8, Math.min(bodyH - 8, scheduleHeight(nowMin)));
    body.append(createNowMarker({ dayKey, top, label: nowLabel(now) }));
  }

  return body;
}

/**
 * 把某一天的卡片放进列里（必须在列已入 DOM 后调用 —— 需要实测列宽）。
 *
 * 拥挤策略（prd R7）：
 * - 分道可用宽度 ≥ `MIN_LANE_W` → 保留 `layoutScheduleLanes()` 的横向分道；
 * - 否则 → **不分道**，全部按开始时间叠放（后者覆盖前者，z-index 递增），
 *   列顶显示 `+N`（被覆盖张数）。窄列里 2 道 = 每道 ~18px，标题必被压成逐字竖排，
 *   所以宁可叠放也要保住标题可读。
 *
 * @param {HTMLElement} body 已入 DOM 的列容器
 * @param {Array<{card:object,dayKey:string,start:number,end:number}>} dayTimed
 * @param {string} dayKey
 */
function layoutDayCards(body, dayTimed, dayKey) {
  if (!dayTimed.length) return;
  const colW = body.clientWidth;
  if (colW < NARROW_COL_W) body.classList.add('is-narrow');

  const laneMap = layoutScheduleLanes(dayTimed.map((t) => ({ id: t.card.id, start: t.start, end: t.end })));
  const laneCount = Math.max(1, ...[...laneMap.values()].map((l) => l.laneCount));
  const splitLanes = laneCount === 1 || colW / laneCount >= MIN_LANE_W;

  const ordered = [...dayTimed].sort((a, b) => a.start - b.start || a.end - b.end);
  let covered = 0;

  ordered.forEach((t, idx) => {
    const lane = splitLanes ? (laneMap.get(t.card.id) ?? { lane: 0, laneCount: 1 }) : { lane: 0, laneCount: 1 };
    const cardEl = renderCardBlock(t.card, lane, false, dayKey);
    if (lane.laneCount === 1) {
      // 单道：占满列宽（只留左右各 1px），把 lane 计算留下的 6px 空隙还给标题
      cardEl.style.left = '1px';
      cardEl.style.right = '1px';
      cardEl.style.width = 'auto';
    }
    if (!splitLanes) {
      cardEl.style.zIndex = String(2 + idx);
      // 被后续卡片覆盖（后开始者开始时，本卡还没结束）→ 计入 +N
      if (ordered.some((o, j) => j > idx && o.start < t.end)) covered += 1;
    }
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
  });

  if (covered > 0) body.append(buildMoreBadge(covered, dayTimed.length));

  // 点击空白单格创建 + 拖动框选创建时间范围
  bindRangeSelect(body, (sMin, eMin) => {
    actions.openEditorRange(minutesToTime(sMin), minutesToTime(eMin), dayKey);
  });
  body.addEventListener('click', (e) => {
    if (e.target.closest('.timeline-card, .timeline-now-marker, .calview-more')) return;
    const rect = body.getBoundingClientRect();
    const mins = vs.viewStartMin + ((e.clientY - rect.top) / SLOT_HEIGHT) * 15;
    actions.openEditor(null, snapToQuarter(minutesToTime(mins)), dayKey);
  });
}

/**
 * 列顶「+N」：本列被叠放覆盖的卡片张数。
 *
 * `position: sticky` 让它随列滚动常驻在表头下方（叠放发生的位置常在视口外）。
 * 暂不绑定点击行为（prd R7 明确「越界不做」），只给 `title` 说明。
 *
 * @param {number} count 被覆盖张数
 * @param {number} total 本列卡片总数
 * @returns {HTMLElement}
 */
function buildMoreBadge(count, total) {
  const el = document.createElement('span');
  el.className = 'calview-more';
  el.textContent = `+${count}`;
  el.title = `本列共 ${total} 张卡片，其中 ${count} 张与上方时间重叠（叠放显示，点开日程可查看全部）`;
  return el;
}
