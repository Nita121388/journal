# design.md — 子任务1 技术设计：dev-loop harness

## 1. 组件与文件

```
dev-loop/                          （新增，独立于 extension/ 与 host/）
├─ package.json                    锁定 playwright@1.63.0（type: module）
├─ dev-loop.mjs                    主 harness（CLI 入口）
├─ lib/
│  ├─ host.mjs                     host 进程生命周期（临时数据目录隔离）
│  ├─ browser.mjs                  Playwright context 生命周期 + extensionId 解析
│  └─ report.mjs                   断言收集 + JSON/Markdown 报告输出
├─ scenarios/
│  └─ smoke.mjs                    默认冒烟场景（首屏渲染 + 基础交互）
└─ out/                            （.gitignore）截图 + 报告产物
```

## 2. 核心数据流

```
CLI args ──► 解析配置(widths, scenario, host 模式)
         ──► host.ensure()        启动/复用 host(临时 JOURNAL_DATA_DIR + 临时端口)
         ──► browser.launch()     launchPersistentContext(channel:chromium, --load-extension)
         ──► resolveExtensionId() serviceWorker.url() → id
         ──► for each width: open sidepanel.html, wait settle, [scenario actions], screenshot
         ──► 收集 console/pageerror/断言
         ──► report.write()       out/report-<ts>.json + .md
         ──► cleanup()            关 context, 停 host(仅本次启动的), 清理临时数据
```

## 3. 关键契约

| 契约 | 约定 |
|---|---|
| 扩展 ID | unpacked 扩展按路径稳定；仍每次从 `serviceWorker.url()` 动态解析，不硬编码 |
| host 隔离 | `JOURNAL_PORT`（默认 8767 避免撞 dev 8766）+ `JOURNAL_DATA_DIR`（系统 temp 子目录） |
| host 复用 | 若目标端口已有 health 响应则复用（不抢用户进程）；否则自己启动并在结束时只关自己启的 |
| 热更新 | 场景内可调 `reload()` → `page.reload()` + settle，重新截图 |
| 产物 | `dev-loop/out/<timestamp>/shot-<width>.png` + `report.json` + `report.md` |
| 退出码 | 有断言失败或 console error → exit 1（供 agent/CI 判定） |

## 4. settle 策略（稳定性关键）

`page.goto` 后不能立刻截图 —— sidepanel 依赖 host 拉数据。判定就绪条件（任一）：
- `#host-banner` 不可见（host 已连接）且 `#today-display` 有文本；
- 或超时 fallback（默认 8s）后仍截图，但报告标注 `settled: false`。

## 5. 错误处理

- 扩展未加载 / 无 service worker → 立即失败并输出可诊断信息（chromium 路径、args）。
- host 起不来 → 报告 `hostError` 并继续（允许在 host 离线态截图，UI 需能显示 banner）。
- 单宽度失败不影响其他宽度；错误聚合成 report.errors。

## 6. 兼容/迁移

无产品代码改动；不触碰 manifest；`dev-loop/` 可整体删除而不影响产品。

## 7. 取舍

- 用系统 temp 目录而非仓库内 `out/data` → 避免 .gitignore 面扩大。
- 默认 headless（实测可用），`--headed` 供人工观察。
- 场景（scenario）以模块形式可插拔，先只做 smoke，后续 B 线按需加场景。
