# 子任务1：Agent 自主调试浏览器扩展技术方案（调研+落地闭环）

> 父任务：`09-28-agent-driven-extension-ux-polish`
> 调研已完成并落盘：`../research/agent-extension-debug-loop.md`（含本机实测铁证）

## Goal

把 A 线调研选定的方案（Playwright persistent context + 自带 Chromium + `--load-extension`）落地为一个**可复用的开发闭环脚本**，让 Pi agent 能在无人值守情况下：改代码 → 热更新 → 打开 sidepanel 截图/交互 → 抓 console → 断言 → 结构化报告，支撑 B 线（及后续）UI/UX 迭代自主验证。

## Background / Confirmed Facts

- 选型与实测详见 `../research/agent-extension-debug-loop.md`：本机 Playwright 1.63.0 + 缓存 chromium-1243 可用；sidepanel 页面级 reload 热更新实测 PASS；SW 级 reload 需重启 context。
- 决定性约束：Chrome/Edge 已禁 `--load-extension`，必须用 Playwright 自带 Chromium；side panel 宽度无法程序化设置，以多宽度视口模拟。
- 结论：**纯外部路线，零产品代码改动**（UX 迭代改 `sidepanel.*` 走 `page.reload()` 即可；仅改 `background.js` 才重启 context）。
- dev host 支持 `JOURNAL_PORT`/`JOURNAL_DATA_DIR`/`JOURNAL_PROJECT_DIR` 环境变量，可用于测试隔离。

## Requirements

- R1. 在项目内新增开发工具（建议 `dev-loop/` 或 `tools/dev-loop/`，不进扩展包、不污染 `extension/`）：
  - `dev-loop.mjs`：核心 harness。启动/连接 host（临时数据目录隔离）→ `launchPersistentContext`（channel chromium）→ 解析 extensionId → 以指定宽度（默认 360，支持 320/360/400/500 多档）打开 `sidepanel.html` → `page.reload()` 拾取新代码 → 截图。
  - 捕获 `console` / `pageerror`，输出结构化结果（截图路径 + 断言 + console 异常）。
- R2. 依赖管理：项目内固定 `playwright@1.63.0`（`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` 复用已缓存 chromium-1243），提供 `dev-loop/package.json`。
- R3. 数据隔离：harness 以临时 `JOURNAL_DATA_DIR` 启动 host，结束清理，产品 dev 数据零污染（对齐父任务 A3）。
- R4. 提供最小可运行示例/断言（至少能断言：sidepanel 渲染出 `#app-title`、今日日期、host 连接状态；console 无 error），证明闭环可用。
- R5. 写明使用说明（README 或脚本头部注释）：如何跑、宽度档位、如何改断言、SW 级变更如何处理。

## Acceptance Criteria

- [ ] 一条命令跑通闭环，输出结构化报告 + 多宽度截图。
- [ ] 改 `sidepanel.css/js` 后 `page.reload()` 能拾取新代码（复用已验证机制）。
- [ ] 断言可运行：至少 3 条 DOM 断言 + console error 捕获，实测通过。
- [ ] 跑完后 dev 产品数据零污染（`git status` 仅预期新增；host/data 无新增脏记录）。
- [ ] 工具不进入扩展包/生产 manifest；依赖版本锁定。

## Out of Scope

- 真实调起系统 side panel（宽度不可控，见调研）；仅多宽度视口模拟。
- SW 级热重载自动化（仅在改 background.js 时手动重启 context）。
- CI 化流水线（本轮只做本地 harness）。

## Open Questions

- （无阻塞）工具放置目录 `dev-loop/` vs `tools/dev-loop/` —— 实现时按仓库约定定，默认 `dev-loop/`。
