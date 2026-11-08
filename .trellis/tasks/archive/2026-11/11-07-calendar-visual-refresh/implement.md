# 实施计划

> 依赖顺序：shared 纯函数 → 组件 → 视图接线 → 样式 → 构建 → 测试/回归。
> 每个阶段结束都能独立跑通 `npm run lint`，不出现中途红灯。

## 阶段 0：准备（不改行为）

- [ ] 0.1 `extension/package.json` 增加 `build:js` 脚本 + devDeps：`esbuild`、`@milkdown/core`、`@milkdown/preset-commonmark`、`@milkdown/prose`、`@milkdown/ctx`
- [ ] 0.2 新增 `extension/build/build-milkdown.mjs`（esbuild → `dist/milkdown.bundle.js` + `dist/milkdown.css`）
- [ ] 0.3 跑一次构建，确认产物可生成、可被 `import()` 加载（先给一个 `mountReadonly` 骨架）

**验收**：`npm run build:js` 成功，`dist/milkdown.bundle.js` 存在且 < 1MB min。

## 阶段 1：shared 纯逻辑（可单测，零 DOM）

- [ ] 1.1 `shared/md-lite.js`：`toPlainLine(md)` / `toLines(md, maxLines)`
- [ ] 1.2 `shared/md-lite.test.js`
- [ ] 1.3 `shared/format.js` 增加 `cardColorKey(card)` → `'red'|'green'|'blue'|'purple'|'gray'`
- [ ] 1.4 `shared/lunar-lite.js`：`festivalOf(dayKey)`（12 条固定节日，纯查表）
- [ ] 1.5 `format.test.js` / `lunar-lite.test.js` 补测

**验收**：`npm --prefix extension run test` 通过；`shared/` 无 `document`。

## 阶段 2：Milkdown 挂载器（DOM，可降级）

- [ ] 2.1 `views/milkdown-mount.js`：动态 `import()` 产物 + 实例池（`MAX_MOUNTED=2`，LRU）
- [ ] 2.2 暴露 `acquire(el, markdown)` / `release(el)` / `releaseAll()` / `mountedCount()`
- [ ] 2.3 降级：产物加载失败或抛错 → `md-lite` 渲染 + 一次性 `console.warn`
- [ ] 2.4 `views/milkdown-mount.test.js`（mock 动态 import）

**验收**：单测覆盖 LRU/上限/降级；`window.__journalMilkdownMounted` 只读计数可查。

## 阶段 3：公共卡片组件

- [ ] 3.1 `views/calendar-card.js`：`renderCardPill` / `renderDayHeader` / `renderCardDetail`
- [ ] 3.2 `renderCardBlock` = 现 `renderTimelineCard` 抽壳（保留拖拽/缩放/`is-short`）
  - `timeline-card.js` 保留导出 `renderTimelineCard` 作为别名，避免一次性大改
- [ ] 3.3 `views/calendar-card.test.js`
- [ ] 3.4 `vs.expandedCardId` 加入 `state/view-state.js`

**验收**：组件单测通过；`views/` 不 import `entries/`。

## 阶段 4：视图接线

- [ ] 4.1 `views/month.js`：从 `rightview.js` 抽出 `renderMonthGrid`，改用 `renderCardPill` + `renderDayHeader`
- [ ] 4.2 `views/week.js`：改用 `renderCardBlock` + `renderDayHeader`
- [ ] 4.3 `views/timeline.js`：改用 `renderCardBlock`
- [ ] 4.4 `rightview.js` 删除 `buildCalSummary`，`renderRightView` 增加 `releaseAll()`
- [ ] 4.5 卡片展开态：点击 pill/block 上的「展开」或双击 → `renderCardDetail` + Milkdown

**验收**：三视图渲染同源；`rightview.js` < 200 行。

## 阶段 5：样式

- [ ] 5.1 `styles/tokens.css`：卡片色系 token（`--card-{red,green,blue,purple,gray}-{bg,border,text}`，亮/暗两套）
- [ ] 5.2 `sidepanel.css`：`.cc-pill` / `.cc-block` / `.cc-dayheader` / `.cc-detail` / `.cc-dock`
- [ ] 5.3 删除被替代的 `.calview-summary*` 规则（不双份维护）
- [ ] 5.4 dock：SVG 图标 + `sticky bottom`

**验收**：无新增硬编码 hex（除 token 定义处）；暗色下对比度达标。

## 阶段 6：视图切换 dock 接线

- [ ] 6.1 `sidepanel.html` 增加 `#view-dock`
- [ ] 6.2 `entries/bind-views.js` 改为 `[data-mode]` 事件委托（顶部按钮 + dock 共用）
- [ ] 6.3 `markViewMode` 同步两处 `is-active` / `aria-pressed`

**验收**：顶部按钮与 dock 状态同步；键盘可达。

## 阶段 7：回归

- [ ] 7.1 `npm run lint` 0 error
- [ ] 7.2 `npm test`（extension + host + dev-loop）全绿
- [ ] 7.3 `cd dev-loop && node dev-loop.mjs --scenario calendar-visual --width 320,360,400,500`（新增场景）
- [ ] 7.4 `npm run build:css`（若动了 tailwind 源）

**验收**：全绿 + 截图人工核对参考图方向。

## 回滚点

- 阶段 0/1/2 全部为**新增文件**，回滚 = 删除文件 + 还原 `package.json`，零风险。
- 阶段 4 开始改动既有视图：回滚点 = git commit（每个阶段一个 commit）。
- 若 Milkdown 打包受阻：保留阶段 1/3/4/5（视觉重构），仅 `milkdown-mount` 走降级分支，
  功能不缺失（PRD 的 Milkdown 验收项降级为「md-lite 渲染」并记录）。
