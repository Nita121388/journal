# PRD: 日历看板 + 指定日期编辑

## Goal

为 Journal 扩展侧边栏增加可交互的日历视图，并支持点击任意日期切换到该日期编辑日志，让用户能方便地回顾和补写历史日志。

## Background / 已有事实

- 侧边栏当前结构：header（今日日期）→ 今日日志 textarea → 热力图（纯展示，不可交互）→ TODO 列表
- 热力图格子有 `dataset.day` 但无 click 事件，不可点选
- `store.js` 已支持任意日期读写：`getJournal(dayKey)` / `saveJournal(dayKey, markdown)` / `deleteJournal(dayKey)`
- `model.js` 已有 `dateRange(365)` 生成日期数组，`aggregateHeatmap(journals)` 聚合热力图数据
- host API `PUT/GET/DELETE /api/journals/{YYYY-MM-DD}` 已完整支持指定日期操作
- 扩展使用原生 JS，无框架，渲染函数纯函数 + 事件委托模式

## Requirements

### 功能需求

1. **保留热力图**：现有 GitHub 风格热力图原样保留（顶部，纯展示，作为一年概览）
2. **日历视图**：在热力图下方新增月度日历视图，直观展示哪些天有日志记录，支持上一月/下一月导航
3. **指定日期编辑**：点击日历中某天，textarea 切换到该天的日志内容；header 日期显示跟随切换；可随时切回今天
4. **视觉反馈**：当前选中日期有明确高亮；有日志的日期有标记；今天有特殊样式

### 交互细节

- 默认选中今天；点击日历日期即切换编辑目标
- 日历提供上一月/下一月按钮与"回到本月"操作
- 切换日期时若当前有未落盘内容先落盘，避免 debounce 窗口内丢失草稿

### 技术约束

- 纯 JS，无新依赖，无构建步骤
- 扩展现有 CSS 变量体系（dark mode 支持）
- 不破坏现有功能（TODO、host 同步）
- 遵循 component-guidelines：render 函数纯函数、textContent over innerHTML、事件委托

## Acceptance Criteria

- [ ] 侧边栏显示月历网格，每格显示日期数字
- [ ] 有日志的日期有绿色/彩色标记
- [ ] 点击某天：textarea 加载该天日志，header 日期显示切换
- [ ] 切换后输入/保存内容写入对应日期（非 todayKey）
- [ ] 点击"今天"或导航回当月可回到今日编辑
- [ ] 月份切换按钮正常工作
- [ ] 今天日期有特殊高亮样式
- [ ] 选中日期有明确高亮样式
- [ ] dark mode 正常
- [ ] 扩展现有功能不受影响

## Out of Scope

- TODO 按日期分组/筛选（本期不做）
- 日历中直接显示 TODO
- 周视图 / 年视图
- 日历拖拽排序
- 额外动画过渡
- 热力图改造（保留现状，不可交互）

## Open Questions

（无 — 已解决：热力图保留 + 日历新增；日历粒度定月视图）
