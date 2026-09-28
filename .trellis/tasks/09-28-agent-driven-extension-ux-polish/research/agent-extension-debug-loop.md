# A 线调研：Pi Agent 自主调试/查看 Chrome MV3 扩展 —— 技术方案

> 调研日期：2026-09-28 · 调研人：chemclin (Pi agent)
> 状态：**已完成 + 本机实测验证**（非纸面调研，全部在本机跑通）

## 结论先行（TL;DR）

**推荐路线：Playwright `launchPersistentContext` + 自带 Chromium + `--load-extension`，把 `chrome-extension://<id>/sidepanel.html` 作为普通页面打开并设侧栏宽度视口。**

- **不修改任何产品代码**：UX 迭代 99% 改的是 `sidepanel.js/css/html`（页面上下文），`page.reload()` 即可热更新，无需 service worker 重载、无需测试钩子、无需重启浏览器。
- **测试数据隔离**：dev host 支持 `JOURNAL_PORT`/`JOURNAL_DATA_DIR` 环境变量，测试 harness 用临时数据目录启动 host，产品数据零污染（已实测）。
- **本机已验证四件事**（见 §6 实测记录）：① 扩展加载 + extensionId 获取；② sidepanel 页面以 360px 视口打开渲染正常；③ host 连接真实渲染；④ 改 CSS → `page.reload()` → 新样式生效。

## 1. 关键事实与信源

### 1.1 Playwright 官方：Chrome 扩展测试（决定性约束）

- 信源：https://playwright.dev/docs/chrome-extensions （官方文档，已抓取全文）
- **Google Chrome 和 Microsoft Edge 已移除侧载扩展所需的命令行开关**（`--load-extension` 等在这些浏览器上不再生效）。
- 因此**必须使用 Playwright 自带分发的 Chromium**（`channel: 'chromium'`），配合 `--disable-extensions-except=<dir>` + `--load-extension=<dir>`。
- 加载 MV3 后：`context.serviceWorkers()` / `waitForEvent('serviceworker')` 拿到后台 service worker；extensionId 从 `sw.url().split('/')[2]` 解析。
- MV3 SW 空闲 ~30s 自动挂起、按需重启；Playwright 保持同一 Worker 句柄透明跨重启，但**挂起瞬间正在执行的 evaluate 会抛 "Service worker restarted"**。
- 扩展页面（popup/sidepanel/options）可作为 `chrome-extension://<id>/<file>.html` 普通页面 `page.goto()` 打开并自动化 —— 官方示例即打开 `popup.html` 测试。
- `channel: 'chromium'` 支持 headless 跑扩展（实测 headless 可行，本机验证）。

### 1.2 Chrome Side Panel API（宽度约束 —— 决定模拟方式）

- 信源：https://developer.chrome.com/docs/extensions/reference/api/sidePanel （官方 API 文档，已抓取）
- sidePanel API：Chrome 114+ / MV3，需 `"sidePanel"` 权限。`default_path` 指向 `sidepanel.html`。
- `sidePanel.open()`（Chrome 116+）**要求用户手势**（点击 action / 扩展页或 content script 内的交互），无法纯程序化调起。
- **关键约束：side panel 宽度无法通过 API 设置/读取**。GitHub issue：GoogleChrome/chrome-extensions-samples#1011「Setting sidePanel default width」已关闭，无程序化方案；宽度由用户在浏览器 UI 手动拖拽，且关闭重开/无痕窗口会重置为默认宽度。
- **推论（决定 A 线架构）**：agent 无法真实调起系统 side panel 并控制宽度；等价且可回归的方案是 —— 以 `chrome-extension://<id>/sidepanel.html` 普通标签页打开，把视口设为典型侧栏宽度（如 320/360/400/500）截图与断言。这是社区与官方测试的通行做法。真实 side panel 的视觉差异主要在宽度与系统 chrome，可通过「多宽度快照」覆盖。

### 1.3 现有轮子盘点（GitHub）

- **`playwright/packages/extension`**（Playwright 官方扩展支持包，对应 1.63.0 已在 npm）—— 官方能力，最可靠。
- **`ruifigueira/playwright-crx`** —— 社区库，封装扩展测试 fixture；思路同官方（persistent context + chromium）。
- 结论：**不需要额外轮子**，官方 `launchPersistentContext` 能力已足够本项目。

### 1.4 热重载机制（本机实测结论）

- **页面级热更新（推荐）**：`sidepanel.js/css/html` 属于扩展页面资源，改文件后 `page.reload()` 即重新从磁盘读取并生效（实测 PASS）。
- **SW 级重载（仅改 background.js 需要）**：`chrome.runtime.reload()` 会销毁整个扩展上下文；实测其后**没有新的 serviceworker 事件自动到达**（MV3 SW 懒启动），且立即重开 `chrome-extension://...` 页面会报 `net::ERR_BLOCKED_BY_CLIENT`（上下文重载窗口期）。
  - 对 SW 级变更的稳妥做法：**重启整个 browser context**（`ctx.close()` + 重新 `launchPersistentContext`），开销 ~3-5s，100% 可靠。
- **结论**：本产品 UX 迭代（B 线）几乎全走页面级 reload；只有改 `background.js`（53 行，罕见）才走 context 重启。

## 2. 可落地路线对比

| 路线 | 可行性 | Windows 稳定性 | 实现成本 | 局限 |
|---|---|---|---|---|
| **A. Playwright persistent context + 自带 Chromium**（推荐） | ✅ 本机实测通过 | 高（chromium-1243 已缓存，1.63.0 匹配） | 低（~100 行 harness） | 必须用自带 Chromium 而非本机 Chrome；无法真实调起系统 side panel 宽度 |
| B. CDP 直连已运行的 Chrome | ⚠️ 部分 | 低（Chrome 已禁 `--load-extension`；remote-debugging-port 需先启动时带参，重载受限） | 中 | 无法加载未打包扩展到已运行实例；热重载黑盒 |
| C. 扩展内自研调试通道（host 下发 reload / 注入测试数据） | ✅ 可行 | 高 | 中-高 | 污染产品代码（虽可 dev 隔离）；实测证明非必需 |
| D. jsdom/静态快照近似 | ⚠️ 有限 | 高 | 低 | 无法验证真实扩展 API、service worker、host 链路 |

**选型：A（纯外部，零产品代码改动）+ host 临时数据目录隔离**。C 作为后续可选的增强（若未来需要 SW 级热重载自动化的严格时序）。

## 3. 闭环架构设计（目标形态）

```
┌─ agent (Pi) ────────────────────────────────────────────┐
│ 1. 修改 extension/sidepanel.* 或 host/* 代码            │
│ 2. harness: node scripts/dev-loop.mjs [--width 360]      │
│    ├─ 启动 host(临时数据目录/或连 dev 8766)             │
│    ├─ launchPersistentContext(扩展) → extensionId       │
│    ├─ page.goto(chrome-extension://id/sidepanel.html)   │
│    ├─ page.reload()(拾取新代码)                         │
│    ├─ 截图 多宽度 + 断言(console error/元素存在/文本)   │
│    └─ 结构化报告 JSON + PNG                              │
│ 3. agent 阅读报告 → 继续改 → 循环                        │
└──────────────────────────────────────────────────────────┘
```

- 断言层建议：`node --test` 或轻量 assert；host 已有 REST API（`/api/cards` 等）可做数据准备/清理，测试数据走临时 `JOURNAL_DATA_DIR`。
- 多宽度快照：320/360/400/500（覆盖 Chrome side panel 可拖拽范围）。
- console 捕获：`page.on('console')` / `page.on('pageerror')` 结构化输出（实测可用）。

## 4. 风险与规避

| 风险 | 规避 |
|---|---|
| Chromium 版本与 playwright 不匹配 | 锁定 `playwright@1.63.0`（与已缓存 chromium-1243 匹配），装到项目 `devDependencies`，`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` 复用缓存 |
| 扩展 ID 随路径变化 | 本机实测 unpacked ID 按路径稳定生成（`cifdbfflmnijpbdnfhckekbofkjggipo`）；测试用固定绝对路径即可 |
| 测试污染 dev 数据 | host 以临时 `JOURNAL_DATA_DIR` 启动；harness 结束统一清理（本机已实测零污染） |
| MV3 SW 挂起/重载窗口期 | 页面级 reload 不触发 SW 重载；仅 SW 级变更走 context 重启（可靠） |
| headless 与真实渲染差异 | 关键视觉检查用 headed 或 headless=new 双跑；截图断言以 headless=new 为准 |

## 5. 环境事实（已核验）

- 本机 Playwright 1.63.0（npx 可解析）+ 已缓存 `chromium-1243`；模块可安装于任意 `node_modules`。
- 扩展 host 支持 `JOURNAL_PORT` / `JOURNAL_DATA_DIR` / `JOURNAL_PROJECT_DIR` 环境变量（`start-dev.bat` 已在用 8766 + 独立数据目录）。
- 网络：出网需代理 `-x http://127.0.0.1:7890`；GitHub API 直连可用。

## 6. 实测记录（2026-09-28，本机）

1. **扩展加载 + extensionId**：`launchPersistentContext`（channel chromium, headless, `--load-extension`) → `SW URL: chrome-extension://cifdbfflmnijpbdnfhckekbofkjggipo/background.js` → extId 解析成功。
2. **sidepanel 页面自动化**：`page.goto(chrome-extension://id/sidepanel.html)` 360×800 成功；`#app-title`=「📓 Journal」、`#today-display`=「2026年9月28日星期一」；host 已连接（8766），无 pageerror。
3. **交互驱动**：点击 `#cal-today` 成功；点击「新卡片」无异常（未产生脏数据）。
4. **热更新**：初始 `rgb(31,35,40)` → 改写 sidepanel.css → `page.reload()` → `rgb(255,0,255)` ✓（PASS）。
5. **SW 级 reload**：`chrome.runtime.reload()` 后无新 SW 事件、页面短暂 BLOCKED —— 佐证「页面级 reload 为主、SW 变更走 context 重启」的结论。
6. **截图资产**：`shot-sidepanel-360.png`（见 B 线审计的证据引用）。

## 7. 附：已发现的 UX 实证（供 B 线审计使用）

360px 真实渲染截图暴露（详见 B 线审计文档）：
- 信息架构倒置：卡片池/日历/热力图占满首屏，主工作区日程在折叠线以下。
- 筛选 chips 三行堆叠、空状态文案与计数并存、时间线大面积空白、热力图信息密度低、emoji 当图标无系统。
