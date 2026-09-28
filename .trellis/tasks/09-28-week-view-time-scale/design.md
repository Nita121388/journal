# design.md — 周视图时间刻度实现设计

## 1. 复用策略（不重写引擎）

周视图直接调用与日视图相同的全局引擎，保证两视图比例/交互一致：

- 范围：`timelineSpan` → `viewStartMin`/`viewEndMin`（周视图按**全周**卡片聚合计算扩展，而非单日）
- 比例：`scheduleHeight(mins)`（15min = `SLOT_HEIGHT` 30px）
- 分道：`layoutScheduleLanes(items)`，`items = {id, start, end}`（分钟）
- 卡片：`renderTimelineCard(card, lane, false)` 产出 `.timeline-card` 绝对定位元素
- 时刻线：复用 `.timeline-now-marker` 样式类

## 2. DOM 结构

```
#timeline-container (.calview-wrap)
└─ .calview-week-grid                       ← grid: [ruler] repeat(7, 1fr)
   ├─ .calview-week-ruler                    ← 刻度列（sticky/fixed 宽度 ~40px）
   │   └─ .calview-week-ruler-label × N       ← 整点 "08:00"
   ├─ .calview-week-col × 7                  ← position:relative; height = 全周总高
   │   ├─ .calview-week-head                  ← 星期+日期+计数（点击回该日时间线）
   │   ├─ .calview-week-gridline × N          ← 横线（is-hour 加粗）
   │   ├─ .timeline-now-marker（今列，可选）
   │   └─ .timeline-card × M                 ← renderTimelineCard 产出（absolute）
```

- 列高：`height: scheduleHeight(viewEndMin) + headH`；`#timeline-container` 承担滚动。
- 表头不参与时间比例：作为列内 `position:sticky; top:0` 固定。

## 3. 关键实现点

### 3.1 全周范围计算
```js
viewStartMin = timelineSpan === 'full' ? 0 : DAY_START_MIN;
viewEndMin   = timelineSpan === 'full' ? 24*60 : DAY_END_MIN;
// 用全周 timedCards 扩展（复用日视图 for 循环逻辑，取 min/max）
```
日视图 renderTimeline 每次重算 viewStartMin/EndMin；周视图在 renderWeekGrid 开头同样重算（保持一致）。

### 3.2 每列分道 + 定位
```js
const timed = cards.filter(c => getCardStartTime(c));
const lanes = layoutScheduleLanes(timed.map(c => ({ id: c.id, start: timeToMinutes(getCardStartTime(c)), end: timeToMinutes(getCardEndTime(c) ?? addMinutes(getCardStartTime(c), 15)) })));
for (const c of timed) col.append(renderTimelineCard(c, lanes.get(c.id), false));
```
`renderTimelineCard` 已设 `top/height/left/--lane-w`（相对定位父级 = 列），无需额外定位代码。`is-short`（≤30min）紧凑布局自动生效。

### 3.3 点击空白新建
列上监听 click：`e.target` 为列/网格线时，用 `y = e.clientY - colRect.top - headH` → `mins = viewStartMin + (y/SLOT_HEIGHT)*15` → `snapToQuarter` → `openEditor(null, time, dayKey)`。

### 3.4 刻度尺与网格线
- 刻度尺 label：整点 `minutesToTime(m)`，垂直位置 `top = scheduleHeight(m)`（与网格线同一比例）。
- 网格线：每 15min 一条，`.is-hour` 加粗，跨列宽（每列内部一条即可，视觉连贯）。

### 3.5 时刻线
今天列内追加 `.timeline-now-marker`（结构同 renderCurrentTimeMarker：tag + line），`top = scheduleHeight(clamped)`，点击在当前时间新建。

## 4. CSS 要点（新增/改写）

```css
.calview-week-grid { display:grid; grid-template-columns: 40px repeat(7,1fr); gap:0; align-items:stretch; height:100%; }
.calview-week-ruler { position:relative; }
.calview-week-ruler-label { position:absolute; right:4px; transform:translateY(-50%); font-size:10px; color:var(--color-muted); }
.calview-week-col { position:relative; display:flex; flex-direction:column; border-left:1px solid var(--color-border); }
.calview-week-head { position:sticky; top:0; z-index:2; }
.calview-week-body { position:relative; flex:1; }  /* 时间区，卡片 absolute 相对此 */
.calview-week-gridline { position:absolute; left:0; right:0; border-top:1px solid var(--color-border); }
.calview-week-gridline.is-hour { border-top-color: var(--color-muted); opacity:.5; }
```
- 移除旧 `min-height:380px` / `.calview-week-cards` 堆叠样式（或保留月视图共用部分）。
- 窄栏 `@media (max-width:420px)`：ruler 32px、字体 9px。

## 5. 兼容/风险

- `renderTimelineCard` 内部 resize 手柄依赖 `el.parentElement.getBoundingClientRect()`（= 列 body），垂直比例一致 → 可用；本轮保留 resize（拖拽改时长），但不新增跨列拖拽。
- `renderCurrentTimeMarker` 查 `.schedule-canvas`，周视图不复用该函数，直接内联构建 marker。
- `viewStartMin/EndMin` 为全局：周视图重算会影响后续日视图渲染，但日视图每次渲染也重算 → 无副作用。

## 6. 取舍

- 复用引擎而非新写刻度：保证两视图像素级一致、维护单一比例源。
- 保留 resize 手柄：复用即得，不额外成本；拖拽移动（改时间点）本轮不做（需跨列 DnD 协调，超范围）。
