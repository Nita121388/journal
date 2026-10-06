/**
 * week.js — 周视图（views 层）

周网格渲染（时间刻度 + 分道卡片 + 拖拽/框选建卡）。
 */

import { addMinutes, currentTime, getCardEndTime, getCardStartTime, layoutScheduleLanes, minutesToTime, snapToQuarter, snapUpToQuarter, timeToMinutes, toDayKey, todayKey } from '../shared/model.js';
import { actions } from '../state/actions.js';
import { DAY_END_MIN, DAY_START_MIN, monthOf, vs } from '../state/view-state.js';
import { SLOT_HEIGHT, scheduleHeight } from './timeline.js';
import { renderTimelineCard } from './timeline-card.js';
import { getCardsByDaySync, requestFocusScroll } from './rightview.js';

export function bindRangeSelect(el, onRange) {
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
export function renderWeekGrid(container) {
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
