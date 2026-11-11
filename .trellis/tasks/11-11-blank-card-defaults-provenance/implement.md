# 实施：空白卡片默认值收敛 + 来源只读行

前置：design.md 已定稿；本任务单 commit、纯 extension 侧改动（无 host/协议改动）。

## 步骤

1. **R1 入口默认值**（4 处调用点，一行改一处）
   - `extension/entries/bind-shell.js` `btnQuickAdd` → `openEditor(null, null, null, null)`
   - `extension/entries/bind-views.js` `btnNewCard` → `openEditor(null, null, null, null)`
   - `extension/views/pool.js` 空态新建 → `openEditor(null, null, null, null)`
   - `extension/features/template-menu.js` → `openEditor(card, null, null, null, {…})`（保留模板 opts 不变）
   - 各处同步更新行内注释（快捷新建注释现写着「今天/当前视图日期」，改为「真空白：不预填排程/日期」）。

2. **formatDateTime 纯函数**
   - `extension/shared/format.js` 新增 `formatDateTime(iso)`：`YYYY-MM-DD HH:mm`；空→`'—'`；非法→原样。
   - `extension/shared/format.test.js` 加用例（空/合法/非法/跨月）。

3. **R2 来源只读行**
   - `extension/sidepanel.html`：删 `#card-editor-meta`（项目行内）；在 `.ce-custom-props` 之后加 `#card-editor-provenance` 分组（创建人/创建时间/更新时间三行，见 design.md DOM 片段）。
   - `extension/components/dom-refs.js`：删 `editorMetaEl`，加 `editorProvenanceEl` / `editorCreatedByEl` / `editorCreatedAtEl` / `editorUpdatedAtEl`（命名与现有导出风格一致）。
   - `extension/features/card-editor.js`：
     - 新增 `renderEditorProvenance(existing)`：`existing` → 填 `formatProvenance`/`formatDateTime`；`null` → 三行占位「保存后生成」；移除 `hidden`。
     - `openEditor` 的 `editorMetaEl` 分支替换为 `renderEditorProvenance(existing)`。
     - `closeEditor` 的清理同步替换。
   - `extension/sidepanel.css`（或对应样式文件）：`.ce-provenance` 分组 + `.ce-ro-row` / `.ce-ro-value` 次级文字样式；图标走 `icon.js`（`user` / `calendar`），emoji 不做功能图标。

4. **验证**
   - `node --test extension/shared/format.test.js`、`editor-fields.test.js`、`card-schema.test.js`、`field-registry.test.js` 全绿。
   - 手动（本机 dev 分支 8766）：快捷新建/卡片池新建/模板新建 → 排程日期全空；时间线点格子 → 仍预填；编辑 agent 建的卡 → 创建人 `🤖 人类驱动 agent · pi · deepseek…`；Esc 关闭再开 → 三行状态正确；新建未保存 → 占位。

## 边界与守则

- 不改 `openEditor` 预填语义、不改 `saveEditor`、不改 host/协议/schema。
- 系统行不写 `data-field`，不进 `FIELD_ORDER`；不新增 `editorProps` 键。
- 样式 token 取 `design-system.md` 现有变量，不造新色。
- ESLint 边界规则必须过（`card-schema.js` 类叶子无 DOM 等）；`rg -n "editorMetaEl"` 清零。

## 交付

- 单 commit：`feat(editor): 空白卡片真空白 + 创建/更新时间与创建人只读行`
- 关联任务文档：prd.md AC1–AC6 逐条勾验。
