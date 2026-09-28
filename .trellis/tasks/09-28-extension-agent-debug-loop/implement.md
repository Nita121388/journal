# implement.md — 子任务1 执行计划：dev-loop harness

## 执行检查表（顺序）

- [ ] 1. 建 `dev-loop/`：package.json（playwright@1.63.0，`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`）、.gitignore（out/）
- [ ] 2. `lib/host.mjs`：临时数据目录 + 端口(默认8767) 启动 host；health 探测；复用/独占；cleanup
- [ ] 3. `lib/browser.mjs`：launchPersistentContext + extensionId 解析 + console/pageerror 捕获
- [ ] 4. `lib/report.mjs`：断言/错误聚合 → JSON + Markdown 报告 + 退出码
- [ ] 5. `scenarios/smoke.mjs`：默认场景 —— 首屏渲染（app-title/今日日期/host 状态）+ 点击「今天」+ 无 console error
- [ ] 6. `dev-loop.mjs`：CLI（--width 多档 / --headed / --host-port / --no-host）+ 多宽度循环 + 截图
- [ ] 7. 安装依赖、跑通闭环，产出截图 + 报告
- [ ] 8. 零污染验证：git status 仅预期新增；host/data 无脏记录
- [ ] 9. trellis-check 质量检查

## 验证命令

```bash
cd dev-loop && npm install            # PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
node dev-loop.mjs --width 360,400,500 --headed=false
# 预期: out/<ts>/shot-*.png + report.md 全绿 (exit 0)
```

## 风险文件 / 回滚点

- `dev-loop/` 全部为新增，独立 commit；可整体删除回滚。
- 若 playwright 版本/缓存问题：回退到复用 python 侧 1.62 或重装 chromium（见 research §4 风险表）。

## 完成前检查

- [ ] 一条命令闭环，多宽度截图存在且可读
- [ ] ≥3 条 DOM 断言通过 + console 零 error（smoke 场景）
- [ ] 改 sidepanel.css 后 reload 场景可选验证（预留，不阻塞）
- [ ] dev 产品数据零污染
