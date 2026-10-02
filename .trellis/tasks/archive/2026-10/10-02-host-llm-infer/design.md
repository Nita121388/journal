# 技术设计：LLM 增强属性推断

## 1. 架构总览

```
模板构建器（扩展）
  └─ prop-infer.js（纯本地，永不联网）
       └─ prop-llm.js（LLM 层，异步/可失败/可降级）
            └─ fetch → http://127.0.0.1:<port>/api/ai/infer-prop
                 └─ host（Node）
                      ├─ 读 host/data/config.json（apiKey/baseURL/model）
                      ├─ lib/llm.js：裸 fetch → OpenAI 兼容 /chat/completions
                      └─ 结构化输出降级链 + 错误分类
```

**为什么 key 在 host**：CRX 包可被解包，扩展内任何 key 都会随发布泄露。host 是本机进程，配置不进包、不随扩展分发。扩展侧只经本机 HTTP 拿**结果**，永不接触 key。

## 2. 配置文件（host 侧）

位置：`host/data/config.json`（与 `journal.db` 同级）。`host/data/` 是本机数据目录，DB 在此；真实 config.json 加 gitignore。

```jsonc
{
  "provider": "deepseek",                          // 仅作展示/分组，可选
  "baseURL": "https://api.deepseek.com",           // OpenAI 兼容根，不含 /chat/completions
  "model": "deepseek-chat",
  "apiKey": "sk-xxxxxxxx",                          // 用户填；文件权限 0600
  "timeoutMs": 15000,
  "enabled": true                                   // 便于临时关掉而不删 key
}
```

- 提供 `config.example.json` 模板（提交进仓库，真实文件 gitignore）
- 读取：启动时读一次并缓存；`POST /api/ai/config`（或复用 GET）可触发热重载——本轮用「每请求读文件」（文件小，开销可忽略，改配置立即生效，无需重启）
- 兼容 baseURL 带不带 `/v1`：内部统一 `joinURL(baseURL, '/chat/completions')` 去重 `/v1`

## 3. host 端点契约

### `GET /api/ai/config`（仅状态，**不返回 key**）
```json
{ "configured": true, "provider": "deepseek", "model": "deepseek-chat", "enabled": true }
```
`configured = !!(apiKey && baseURL && model && enabled)`。

### `POST /api/ai/infer-prop`
请求：
```json
{ "name": "客户满意度评分", "local": { "icon":"📄", "type":"text", "options":null } }
```
响应 `200`：
```json
{ "source": "llm", "icon": "⭐️", "type": "number", "options": null, "defaultValue": "", "model": "deepseek-chat" }
```
- `source` ∈ `llm | local | fallback | not_configured`；`not_configured`/`fallback` 时 `type/icon` 回落到请求里的 `local`
- 非 2xx 仅用于「配置类」错误（`500 not_configured`）；**LLM 调用失败仍返回 200 + `source:fallback` + `local` 结果**——让扩展不必区分「网络错」和「没配置」，统一降级

响应头沿用现有 `ok(res, data)` 包装（`{ok, data}`）——与其它端点一致。

## 4. host LLM 客户端 `host/lib/llm.js`

### 4.1 请求体（OpenAI 兼容）
```js
{
  model, temperature: 0,
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },   // 说明任务 + 只输出 JSON + 枚举 type/option 约束
    { role: 'user',   content: `属性名：${name}` },
  ],
  response_format: { type: 'json_schema', json_schema: { name:'prop', strict:true, schema: PROP_SCHEMA } },
}
```
`PROP_SCHEMA`：`{ type: enum, options: string[]|null, icon: string, defaultValue: any }`（`type` 枚举与扩展 `PROP_TYPES` 对齐）。

### 4.2 结构化输出降级链（核心）
```
attempt(json_schema) → ok? 解析
  ↓ 失败/不支持
attempt(json_object)  → ok? 解析
  ↓ 失败
attempt(prompt-only + 去围栏 + 括号扫描 + 校验/修复) → ok? 解析
  ↓ 失败
return { source:'fallback', ...local }
```
- **括号扫描**：剥 ```json 围栏，取首个平衡 `{…}`（`lib` 纯函数，可单测）
- **校验/修复**：`type` 归一到 `PROP_TYPES`；`options` 只在 `select/multi` 保留，否则置 null；`defaultValue` 按 type 兜底
- 每次 attempt 都带 `AbortSignal.timeout(timeoutMs)`；非 2xx / 429 记 warn（不含 key/不含 prompt 全文），进入下一级

### 4.3 错误分类（对上层只暴露 3 类）
- `not_configured`：无 key/baseURL/model 或 `enabled:false`
- `llm_failed`：所有 attempt 都失败（超时/HTTP/解析）→ 仍 200，`source:'fallback'`
- （`ok`）：`source:'llm'`

## 5. 扩展侧 `lib/prop-llm.js`（新增）

```js
export async function inferPropWithLLM(name, opts = {})
  → { ...localResult, source: 'llm'|'local'|'cached'|'fallback', llm?: {...} }
```
- 先 `inferProp(name)`（本地）
- `confidence === 'rule'` → 直接返回，**不发请求**（R5 断言点）
- 否则：查本地缓存（`chrome.storage.local`，key `ai.inferCache:<name>:<model?>`）→ 命中返回 `cached`
- 未命中 → `fetch('/api/ai/infer-prop')`；成功且 `source==='llm'` → 写缓存返回；否则返回本地结果（`source:'fallback'`/`'not_configured'`）
- **永不 throw**：内部 try/catch 全兜，失败等价于本地结果（UI 不会因网络问题崩）

## 6. 触发策略（`settings.ai.inferMode`，默认 `auto`）
- `auto`：本地 `rule`→不调；`fallback`/`emoji`→调
- `always`：每次新建都调
- `never`：不调
- 行上「✨ 重新推断」：无条件调一次（绕过 auto 判断），结果以「AI 建议」呈现

## 7. UI：AI 建议（不自动覆盖用户）

新建属性的时序：
1. 名字输入中 → 本地推断**实时**应用（上一轮已有）
2. 名字提交（Enter）→ 若策略判定要问 LLM，**后台** `inferPropWithLLM`
3. LLM 到达 → 若比当前更「确定」（`source==='llm'` 且 type/options 与当前不同 且用户未手动改过该字段）→ 行尾出现「✨ AI 建议：选择（高/中/低）」小徽标 + 「采纳 / 忽略」
4. 用户「采纳」→ 应用 LLM 的 type/options（重置 values[key] 为该类型空值）；「忽略」→ 忽略本次（或永久该名）

「用户改过」判定：行上 `data-userTouched` 标记（右键改类型/改图标/改名字都会置位），有标记则不提示采纳。

## 8. 改动清单

| 文件 | 改动 |
|---|---|
| `host/data/config.example.json` | 新增：配置模板 |
| `host/.gitignore`（或根） | 忽略 `host/data/config.json` |
| `host/lib/llm.js` | 新增：配置读取 + OpenAI 兼容客户端 + 降级链 + 错误分类（纯函数可测） |
| `host/server.js` | 注册 `GET /api/ai/config`、`POST /api/ai/infer-prop`（复用 `ok()` 包装） |
| `host/test/llm.test.js` | 新增：降级链 / 括号扫描 / 校验修复 / 错误分类 单测 |
| `extension/lib/prop-llm.js` | 新增：host 调用 + 缓存 + 永不 throw |
| `extension/lib/prop-infer.js` | 微调：导出供 LLM 层复用的 type 枚举（已有 PROP_TYPES） |
| `extension/sidepanel.js` | 模板构建器接入：提交后异步问 LLM、渲染「AI 建议」徽标、采纳/忽略、「✨ 重新推断」 |
| `extension/sidepanel.css` | 「AI 建议」徽标 / 采纳按钮样式 |
| `dev-loop/scenarios/llm.mjs` | 新增：无 key 降级路径断言（mock host 返回 not_configured） |

## 9. 风险与缓解

| 风险 | 缓解 |
|---|---|
| key 泄露 | 只在 host 配置文件；响应/日志/扩展包均不含 key；config 端点只回布尔 |
| LLM 慢/挂 | `AbortSignal.timeout`；不阻塞 UI（本地结果先出，LLM 后到）；超时降级本地 |
| 结构化输出不遵守 | 三级降级链 + 解析后校验修复；失败降级本地 |
| 扩展断连 host | fetch 失败 → 永不 throw → 等价本地 |
| 重复计费 | 本地缓存按 `name`；`auto` 策略不重复问高置信名 |
| provider 差异 | 只依赖 OpenAI 兼容 `/chat/completions`；`response_format` 不支持时降级链兜住 |

## 10. 验证方式（无真实 key 也能测）

- `host --test`：降级链、括号扫描、校验、错误分类、not_configured —— **纯单测，不联网**
- dev-loop 新场景 `llm`：mock host（dev-loop 已支持 isolated host + 端口重写），断言
  - 未配置 → `source:'not_configured'`，UI 走纯本地（等价上一轮，14/14 不变）
  - 配了假 baseURL 指向 mock → 断言「高置信名 0 次请求」「长尾名 1 次请求」「故障降级」
- 真实 key 验证（可选，用户配好后手动跑一次长尾名）

## 11. 已确认决策（用户拍板）

1. **配置文件位置**：`host/data/config.json`（与 `journal.db` 同级；示例模板 `host/data/config.example.json` 提交进仓库，真实文件 gitignore）。
2. **接入方式**：本轮**裸 fetch 零依赖**（Node 22 内置），不引入任何 LLM SDK。理由：目标国产模型全为 OpenAI 兼容 `/chat/completions`；单一结构化调用形状无需 SDK；保持 host 零依赖约束。**协议层留插槽**：`lib/llm.js` 内部 `chatCompletions()` 单点封装，未来要接 Anthropic/Gemini 原生协议或换 Vercel AI SDK 时只改此函数，端点契约 / 降级链 / 扩展侧不动。
3. **触发策略默认**：`auto`（本地 `rule` 命中不发请求，`fallback`/`emoji` 才问）。
4. **模型默认**：DeepSeek `deepseek-chat`；用户改 baseURL/model 即适配其它（Qwen/Kimi/Ollama）。

## 12. 待你确认（Open Questions，已全部关闭）

- ~~配置文件位置~~ → `host/data/config.json`
- ~~触发策略默认~~ → `auto`
- ~~模型默认~~ → DeepSeek `deepseek-chat`
- ~~是否引库~~ → 不引，裸 fetch + 协议插槽
