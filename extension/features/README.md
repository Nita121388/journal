# `features/` — 交互功能层

**职责**：跨视图的交互功能模块（编辑器、模板构建器、下拉框、提示等）。

## 允许
- import `shared/`、`components/`；通过参数接收 `state` 与 `port`。

## 禁止
- 不得 import `platform/**` 或直接使用 `chrome.*`。
- 不得直接读写持久化存储（走 `state/repository`）。

## 规划内容
`card-editor.js` `template-builder.js` `emoji.js` `select.js` `toast.js` `prop-library.js`

来源见 `design.md` §5。
