# `entries/` — 组合根

**职责**：页面入口。选择并注入 `PlatformPort`，组装 `state` / `views` / `features`，绑定 DOM，启动应用。

## 允许
- import 任意层（唯一可以 import `platform/**` 的地方）。

## 约定
- 保持极薄（`sidepanel.js` < 120 行）；业务逻辑一律下沉到 `state/` `views/` `features/`。

## 规划内容
`sidepanel.js`、`options.js`（分别对应 `extension/sidepanel.html`、`options.html`）。

详见 `design.md` §2、§5。
