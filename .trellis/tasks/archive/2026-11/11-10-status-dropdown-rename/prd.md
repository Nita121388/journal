# 状态控件改普通下拉框 + 纯记录改名无状态

## Goal

编辑器（新建/编辑卡片）里的「状态」控件当前是 2×2 分段胶囊 + 「自定义状态」自由文本输入，
在窄侧栏里看着花、操作路径也长。改为**普通下拉框**（一次点击可选），
并把状态标签「纯记录」改名为「无状态」（用户语义：没有状态，而不是一种状态）。

## Requirements

### R1 状态下拉框

- 编辑器属性区「状态」行：删除分段胶囊容器（`#card-editor-status-seg`）与自定义状态输入（`#card-editor-status-custom`），
  换成一个**原生 `<select id="card-editor-status">`**（保留原 hidden input 的 id，减少调用点改动）。
- 选项由 `shared/card-schema.js` 的 `statusOptions()` 渲染（文案唯一真值，不在 HTML 硬编码）；
  顺序：无状态 / 未开始 / 进行中 / 已完成。
- 交互保留：
  - 选「已完成」→ 进度自动 100；从已完成切走 → 进度回到 0（`onEditorStatusChange` 语义不变）。
  - 进度拖到 100 → 状态变已完成；从 100 回退 → 进行中/未开始（`onEditorProgressChange` 不变）。
  - 选择状态写入 `#card-editor-status` 的值，保存路径不变。

### R2 自定义状态退场

- 编辑器不再支持自由文本状态（`statusCustom` 概念删除：dom-refs / bind-editor / formSnapshot）。
- 防御：编辑存量卡片时若 `status` 不在 4 档内，下拉框动态追加该原值 option 并选中，
  **不静默改写用户数据**；用户改选后按新值保存。
- dev 库已核实无存量非常规状态（`SELECT ... WHERE status NOT IN (...)` 返回 0 行）。

### R3 文案改名

- `STATUS_LABELS.none: '纯记录' → '无状态'`（唯一真值处改 1 行）。
- 自动跟随的可见处：卡片池筛选条、卡片池状态徽标、日历卡徽标、模板默认值下拉、编辑器下拉。
- 不改数据：库里仍存 `'none'`。

### R4 样式收敛

- 删除 `.status-seg` 专属规则、`#card-editor-status-custom` 规则、状态行的 `.prop-val--stack` 使用。
- 「状态」行值区改为单行，插入 select 的裸输入风格样式（常态无框 / hover 细边框 / focus 描边 + ring），
  与 `.prop-val input` 规则对齐。`components/seg.js` 保留（优先级胶囊仍在用）。

## Constraints

- 纯前端：不动 host / 协议 / 数据库 schema，无迁移。
- 依赖分层：`shared` 不新增依赖；`features` 不直接碰 `chrome.*`。
- 文案不硬编码在 HTML（沿用 statusOptions 单一真值约定）。
- 切片遵循 `.trellis/spec/frontend/design-system.md` 的状态标签单一真值约定。

## Acceptance Criteria

- [x] 新建卡片：状态下拉框 4 个选项文案为「无状态/未开始/进行中/已完成」，选中即生效。
- [x] 已完成 ↔ 进度 100 双向联动仍成立。
- [x] 编辑存量卡片时状态正确回显；非常规状态值以原值显示且保存后不丢失。
- [x] 全站不再出现「纯记录」文案（`grep -rn 纯记录 extension/` 只剩历史注释/测试注释，或已一并更新）。
- [x] 自定义状态输入框、分段胶囊 DOM 与相关死代码全部移除（无残留 `.status-seg` 引用）。
- [x] `npm run lint` / `npm test` 通过。
- [x] 已同步到 dev 部署目录（robocopy）。

## Out of Scope

- 卡片池筛选条的控件形态（仍是胶囊，仅文案跟随改名）。
- 优先级控件形态（保留分段胶囊）。
- 状态在时间线/日历上的视觉表达。
