# 类型收敛 + 卡片池类型筛选 — Design

## 变更范围
前端四文件：`sidepanel.html`、`sidepanel.js`、`sidepanel.css`、`lib/model.js`（计数口径）。
host / sync / SQLite / MarkdownBackplane 一律不动。

## 状态与数据
- 卡片 `type` 三值不变（`text/task/idea`，host 白名单照旧）。
- 前端把所有 `idea` 视为 `text`：
  - `typeIcon('idea')` → 📝
  - 月/周历 `.type-idea` 摘要色并入 `.type-text`
  - `getCardTypeCounts` 将 idea 计入 text，不再返回 idea 键
- 新建卡片默认 `text`，编辑器下拉只留 text/task。

## 卡片池筛选状态
```js
let poolTypeFilter = '';   // '' | 'text' | 'task'
```
- 与既有 `poolTagFilter`（标签）AND 叠加：
  `pool = allPool.filter(type match && tag match)`
- 筛选条渲染沿用现有 `renderPoolTagFilters(allPool)` 的模式，新增
  `renderPoolTypeFilters()`：
  - 「全部 / 📝 文本 / ☑️ 任务(待办)」
  - 点击写 `poolTypeFilter` → `renderCardPool()`
- 标签筛选条与类型筛选条共存于 `cardpoolList` 顶部（类型条在前，标签条在后）。

## 表达式等价
- 选中「任务」→ 只显示 `type==='task'` 的未安排卡片 = 「卡片池中的待办」。
- 侧栏待办区块不变（仍显示所有 task，含已安排）。两者语义差异保留：
  卡片池=未安排；待办=全部任务视图。

## UI 文案
- 类型筛选条项：`全部`、`文本`、`任务（待办）`——明确"任务就是待办"。
- 编辑器下拉：📝 文本、☑️ 任务。

## 回归要点
- 存量 idea 卡展示归文本后，确认删除/编辑/完成等交互不受影响
  （`done` 只对 task 生效的既有逻辑不动）。
- 卡片池拖拽、安排按钮、删除按钮逻辑不受筛选影响（筛选只决定"显示哪些"，不碰操作）。