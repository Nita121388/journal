# PRD: TODO 待办功能

## Goal

在 Journal 侧边栏中实现完整的 TODO 待办清单，覆盖日常使用的全部核心操作：添加、完成、删除、优先级、截止日、筛选。

## User Story

作为用户，我能在侧边栏直接添加待办事项，设置优先级和截止日期，完成后勾选，快速筛选「今日/全部/未完成」，确保不遗漏任何要事。

## Acceptance Criteria

- [ ] 侧边栏 UI 增加 TODO 区域（位于日志区域下方）
- [ ] 添加待办：输入框 + Enter 提交
- [ ] 完成切换：点击条目左侧 checkbox
- [ ] 删除：每个条目右侧有删除按钮（X）
- [ ] 优先级：三级选择器（高/中/低），不同颜色标识
- [ ] 截止日期：日期选择器，过期条目红色警告
- [ ] 筛选：全部 / 未完成 / 已完成 三个 Tab
- [ ] 存储：所有操作实时写入 `chrome.storage.local` 的 `todos` 数组
- [ ] 条目显示：标题 + 优先级色条 + 截止日期（如有）+ 完成状态

## Technical Notes

- `lib/store.js` 已有 `getTodos()` / `saveTodos()` / `getJournalsForHeatmap()`
- `lib/model.js` 已有 `todoSummary()`
- 用事件委托（不给每个条目加 listener）
- 输入框 debounce 500ms 保存
- CSS 变量沿用现有主题

## Out of Scope

- TODO 的拖拽排序
- TODO 与日志的关联/提及
- 子任务
