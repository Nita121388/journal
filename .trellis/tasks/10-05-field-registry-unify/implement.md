# Implement Plan: 统一字段注册表

> 依据 `design.md` 执行。每 Phase 独立提交、可单独 revert。不允许跳过 Phase。

## Phase 1：deprecation 感知（当前分支已动项合并）

- [x] CSS 小改（tpl-builder-name 焦点样式 / .tpl-prop-value 铺满）先行 commit，保持本任务改动干净

## Phase 2：注册表模块 + 统一存储路径

**目标**：纯重构，行为等价；`findPropDef` 分叉删除。

- [ ] 读 spec：`trellis-before-dev`（frontend: types/forms/state）。
- [ ] 新增 `extension/lib/field-registry.js`：
  - 内建种子常量（从 REQUIRED_DEFS/OPTIONAL_DEFS 迁移，补 `behavior/storage/source/locked/required`）。
  - `initFieldRegistry({ userFields })`、`getFieldDef`、`listFieldDefs`、`isReservedKey`、`getBehavior`、`getStorage`、`writeValueToCard`、`readValueFromCard`、`upsertUserField`、`removeUserField`。
- [ ] `sidepanel.js`：
  - `findPropDef` 改写为 `getFieldDef` 薄封装后全部调用点替换（:2252、:2294、:2885、:2911、:2494、:2888 附近的 `findPropDef`）。
  - `BUILTIN_DEFS.find(...)` 三处判内建（:2508、:2936、:2959）改用 `source === 'builtin'`。
  - 启动时 `initFieldRegistry({ userFields: propLibrary })`（`loadPropLibrary` 之后）。
- [ ] 验证命令：`rg -n "findPropDef|BUILTIN_DEFS" extension/sidepanel.js` 无残留；DevTools 断点确认动态查找生效。

**回滚点**：本阶段行为等价，可整体 revert。

## Phase 3：行为声明化 + 引擎分发

**目标**：`createFromTemplate` 与卡片徽标改为 behavior 驱动；显示结果与现状逐项一致。

- [ ] `createFromTemplate`（:3012）`switch(f.key)` → `writeValueToCard(patch, key, value)`。
  - 逐一验证 9 个内建 key 的落位（title/content/status/progress/priority/assignedDate/schedule→3 项/project/tags）。
  - 验证命令：用各类型模板新建卡片，对照 `patch` 对象属性。
- [ ] 卡片渲染（:1884-1932）徽标逻辑按 `behavior` 遍历。
  - 逐项比对：状态徽标 + `status-*` 类、进度 `%` 徽标、时长徽标、项目徽标、日期徽标、通用 `•key: value` 徽标。
- [ ] 不碰范围：`:1750-1751` 状态过滤、时间线布局逻辑、`card.status` 读点。
- [ ] 验证：侧边栏跑一遍 dev-loop（如有场景）或手动点检。

**回滚点**：本阶段单独提交；徽标回归失败则 revert。

## Phase 4：模板构建器字段选择下拉

**目标**：分裂按钮 + 浮层 + 选中加入。

- [ ] `buildAddRow` 改写：主体（行为不变）+ ▾ 触发器。
- [ ] `openFieldPicker(anchorEl)`：复用 `tpl-ctx-menu` 样式与 `openPropRowMenu` 定位；分组标题（内建可选 / 属性库）；已加入置灰 + ✓；空属性库显示「（空）」。
- [ ] 选中逻辑：未添加字段 → `extra.push` + `values[key] = defaultValueForType(def.type)` + `renderTemplateBuilder()`。
- [ ] CSS：分组标题样式 + 分裂按钮 ▾ 区（靠近 `.tpl-builder-*` 现有规则，文件内就近）。
- [ ] 验证：打开构建器 → ▾ 展开 → 内建/属性库各选一个 → 保存模板 → 用模板建卡逐项校验。

**回滚点**：纯新增 UI，可独立 revert。

## Review Gates

- Phase 2 结束：`task.py` 上下文里声明"存储路径统一完成"，并附 `rg` 无残留截图/输出。
- Phase 3 结束：徽标比对清单（9 内建项 + 通用徽标 + 状态灯）逐项勾选。
- Phase 4 结束：端到端建卡校验。
- 收尾：`trellis-check` 全量验证 → `trellis-update-spec`（更新 frontend 相关 spec：字段注册表概念）→ commit（每个 Phase 独 commit）。

## Rollback

- 每个 Phase 独立 commit，任一 Phase 验收失败 revert 对应 commit。
- Phase 3 若渲染回归无法短时修复：先 revert Phase 3，保留 Phase 2 成果，重新规划。