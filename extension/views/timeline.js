/**
 * timeline.js — 日程时间线视图（views 层）
 *
 * 画布按时段绝对定位；范围（vs.viewStartMin/EndMin）随当天卡片自动扩展。
 * 重渲染 / 打开编辑器经 state/actions.js 由组合根注入。
 */

import { todayKey, currentTime, timeToMinutes, minutesToTime, addMinutes, snapToQuarter, snapUpToQuarter, getCardStartTime, getCardEndTime, layoutScheduleLanes } from '../shared/model.js';
import { getCardsByDay, updateCardEntry } from '../state/repository.js';
import { els } from '../components/dom-refs.js';
import { vs, DAY_START_MIN, DAY_END_MIN } from '../state/view-state.js';
import { bindRangeSelect } from './range-select.js';
import { renderCardBlock } from './calendar-card.js';
import { actions } from '../state/actions.js';
import { icon } from '../components/icon.js';
import { button } from '../components/button.js';
import { createNowMarker, nowLabel } from './now-marker.js';

// escapeHtml / typeIcon 等纯展示工具已统一到 shared/format.js（唯一实现处）。

/* ─── 渲染：时间线 ──────────────────────────────────────── */

export async function renderTimeline() {
  const date = vs.selectedDate;
  const dayCards = await getCardsByDay(date);

  // 注：主视图标题由 renderRightView() 统一写入（viewHeaderLabel）。
  // 此处不要再写 #timeline-date-header —— 曾经两处都写，后者会覆盖前者
  // （导致窄栏短式标题失效、且两处格式逐渐分叉）。

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

  // 卡片车道：从小时刻度尺右侧开始，避免卡片压住 09:00 这列标签。
  // 网格线仍画在 canvas 全宽上（左端与标签对齐），卡片百分比宽度改为相对车道计算。
  const lanesLayer = document.createElement('div');
  lanesLayer.className = 'schedule-lanes';
  canvas.append(lanesLayer);

  // 当天无卡片：空态引导（挂在画布内居中，`pointer-events:none` 不挡点击建卡）
  if (!dayCards.length) {
    const empty = buildTimelineEmptyState(date);
    // 高度取「容器可视高 - 画布上边距」：空态整块必须落在一屏内，
    // 否则它会被居中到 870px 画布的 435px 处、底部溢出滚动容器（dev-loop smoke 实测）
    const visibleH = container.clientHeight - 8;
    if (visibleH > 0) empty.style.height = `${visibleH}px`;
    canvas.append(empty);
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
  // 卡片/marker/空态行动按钮内部冒泡上来的点击直接忽略，否则会覆盖已打开的编辑态
  canvas.addEventListener('click', (e) => {
    if (e.target.closest('.timeline-card, .timeline-now-marker, .timeline-empty-hint')) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const mins = vs.viewStartMin + (y / SLOT_HEIGHT) * 15;
    const snapped = snapToQuarter(minutesToTime(mins));
    actions.openEditor(null, snapped, date);
  });

  // ── 框选创建时间范围（与周视图共用 views/range-select.js）──
  // 拖动后选区代表一个时间段，松手弹编辑器预填起止；纯点击保持单格创建。
  bindRangeSelect(canvas, (sMin, eMin) => {
    actions.openEditorRange(minutesToTime(sMin), minutesToTime(eMin), date);
  });

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
    const cardEl = renderCardBlock(card, laneInfo);
    lanesLayer.append(cardEl);

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
        lanesLayer.append(addBtn);

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
    for (const card of noTimeCards) wrap.append(renderCardBlock(card, null, true));
    all.append(wrap);
    container.append(all);
  }
}

/**
 * 空态：线稿图标 + 一句原因 + 一个行动按钮（design.md §6「空状态」）。
 *
 * 容器 `pointer-events:none`（空白处点击仍落到画布→按 Y 新建），只有按钮恢复
 * `pointer-events:auto`。不再用「一段绝对定位文字盖住画布」。
 *
 * @param {string} date 目标日期
 * @returns {HTMLElement}
 */
function buildTimelineEmptyState(date) {
  const wrap = document.createElement('div');
  // 类名保留 `.timeline-empty-hint`：dev-loop smoke 依赖它判断空日引导是否可见
  wrap.className = 'timeline-empty-hint';

  const iconWrap = document.createElement('span');
  iconWrap.className = 'timeline-empty-icon';
  iconWrap.append(icon('calendar', { size: 24 }));

  const title = document.createElement('b');
  title.className = 'timeline-empty-title';
  title.textContent = '今天还没有安排';

  const sub = document.createElement('span');
  sub.className = 'timeline-empty-sub';
  sub.textContent = '点击空白处，或从这里新建一张卡片';

  const cta = button({
    label: '新建卡片',
    icon: 'plus',
    variant: 'solid',
    size: 'sm',
    onClick: (e) => {
      // 阻止冒泡：否则画布的 click 会再按 Y 坐标开一个空编辑器
      e.stopPropagation();
      actions.openEditor(null, emptyStateDefaultTime(), date);
    },
  });

  wrap.append(iconWrap, title, sub, cta);
  return wrap;
}

/** 空态「新建卡片」的默认时间：当下对齐 15 分钟且在视图范围内，否则落在视图起点。 */
function emptyStateDefaultTime() {
  const nowMin = timeToMinutes(currentTime());
  const inRange = nowMin >= vs.viewStartMin && nowMin <= vs.viewEndMin - 15;
  return inRange ? snapUpToQuarter(currentTime()) : minutesToTime(vs.viewStartMin);
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
  // marker 高 18px、`translateY(-50%)` —— 贴到画布上下边时胶囊会被 overflow:hidden 切一半，
  // 所以把 top 夹在 [10, 画布高-10]（视图范围外的时间本来就被钳制到边界）
  const canvasH = scheduleHeight(vs.viewEndMin);
  const top = Math.max(10, Math.min(canvasH - 10, scheduleHeight(clamped)));

  canvas.append(createNowMarker({
    dayKey: vs.selectedDate,
    top,
    label: nowLabel(now),
  }));
}

/** 每分钟更新今日当前时间 marker（不影响已有时间槽/卡片） */
export function startNowMarkerTimer() {
  setInterval(() => {
    renderCurrentTimeMarker();
  }, 60 * 1000);
}
