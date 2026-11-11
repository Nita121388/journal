# 实施：内置模板 seed + agent 模板管理通路

## 步骤

1. **内置模板数据（`extension/shared/builtin-templates.js`，新建）**
   - `BUILTIN_TEMPLATES`（5 条，见 design §1）+ `TEMPLATES_SEED_VERSION`
   - 纯数据 + 纯函数 `missingBuiltinTemplates(list)` / `cloneTemplate(tpl, id)`（可单测）
   - `builtin-templates.test.js`：补缺逻辑、版本判定、clone 去 builtin/改名

2. **seed（extension init）**
   - `entries/app.js`：pullFromHost 后 `void ensureBuiltinTemplates()`（新模块 `state/template-seed.js` 或 features）
   - 逻辑：`getHostMeta('templatesSeed')` 版本达标即 return；否则 updateHostMeta 补缺 + setHostMeta 版本
   - 离线（null）跳过静默

3. **UI：builtin 只读 + 复制**
   - `features/template-menu.js` `manageTemplates`：builtin 分支只有「复制为我的模板」（clone → updateHostMeta 追加）
   - `renderTemplateMenu`：builtin 条目加 🔒 视觉标记（CSS 小样式，token 取色）
   - 样式进 `sidepanel.css`（`.tpl-item .tpl-lock` 之类）

4. **host API（`host/lib/storage.js` + `host/server.js`）**
   - storage：`upsertTemplate(store, tpl)` / `deleteTemplate(store, id)` / `getTemplatesSeed` / `saveTemplatesSeed`
     - 校验（id/name/fields）→ 抛 `TemplateValidationError`（server 映射 400）/ builtin 冲突抛 `BuiltinTemplateError`（映射 409）
   - server 路由：
     - `GET/PUT /api/meta/templatesSeed`
     - `PUT /api/meta/templates/:id`
     - `DELETE /api/meta/templates/:id`
   - 错误映射与现有 `ok/err` 风格一致（查 server.js 的 4xx 返回方式）

5. **host 单测（`host/test/templates.test.mjs`，新建）**
   - upsert 新建 / 更新 / 不存在 id 的 delete 幂等 / builtin 409 / 非法体 400 / 版本读写

6. **skill 文档（`.agents/skills/journal/SKILL.md`）**
   - 新增「模板管理」节（design §5 内容），含 curl 示例与格式契约、builtin 只读、禁止整列表 PUT

7. **dev-loop（`dev-loop/scenarios/tpl.mjs`）**
   - 补断言：模板下拉出现 5 个内置；管理对话框对 builtin 只有「复制为我的模板」；复制后副本出现在列表
   - 注意 isolated DB 每次全新 → seed 必然触发；若 host 离线分支则跳过

8. **验证**
   - `npm --prefix host test`
   - `npm --prefix extension run test`
   - `npm run lint`
   - `node dev-loop/dev-loop.mjs --scenario tpl --width 320,400,500`
   - `node dev-loop/dev-loop.mjs --scenario smoke --width 320,360,400,500`

## 边界与守则

- 不改卡片 schema / 同步协议；templates 仍是 host meta。
- builtin 标记只允许 seed 写入；单模板 API 收到的 payload 一律剥离 `builtin`。
- UI 不提供任何编辑内置模板的入口（复制是唯一出口）。
- seed 必须幂等、离线静默、删除不复活。
- skill 文档与真实 API 行为逐条对齐（含 409/400 语义）。

## 交付

- 单 commit：`feat(templates): 内置 5 模板 seed（只读可复制）+ agent 单模板 API 与 skill 文档`
- PRD AC1–AC7 逐条勾验。
