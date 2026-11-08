# P3 三视图视觉重建：时间线 / 周视图 / 月视图

## 背景

外壳（P2）已就位，但三个视图仍是旧视觉，且周视图有**可读性硬伤**。
证据：`dev-loop/out/2026-11-08T03-25-03-412Z/cal-week-400.png`
—— 卡片标题按字竖排（列宽被压到 1 字）、浅绿色块半透明叠影、时间与标题挤在同一像素列。

同时现役视觉细节与新体系不符：
- 时间线 `.schedule-canvas` 是「面板里再套一个带边框的卡」，且 15 分钟线是虚线（草稿纸感）。
- 空态是绝对定位的一段文字，没有行动入口，且盖在 canvas 暗底上。
- 时间线卡片用整块 `--cc-bg` 染色（和 B 方向「白卡 + 左色条」不一致）。
- 月视图 pill 高 16px、无固定规格，今日靠整格染色。

## 需求

| # | 需求 |
|---|---|
| R1 | 时间线：去掉 `.schedule-canvas` 的边框/底色，画布直接位于面板 surface 上；小时线 1px **实线** `--line`，15 分钟线不可见（仅作点击/吸附热区） |
| R2 | 时间线小时标签 10.5px `tabular-nums` `--ink-weak`，压在线上方并用 surface 底色断开线条 |
| R3 | 当前时间：`--accent` 2px 线 + 8px 圆点 + `现在 HH:mm` 胶囊（`--accent` 底 / `--on-accent` 字） |
| R4 | 时间线卡片：`--surface` 底 + `inset 0 0 0 1px var(--line)` + `--shadow-1`，左 2.5–3px `--cc-*` 色条；标题 12.5/600 单行省略，元信息 10.5 `--ink-weak`；hover 升 `--shadow-2` 且内描边转 `--line-2`，**不位移** |
| R5 | 时间线空态：居中「线稿图标 + 一句原因 + 一个行动按钮（新建卡片）」，不遮挡点击画布新建；不用绝对定位块 |
| R6 | 周视图：320/360/400 下**无横向滚动**、标题不按字竖排（单行省略或 2 行 clamp）、同列卡片不产生半透明叠影（卡片不透明） |
| R7 | 周视图列宽 `minmax(0,1fr)`；列内重叠时优先保证标题可读（列宽 < 26px 时不做横向分道，改为叠放 + `+N` 折叠） |
| R8 | 月视图：格高 `aspect-ratio: 1/.92`，日期号 11.5，事件 pill 高 14px / 10.5px 字 / 单行省略；今日用 `--accent` 实心圆角标，不整格染色 |
| R9 | 新增 dev-loop 场景 `week-readable`，在 320/360/400 断言：标题元素宽度 > 4 个字宽、同列卡片 `getBoundingClientRect()` 不重叠、容器无横向溢出 |
| R10 | 三视图都要有暗色形态；不新增 `backdrop-filter`、不新增 hex（`tokens.css` 除外） |

## 非目标

- 不改拖拽/缩放/新建槽位的交互语义（只调视觉与防挤压）。
- 不改卡片数据模型与 `views/calendar-card.js` 的导出签名。
- 不改侧栏面板（P4）与弹窗（P5）。

## 验收标准

- [ ] `node dev-loop/dev-loop.mjs --scenario week-readable --width 320,360,400` 全绿
- [ ] `calendar-visual --seed`（亮/暗，320/360/400/500）全绿，色系对比度不回归
- [ ] `smoke` / `tailwind-migrated` / `shell` 全绿
- [ ] 截图对照 `docs/design/directions/b-quiet-desk.html`：时间线卡片是白卡+左色条，小时线是实线，空态有行动按钮
- [ ] `rg -c "backdrop-filter" extension/sidepanel.css` 不增加；新增 CSS 无 hex
