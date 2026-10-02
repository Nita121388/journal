# 模板构建器属性推断 LLM 增强（host 代理 + 配置驱动 + 双层推断）

## Goal

在上一轮「本地规则推断」（`lib/prop-infer.js`）之上增加 **LLM 增强层**：本地规则置信度低（长尾属性名，如「客户满意度评分」「血标本采集时限」）时，调用本地 host 的 LLM 代理端点，由大模型推断图标的类型/选项/默认值。常见属性名仍走本地规则（零延迟、零成本、离线可用）。

> API key **只存在 host 侧配置文件**，绝不进扩展包（CRX 可解包，key 泄露风险）。扩展只经 native-messaging/HTTP 与本机 host 通信。

## Requirements

1. **host 新增 LLM 代理端点** `POST /api/ai/infer-prop`：
   - 零依赖裸 `fetch`（Node 22 内置），OpenAI 兼容 `/chat/completions`，只换 `baseURL` 即适配 DeepSeek / Qwen / Kimi / 智谱 / OpenRouter / Ollama
   - 请求体 `{ name, local: {icon,type,options}, model? }` → 响应 `{ icon, type, options, defaultValue, source: 'llm' }`
   - **结构化输出降级链**：`response_format:{type:'json_schema'}` → 失败降级 `json_object` → 再失败走「prompt 内嵌 schema + 去围栏解析 + 校验」→ 仍失败返回本地结果（`source:'fallback'`），**永不因 LLM 故障阻断 UI**
   - 超时（`AbortSignal.timeout`）、非 2xx、限流、空返回 → 统一错误分类，扩展侧静默降级到本地
2. **host 侧配置文件驱动**：
   - 位置 `host/data/ai-config.json`（或 `host/ai-config.json`，见 Open Questions），提供 `provider / baseURL / model / apiKey / timeoutMs`
   - API key 永不出现在扩展的任何响应里（`GET /api/ai/config` 只回 `{configured: bool, provider, model}`，不含 key）
   - 配置文件缺失/未填 key → 端点返回明确 `not_configured`，扩展降级纯本地
3. **扩展侧双层推断**（`lib/prop-infer.js` 扩展，保留纯本地默认）：
   - 新增 `inferPropWithLLM(name)`：先跑本地规则；若 `confidence==='rule'` 直接返回（不调 LLM）；若 `fallback`/`emoji` 则异步请 host 代理
   - 模板构建器新建属性时：本地结果**立即**应用到行上（保证瞬时反馈），LLM 结果返回后**仅当 confidence 提升或类型不同**才提示用户「AI 建议：type=select（选项 …）」，用户可一键采纳或忽略（不自动覆盖用户已改动）
   - LLM 结果**本地缓存**（chrome.storage.local，按 `name+model` 键），重复属性名不重复计费
4. **触发策略**（可配置，默认「智能」）：
   - `auto`（默认）：本地 `rule` 命中→不问；`fallback`/`emoji`→问
   - `always`：每次新建属性都问
   - `never`：只用本地（等价于关闭 LLM）
   - 另提供行上「✨ 重新推断」手动强制触发（`always` 也可手动）

## Constraints

- host **零新增运行时依赖**（`dependencies: {}` 保持），只用 Node 内置 `fetch`/`AbortSignal`/`fs`
- 扩展侧不新增依赖；`lib/prop-infer.js` 保持纯函数、**不 import host/网络**（LLM 层单独放 `lib/prop-llm.js`）
- 遵守 backend/database-guidelines：key 不入库（`settings`/`meta` 表）、不写日志、不随同步快照分发
- 遵守 error-handling：网络/解析/校验错误分类，不把原始异常抛给 UI
- 遵守 component-guidelines：AI 建议提示用 DOM API 构建，不用 innerHTML
- 本轮不新增选项页 AI 设置 UI（配置走 host 配置文件）

## Acceptance Criteria

- [ ] host 未配置 key 时，`/api/ai/infer-prop` 返回 `not_configured`，扩展纯本地推断不受影响（功能等价于上一轮）
- [ ] 配置 key + 合法 baseURL/model 后，`POST /api/ai/infer-prop {name:'客户满意度评分'}` 返回合理结构（如 `type: 'number'|'select'`, 有 icon/options）
- [ ] `GET /api/ai/config` 响应**不含** apiKey（只有 configured/provider/model）
- [ ] 本地规则 `rule` 命中（如「重要度」「截止日期」）→ **不发** LLM 请求（用 mock server 计数断言 0）
- [ ] 本地 `fallback`/长尾名 → 发一次 LLM 请求，UI 先显示本地结果、LLM 到达后给出「AI 建议」可采纳
- [ ] LLM 故障（超时/非 2xx/非法 JSON）→ 静默降级到本地结果，不弹错误、不阻断新建属性
- [ ] 同一属性名重复推断命中本地缓存，LLM 请求不重复发
- [ ] key 不出现在扩展包/任何扩展侧响应/日志中
- [ ] 无回归：tpl 场景 14/14、smoke 多宽度 15/15 不变（无 key 场景）
- [ ] host 新增测试（`node --test`）覆盖降级链与错误分类

## Notes / Open Questions（已决策）

- **配置文件位置**：`host/data/config.json`（与 `journal.db` 同级），示例模板 `host/data/config.example.json` 提交、真实文件 gitignore。
- **接入方式**：裸 fetch 零依赖（Node 内置），不引 LLM SDK；国产模型全为 OpenAI 兼容。协议层在 `host/lib/llm.js` 单点封装留插槽，未来可无缝换 Vercel AI SDK / 加 Anthropic/Gemini。
- **模型默认**：DeepSeek `deepseek-chat`；baseURL/model 可配置，Ollama 用户填 `http://127.0.0.1:11434/v1` 即走本地模型。
- **触发策略默认**：`auto`（本地 `rule` 命中不问；`fallback`/`emoji` 才问；行上「✨ 重新推断」可手动强制）。
- 复用已有 emoji 库做图标兜底：LLM 只推断 type/options/default，icon 仍优先用本地规则/emoji 库（LLM 选 emoji 质量不如本地库），但允许 LLM 覆盖——此点在实现时以本地优先、LLM 可选。
