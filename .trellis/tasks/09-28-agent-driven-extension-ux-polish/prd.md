# Pi Agent 自主调试扩展 + UI/UX 深度优化

## Goal

让 **Pi agent 在不依赖用户肉眼验证的前提下，自主完成浏览器扩展的开发-调试-回归闭环**，并以资深产品经理视角对 Journal（Chrome MV3 每日日志 sidepanel 扩展 + 本地 Node host）做 **UI/UX 深度优化**，持续迭代直到「完美可交付」。

用户明确要求：不限 Token、不限时间，目标是**不断优化本产品直到完美可交付**；先上网调研技术方案与设计方法，再落地。

## Background / Confirmed Facts

（从仓库侦察确认，2026-09-28）

### 产品形态
- **扩展端** `extension/`：Chrome MV3，`sidePanel` 每日日志面板。结构：`sidepanel.html/css/js`（js 约 2350+ 行）、`options.html/css/js`、`background.js`（service worker）、`lib/`（ai.js / emoji.js / host-sync.js / model.js / store.js / sync.js）。
- **Host 端** `host/`：Node HTTP 服务（`server.js`，DEFAULT_PORT 8765，dev 副本 8766），SQLite 持久化（`host/lib/storage.js`），含同步引擎 `sync/`、CLI `cli.mjs`、auto-summary、Windows 自启 launcher。
- **数据流**：sidepanel ↔ host（REST + 扩展 storage 缓存）↔ SQLite；host 离线时扩展缓存层独立可用。

### Sidepanel 现有 UI（sidepanel.html 结构）
- 顶栏：标题 📓 Journal + 今日日期 + ⚙️ 设置
- Host 未连接 banner（role=status）
- 三栏布局：左侧 `#sidebar`（卡片池 🃏 + 日历 📅 + 热力图打卡 🔥 + AI Skill 状态 🧠），中间 `#timeline-section` 日程/周/月三视图（view-mode month/week/timeline），右侧（待确认）
- 卡片池：命名视图下拉、过滤行、模板新建 🗂、新卡片 ＋、布局切换 ⊞ / 保存视图 💾
- 时间线：导航 ‹ › 今天、宽屏循环 ⛶、时间范围 08–22/24h、视图模式 📅📆⏱
- 卡片：标题/emoji/标签/属性/状态/进度/时长/项目（上游近 31 个提交新增）

### 代码质量基线
- 上游最新（`origin/main` f21cc7c，31 提交已合并进 `dev/local`）工作区干净。
- 5 个核心 JS 文件 `node --check` 通过；dev host 冒烟启动通过，SQLite 迁移自动备份。
- 已有多条活跃任务在跑：图标、时间线当前时刻、日程横向并行、卡片拖拽、标签系统、数据同步、卡片池过滤、宽屏、emoji 图标。

### 约束
- 扩展运行在 Chrome，agent 需**自主驱动浏览器**才能「看到」渲染效果 → 这是本任务 A 线的核心技术问题。
- Windows 环境（本机 E:/projects/journal-dev）；已有 `host/start-dev.bat`（8766 + 独立数据目录）。
- 无自动化 UI 测试基建（未见 e2e 目录/playwright 配置）。

## Requirements

### A 线 · Agent 自主调试浏览器扩展（技术方案调研 + 落地闭环）
- A1. 调研并选定「Pi agent 自主驱动 Chrome 调试 MV3 扩展」的技术路线（候选：Playwright + 扩展加载、CDP/Chrome DevTools Protocol 直连、扩展自带调试通道、jsdom 快照近似等），输出对比与选型结论。
- A2. 落地闭环：改代码 → 扩展热重载 → 自动打开 sidepanel/截图/点击/输入 → 抓 console 与网络 → 断言 → 报告。agent 可据此自主迭代 UI 而不依赖用户肉眼。
- A3. 闭环对 dev 副本（8766 端口 + 独立数据目录）零污染：不破坏现役 8765 环境与真实数据。
- A4. 可重复、可断言：回归脚本输出结构化结果（截图路径 + 断言通过/失败 + console 异常）。

### B 线 · UI/UX 深度优化（资深 PM 视角）
- B1. 产出完整 **UX 审计报告**：产品定位、信息架构、视觉层级、交互流程、空状态/加载/错误反馈、可发现性、一致性、可访问性；每条结论附证据（file:line / 截图）。
- B2. 产出 **设计系统文档**：设计 token（色板/字体/间距/圆角/阴影/动效）、组件规范、写进前端 spec 供后续复用。
- B3. 按审计结论**分轮落地改造**（本轮为第一轮），每轮用 A 线闭环自测回归，避免肉眼验证依赖。
- B4. 最终状态达到「可交付」：无已知阻断级缺陷，视觉/交互一致，关键流程（写日志/打卡/TODO/AI）顺畅。

### 交付方式（用户已确认）
- 文档先行：先出 UX 审计 + 设计系统文档，用户确认后再动产品代码。
- 任务结构：父任务（本任务）+ 3 子任务（A 线落地 / UX 审计+设计系统 / UX 第一轮落地）。

## Acceptance Criteria（父级跨子任务验收）

- [ ] A1 调研文档存在：≥3 条技术路线对比 + 明确选型 + 风险与回退方案。
- [ ] A2 闭环可用：一条命令跑通「改代码→重载→截图+交互+断言+报告」，截图与断言结果可读。
- [ ] A3 dev 副本数据零污染：跑闭环后 8766 数据目录可恢复到基线（或使用隔离测试数据）。
- [ ] B1 UX 审计报告存在：覆盖 ≥6 个维度，每条结论有证据锚点。
- [ ] B2 设计系统文档存在：token + 组件规范已落入 `.trellis/spec/frontend/`。
- [ ] B3 第一轮落地完成：按审计优先级 ≥5 项改造落地并通过 A 线回归。
- [ ] 父任务集成评审：全链路（扩展→host→SQLite→AI）回归通过，工作区干净，文档齐全。

## Out of Scope

- 改造现役 8765 生产环境（只允许隔离的 8766 dev 副本）。
- 非 Chrome 浏览器支持（Firefox/Safari 适配）。
- 移动端/跨平台 UI。
- B 线一次性改完所有审计项（分轮进行，本轮只做第一轮）。

## Open Questions（规划期，逐项收敛）

- （已收敛，调研见 `research/agent-extension-debug-loop.md`）A 线选型：**Playwright persistent context + 自带 Chromium**，纯外部零测试钩子，页面级 reload 热更新，host 临时数据目录隔离 —— 已本机实测通过。
- （已收敛）MV3 热重载：页面级 reload 为主；SW 级（改 background.js）重启 context。
- （已收敛）测试钩子边界：**不需要**（纯外部路线即可，实测佐证）。
- （用户决策）第一轮改造项 —— 由子任务2 审计清单输出，审计后随文档一并请用户确认。
