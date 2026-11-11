# 设计：空白卡片默认值收敛 + 来源只读行

## 关键现状（证据）

| 事实 | 位置 |
|---|---|
| 新建时 `start = snapUpToQuarter(time)`、`end = start + 15min` | `extension/features/card-editor.js:300-305` |
| `date` 取值链：`card ? card.assignedDate : (assignedDate === null ? '' : date ?? vs.selectedDate)` | `card-editor.js:313-318` |
| 保存时开始为空 → `startTime/endTime = null`（全天卡），`assignedDate = '' || null` | `card-editor.js:595-606` |
| 属性行显隐由 `applyFields` 按 `.prop-row[data-field]` 统一设置 `hidden` | `extension/features/editor-fields.js:140-155` |
| 来源灰字 `#card-editor-meta` 挂在「项目」行 `.prop-val` 内 | `extension/sidepanel.html:295`、`card-editor.js:348-353, 565` |
| provenance 已含 origin/agent/model/project/device/at，`formatProvenance` 已在用 | `host/server.js:306-324`、`extension/shared/format.js:128-138` |
| host 权威记录 createdAt/updatedAt，中文无需迁移 | `host/lib/storage.js:71-72` |

## 方案

### R1：入口默认值（改调用点，不动 openEditor 语义）

通用新建入口传 `time=null, date=null, assignedDate=null`：

- `extension/entries/bind-shell.js` `btnQuickAdd`：`openEditor(null, currentTime(), vs.selectedDate)` → `openEditor(null, null, null, null)`
- `extension/entries/bind-views.js` `btnNewCard`：`(null, currentTime(), null, null)` → `(null, null, null, null)`
- `extension/views/pool.js` 空态新建（约 :169）：`(null, currentTime(), vs.selectedDate)` → `(null, null, null, null)`
- `extension/features/template-menu.js`（约 :230）：`openEditor(card, currentTime(), null, null, …)` → `openEditor(card, null, null, null, …)`

保持不变（排程语义入口）：`views/timeline.js`、`views/week.js`、`views/now-marker.js`、`views/calendar-card.js`、`views/timeline-card.js`。

理由：`openEditor` 的预填逻辑本身是对的（时间上下文入口依赖它）；差异只应来自「调用者是否处在时间语境」。改语义会波及时间线/周视图，风险大收益无。

### R2：来源只读行

**DOM**：在 `sidepanel.html` 编辑器 body 末尾、`.ce-custom-props` 之后新增独立分组（在 `#card-editor-props` 容器之外，从而完全不受 `applyFields`/模板收敛影响）：

```html
<div id="card-editor-provenance" class="ce-provenance" hidden>
  <div class="prop-row ce-ro-row" data-ro="createdBy">
    <div class="prop-key"><i class="prop-key-icon" data-icon="user" data-icon-size="12"></i><span class="prop-key-label">创建人</span></div>
    <div class="prop-val"><span id="card-editor-created-by" class="ce-ro-value"></span></div>
  </div>
  … createdAt / updatedAt 两行同构
</div>
```

**逻辑**（`card-editor.js`）：
- `openEditor` 中替换现有 `editorMetaEl` 分支：`renderEditorProvenance(existing)`。
  - `existing` 有值 → 填 `formatProvenance(m.createdBy)` / `formatDateTime(createdAt)` / `formatDateTime(updatedAt)`，容器 `hidden=false`。
  - 新建（`existing=null`）→ 三行显示「保存后生成」占位（`—` 不出现）；容器仍显示。
- `closeEditor` 里清空三行文本 + `hidden=true`（与现有 `editorMetaEl` 清理一致）。
- 删除 `#card-editor-meta` div、`dom-refs.js` 的 `editorMetaEl` 导出、`card-editor.js` 两处引用。

**纯函数**：`shared/format.js` 新增 `formatDateTime(iso)` → `YYYY-MM-DD HH:mm`（无值返回 `'—'`，非法返回原值），带单测，供三行与未来卡片池悬停复用。

**只读保障**：
- 三行不写 `data-field`，不进入 `FIELD_ORDER`、`applyFields`、字段选择器（picker 只列 `OPTIONAL_BUILTIN_FIELDS` + 属性库），天然不可隐藏/不可被模板收敛。
- 不新增 `editorProps` 键，不写库。
- `formatProvenance` 已把 origin 映射为「👤 人类 / 🤖 Agent」（`ORIGIN_LABEL`），agent 名取 `ev.agent`；确认 agent 写卡路径填充 `agent` 字段即可（host 既有逻辑）。

**样式**：`.ce-ro-row` 复用 `.prop-row` 布局，值格 `.ce-ro-value` 用次级文字色 + `user-select:text`（可复制），行高与普通行一致；`design-system.md` 的 token 取色。

### 兼容性

- 数据形态零变化；无 host 改动；无迁移。
- 旧卡片无需 createdBy（老卡 `meta` 缺失时显示「—」，与现状灰字 fallback 一致）。
- 新建默认改为真空白属于**行为变更**：用户此前依赖「快捷新建自动排 15 分钟」的话会失效 —— 但排程仍可在编辑器里手填，或在时间线点格子创建，覆盖成本低。

### 回滚

单 commit 可整回滚（4 处调用点 + 1 组 DOM/渲染 + 1 个纯函数），无数据副作用。

## 验证

- 单测：`format.test.js`（formatDateTime）、`editor-fields.test.js`（确认 RO 行不受 applyFields 影响）。
- dev-loop 场景（可手动）：`dev-loop/scenarios/editor.mjs` 覆盖编辑器开合。
- 手动：顶部快捷新建/卡片池新建/模板新建 → 空排程空日期；时间线点格子 → 预填；编辑 agent 创建的卡 → 创建人显示 agent 名。
