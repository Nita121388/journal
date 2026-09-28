# 周视图补齐单元格创建机制

## Goal

把日视图（时间线）已有的「单元格创建」机制完整对齐到周视图，使两视图交互一致。用户反馈：周视图似乎没支持 24 小时 + 今日日程的多种选择单元格创建卡片机制。

## Gap 分析（日视图 vs 周视图，2026-09-28 对照源码）

| # | 机制 | 日视图 | 周视图 | 说明 |
|---|---|---|---|---|
| 1 | **24h 范围切换** | ✅ `btn-span` → `renderRightView()` | ✅ 已修（上轮） | 实测 24h = 00:00–24:00 共 25 刻度；需确认与其他机制协同 |
| 2 | 点空白单格创建 | ✅ canvas click → snapToQuarter | ✅ body click | 已对齐 |
| 3 | 点网格线创建 | ✅ `.schedule-grid-line` click | ⚠️ 隐式（网格线 pointer-events:none，点线=点空白） | 功能等效，行为一致 |
| 4 | **框选创建时间范围** | ✅ mousedown→拖动→mouseup + `.selection-overlay`，预填起止时间 | ❌ **缺失** | 「多种选择单元格创建」核心机制 |
| 5 | **卡片 hover「＋」同时间创建** | ✅ `.card-add-btn`（is-hover-add） | ❌ **缺失** | 在已有卡片旁快速追加 |
| 6 | **无时间/全天卡片展示** | ✅ `.schedule-allday` 置底 | ❌ **缺失** | 无 startTime 的卡片在周视图完全不显示 |
| 7 | 点时刻线创建 | ✅ now-marker click | ✅ 已实现 | 已对齐 |
| 8 | 点卡片编辑 | ✅ | ✅（dateOverride） | 已对齐 |
| 9 | 拖拽移动卡片 | 独立任务（09-22-card-drag-move） | 本轮不做 | 范围外 |

## Requirements

- R1. **框选创建时间范围**：周视图每列 body 支持 mousedown→拖动→mouseup 框选，松手以选中起止时间打开新建编辑器（预填 start/end）；纯点击仍走单格创建；框选后抑制重复 click。
- R2. **卡片 hover「＋」**：周视图卡片 hover 时在右侧出现「＋」，点击在同一时间新建卡片（对齐日视图 `.card-add-btn`/`.is-hover-add` 交互）。
- R3. **无时间/全天卡片**：每列底部 `.schedule-allday` 区展示该列无 startTime 的卡片（复用 `.schedule-allday-*` 样式与 `renderTimelineCard(card, null, true)`）。
- R4. **24h 协同**：在 24h 模式下框选/新建/时刻线均正常（共用 viewStartMin/EndMin 即可，需实测）。
- R5. 复用日视图的 `.selection-overlay`/`.schedule-allday-*`/`.card-add-btn` CSS；不破坏日视图（零改动日视图渲染函数，除非抽出共享 helper 且回归全绿）。
- R6. 用 dev-loop 回归 + 截图 + 交互实测验证。

## Acceptance Criteria

- [ ] 周视图：拖拽框选出现选区、松手打开编辑器且预填起止时间；纯点击仍单格创建。
- [ ] 卡片 hover 显示「＋」且点击可在同时间新建。
- [ ] 无时间卡片在每列「全天」区显示且可点击编辑。
- [ ] 24h 模式下框选/新建正常；亮暗主题一致。
- [ ] 日视图零回归（dev-loop 42/42 + 月/周/日切换无报错）。
- [ ] 工作区干净、提交边界清晰。

## Out of Scope

- 周视图卡片拖拽移动/拖拽改时间（独立任务）。
- 跨日连续卡片跨列渲染。
- 月视图单元格创建机制（用户未要求）。

## Open Questions

- （已收敛）对齐日视图交互即可，无需新范式。
