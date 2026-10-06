# Quality Guidelines (Frontend)

> 扩展的 lint / 测试 / 评审 / 性能 / 安全门禁。分层见 [Directory Structure](./directory-structure.md)。

---

## Linting

**工具**：ESLint 9 flat config（`extension/eslint.config.js`），`cd extension && npm run lint`（即 `npx eslint .`）。

三类规则：

| 类别 | 规则 |
|---|---|
| 安全 | `no-eval` `no-implied-eval` `no-new-func` `no-script-url` |
| 卫生 | `no-unused-vars`（`argsIgnorePattern`/`varsIgnorePattern` = `^_`） |
| **架构边界** | `no-restricted-globals`（`chrome`/`localStorage` 仅限 `platform/`）+ `no-restricted-imports`（分层方向） |

**门禁：0 errors。** 每次提交前必跑。

> 未安装的插件（`eslint-plugin-no-unsanitized` 的 innerHTML 检查、`eslint-plugin-jsdoc`）
> 所对应的要求由**人工评审**把关，见下方 Code Review Checklist。

---

## Testing

三层，都需要跑：

| 层 | 工具 | 命令 | 范围 |
|---|---|---|---|
| `shared/` + `state/` 单测 | **Vitest**（node，无浏览器） | `npm --prefix extension test` | 纯逻辑 + 数据层 |
| host 单测 | `node --test` | `npm --prefix host test` | 存储/合并/同步/LLM |
| UI 端到端 | **dev-loop**（Playwright + 自带 Chromium） | `cd dev-loop && node dev-loop.mjs --width 320,360,400,500` | 真实渲染 + 交互 |

一键：`npm test`（根，= extension + host）。

### 覆盖率门禁

`extension/vitest.config.mjs` 对 `shared/**` + `state/**` 设阈值：

```js
thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 }
coverage: { exclude: ['shared/emoji-data.js'] }   // 纯数据表
```

实测基线（2026-10）：语句 **91.4%** / 分支 **81.6%** / 函数 **96.6%** / 行 **94.7%**。

- 测试文件与被测模块同目录、同名 + `.test.js`（如 `state/repository.test.js`）。
- 测试用 `extension/test-helpers.mjs` 的 `makePort()` 注入假端口，**不启动浏览器**。
- 新增 `shared/` / `state/` 导出函数 → 必须补测试，否则覆盖率会掉穿阈值。

---

## Code Review Checklist (for `trellis-check`)

- [ ] 用户内容一律 `textContent` / `createElement`，绝不进 `innerHTML`
- [ ] 卡片读写只经 `state/repository.js`；视图层无 `storageGet`/`storageSet`
- [ ] `chrome.*` / `localStorage` 只出现在 `platform/`
- [ ] 视图可变状态只在 `state/view-state.js` 的 `vs`（无新增模块级 `let`）
- [ ] 无 `views/` → `entries/` 反向 import（改用 `state/actions.js`）
- [ ] 导出函数有 JSDoc `@param` / `@returns`；跨模块形状用 `@typedef` 引用真源
- [ ] `npm run lint` 0 errors
- [ ] `npm test` 全绿（extension + host）
- [ ] UI 改动 → dev-loop 相关场景全绿
- [ ] `manifest.json` 权限最小化（无 `*://*/*` host 权限）

---

## Performance Rules

- 渲染是**显式调用**的：改 `vs` 后必须主动渲染；不要在 render 里挂 `addEventListener`（泄漏）。
- 列表用**事件委托**（`e.target.closest()`），不要给每项各挂监听。
- 轮询靠**内容签名去重**（`sync-bridge`）：签名未变不通知、不重渲染。
- 拖拽/缩放进行中跳过全量重渲染（`entries/app.js` 检查 `is-dragging`/`is-resizing`）。
- 异步读取不阻塞首屏：先渲染骨架/缓存（`repository.hydrateFromCache()`），再拉 host。
- 避免在循环里重复 `storageGet` —— 一次读、传下去。

---

## Security Rules

- **CSP**：MV3 强制 `script-src 'self'`；禁用 `eval()` / `new Function()`。
- **AI 密钥**：权威存放于 **host** `host/data/config.json`（`GET /api/llm/config` 只回传是否已设，不回传密钥）；
  扩展侧 `settings.ai.apiKey` 仅为历史字段。**不得写日志、不得回传前端**。
- **同步凭据**：同样存 host；`GET /api/sync/config` 对密钥脱敏（只回 `*Set` 标记）。
- **数据本地优先**：卡片数据只在本地 SQLite；同步为用户显式开启。

---

## Forbidden Patterns

| Pattern | Why |
|---------|-----|
| `innerHTML` 拼用户内容 | XSS |
| 视图层直接 `getPort().storageSet` 改卡片 | 双真源、订阅者收不到通知 |
| `views/` import `entries/` | 循环依赖；用 `actions` 通道 |
| `shared/` 里 `document`/`chrome`/`fetch`/`node:*` | 破坏可测试性与可移植性 |
| `import` `platform/chrome.js` 等具体实现 | 桌面版/测试无法替换端口 |
| `eval()` / `new Function()` | CSP 违规 |
| 同步 `XMLHttpRequest` | 阻塞 UI 线程 |
| 无声明地新建模块级可变状态 | 隐式全局、无法统一重置 |
