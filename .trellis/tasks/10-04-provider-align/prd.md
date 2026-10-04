# 模型配置对齐参考项目（24 家 + 推荐模型 + 多协议分派）

## Goal

把选项页 AI 配置与参考项目（next-ai-drawio）的模型配置做到「一模一样」：
- 服务商 **24 家**（`PROVIDER_INFO`，含 defaultBaseUrl）
- 每家带 **推荐模型下拉**（`SUGGESTED_MODELS`）
- 三家无需 key（`FIXED_CRED_PROVIDERS` = bedrock/vertexai/ollama）→ Key 输入置灰
- 每家带 **logo**（`PROVIDER_LOGO_MAP`）
- host 按服务商**分派协议**：openai / anthropic / gemini

> 数据已从参考项目 bundle 提取验证（24 家 / 19 家推荐模型 / 19 logo / 3 家 no-key）。

## Requirements

1. **24 家服务商全列**（含无 baseURL 的 vertexai/bedrock/edgeone）
   - 选中无 defaultBaseUrl 的 → Base URL 留空 + 提示「该服务商需云厂商凭据」
2. **推荐模型下拉**：model 从文本框改为「下拉 + 自定义」；选项来自 `SUGGESTED_MODELS[provider]`；末尾加「自定义…」切换为自由输入
3. **无需 key 置灰**：选 `FIXED_CRED_PROVIDERS`（bedrock/vertexai/ollama）→ API Key 输入 disabled + 提示「该服务商无需 API Key」；保存时跳过 key 校验
4. **协议分派**（host）：
   - `minimax` → anthropic 协议（`POST {base}/messages`，`x-api-key` + `anthropic-version`，`tool_choice` 强制结构化）
   - `google`/`vertexai` → gemini 协议（`POST {base}/models/{model}:generateContent`，`x-goog-api-key`，`responseSchema`）
   - 其余 → openai 协议（现状 `/chat/completions` + `response_format`）
   - 三协议降级链统一出口，仍返回 `{ source:'llm', def }`，扩展零感知
5. **数据下发**：host 新增 `GET /api/ai/providers` 返回 `{providerInfo, suggestedModels, fixedCredProviders, logoMap}`，扩展拉取渲染（避免两端重复维护）
6. **logo**：用 emoji 近似品牌（`PROVIDER_LOGO_MAP` 是品牌名 → 扩展侧 emoji 映射表），避免打包图片资源

## Constraints

- `config.json` 结构不变（provider/baseURL/model/apiKey/enabled/timeoutMs）；现有已存配置无需迁移
- host 零新增依赖（裸 fetch）
- API key 仍只存 host、永不回显
- 遵守 design-system（无硬编码 hex）、component-guidelines（DOM 构建）
- 改动涉及 options.*（含 select 任务未提交改动，commit 前剥离）

## Acceptance Criteria

- [ ] 设置页服务商下拉含参考项目全部 24 家
- [ ] 选无 baseURL 的服务商（vertexai/bedrock/edgeone）→ 提示需云凭据，Base URL 留空
- [ ] 选任一服务商自动填 `defaultBaseUrl`（自定义除外）
- [ ] 模型改为下拉 + 自定义：下拉项 = 该家推荐模型；选「自定义…」可自由输入
- [ ] 选 bedrock/vertexai/ollama → API Key 输入置灰 + 提示无需 key
- [ ] minimax 走 anthropic 请求体（`/messages` + `x-api-key` + `anthropic-version`）；google/vertexai 走 gemini（`:generateContent` + `x-goog-api-key`）；其余 openai
- [ ] 三协议降级链都返回统一 `{source:'llm', def}`；失败一律 `{source:'fallback'}` 静默降级
- [ ] `GET /api/ai/providers` 返回四张表；扩展在 host 离线时用内置兜底表
- [ ] 现有配置（deepseek 等）打开后仍正确回填、无迁移
- [ ] 无回归：host 18/18+新增、options 6/6+新增、tpl 14/14、llm 9/9、smoke 15/15

## Notes

- Ollama 用本地地址 `http://127.0.0.1:11434/v1`（参考项目指云端 ollama.com/api，本地工具用本地）
- vertexai/bedrock/edgeone 无 defaultBaseUrl（需云凭据），本轮列出但标注
- 参考项目 PROTOCOL 分派来自其 PROVIDER_LOGO_MAP 归类（sglang/atlascloud→openai、vertexai→google）+ minimax 的 anthropic baseURL