# 选项页 AI 设置项 + 设置卡片默认折叠

## Goal

两件事：
1. **AI 配置进 UI**：不再手改 `host/data/config.json`，在选项页新增「AI 增强」section（开关/服务商/Base URL/Model/API Key/触发策略）
2. **设置卡片默认折叠**：所有 `<details>` 去掉 `open`，用户点标题才展开

## Requirements

1. **默认折叠**：`host-section` / `agent-section` / `data-section` / `sync-section` / 新增 `ai-section` 全部去掉 `open` 属性
2. **新增 AI section**（插在 Agent 接入之前）：
   - 启用开关（对应 host config `enabled`）
   - 服务商下拉：DeepSeek / 通义千问 / Kimi / 智谱 / SiliconFlow / Ollama / 自定义；选择后自动填 baseURL + 默认 model
   - Base URL 文本（自动填、可改）
   - Model 文本
   - API Key password（占位「留空表示不修改」；key 只写 host，扩展不持有、不回显）
   - 触发策略下拉：智能 auto / 总是 always / 从不 never（存扩展 `settings.ai.inferMode`）
   - 「保存配置」按钮：PUT 到 host `/api/ai/config`（key 一起送，host 落 config.json）+ 更新扩展 `inferMode`
   - 「连接测试」按钮：调 `/api/ai/config` 看 configured，回显状态（不回显 key）
3. **host 新增 `PUT /api/ai/config`**：写 `host/data/config.json`。key 永不回显（GET 只回 configured/provider/model/enabled）
4. **自动迁移旧配置**：UI 打开时 GET `/api/ai/config`，若已 configured 则把 provider/model/baseURL（不含 key）预填进表单，用户只补 key 即可

## Constraints

- API key 只存 host `config.json`（gitignore），扩展不持久化 key
- 复用现有 `<details class="card collapsible">` + `section-head` 结构；新增 `.field` 样式不硬编码 hex（走 options.css 既有 token）
- options.* 里另一任务（custom-select）的未提交改动要保留、不误伤
- host 零新增依赖（fs 写 JSON）

## Acceptance Criteria

- [ ] 5 个设置卡片（host/AI/Agent/数据/同步）默认全部折叠
- [ ] 点标题可展开/收起
- [ ] AI section：选服务商自动填 baseURL + model
- [ ] 填 key 保存 → 重开选项页，`GET /api/ai/config` configured=true（key 不回显）
- [ ] 触发策略保存到扩展 settings，重启生效
- [ ] host 未运行时保存 → 友好提示（不崩）
- [ ] 旧 config.json 自动预填（provider/model/baseURL）
- [ ] 无回归：tpl 14/14、llm 9/9、smoke 15/15 不变；lint 零新增

## Notes

- provider 预设表：baseURL/model 默认值内置在 options.js
- Ollama：baseURL `http://127.0.0.1:11434/v1`，model `qwen2.5:3b`，key 可留空（本地无需 key）
