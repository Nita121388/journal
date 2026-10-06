# `entries/` — 组合根

**职责**：页面入口。选择并注入 `PlatformPort`，装配 `state` / `views` / `features`，绑定 DOM，启动应用。

## 允许
- import 任意层（**唯一**可以 import `platform/chrome.js` / `web.js` 具体实现的地方）。

## 约定
- 保持极薄：`sidepanel.js` 只做启动引导（当前 13 行）；业务逻辑一律下沉到 `state/` `views/` `features/`。
- `bind-*.js` 只做事件绑定，不写业务实现。
- 组合根负责把反向能力注入 `state/actions.js`（`refreshAll` / `openEditor` / `openEditorRange` / `updateEditorDuration`），
  避免 `views → entries → views` 循环依赖。

## 内容

| 文件 | 职责 |
|---|---|
| `sidepanel.js` | 启动引导（import `app.js` 的 `init()` 并捕获错误） |
| `app.js` | 装配顺序 + 注入 actions |
| `bind-shell.js` | 外壳交互（主题、抽屉、搜索、host 状态） |
| `bind-views.js` | 视图导航与视图内事件 |
| `bind-editor.js` | 卡片编辑器 / 模板构建器事件 |
| `options.js` | 设置页入口 |

## 相关规范

- [`../../.trellis/spec/frontend/directory-structure.md`](../../.trellis/spec/frontend/directory-structure.md) — 分层与依赖铁律
- [`../../.trellis/spec/frontend/state-management.md`](../../.trellis/spec/frontend/state-management.md) — 真源与同步
- [`../../docs/adr/0001-layered-packaging-within-chrome-root.md`](../../docs/adr/0001-layered-packaging-within-chrome-root.md) — 为什么在扩展根内逻辑分层
