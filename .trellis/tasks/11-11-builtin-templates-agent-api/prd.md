# 内置模板 seed + agent 模板管理通路

## Goal

1. 扩展首次启动即带 **5 个内置模板**（待办/灵感/每日记录/Agent 任务/会议），只 seed 一次、用户删除后不复活；内置模板在 UI 里只读、可"复制为我的模板"。
2. host 新增**单模板 upsert / 删除 API**（绕开整列表覆盖的并发坑），并文档化到 journal skill——agent 可以安全地创建/管理模板。

## 现状（证据）

- 模板存 host meta `templates`（`GET/PUT /api/meta/templates`，`host/server.js:600-601`）；`PUT` 是**整列表覆盖**，UI 侧是 read-modify-write（`extension/features/template-menu.js:52-58`），并发写会丢数据
- 模板形态：`{ id, name, emoji, fields: [{key, value, label?, icon?, type?, options?}] }`（构建器产出 `template-menu.js:37`）；`normalizeTemplateFields`（`template-builder.js:119`）兼容旧形态并自动补 `REQUIRED_DEFS`（title/content/tags）
- 模板 UI：下拉（新建/管理）、管理对话框（重命名/删除/编辑属性）、构建器；全部无"内置"概念
- `getTemplates` 对"从未初始化"与"空列表"都返回 `[]`（`host/lib/storage.js:645-651`）——只靠列表无法区分"没 seed 过"
- journal skill（`.agents/skills/journal/SKILL.md`）未文档化模板接口，agent 不知道通路

## Requirements

### R1 内置模板（5 个）

| 模板 | emoji | 字段（值） |
|---|---|---|
| 待办任务 | ✅ | status（todo）、priority（medium）、assignedDate、project |
| 灵感想法 | 💡 | project（**无优先级、无排程**） |
| 每日记录 | 📅 | assignedDate、tags |
| Agent 任务 | 🤖 | status（todo）、priority（medium）、project |
| 会议 / 会面 | 🤝 | schedule（{duration: 60}）、assignedDate、project |

- 灵感不带优先级、待办带优先级（用户 2026-11-11 拍板）；`title/content/tags` 由 `normalizeTemplateFields` 自动补。

### R2 builtin 只读 + 可复制

- 内置模板带 `builtin: true`，UI 的"管理模板"对它只提供 **复制为我的模板**（clone：新 id、名称 + " 副本"、去掉 builtin 标记）；不提供重命名/删除/编辑属性。
- 模板下拉（新建卡片入口）正常列出与使用内置模板。

### R3 只 seed 一次、不复活

- **seed 触发条件**：meta `templatesSeed` 标记缺失（首次）；写入 5 个模板 + `templatesSeed: 1`。
- 用户删除全部/部分内置模板后（列表 meta 已存在）不再 seed——`templatesSeed` 标记挡住复活。
- host 离线：跳过，下次启动再试（不报错）。

### R4 agent 模板管理 API（host）

- `PUT /api/meta/templates/:id`：**单模板 upsert**（按 id 合并；不存在则追加）。
- `DELETE /api/meta/templates/:id`：单模板删除。
- **内置保护**：对 `builtin: true` 的模板 upsert/删除 → 拒绝（409 + 明确报错）。
- 最小校验：`id` 非空、`name` 非空字符串、`fields` 是数组；不合法 → 400。
- 保留 `GET/PUT /api/meta/templates`（UI 全量保存链路不变），但 `PUT` 拒绝覆盖 builtin 模板为非 builtin（防 UI 老链路把内置标记洗掉）。

### R5 skill 文档化

- `.agents/skills/journal/SKILL.md` 新增"模板管理"一节：列出/创建/更新/删除模板的命令与格式契约（fields 形态、normalize 兼容、必含 title/content/tags 的说明）、builtin 只读约束、**不要用整列表 `PUT /api/meta/templates`**（并发覆盖）。

## Acceptance Criteria

- [ ] AC1：全新数据目录启动扩展（host 在线）→ 模板下拉出现 5 个内置模板；删除其中任意一个后重启，被删的不复活、未删的还在。
- [ ] AC2：管理对话框对内置模板只显示"复制为我的模板"；复制出的副本可正常编辑/删除。
- [ ] AC3：内置模板可正常"用模板新建卡片"，预填值正确（待办 status=todo/priority=medium；会议 duration=60；灵感无优先级字段）。
- [ ] AC4：`PUT /api/meta/templates/:id` 创建/更新单模板成功；`DELETE` 删除成功；对 builtin 模板操作返回 409；非法体（缺 name/fields 非数组）返回 400。
- [ ] AC5：host 单测覆盖 upsert/删除/内置保护/校验；extension 单测覆盖 seed 判定与克隆逻辑（纯函数部分）。
- [ ] AC6：dev-loop `tpl` 场景（或新增断言）覆盖内置模板出现与复制入口；全量单测 + lint + smoke 回归全绿。
- [ ] AC7：SKILL.md 含模板管理文档（agent 按文档操作可通过）。

## Notes

- 用户 2026-11-11 确认：待办带优先级、灵感不带；关心 agent 能否创建模板（→ R4/R5）。
- 明确不做：月历模板入口、模板排序/分组、跨设备同步（meta 本不同步）。
