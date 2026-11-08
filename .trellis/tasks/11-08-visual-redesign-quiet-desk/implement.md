# 实施计划 — 纸感克制（Paper Desk）

原则：**每阶段一个可独立回滚的 commit**；每阶段结束跑一遍回归门禁；
不在 prod 环境验证（dev-loop 隔离构建 + dev host 8766）。

## 通用门禁（每阶段都要过）

```bash
npm run lint
npm test
node dev-loop/dev-loop.mjs --scenario smoke --width 320,360,400,500
node dev-loop/dev-loop.mjs --scenario calendar-visual --width 320,400,500
node dev-loop/dev-loop.mjs --scenario tailwind-migrated --width 320,360,400,500
# P5 起追加：
node dev-loop/dev-loop.mjs --scenario options
node dev-loop/dev-loop.mjs --scenario select
```

硬条件：退出码 0、console error = 0、无横向滚动、无硬编码 hex 新增（`styles/tokens.css` 除外）。

---

## P0 方向样张（无代码改动）

- [ ] `docs/design/directions/` 下产出 3 个自包含 HTML：`a-paper-desk.html` / `b-quiet-desk.html` / `c-handdrawn-desk.html`
  - 同一屏内容：header、视图头（两行）、时间线（3 张真实数据卡 + 当前时间）、底部 dock、一张「面板」示意
  - 每份支持 `?theme=dark`，宽度 320 / 400 / 500
- [ ] `index.html` 目录页：并排 iframe 预览 + 每方向一句取舍说明
- [ ] Playwright 截图（3 方向 × 320/400 × 亮暗），存 `docs/design/directions/shots/`
- [ ] 用户目视选定方向与主色 → 记入本任务 `notes`
- **出口**：方向定稿，design.md 的色板/圆角/字体如被调整，先改 design.md 再动代码

## P1 设计基元

- [ ] 重写 `styles/tokens.css`：纸/墨/数据色/尺寸标尺/动效/焦点；亮暗两套；删除旧别名（保留兼容映射一个版本）
- [ ] `components/icon.js` + `components/icon.test.js`
- [ ] `components/button.js` + 测试；把 `.btn-primary/.btn-secondary/.cal-nav-btn/.view-wide-btn/.pool-tool-btn/.skills-toggle-btn/.cardpool-add-btn` 收到基元
- [ ] `src/tailwind.css`：`@theme inline` 补齐新 token 别名；`@layer components` 只留稳定组件
- **出口**：`tailwind-migrated` 全绿；截图对比「只换 token 未换布局」的可读性

## P2 外壳

- [ ] `sidepanel.html`：header 三个图标按钮换 SVG；删除 `.view-modes`；视图头改两行结构；dock 结构保留
- [ ] `entries/bind-shell.js` / `features/*`：`data-mode` 绑定改容器委托；移除对已删按钮的引用
- [ ] `sidepanel.css`：纸面分层替代灰盒；header/视图头/dock 新样式；`.section-label` 去 uppercase/tracking
- **出口**：DOM 断言无功能 emoji；键盘 Tab 顺序通顺

## P3 三视图

- [ ] `views/timeline.js` + `views/timeline-card.js`：实线小时轨、墨线当前时间、卡片节奏
- [ ] `views/week.js`：列宽/clamp/不透明叠放/`+N` 折叠
- [ ] `views/month.js` + `views/calendar-card.js`：月格与 pill 规格
- [ ] dev-loop 新增 `scenarios/week-readable.mjs`（标题非竖排、无重叠、无横向溢出）
- **出口**：`week-readable` 在 320/360/400 全绿

## P4 面板与卡片池

- [ ] `sidepanel.html` 四个 section 统一头部；`views/pool.js` 三段式条目；空状态手绘 SVG
- [ ] `views/heatmap.js` / `views/calendar.js` / `views/skills.js` 对齐新标尺
- **出口**：面板抽屉在 320px 下不挤压主区

## P5 弹窗与附属页

- [ ] `sidepanel.html` 卡片编辑器/模板构建器/app-dialog：属性行图标换 SVG、控件高度统一
- [ ] `options.html` + `options.css` + `styles/tokens-options.css`：同步纸感
- [ ] `select.css`：圆角/高度/焦点环对齐新标尺（两页共享）
- **出口**：`options` / `select` / `tpl` / `llm` 场景全绿

## P6 签名细节与收口

- [ ] 纸纹 PNG（<2KB）+ `body::before`；胶带/图钉按 §6 预算上限
- [ ] `features/prop-llm.js`：AI 生成处加一条极简 trace 行（Solid Glass 信息结构）
- [ ] 暗色全量走查（每个视图 + 弹窗 + options + select）
- [ ] 对比度/键盘/`prefers-reduced-motion` 全量断言
- [ ] 性能：CSS 体积、200 卡渲染计时、`backdrop-filter` 计数
- [ ] 更新 `spec/frontend/design-system.md` → v1.0，并把 `docs/design/directions/` 的取舍写进 spec
- **出口**：PRD §验收标准 1–9 全部通过；`design-system.md` 与实现一致

## 依赖与并行

- P1 是所有阶段的前置；P3 / P4 / P5 可在 P2 后并行推进，但**同一工作区只允许一个写者**：
  串行合并（P3 → P4 → P5），或为并行开 worktree（本仓库禁用 `git clean -xdf`，注意不清理未跟踪产物）。
- P6 必须最后做。
