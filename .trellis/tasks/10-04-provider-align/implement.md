# 实施计划：模型配置对齐参考项目

## Step 1 — host 数据表 + 协议分派（host/lib/llm.js）
- [ ] PROVIDER_INFO（24 家，ollama 换本地地址）+ FIXED_CRED_PROVIDERS（3 家）+ SUGGESTED_MODELS（19 家）+ PROVIDER_LOGO_MAP
- [ ] resolveProtocol(provider) → 'openai'|'anthropic'|'gemini'
- [ ] chatRequest(provider, cfg, body, mode) 按协议构造 url/headers/body（openai 现状 / anthropic /messages / gemini :generateContent）
- [ ] inferProp 降级链按协议分支：openai=response_format、anthropic=tool_choice、gemini=responseSchema；统一 normalize 出口
- [ ] host 单测：minimax→anthropic、google→gemini 请求体形状 + providers 表

## Step 2 — host 端点（host/server.js）
- [ ] GET /api/ai/providers → {providerInfo, suggestedModels, fixedCredProviders, logoMap}
- [ ] host/test/ai.test.mjs 加 providers 端点断言

## Step 3 — 扩展设置页（options.js/html/css）
- [ ] 启动拉 GET /api/ai/providers（离线 → 内置兜底表）
- [ ] 服务商下拉动态渲染 24 家（label + logo emoji）
- [ ] 选服务商：填 defaultBaseUrl（无 baseURL 的提示云凭据）+ 刷新推荐模型下拉
- [ ] 模型「select + 自定义…」：推荐项来自 suggestedModels[provider]，无推荐则直接自由输入
- [ ] FIXED_CRED 服务商：key 输入 disabled + 提示无需 key，保存跳过校验
- [ ] logo emoji 映射表

## Step 4 — 验证
- [ ] dev-loop options 场景扩展：24 家 / 模型下拉 / ollama key 置灰 / 无 baseURL 提示
- [ ] 回归 host 18/18+、options 6/6+、tpl 14/14、llm 9/9、smoke 15/15、lint 零新增
- [ ] commit 剥离（保留 select 任务在 options.*/sidepanel.* 的改动）

## Gates
- G1：Step 1-2 host 测试通过
- G2：Step 4 场景+回归全绿
- G3：commit（剥离后）

## Rollback
- host llm.js 协议层独立函数、providers 端点独立；扩展 options AI 卡片独立。回滚 = 还原对应文件段落，不影响既有 prop-infer/模板构建器
