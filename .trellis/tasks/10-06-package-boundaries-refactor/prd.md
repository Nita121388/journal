# 按边界分包重构（packages 单体仓库）+ 桌面版准备

## Goal

把当前 `extension/`（3695 行 sidepanel.js + 3022 行 CSS 双轨）与 `host/` 重构为
**shared + host + ui + platforms** 四层单向依赖分包，收敛 `chrome.*` 到平台端口，
拆分 UI 巨石，统一数据真源与样式 token，并落地 Electron 桌面壳 PoC。
以**可读性、单一职责、单向依赖**为第一验收标准。

## Background（实测基线 2026-10-06）

| 指标 | 现状 |
|---|---|
| `extension/sidepanel.js` | 3695 行，19 分区，98 个 `getElementById`，159 处 `addEventListener` |
| `extension/sidepanel.css` | 3022 行，与 Tailwind 构建链（`src/tailwind.css`→`dist/sidepanel.css`）双轨并存 |
| 数据真源 | host SQLite（权威）+ `chrome.storage.local`（缓存）+ 轮询 + `onChanged`，共 3 条同步路径 |
| `chrome.*` 分布 | store.js 13 / background.js 11 / host-sync.js 5 / sidepanel.js 3 / prop-llm 3 / options.js 1 |
| 测试 | spec 要求 vitest `lib/` 覆盖 >80%，仓库内**无任何扩展测试文件** |
| 跨边界违规 | `host/test/extension-sync.test.mjs` 反向 `import '../../extension/lib/sync.js'` |

## Requirements

### R1 分层与依赖方向（硬约束）
- 四层：`shared`（纯逻辑）→ `host`（权威服务）/ `ui`（视图）→ `platforms`（壳）。
- 只允许向下依赖，禁止反向。用 ESLint `no-restricted-imports` 强制：
  - `shared/**` 禁止 import 任何其他包，禁止 `document/window/chrome/node:sqlite`
  - `ui/**` 禁止 import `platforms/**`（只能依赖注入的 platform 端口对象）
  - `platforms/*` 之间禁止互相 import

### R2 chrome.* 收敛
- 全仓 `chrome.*` 只允许出现在 `platforms/**`。
- 提供 `chrome` 与 `web` 两个端口实现，UI 在两者下均可运行。

### R3 数据真源唯一
- UI 侧只有一个内存真源 `repository`（读/写/订阅）。
- host 同步降级为 repository 的后端：pull/poll/onChanged 合并为一条通知链。
- 删除 `journals/todos` 全量委托、`normalizeEntry`/`newerEntry`/`startPushListener` 等死代码。

### R4 UI 可读性
- `entries/sidepanel.js` 入口 < 120 行，仅组装。
- 每个 view/feature 模块 200–400 行，带 JSDoc；无跨模块隐式全局状态。
- 消除散落的多处 `innerHTML`，统一走 `ui/dom.js` 的小型渲染工具。

### R5 样式单一来源
- token 只在 `ui/styles/tokens.css` 定义一次。
- 消除 `sidepanel.css` 与 Tailwind `dist/` 双轨心智；视觉零漂移。

### R6 类型与测试
- `shared/` 与 `ui/state/` 全量 JSDoc `@typedef`。
- vitest 对 `shared/` + `ui/state/` 覆盖率 ≥ 80%，接入质量门禁。

### R7 桌面版准备
- `platforms/desktop/`（Electron）加载**同一套** `ui/`，内嵌 host，无需 native messaging。
- Chrome 扩展渠道保留，双端复用同一 UI 代码。

### R8 行为冻结
- 重构期间不新增功能。每次搬迁/拆分必须行为等价，以 `dev-loop` 回归为门禁。

## Acceptance Criteria

- [ ] AC1 `rg "chrome\." packages/shared packages/ui` 无结果（仅 platforms 命中）
- [ ] AC2 ESLint 边界规则 0 违规
- [ ] AC3 `entries/sidepanel.js` < 120 行；无单文件 > 400 行的 UI 模块
- [ ] AC4 UI 侧无直接 `chrome.storage` 调用；`repository` 为唯一卡片读写入口
- [ ] AC5 token 单一来源；`dev-loop` 多宽度截图与 computed-style 断言全绿
- [ ] AC6 vitest `shared/` + `ui/state/` 覆盖率 ≥ 80%
- [ ] AC7 Electron 桌面窗口可打开 UI，读写同一 `host/data/journal.db`
- [ ] AC8 Chrome 扩展 load unpacked 正常，side panel 与 options 功能不回归
- [ ] AC9 每个子任务独立可验收、可回滚；父任务通过最终集成回归

## Constraints

- 不引入前端框架（保持原生 ES modules）；Electron 仅作桌面壳。
- 不引入打包器（Chrome 侧仍"加载 unpacked 免构建"）。
- 迁移必须保留 git 历史可追溯（优先 `git mv`）。
- 任何一步都必须保持可运行、可提交。

## Non-goals

- 不做 UI 视觉重设计。
- 不做数据模型变更（Field Registry 维持现状）。
- 本期不发布桌面正式版，仅 PoC 验证可复用性。

## Notes

- 子任务按 `implement.md` 定义的顺序执行，但 Trellis 父子关系不是依赖系统，
  顺序约束写在 `implement.md` 与各子任务 prd 中。
- 执行前必须完成 `baseline-cleanup`，确保工作树干净、基线可复现。
