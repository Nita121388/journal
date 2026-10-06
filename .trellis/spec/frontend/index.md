# Frontend Development Guidelines

> 扩展（Chrome MV3 + Side Panel）的开发规范索引。**动手前先读 [Directory Structure](./directory-structure.md)。**

---

## Overview

前端 = `extension/` 下的 **原生 ES modules**（无框架、无打包器，保持 load unpacked 免构建），
按 7 层单向依赖组织：`shared` / `platform` / `state` / `views` / `features` / `components` / `entries`。

- 主界面：侧边栏（`sidepanel.html` → `entries/sidepanel.js`）
- 设置页：`options.html` → `entries/options.js`
- 平台接缝：`platform/index.js` 的 `PlatformPort`（`chrome.*` 唯一归属地）
- 数据真源：`state/repository.js`（内存）+ host SQLite（权威）
- 样式：手写 CSS + 设计 token（`styles/tokens.css`）**及** Tailwind v4 纯 CSS 构建
  （`src/tailwind.css` → `dist/sidepanel.css`，已提交；`npm run build:css`），
  详见 [Design System](./design-system.md)。

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | 7 层结构、依赖铁律、ESLint 强制规则、"新文件放哪"决策表 | ✅ Filled |
| [Component Guidelines](./component-guidelines.md) | 渲染函数组件、Field Registry、可访问性、历史踩坑 | ✅ Filled |
| [Module Guidelines](./hook-guidelines.md) | 模块粒度/命名/纯度、状态归属、actions 通道、DOM 约定 | ✅ Filled |
| [State Management](./state-management.md) | repository 真源、view-state、三条同步路径合一、读写模式 | ✅ Filled |
| [Quality Guidelines](./quality-guidelines.md) | ESLint、Vitest 覆盖率、dev-loop、安全与禁用模式 | ✅ Filled |
| [Type Safety](./type-safety.md) | JSDoc `@typedef` 清单、边界运行时校验 | ✅ Filled |
| [Design System](./design-system.md) | 设计 token 三层 / 组件规范 / 动效 / 可访问性硬门 / 反模式 | ✅ Filled |
| [dev-loop](./dev-loop.md) | Agent 自主验证扩展 UI 的闭环（多宽度截图 + 断言 + 报告） | ✅ Filled |

---

## Pre-Development Checklist

动手写扩展代码前确认：

- [ ] 新文件位置符合 [Directory Structure](./directory-structure.md) 的"新增文件放哪"决策表
- [ ] 该能力没有落到错误的层（`chrome.*`→platform、卡片读写→repository、视图状态→`vs`、纯计算→shared）
- [ ] 渲染函数纯 + 幂等（同状态同 DOM），不读存储、不写存储
- [ ] 触碰卡片字段（新增/改名/类型/落位）→ 走 **Field Registry**
      （[Component Guidelines](./component-guidelines.md) 的 Field Registry 节）；
      不得重新引入 `findPropDef` / `BUILTIN_DEFS` 分叉或 `switch(key)` 分发
- [ ] 新增存储字段 → 在 [State Management](./state-management.md) 说明，并在边界做运行时校验
- [ ] 导出函数补 JSDoc（[Type Safety](./type-safety.md)）

---

## Quality Check

- [ ] `cd extension && npm run lint` — **0 errors**
- [ ] `npm test`（根）— extension（vitest，覆盖率阈值）+ host 全绿
- [ ] UI 改动 → `cd dev-loop && node dev-loop.mjs --width 320,360,400,500` 全绿（见 [dev-loop](./dev-loop.md)）
- [ ] `chrome://extensions` load unpacked 正常，侧边栏与设置页 console 无 error
- [ ] 无 `eval` / `new Function` / 用户内容进 `innerHTML`
