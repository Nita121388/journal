# Implement Plan: 统一字段注册表

> 依据 `design.md` 执行。每 Phase 独立提交、可单独 revert。不允许跳过 Phase。

## Phase 1：deprecation 感知（当前分支已动项合并）

- [x] CSS 小改（tpl-builder-name 焦点样式 / .tpl-prop-value 铺满）先行 commit，保持本任务改动干净

## Phase 2：注册表模块 + 统一存储路径

**目标**：纯重构，行为等价；`findPropDef` 分叉删除。

- [x] 读 spec：`trellis-before-dev`（frontend: types/forms/state）。
- [x] 新增 `extension/lib/field-registry.js`：
  - 内建种子常量（从 REQUIRED_DEFS/OPTIONAL_DEFS 迁移，补 `behavior/storage/source/locked/required`）。
  - `initFieldRegistry`、`getFieldDef`、`listFieldDefs`、`isReservedKey`、`getBehavior`、`getStorage`、`writeValueToCard`、`readValueFromCard`。
- [x] `sidepanel.js`：
  - `findPropDef` → `getFieldDef` 薄封装，调用点全替换；`BUILTIN_DEFS`/`OPTIONAL_DEFS` 常量移除。
  - `BUILTIN_DEFS.find(...)` 三处判内建 → `isBuiltinKey()`（source==='builtin'）。
  - 启动时 `initFieldRegistry({ getUserFields: () => propLibrary })`（`loadPropLibrary` 之后）。
- [x] 验证：`rg findPropDef|BUILTIN_DEFS` 无分叉残留；node 导入通过；lint 回到 23 基线。

**回滚点**：本阶段行为等价，可整体 revert。

## Phase 3：行为声明化 + 引擎分发

**目标**：`createFromTemplate` 与卡片徽标改为 behavior 驱动；显示结果与现状逐项一致。

- [x] `createFromTemplate`（:3012）`switch(f.key)` → `writeValueToCard(patch, key, value)`。
  - node 等价测试：24 建卡用例全匹配旧 switch（修 2 bug：`empty:null` 用 hasOwnProperty 而非 `??`；未登记 key 回落 props 不丢值）。
- [x] 卡片渲染（:1884-1932）徽标逻辑按 `behavior` 遍历（seed 顺序 = 渲染顺序）。
  - node 等价测试：17 徽标用例全匹配（修 1 处顺序：project/schedule 排列）。
- [x] 不碰范围：状态筛选、时间线布局、`card.status` 业务读点。
- [x] 验证：dev-loop smoke 15/15（320/500），tpl 17/17（360/400）。

**回滚点**：本阶段单独提交；徽标回归失败则 revert。

## Phase 4：模板构建器字段选择下拉

**目标**：分裂按钮 + 浮层 + 选中加入。

- [x] `buildAddRow` 改写：主体（行为不变）+ ▾ 触发器（`.tpl-add-caret`）。
- [x] `openFieldPicker(anchorEl)`：复用 `tpl-ctx-menu` 样式/定位；分组（内建可选 / 属性库）；已加入置灰 + ✓；空库显示「（空）」。
- [x] 选中逻辑：未添加 → `extra.push` + `values[key]=defaultValueForType` + `renderTemplateBuilder()`。
- [x] 浮层 Esc 只关浮层（全局 handler 加 `fieldPickerEl` early-return）。
- [x] CSS：`.tpl-add-row-wrap`/`.tpl-add-caret`/`.tpl-field-picker`/`.tpl-picker-group`/`.tpl-picker-empty`。
- [x] 验证：dev-loop tpl 场景新增 4 条浮层断言全绿；scenario `.tpl-extra-row:last-of-type` 改稳健选择器（分裂按钮 wrap 变同级 div）。

**回滚点**：纯新增 UI，可独立 revert。

## Review Gates

- Phase 2 结束：`task.py` 上下文里声明"存储路径统一完成"，并附 `rg` 无残留截图/输出。
- Phase 3 结束：徽标比对清单（9 内建项 + 通用徽标 + 状态灯）逐项勾选。
- Phase 4 结束：端到端建卡校验。
- 收尾：`trellis-check` 全量验证 → `trellis-update-spec`（更新 frontend 相关 spec：字段注册表概念）→ commit（每个 Phase 独 commit）。

## Rollback

- 每个 Phase 独立 commit，任一 Phase 验收失败 revert 对应 commit。
- Phase 3 若渲染回归无法短时修复：先 revert Phase 3，保留 Phase 2 成果，重新规划。