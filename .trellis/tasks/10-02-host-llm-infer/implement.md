# 实施计划：LLM 增强属性推断

## Step 1 — host LLM 客户端 `host/lib/llm.js`
- [ ] 配置读取：`readConfig()` 从 `host/data/config.json` 读 `{provider,baseURL,model,apiKey,timeoutMs,enabled}`，缺失返回 `null`；`joinURL(baseURL, '/chat/completions')` 去重 `/v1`
- [ ] `chatCompletions(config, body)`：单点封装裸 fetch（协议插槽，未来换 SDK 只改这里）
- [ ] `PROP_SCHEMA` + `SYSTEM_PROMPT`：type 枚举与扩展 `PROP_TYPES` 对齐；只输出 JSON
- [ ] 结构化输出**三级降级链**：json_schema → json_object → prompt-only（去围栏 + 括号扫描 + 校验修复）
- [ ] `extractJson()` 纯函数：剥 ```json 围栏、平衡括号扫描（可单测）
- [ ] `normalizePropDef()`：type 归一到枚举、options 仅 select/multi 保留、defaultValue 按 type 兜底
- [ ] 错误分类：`not_configured` / `llm_failed`（内部转 source:'fallback'）
- [ ] 每请求 `AbortSignal.timeout(timeoutMs)`；非 2xx/429 记 warn（不含 key/prompt 全文）

## Step 2 — host 端点 `host/server.js`
- [ ] `GET /api/ai/config` → `{configured, provider, model, enabled}`（**不含 apiKey**）
- [ ] `POST /api/ai/infer-prop`：读请求 `{name, local, model?}` → 未配置返回 `{source:'not_configured', ...local}`；已配置走降级链；复用 `ok()` 包装
- [ ] host 测试 `host/test/llm.test.js`：降级链 / extractJson / normalizePropDef / 错误分类 / not_configured（`node --test`）

## Step 3 — 配置模板与 gitignore
- [ ] `host/data/config.example.json`：模板（baseURL=https://api.deepseek.com、model=deepseek-chat、timeoutMs=15000、enabled=true、apiKey 空字符串）
- [ ] `.gitignore` 加 `host/data/config.json`（确认现有 gitignore 结构）

## Step 4 — 扩展 LLM 层 `extension/lib/prop-llm.js`
- [ ] `inferPropWithLLM(name, {mode, force})`：先本地 `inferProp`；`mode==='never'` 或 `(mode==='auto' && confidence==='rule' && !force)` → 直接返回本地
- [ ] 缓存：chrome.storage.local `ai.inferCache`（Map name→{result, model, ts}），命中返回 `source:'cached'`
- [ ] `fetch` host 代理；`source==='llm'` 写缓存；**永不 throw**（try/catch 全兜 → 本地结果）
- [ ] 复用 `defaultValueForType` 对齐 LLM 返回的 defaultValue

## Step 5 — 模板构建器接入 `extension/sidepanel.js`
- [ ] 新建属性提交后：读 `settings.ai.inferMode`（默认 auto），策略判定调 `inferPropWithLLM`
- [ ] LLM 结果到达 → 若 `source==='llm'` 且 type/options 与当前不同且行无 `data-userTouched` → 行尾渲染「✨ AI 建议：选择（高/中/低）」+ 采纳/忽略
- [ ] 行上「✨ 重新推断」按钮（force=true 绕过 auto）；右键菜单也可加入口（可选）
- [ ] 采纳 → 应用 type/options，重置 `values[key]`；忽略 → 关闭徽标
- [ ] `data-userTouched` 置位点：改类型/改图标/改名字

## Step 6 — 样式与场景
- [ ] `extension/sidepanel.css`：AI 建议徽标 / 采纳忽略按钮
- [ ] `dev-loop/scenarios/llm.mjs`：mock 断言（未配置→纯本地降级；高置信 0 请求；长尾 1 请求；故障降级）
- [ ] 回归：tpl 14/14、smoke 15/15、lint 零新增

## Review Gates
- G1：Step 2 完成后 `node --test` host 全绿（降级链/解析/错误分类）
- G2：Step 5 完成后 dev-loop llm 场景断言通过
- G3：Step 6 回归全绿才 commit

## Rollback
- host 端点与 lib/llm.js 独立，删除即回退；扩展 prop-llm.js 独立模块，移除 import 即回退到纯本地；不影响既有 prop-infer 与模板构建器
