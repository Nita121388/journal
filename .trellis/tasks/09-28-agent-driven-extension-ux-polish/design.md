# design.md — 父任务技术设计（跨子任务架构）

> 范围：本文件记录**跨子任务**的架构边界、集成契约与关键取舍。子任务内部细节见各自 design/prd。

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│ Pi Agent (编排者)                                            │
├─────────────────────────────────────────────────────────────┤
│ 子任务1: dev-loop harness (开发工具, 零产品代码)              │
│  ├─ launchPersistentContext(chromium) + --load-extension     │
│  ├─ extensionId ← serviceWorker.url()                        │
│  ├─ open chrome-extension://id/sidepanel.html @多宽度视口      │
│  ├─ page.reload() 热更新 → 截图 → console/pageerror 捕获       │
│  └─ 结构化报告 (JSON + PNG)                                   │
├─────────────────────────────────────────────────────────────┤
│ 子任务2: UX 审计 + 设计系统 (文档)                            │
│  └─ 证据来自子任务1多宽度截图; 产出改造清单 + 设计系统          │
├─────────────────────────────────────────────────────────────┤
│ 子任务3: 第一轮改造 (产品代码) + harness 回归自测              │
└─────────────────────────────────────────────────────────────┘
        ▲ 数据流：子1 产截图/断言 → 子2 消费证据产清单 → 子3 按清单改造并用子1回归
```

**依赖是顺序的，不是并行的**：子1 → 子2 → 子3。父任务/子任务树不是依赖系统，顺序在此显式声明（写在各子任务 PRD）。

## 2. 关键技术决策（已由调研+实测确定）

| 决策 | 结论 | 依据 |
|---|---|---|
| 浏览器载体 | Playwright 自带 Chromium（`channel:'chromium'`） | Chrome/Edge 已禁 `--load-extension`（官方文档） |
| 扩展加载 | `launchPersistentContext` + `--load-extension` + `--disable-extensions-except` | 官方文档 |
| side panel 模拟 | 普通标签页打开 `sidepanel.html` + 多宽度视口(320/360/400/500) | side panel 宽度无法程序化设置（issue #1011 已关闭） |
| 热更新 | 页面级 `page.reload()` 为主；SW 级(改 background.js)重启 context | 实测：页面级 PASS；SW reload 后无新 SW 事件、页面 BLOCKED |
| 测试钩子 | **不需要**（纯外部路线） | 实测证明页面级 reload 足够；host REST API 即可注入数据 |
| 数据隔离 | host 以临时 `JOURNAL_DATA_DIR` 启动 | start-dev.bat 已用该机制；实测零污染 |
| 依赖 | `playwright@1.63.0` 锁版，`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` | 本机缓存 chromium-1243 匹配 1.63.0 |
| 模式捕获 | `page.on('console'/'pageerror')` → 结构化 | 实测可用 |

## 3. 集成契约（子任务间）

- **子1 → 子2**：子1 产出的多宽度截图 + 断言报告作为审计证据（路径契约：截图落在约定目录，报告为 JSON）。
- **子2 → 子3**：审计产出的**改造清单**（含 id/严重度/建议）作为子3 的执行输入；设计系统 token 作为实现规范。
- **子3 自测**：改造后调子1 harness 回归（多宽度 + 断言 + console 零 error）。

## 4. 边界与不变量（不变量）

- **现役 8765 生产环境零影响**：所有自动化只在 8766 dev 副本 + 临时数据目录进行。
- **产品代码零侵入（规划期）**：子1 只加开发工具目录，不改 `extension/` 源码/manifest；子2 只产文档；子3 才改产品代码。
- **工作区纪律**：子1/子2 产出可独立 commit；子3 改造有清晰 commit 边界、可回退。

## 5. 兼容性与迁移

- 无用户数据 schema 变更（子3 改造若触及数据读写需在子3 design 另行说明）。
- 设计系统迁移**增量式**：与现有 29 个 CSS 变量映射，逐步收敛硬编码 hex，不推倒重来。

## 6. 取舍记录

- 选「纯外部 Playwright」而非「扩展内调试通道」：换取产品零侵入，代价是 SW 级热重载需重启 context（对本产品 UI 迭代可接受，因 UX 改动几乎全在页面层）。
- 用「多宽度视口」而非真实 side panel：换取可回归性，代价是无法覆盖系统 chrome 边缘（影响低）。

## 7. 风险

见各子任务 PRD 与 `research/agent-extension-debug-loop.md` §4 风险表。
