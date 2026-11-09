# Implementation Plan

1. Read frontend specs and inspect主区 `rightview.js`、数据流和现有 CSS，确认月视图实际 DOM 入口。
2. 抽取/新增纯函数：按日期分组卡片、生成月格模型、计算显示条目和隐藏数量、格式化状态与时间。
3. 为纯函数补 Vitest：跨月 42 格、排序、状态、无标题、条目上限和隐藏数量。
4. 更新主区月视图 DOM：月份标题/导航、日期单元格、任务条目、空白日期新建入口和语义属性。
5. 接入现有事件委托：日期选择、任务编辑、新建卡片、月份切换；确认不影响侧栏月历。
6. 添加窄侧栏/主题/焦点样式，遵守 token 与 `textContent` 安全约束。
7. 运行 `cd extension && npm run lint`、`npm test`、`cd dev-loop && node dev-loop.mjs --width 320,360,400,500`；修复所有回归。
8. 运行完整质量检查，确认无未覆盖的跨视图数据流问题。

## Risk Points

- 主区月视图可能与侧栏月历共用部分事件或日期状态；修改前必须确认入口。
- 现有卡片编辑器入口可能依赖事件对象/当前视图上下文，不能在 view 层复制写入逻辑。
- 现有 CSS 可能对 `.cal-day` 有侧栏专用样式；新主区类名应隔离或明确复用。

## Validation

- Unit: `cd extension && npm test -- --run views/calendar.test.js`
- Lint: `cd extension && npm run lint`
- Full test: `npm test`
- UI: `cd dev-loop && node dev-loop.mjs --width 320,360,400,500`
