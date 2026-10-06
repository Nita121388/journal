# `components/` — 原子组件层

**职责**：可复用的无框架 UI 原子（chip / seg / modal / toolbar / badge）。

## 允许
- import `shared/`；纯 DOM 构建。

## 禁止
- 不得 import `state/` `views/` `features/` `platform/`（组件必须自包含）。
- 不得对用户内容使用 `innerHTML`。

约定见 `.trellis/spec/frontend/component-guidelines.md`。
