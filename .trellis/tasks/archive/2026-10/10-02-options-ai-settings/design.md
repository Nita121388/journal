# 技术设计：选项页 AI 设置 + 默认折叠

## 1. 边界
- 只改 `extension/options.html / .css / .js` + `host/server.js`（+ 复用 `host/lib/llm.js` 的配置读写）
- 不动 sidepanel / 模板构建器 / 数据格式

## 2. 默认折叠
5 个 `<details>` 全部去掉 `open`。`<details>` 原生支持展开/收起，无需 JS。不设 `name`（互斥手风琴可后加，本期各自独立折叠更稳）。

## 3. host 配置读写
`lib/llm.js` 已有 `readConfig()`。新增：
- `writeConfig(cfg, path)`：写 `host/data/config.json`（JSON.stringify + 原子写 temp→rename）
- `GET /api/ai/config` 已有（不含 key）
- 新增 `PUT /api/ai/config`：body `{enabled?, baseURL?, model?, apiKey?, provider?, timeoutMs?}`，与现有配置**合并**（apiKey 空串/省略 = 不改 key），写盘后返回 `{configured, provider, model, enabled}`

key 安全：PUT 收 key 落盘；GET 永不返回；扩展 `options.js` 只在「保存」那一刻持有用户刚输入的值，不持久化。

## 4. options.html 新增 AI section
结构（复用 `.card.collapsible` + `.section-head` + `.field`）：
```
<details id="ai-section" class="card collapsible">
  <summary class="section-head">🤖 AI 增强 <span id="ai-dot">…</span></summary>
  <label class="field">启用 <input type="checkbox" id="ai-enabled"></label>
  <label class="field">服务商 <select id="ai-provider">…</select></label>
  <label class="field">Base URL <input id="ai-base" placeholder></label>
  <label class="field">模型 <input id="ai-model" placeholder></label>
  <label class="field">API Key <input type="password" id="ai-key" placeholder="留空表示不修改"></label>
  <label class="field">触发策略 <select id="ai-infer-mode"><option auto>智能（推荐）…</select></label>
  <div class="btn-row">
    <button id="ai-save">保存配置</button>
    <button id="ai-test">连接测试</button>
  </div>
  <span id="ai-feedback" class="copy-feedback"></span>
</details>
```

服务商预设（`PROVIDERS` 表，options.js）：
| key | label | baseURL | model |
|---|---|---|---|
| deepseek | DeepSeek | https://api.deepseek.com | deepseek-chat |
| qwen | 通义千问 | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-plus |
| kimi | Kimi | https://api.moonshot.cn/v1 | moonshot-v1-8k |
| zhipu | 智谱 GLM | https://open.bigmodel.cn/api/paas/v4 | glm-4-flash |
| siliconflow | 硅基流动 | https://api.siliconflow.cn/v1 | Qwen/Qwen2.5-7B-Instruct |
| ollama | Ollama（本地） | http://127.0.0.1:11434/v1 | qwen2.5:3b |
| custom | 自定义 | （留空） | （留空） |

选预设自动填 baseURL+model；切「自定义」清空让用户填。

## 5. options.js 逻辑
- `init()`：`enhanceSelects()` 已存在（保留 select 任务那行）→ 再调 `loadAiSettings()`
- `loadAiSettings()`：GET `/api/ai/config` + 读 `getSettings().ai.inferMode` → 填表单（key 留空）；host 离线→ 反馈「host 未连接」并禁用保存
- 选 provider 变化 → 自动填 baseURL/model
- `saveAi()`：PUT `/api/ai/config`（enabled/baseURL/model/provider/apiKey 合并）+ `saveSettings({ai:{inferMode}})` → 反馈
- `testAi()`：GET `/api/ai/config` → 显示 configured 状态（不含 key）

## 6. 风险
- select 任务改动混在 options.*：commit 前剥离（保留其改动在工作区）
- API key 只在 PUT body 一次；扩展 storage 只存 inferMode（`settings.ai` 现有 apiKey 字段遗留为空，不动）
- host 离线：GET/PUT 失败 → fetch catch → 反馈提示，不崩

## 7. 验证
- dev-loop 加 `options` 场景或手工：折叠默认态 / 选 provider 自动填 / 保存后 GET configured / key 不回显
- 回归：tpl 14/14、llm 9/9、smoke 15/15、lint 零新增
