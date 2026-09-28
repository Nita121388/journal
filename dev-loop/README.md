# dev-loop — Agent 驱动的扩展开发闭环

让 Pi/任何 agent **自主调试与验证** Journal Chrome 扩展：改代码 → 热更新 → 打开 side panel 截图 → 交互断言 → 抓 console → 结构化报告。全程**零接触**用户现役环境。

## 为什么需要它

- Chrome/Edge 已移除 `--load-extension` 侧载开关 → 用 Playwright 自带 Chromium（`channel: 'chromium'`）。
- side panel 宽度无法程序化设置 → 用多宽度视口（320/360/400/500）模拟。
- 扩展硬编码 host 端口（8765/8766）→ harness 自动把扩展复制到临时目录、改写端口、加载**测试构建**，实现端口+数据+存储全隔离。

## 快速开始

```bash
cd dev-loop
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install   # 复用已缓存 chromium-1243，不重新下载
node dev-loop.mjs --width 360,400,500            # → out/<ts>/ 截图 + report.md
node dev-loop.mjs --width 360 --headed           # 有头模式人工观察
node dev-loop.mjs --width 360 --host-mode off    # 模拟 host 离线（验证离线 banner）
```

退出码：`0` = 全部断言通过且无 console error；`1` = 有失败/异常（供 agent/CI 判定）。

## 输出

`dev-loop/out/<timestamp>/`：
- `shot-<width>.png` — 多宽度全页截图
- `report.json` / `report.md` — 结构化断言结果 + console 错误

## 工作原理

```
CLI → 隔离 host(临时端口 + 临时数据目录) → 测试构建扩展(端口改写)
    → launchPersistentContext(chromium, --load-extension)
    → 解析 extensionId → 打开 chrome-extension://<id>/sidepanel.html @各宽度
    → smoke 场景断言 → 截图 → 报告 → 清理(host/构建/profile/数据)
```

- **热更新**：UI 迭代（sidepanel.js/css/html）改完直接 `page.reload()` 即生效（实测验证）；只有改 `background.js` 才需要重启 browser context。
- **隔离**：产品源码 `extension/`、`host/` 零改动；用户 8765/8766 现役环境零影响；数据在临时目录，运行结束自动清理。
- **扩展 ID**：每次从 `serviceWorker.url()` 动态解析，不硬编码。

## 断言场景

`scenarios/smoke.mjs` 默认覆盖：首屏渲染（标题/今日日期/host 连接）、点击「今天」交互、卡片池可查询、console 零 error。
扩展新场景：在 `scenarios/` 下新增模块，`dev-loop.mjs` 按 `--scenario <name>` 选择。

## 环境

- Windows 本机已验证；Node ≥ 18；Playwright 1.63.0 + chromium-1243（`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`）。
- `DEV_LOOP_OUT`：自定义报告输出目录（默认 `dev-loop/out/<ts>`）。
- `DEV_LOOP_KEEP=1`：保留临时工作目录（调试用）。

## 注意

- 报告里的截图是**测试构建**渲染，非现役构建 —— 两者差异仅在 host 端口改写，UI 一致。
- 若 host 起不来（端口被占等），harness 报 `hostError` 并继续（截图会显示离线 banner 态）。
