# 周视图垂直填满 + 时间刻度

## Goal

把周视图从「顶部堆叠卡片摘要、容器只用 1/3 高度、无时间刻度」改造为 **Google Calendar 风格的垂直周历**：垂直占满容器、左侧小时刻度尺、7 天列按真实时间比例定位卡片、显示当前时刻线。复用日视图时间线引擎，不重写。

## Background / Confirmed Facts（实测 2026-09-28）

基线截图 `dev-loop/out/.../light-week-500-closed.png`（500px，有数据）：
- `.calview-week-grid`（sidepanel.css:841）为 7 列 grid、`align-items:start`；`.calview-week-col` 固定 `min-height:380px` → 容器下方约 280px 完全空白。
- 卡片以 `.calview-week-cards` 顶部纵向堆叠的 `.calview-summary` 呈现（时间+图标+截断文字），**无时间刻度/网格**，看不出时间分布。
- 用户诉求：周视图应垂直占满 + 展示时间刻度。

可复用引擎（已确认签名/行为）：
- `DAY_START_MIN=480` / `DAY_END_MIN=1350` / `SLOT_HEIGHT=30` / `scheduleHeight(mins)`（sidepanel.js:1137-1148）。
- `viewStartMin`/`viewEndMin` 全局，按 `timelineSpan`（08–22 / 24h）+ 数据自动扩展（sidepanel.js:897-905）。
- `layoutScheduleLanes(items)`（lib/model.js:294）→ `Map<id,{lane,laneCount}>`，按 start/end 分配并行车道。
- `renderTimelineCard(card, lane, allday)`（sidepanel.js:1139+）绝对定位卡片（top/height/left），含 resize 手柄、点击编辑、来源角标。
- `.timeline-now-marker`/`.timeline-now-tag`/`.timeline-now-line` 当前时刻线（renderCurrentTimeMarker，sidepanel.js:1405+）。
- `timeToMinutes`/`minutesToTime`/`addMinutes`/`snapToQuarter`/`getCardStartTime`/`getCardEndTime` 均为可用纯函数。

## Requirements

- R1. 周视图垂直占满可用高度（容器 `height: var(--panel-max-h)`，7 列等高铺满；内容超出时纵向滚动）。
- R2. 左侧固定小时刻度尺（整点标签 + 横线跨 7 列），时间比例与日视图一致（`SLOT_HEIGHT`/15min）。
- R3. 卡片按 `startTime` 绝对定位到对应天列的对应时刻；同一天重叠卡片用 `layoutScheduleLanes` 并行分道。
- R4. 时间范围与日视图联动（`timelineSpan` 08–22 / 24h + 全周数据自动扩展）。
- R5. 今天列显示当前时刻线（复用 `.timeline-now-marker`）。
- R6. 点击某天某时刻空白 → 以该时间打开新建编辑器（与日视图一致）。
- R7. 点击卡片进入编辑器（复用 `renderTimelineCard` 的点击/编辑逻辑）。
- R8. 保留每天的表头（星期+日期+卡片数）与点击表头切到该日时间线的现有行为。
- R9. 窄栏（360px）下周视图 7 列仍可用（横向压缩，刻度尺变窄）。
- R10. 亮暗主题一致；用 dev-loop 回归 + 截图核验。

## Acceptance Criteria

- [ ] 360/500px 截图：周视图垂直占满（无大片底部空白），显示时间刻度与网格线。
- [ ] 卡片按时间正确定位（与日视图同比例）；重叠卡片并行不重叠。
- [ ] 当前时刻线出现在今天列；点击空白/时刻线可新建；点击卡片可编辑。
- [ ] 08–22/24h 切换对周视图生效。
- [ ] dev-loop 回归全绿 + 0 console error。
- [ ] 工作区干净、提交边界清晰。

## Out of Scope

- 周视图卡片拖拽改时间 / 框选建范围 / 跨日连续卡片跨列渲染（本轮不做）。
- 月视图的刻度尺（周视图专属诉求）。
- 改动日视图/时间线引擎本身（只复用）。

## Open Questions

- （已确认）刻度跟随 08–22/24h 切换；本轮不做拖拽。
