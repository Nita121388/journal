# 日历视图视觉重构：公共卡片组件 + Milkdown 内容渲染

## 背景

侧边栏「日历/日程」区的三个视图（月 `calview-month-grid`、周 `calview-week-grid`、日时间线）
各自维护一套卡片渲染：

| 视图 | 渲染函数 | 卡片 DOM |
|---|---|---|
| 月 | `views/rightview.js` `buildCalSummary` | `.calview-summary`（时间 + 图标 + 标题） |
| 周 | `views/week.js` → `views/timeline-card.js` | `.timeline-card` |
| 日 | `views/timeline.js` → `views/timeline-card.js` | `.timeline-card` |

视觉参考（用户提供两张截图，Obsidian「达达清单」插件）：

- 月格：每格内是**彩色事件 pill**（类型色底 + 圆形图标 + 标题截断 + 右对齐时间），最多 3 条 + `+N`
- 日期头：大号日期数字 + 农历/节日副标；今天用红底「今天」标
- 周视图：时间块内「图标 + 标题」首行、`09:00–10:00` 次行，粉/绿/蓝/紫四系配色
- 视图切换：底部浮动 dock（日/周/月/日程/清单/列表）

## 目标

1. **统一卡片组件**：月/周/日三视图共用一套卡片渲染，样式与交互不再分叉。
2. **视觉向参考图对齐**：类型/标签决定色系，pill 形态、时间位置、今天标记、当前时刻线。
3. **块内容用 Milkdown 渲染**：卡片正文（Markdown）在展开态/详情态用 Milkdown 真实渲染，
   格内 pill 用轻量只读渲染（性能红线，见约束）。

## 范围

**包含**
- `views/calendar-card.js`（新）— 公共卡片组件：`renderCardPill` / `renderCardBlock` / `renderDayHeader`
- `views/milkdown-mount.js`（新）— Milkdown 只读挂载器（单实例复用池 + 懒挂载 + 卸载）
- `views/month.js`（新，从 `rightview.js` 抽出 `renderMonthGrid`）
- `views/week.js`、`views/rightview.js`、`views/timeline-card.js`、`views/timeline.js` 适配
- `shared/md-lite.js`（新）— 极简只读 Markdown → 纯文本/结构（格内 pill 用，零依赖）
- `styles/tokens.css` + `sidepanel.css`：卡片色系 token、pill/block/day-header 样式
- 视图切换改为底部浮动 dock（含月/周/日，保留原顶部按钮做可访问入口或一并移除，见设计）

**不包含**
- 卡片编辑器（`features/card-editor.js`）的富文本化 / 双向编辑
- 清单、列表、日程（day）之外的新视图（参考图里的「清单/列表」不做）
- 农历/节日数据源接入（副标先用占位/可选开关，不引入数据依赖）
- host / 数据模型变更

## 约束（硬）

1. **性能红线**：Milkdown 实例数受控。月视图 42 格 × N 卡**不得**各挂一个 ProseMirror 实例；
   只允许「展开态/详情态」挂载，同时存活实例 ≤ 2，其余用轻量渲染。
2. **零框架、可打包**：`extension/` 目前无 JS 构建链路。引入 Milkdown 必须新增
   本地打包（esbuild）产物并提交进仓库，保持 Chrome load unpacked 免构建。
   产物为单文件 IIFE/ESM bundle，**不得**使用 CDN（MV3 CSP `script-src 'self'`）。
3. **分层铁律**：`shared/` 零 DOM；`components/` 只放 DOM 原子；`views/` 渲染；
   不允许 `views/` import `entries/`；`chrome.*` 只在 `platform/`。
4. **安全**：用户内容一律 `textContent`；Milkdown 渲染的是**用户自己写的 Markdown**，
   必须关闭 HTML 解析（不启用 `html` 插件），禁止 `innerHTML` 拼接用户内容。
5. **可访问性**：pill/block 键盘可达（Tab + Enter），今天标记不只靠颜色，焦点环可见。
6. **设计 token**：不得新增硬编码 hex；色系进 `styles/tokens.css` 语义层，暗色自动跟随。
7. **回归**：`npm run lint` 0 error、`npm test` 全绿、dev-loop 多宽度（320/360/400/500）全绿。

## 验收标准

- [ ] 月视图格内显示彩色 pill（图标 + 标题 + 时间），最多 3 条 + `+N`，`is-today` 有红标
- [ ] 周/日视图的卡片与月视图 pill **同源**（同一个 `calendar-card.js`），改色改样式一处生效
- [ ] 卡片展开/详情时正文以 Milkdown 渲染（加粗/列表/代码/引用正确显示），卸载后实例被销毁
- [ ] 同时存活 Milkdown 实例 ≤ 2；月视图切月无内存/卡顿回归（dev-loop 断言）
- [ ] `npm run build:js` 可复现产出 `dist/milkdown.bundle.js`（或等价），已提交
- [ ] lint / test / dev-loop 全绿；320px 无横向滚动
- [ ] 暗色主题下色系与文字对比度达标（≥4.5:1 正文）
