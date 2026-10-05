# 统一字段注册表（Field Registry）：内建可选属性与属性库合流，行为声明化

## Goal

把目前分裂的两套字段定义——代码硬编码的 `REQUIRED_DEFS` / `OPTIONAL_DEFS` 与用户沉淀的 `propLibrary`——统一为单一概念 **Field Registry**。每个字段是同一结构的 `FieldDef`，内建/用户只是其中 `source` 属性。特色功能（状态灯、进度条、时间线布局等）从"内建 key 特权"改为"字段上声明式 `behavior` 属性"，任何字段（含用户字段）都可获得。

同时解决模板构建器的可发现性缺口：用户新建模板时无法从现有属性选择，只能手打新建。

## Requirements

### R1 统一字段定义结构
- 所有字段（内建必选、内建可选、属性库自定义）统一为同一 `FieldDef` 结构：`{ key, label, icon, type, behavior, required, source, locked, options?, overrides? }`。
- `type`（值形态：text/textarea/number/select/multi/date/time/checkbox/schedule/tags/status）只负责"值怎么存、用什么控件"。
- `behavior`（特色功能：status / progress / schedule / none…）只负责"引擎拿到值后做什么"。
- `source: 'builtin' | 'user'` 仅决定可删改权限；`locked: true` 表示内建不可删、key 不可改。
- `required: true` 表示每张卡必有（UI 锁定行、模板必含）——REQUIRED_DEFS 的 title/content/tags 只是 `required:true` 的内建条目，不再有独立数据结构。

### R2 单一查找路径
- 删除 `findPropDef` 的"先查内建再查库"分叉，统一为 `registry.get(key)`。
- 读取入口收敛：渲染、默认值编辑器、模板 normalize、卡片编辑器属性表单，全部走注册表。

### R3 行为声明化，引擎按 behavior 分发
- 卡片渲染不再按硬编码 key 判断，改为按 `def.behavior` 分发：
  - `behavior:'status'` → 状态灯 + 状态徽标 + 归一化
  - `behavior:'progress'` → 进度徽标 + clamp(0,100)
  - `behavior:'schedule'` → 时间线横向布局 + 起止联动（映射 card.startTime/endTime/duration）
  - `behavior:'none'`（默认）→ 通用字段徽标
- 模板建卡 `createFromTemplate` 的 `switch(f.key)` 改为按注册表内 `storage`/`behavior` 映射到卡片字段或 `card.props`。
- 内建字段映射到卡片的**一级字段**（title/content/status/progress/priority/assignedDate/schedule/project/tags → 各自 first-class 字段），用户字段映射到 `card.props`——该存储约定进注册表声明。

### R4 模板构建器字段选择下拉
- 末尾"添加属性"行升级为**分裂按钮**：主体点击 = 现有新建流程不变（`startAddProp` → 行内命名 → inferProp 推断）；右侧 ▾ 展开字段选择浮层。
- 浮层顶部「＋ 新建自定义属性…」默认高亮（回车 = 新建）。
- 浮层列出可选字段：内建可选 + 属性库自定义，统一排序；已加入模板的字段置灰 + ✓，点击提示"已在模板中"。
- 选中现有字段 → 以 `findPropDef` 所得 def 直接 `push` 进 `tplBuilderState.extra`，渲染默认值编辑器（type/icon/options 从注册表带过来）。
- 属性库为空时该分组显示"（空）"。

### R5 兼容存量，不迁移数据
- 旧模板 `fields: [{key,value,label?,icon?}]` 结构无需迁移，读取时查注册表补齐 def。
- `RESERVED_PROPS` 继续作为用户 key 保留命名空间。
- 属性库写入路径（卡片编辑器保存 / 模板编辑写回）保持，只是底层改操作注册表。

## Constraints

- 纯前端 extension 改动（`sidepanel.js` / `sidepanel.html` / `sidepanel.css`，可能新增 `lib/field-registry.js`）。
- 不引入框架；沿用现有 DOM 构建函数 + 原生 CSS 约定（spec: component-guidelines）。
- 不做数据迁移；存量模板、存量卡片、存量属性库全部原样可读。
- 行为声明化（R3）涉及卡片渲染重构，是主要风险面，必须分阶段实施且每阶段可回滚。
- 下拉浮层样式复用现有 `tpl-ctx-menu`（tpl-ctx-item / menuSep / 定位逻辑），不新建样式体系。

## Acceptance Criteria

- [ ] 单一 `FieldDef` 结构与注册表存在；`findPropDef` 分叉删除，所有读取走 `registry.get`。
- [ ] 内建字段（REQUIRED + OPTIONAL）迁移为注册表条目，行为/类型与现状渲染结果逐项一致（回归：卡片状态灯、进度、时间线、徽标无变化）。
- [ ] 属性库字段通过注册表正常读写（新增/编辑/删除/复用），卡片编辑器行为不变。
- [ ] 模板构建器：主体点击"添加属性"走原新建流程；▾ 展开选择浮层；内建可选 + 属性库字段可选择加入；已加入置灰；新建入口保留。
- [ ] `createFromTemplate` 不再依赖硬编码 switch；按注册表映射字段，新建卡片结果与现状一致。
- [ ] 存量模板 / 存量卡片 / 存量属性库在改动后全部正常（无迁移、无丢失）。
- [ ] 暗色模式、select 组件、emoji picker 等现有交互不受影响。

## Notes

- 复杂度：复杂任务。必须 `design.md` + `implement.md` 齐备后 `task.py start`。
- 实施顺序：R1/R2（注册表统一）→ R3（行为分发）→ R4（下拉选择）。
