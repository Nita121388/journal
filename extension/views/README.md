# `views/` — 主视图渲染层

**职责**：各主视图的纯渲染与视图内交互。

## 允许
- import `shared/`、`components/`；通过参数接收 `state` 与回调。

## 禁止
- 不得 import `platform/**` 或直接使用 `chrome.*`。
- 不得读写持久化存储（走 `state/repository`）。

## 规划内容
`timeline.js` `week.js` `month.js` `pool.js` `heatmap.js` `calendar.js` `skills.js`

来源与行区间见 `design.md` §5。
