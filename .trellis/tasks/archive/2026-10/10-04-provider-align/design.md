# 技术设计：模型配置对齐参考项目（24 家 + 多协议分派）

## 1. 目标

把选项页 AI 配置与参考项目（next-ai-drawio）的模型配置做到「一模一样」：
- 服务商从 6 家扩展到 **24 家**（`PROVIDER_INFO`，含 defaultBaseUrl）
- 每家带 **推荐模型下拉**（`SUGGESTED_MODELS`）
- 三家无需 key（`FIXED_CRED_PROVIDERS` = bedrock/vertexai/ollama）→ Key 输入置灰
- 每家带 **logo**（`PROVIDER_LOGO_MAP`）
- host 按服务商**分派协议**：openai / anthropic / gemini

## 2. 参考数据（已从参考项目 bundle 提取验证，存 ref-all.json）

**24 家** = `openai anthropic google vertexai azure bedrock ollama openrouter aihubmix deepseek siliconflow sglang gateway edgeone doubao modelscope glm qwen qiniu kimi minimax novita mimo atlascloud`

关键特殊项：
- `FIXED_CRED_PROVIDERS = ["bedrock","vertexai","ollama"]`（无需 apiKey → Key 置灰）
- `minimax.defaultBaseUrl = https://api.minimaxi.com/anthropic` → **anthropic 协议**
- `google / vertexai` → **gemini 协议**
- 其余 20 家 → openai 协议
- 3 家无 defaultBaseUrl（vertexai/bedrock/edgeone）→ **仍列出**，选中时提示「需云厂商凭据」、Base URL 留空（用户已定：完整24家）

推荐模型（19 家，截取自参考项目）：
```
deepseek: deepseek-v4-pro, deepseek-v4-flash, deepseek-chat, deepseek-reasoner
doubao:   doubao-seed-2-0-pro-260215, doubao-seed-2-0-lite-260428, ... 
siliconflow: deepseek-ai/DeepSeek-V4-Pro, Qwen/Qwen3-30B-A3B-Instruct, ...
minimax:  MiniMax-M3, MiniMax-M2.7, MiniMax-M2.5
openrouter: anthropic/claude-opus-4.8, openai/gpt-5.5, google/gemini-3.1-pro, ...
openai:   gpt-5.5-pro, gpt-5.5, gpt-4o, ...
anthropic: claude-opus-4-8, claude-sonnet-4-6, ...
google:   gemini-3.1-pro, gemini-3.5-flash, gemini-2.5-flash, ...
（qwen/kimi/glm 在参考项目里无 SUGGESTED 条目 → UI 显示「无推荐，使用自定义」）
```

## 3. host 侧改造（`host/lib/llm.js`）

### 3.1 三张数据表（对齐参考项目，含本地适配）

```js
export const PROVIDER_INFO = {
  openai:  { label: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1" },
  ... // 21 家可选项（含 ollama 本地地址适配）
  ollama:  { label: "Ollama", defaultBaseUrl: "http://127.0.0.1:11434/v1" },  // ← 本地适配（参考用 ollama.com/api）
  ...
};
export const FIXED_CRED_PROVIDERS = ["ollama"];  // 本地化：只保留 ollama（本地模型无需 key；bedrock/vertexai 已剔除）
export const SUGGESTED_MODELS = { deepseek: ["deepseek-v4-pro","deepseek-v4-flash","deepseek-chat","deepseek-reasoner"], ... };
export const PROVIDER_LOGO_MAP = { deepseek: "deepseek", ... };
```

> 适配说明：参考项目的 ollama 指向 `https://ollama.com/api`（云端版），我们是本地工具 → 用 `http://127.0.0.1:11434/v1`（用户已确认）。sglang 参考 `http://127.0.0.1:8000/v1` 保留（本地推理框架）。

### 3.2 协议分派

`chatCompletionsURL(baseURL)` 扩展为按 provider 分派（新函数 `resolveProtocol(provider)`）：

| provider | 协议 | 请求 |
|---|---|---|
| `minimax` | anthropic | `POST {base}/messages`，headers `x-api-key` + `anthropic-version: 2023-06-01`，body `{model, max_tokens, system, messages}` |
| `google` | gemini | `POST {base}/models/{model}:generateContent`，header `x-goog-api-key`，body `{contents:[{parts:[{text}]}]}` |
| 其余 18 家 | openai | `POST {base}/chat/completions`，`Authorization: Bearer`（现状） |

**降级链改造**：
- openai：`response_format` json_schema → json_object → prompt-only（现状不变）
- anthropic：`tool_choice: {type:'tool', name:'infer_prop'}` + `tools:[{name, input_schema}]` 强制结构化 → 失败 → prompt-only
- gemini：`generationConfig.responseSchema` + `responseMimeType:'application/json'` → 失败 → prompt-only

统一出口：仍返回 `{ source:'llm', def }`，扩展侧零感知。

### 3.3 新端点 `GET /api/ai/providers`

返回 `{ providerInfo, suggestedModels, fixedCredProviders, logoMap }`（扩展拉取渲染，避免两端重复维护）。`/api/ai/config` 的 GET/PUT 增补 `provider` 字段透传（已有）。

## 4. 扩展侧（options.html/js/css）

### 4.1 服务商下拉（21 家）
- `options.js` 启动时 `GET /api/ai/providers` 拉表（host 离线 → 用内置兜底 6 家）
- 下拉每项：`logo emoji + label`；`defaultBaseUrl` 自动填 Base URL 输入框（现状逻辑）
- logo：`PROVIDER_LOGO_MAP` 是品牌名，扩展侧用 emoji 映射（品牌 logo 资源太重，用 emoji 近似，`OPTIONS_LOGO_EMOJI` 表）

### 4.2 模型下拉（推荐模型）
- model 从「文本框」改为「下拉 + 自定义」：
  - `<select id="ai-model">` 列出 `SUGGESTED_MODELS[provider]` + 末尾「自定义…」option
  - 选「自定义…」→ 切换为 text input（或 datalist）
- 保存的 model 保持字符串，config.json 格式不变

### 4.3 无需 key 置灰
- 选 `FIXED_CRED_PROVIDERS`（本地 = ollama）→ `ai-key` 输入 disabled + 提示「本地模型无需 API Key」
- 保存时该家跳过 key 校验（不要求填）

### 4.4 host 离线兜底
- `GET /api/ai/providers` 失败 → 用内置 `FALLBACK_PROVIDERS`（现有 6 家），功能不降级

## 5. 向后兼容

- `config.json` 结构不变（provider/baseURL/model/apiKey/enabled/timeoutMs）
- 现有已存配置（deepseek 等）baseURL 与参考表一致 → 无需迁移
- 唯一变化：model 存储仍为字符串，只是 UI 从 text 变 select

## 6. 改动清单

| 文件 | 改动 |
|---|---|
| `host/lib/llm.js` | 新增 PROVIDER_INFO / SUGGESTED_MODELS / FIXED_CRED_PROVIDERS / PROVIDER_LOGO_MAP；协议分派 resolveProtocol + anthropic/gemini 请求体；降级链按协议分支 |
| `host/server.js` | 新增 GET /api/ai/providers |
| `host/test/llm.test.mjs` | 新增协议分派测试（minimax→anthropic、google→gemini 的请求体形状）|
| `host/test/ai.test.mjs` | providers 端点测试 |
| `extension/options.js` | 拉 providers 表；服务商 21 项 + logo emoji；模型下拉 + 自定义；无需 key 置灰 |
| `extension/options.html` | AI 卡片改造（模型 select + 自定义 option；key 置灰逻辑）|
| `extension/options.css` | logo emoji / 模型 select / 置灰样式 |
| `dev-loop/scenarios/options.mjs` | 扩展断言：21 家服务商 / 模型下拉有推荐 / ollama 时 key 置灰 |

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| anthropic/gemini 协议降级链不稳 | 无真实 key 也能单测请求体形状（mock）；无 key 时 UI 不阻塞 |
| 21 家表太大 | 数据在 host 一处维护（providers 端点下发），扩展只渲染 |
| 部分家 baseURL 需科学上网 | 用户自选，默认 deepseek |
| model 名随各家更新 | SUGGESTED_MODELS 集中在 host 表，未来只改一处 |

## 8. 验证

- host 单测：协议分派 3 家族请求体形状、providers 端点
- dev-loop options 场景扩展
- 回归：tpl 14/14、llm 9/9、smoke 15/15、options 6/6+ 新增
