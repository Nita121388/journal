# 扩展自主调试闭环（dev-loop）

> 本项目已落地一条让 **AI agent / 开发者自主验证扩展 UI** 的闭环：改代码 → 热更新 → 多宽度截图 → 断言 → 报告。全程零接触现役环境。

## 快速使用

```bash
cd dev-loop
node dev-loop.mjs --width 360,400,500     # 截图 + report.md（out/<ts>/）；退出码 0=通过
node dev-loop.mjs --width 360 --headed    # 有头模式人工观察
```

## 关键约束（不可违背，来自实测与官方文档）

| 约束 | 原因 |
|---|---|
| 必须用 Playwright **自带 Chromium**（`channel:'chromium'`） | Chrome/Edge 已移除 `--load-extension` 侧载开关 |
| side panel 用**多宽度视口**模拟 | side panel 宽度无法程序化设置（issue #1011 已关闭） |
| **热更新用页面级 `page.reload()`** | UI 改动（`entries/` `views/` `features/` `components/` 与 CSS/HTML）在页面上下文；实测 PASS |
| 改 `platform/background.js` 需**重启 browser context** | `chrome.runtime.reload()` 后无新 SW 事件、页面短暂 BLOCKED |
| 加载**测试构建**（扩展复制到临时目录 + 端口改写） | 产品扩展硬编码 host 端口；测试需端口/数据/存储全隔离 |
| 现役 8765/8766 host **零影响** | harness 用临时端口 + 临时数据目录，现役不碰 |

## 扩展新场景

在 `dev-loop/scenarios/` 新增模块导出 `runScenario({ page, width }) → { checks }`，在 `dev-loop.mjs` 注册，用 `--scenario <name>` 调用。

> Gotcha：`--theme` 参数只对 `audit` 场景生效。其他场景要断言暗色必须自己在
> `page.evaluate` 里 `setAttribute('data-theme','dark')`（`shell` 与 `tailwind-migrated` 都这么做）。
> 切回亮色后记得 `waitForTimeout(250)` 再截图——token 翻转会重启 `background-color` 过渡，
> 否则末尾的全页截图会拍到「过渡中间色」，看起来像配色错了。

## 与本项目的关系

- 扩展源码在 `extension/`（分层见 [Directory Structure](./directory-structure.md)）；dev-loop 只**读取**它做测试构建，绝不写入。
- host 见 Backend 规范；dev-loop 以 `JOURNAL_PORT`/`JOURNAL_DATA_DIR` 环境变量起隔离 host。
- UI 改造（第一轮及后续）后**必须**用 dev-loop 回归，作为质量门之一。

## 已有场景

| 场景 | 守住什么 |
|---|---|
| `smoke` | 首屏布局、host 状态、键盘可达、空态动作；卡片页脚「标记完成」常驻且无「切换类型」、默认图标为线稿（类型退场） |
| `shell` | 外壳结构：`.view-modes` 已删除、`#view-dock` 唯一驱动 `data-mode`、外壳按钮零功能 emoji、header 44px、无横向滚动、dock 无 `backdrop-filter`、`.section-label` 无 uppercase/tracking、header+dock 按钮 Tab 可达且 2px 焦点环（亮暗各一遍） |
| `audit` | 主题 × 视图模式截图与度量 |
| `tailwind-migrated` | 迁移到 `@layer components` 的组件 computed-style + 暗色跟随 |
| `select` / `tpl` / `llm` / `options` | 下拉框、模板构建器、LLM 设置、设置页 |
| `calendar-visual` | 日历公共组件同源、色系 token 生效、今天标记、Milkdown 展开态、无横向溢出 |
| `week-readable` | 周视图窄栏可读性：无横向溢出、标题不被压成逐字竖排、同列卡不重叠（叠放需有 `+N` 说明）、卡片底色不透明、`+N` 字号 ≥9px |
| `editor` | 卡片编辑器：默认属性行 = 状态/标签、**无「类型」下拉且头部无「文本/任务/想法」文案**、未选图标时图标位是线稿、弹窗内无功能 emoji（内容 emoji 白名单）、遮罩 `backdropFilter=none`、保存=solid/md 取消=outline/md、版本徽标 = `manifest.version`、模板下拉含「空白」项 |

`calendar-visual` 的用法（需要数据才有卡可展开）：

```bash
cd dev-loop && node dev-loop.mjs --scenario calendar-visual --seed --width 320,360,400,500
```

它额外产出 `cal-month-<w>.png` / `cal-week-<w>.png` / `cal-timeline-<w>.png` / `cal-detail-<w>.png`，
便于人工核对视觉方向（scenario 通过 `outDir` 参数自行截图）。

`week-readable` 自带播种：它需要**同列重叠**的卡片才测得出「叠放 + `+N`」，
所以场景内部会 POST 4 张卡到隔离 host（只播一次）再 `page.reload()`。
因此它必须拿到 host 端口 —— dev-loop 把 `hostPort` 一并传给场景；
`--host-mode off` 下拿不到端口，场景会退化成「无卡可断言」。

```bash
cd dev-loop && node dev-loop.mjs --scenario week-readable --width 320,360,400
```
