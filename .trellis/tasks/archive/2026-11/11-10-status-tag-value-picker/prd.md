# 编辑器状态/标签可搜索输入浮层（value-picker）

## Goal

参考 `E:/code/snorkeling` 的 md 预览属性列表交互（`frontend/app/view/preview/plugins/md-properties/property-tag-editor.tsx`
+ `frontend/app/element/property-editor/value-popover.tsx`），把卡片编辑器的「状态」「标签」改成
**点击值格打开的非模态浮层**：chips 与搜索输入同一行、输入即过滤候选、无匹配时可创建。

## Requirements

### R1 通用组件 `features/value-picker.js`

- 非模态浮层，锚定值格；Esc / 外点关闭（走 `features/layer-stack.js`，与既有 picker 一致）。
- 结构：chips 流 + 输入框同行流（已选项是 chip，可点 × 删）。
- 输入即过滤：忽略大小写、包含匹配。
- 无匹配且输入非空 → 出现「创建 "xxx"」行，Enter 或点击即创建。
- 键盘：↑↓ 移动高亮、Enter 选中/创建、Backspace（空输入）删最后一个 chip、Esc 关闭。
- 模式：`multiple: true` 点候选 toggle；`multiple: false` 点即选中并关闭。
- 定位：锚定 `getBoundingClientRect()`，下方越界上翻、左右夹紧（复用现有 `editor-field-picker` 的 place 思路）。

### R2 状态行（单选）

- 值格从原生 `<select>` 改为**只读展示 + 点击打开 picker**（单选模式）。
- 候选 = `statusOptions()` 四档（无状态/未开始/进行中/已完成）。
- 允许输入创建自定义状态：写入 `card.status` 原字符串；下一张卡打开时先清理遗留非常规项，
  当前卡非常规值以原值显示（沿用 2026-11-10 的兜底语义）。
- 保留 done ⇔ 进度 100 双向联动（`onEditorStatusChange` 语义不变，选择后触发）。

### R3 标签行（多选）

- 值格显示只读 chips（不可删），点击整行值格打开 picker；浮层内可增删。
- 候选源 = 全库卡片标签聚合（去重；按出现次数降序，同次数按字典序），且包含当前卡已选。
- 输入即创建新标签：trim + 小写化（与现有 `addEditorTag` 一致），去重。

### R4 样式

- 浮层：6px 圆角 + 双层阴影 + 边框（本项目 token：`--r-sm` / `--line-2` / `--surface`，暗色自动跟随）。
- chips 沿用现有 `.tag-chip` 组件（Notion 式小方角），不引入参考项目的胶囊圆角。
- 焦点环用 `--accent` + `--accent-soft`，与编辑器其他控件同语言。

### R5 不改动

- 优先级胶囊（`components/seg.js`）、自定义属性行、卡片池/时间线/日历的标签与状态展示。
- host / 协议 / 数据库 schema。

## Constraints

- 原生 ES modules、无框架无构建（沿用项目约束）；`features` 层不直接碰 `chrome.*`。
- 文案/选项仍取自 `shared/card-schema.js`（单一真值）。
- 可访问性：输入框有 aria-label；浮层 `role="dialog"`/`listbox` 语义合理；Esc 关闭不丢编辑中表单。

## Acceptance Criteria

- [x] 点击状态值格打开浮层；候选 4 档可搜索；点选即写入并关闭；选择「已完成」进度变 100。
- [x] 状态下拉不再依赖 `<select>`（DOM 中无 `#card-editor-status` select），存量自定义值以原值展示。
- [x] 点击标签值格打开浮层；输入过滤候选；无匹配出现创建行；Enter 创建并成为 chip。
- [x] 标签候选按全库使用次数排序；Backspace 删最后 chip；多选 toggle 生效。
- [x] Esc 只关闭 picker，不关闭编辑器、不丢未保存表单。
- [x] `npm run lint` / `npm --prefix extension test` / dev-loop editor 场景通过（断言同步更新）。
- [x] 已同步 dev 部署目录。

## Reference

- `E:/code/snorkeling/frontend/app/view/preview/plugins/md-properties/property-tag-editor.tsx`（交互主参考）
- `.../element/property-editor/value-popover.tsx`（浮层定位/关闭语义）
- `.../md-properties/list-property-editor.tsx`（chips+输入行内流）
