# 实施计划：选项页 AI 设置 + 默认折叠

## Step 1 — host 配置写入
- [x] `host/lib/llm.js` 加 `writeConfig(cfg, path)`（原子写 temp→rename；与现有合并）
- [x] `host/server.js` 加 `PUT /api/ai/config`（合并写盘，返回 configured/provider/model/enabled）
- [x] `host/test/ai.test.mjs` 加 PUT 测试：写入后 GET configured=true、key 不回显、省略 apiKey 不改 key

## Step 2 — options.html
- [x] 5 个 `<details>` 去掉 `open`（默认折叠）
- [x] 新增 `ai-section`（插在 agent-section 前）：enabled/provider/baseURL/model/apiKey/inferMode/保存/测试

## Step 3 — options.css
- [x] AI section 复用现有 `.card.collapsible`/`.field`；无新增硬编码 hex
- [x] （检查是否有折叠箭头/状态样式需要补）

## Step 4 — options.js
- [x] PROVIDERS 预设表 + 选 provider 自动填
- [x] loadAiSettings：GET config + getSettings().ai.inferMode 填表单（key 留空）
- [x] saveAi：PUT config（合并 key）+ saveSettings inferMode
- [x] testAi：GET 显示状态
- [x] host 离线：fetch catch → 提示不崩

## Step 5 — 验证
- [x] dev-loop 新增 `options` 场景：默认折叠 / provider 自动填 / 保存→GET configured / key 不回显
- [x] 回归 tpl 14/14、llm 9/9、smoke 15/15、lint 零新增
- [x] commit 剥离（保留 select 任务在 options.* 的改动）

## Gates
- G1：Step 1 host 测试通过
- G2：Step 5 场景全绿
- G3：回归全绿才 commit

## Rollback
- 全在前端选项页 + host 一个端点；回滚 = 还原 options.* 与 server.js 该段
