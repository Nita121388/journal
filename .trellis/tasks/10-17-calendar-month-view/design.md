# Technical Design

## Architecture

主区月视图继续归属 `extension/views`，以纯计算模型驱动 DOM 渲染：

```text
repository / view-state
        ↓
  calendar month model
        ↓
  render month grid
        ↓
  bind view interactions
        ↓
 existing actions / card editor / date navigation
```

不新建持久化字段。月视图读取现有卡片数组、`vs.calendarMonth`、`vs.selectedDate` 与当前主题 token。

## Boundaries

- `extension/views/calendar.js`：月历单元格/任务条目模型与幂等渲染；不直接读写存储。
- `extension/views/rightview.js`：主区视图入口和已有月份/日期上下文；只在必要处接入新 renderer。
- `extension/entries/bind-views.js`：事件委托，复用现有日期导航、编辑器打开和新建动作。
- `extension/shared/model.js`：复用 `getCardsByDate` 与时间工具；若需要纯分组函数，放 shared 或 calendar view 内并加测试，避免复制卡片状态规则。
- `extension/sidepanel.css`：复杂月历网格保留原生 CSS，使用已有语义 token；不改 Tailwind 产物。

## Data Contract

单元格内部模型建议：

```js
{
  dayKey,
  day,
  isCurrentMonth,
  isToday,
  isSelected,
  isWeekend,
  cards: [{ id, title, status, done, startTime, emoji }],
  hiddenCardCount
}
```

任务显示排序沿用 `getCardsByDate`：有开始时间优先按时间，其次按创建时间；无标题时从内容生成安全的短标题。DOM 使用 `textContent`，不把用户内容写入 `innerHTML`。

## Interaction Contract

- 月格日期按钮：保持现有 roving tabindex 与方向键逻辑；Enter/Click 更新选中日期并触发现有日期流程。
- 任务按钮：事件委托按 `data-card-id` 调用现有编辑器入口。
- 新建按钮：携带 `data-day`，调用现有新卡片流程并预填 `assignedDate`。
- 更多按钮：第一期只展示可访问的隐藏数量提示；若现有当天视图入口稳定，可打开当天视图，否则不做伪交互。

## CSS / Responsive

- 固定 7 列、6 行；单元格内部采用 `min-width: 0`，任务标题 `text-overflow: ellipsis`。
- 桌面/宽侧栏显示 3–4 条，窄侧栏显示 1–2 条并保留更多计数。
- 今天与选中态使用边框/背景/文本组合，状态使用图标与文字语义辅助，不依赖颜色。
- 所有颜色来自语义 token；不新增 hex，不使用 inline style。
- 如有动画，默认无动画或遵循 reduced-motion；本期不依赖动画。

## Compatibility / Rollback

先以增量方式接入主区月视图，保留现有 `renderCalendar` 侧栏实现。若新渲染器导致主区回归，可通过入口开关回退到原有 renderer；不涉及数据库迁移，代码回退即可恢复。

## Trade-offs

- 选择固定 42 格换取月份切换时页面高度稳定。
- 选择状态优先、项目色作为辅助，避免截图式多色编码削弱完成状态可读性。
- 第一版不做拖拽和节假日，降低事件复杂度与外部数据依赖。
