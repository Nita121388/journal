# 引入 Tailwind CSS v4 构建链并渐进迁移 UI

## Goal

为 Journal Chrome MV3 侧边栏引入 Tailwind CSS v4 的**本地构建链**，把现有手写 CSS 从「唯一实现」降级为「可逐步替换的存量」，并完成第一批高频简单区域的 utility 化迁移。目标不是全量重写，而是在保持零回归的前提下，让后续 UI 迭代可以更快、更不易出错。

## Background / Confirmed Facts

- **现状**：纯手写原生 CSS，`sidepanel.css` 2745 行 / 594 条规则 / 125 个分段，`options.css` 554 行；HTML 用 `<link rel="stylesheet">` 直接加载，**无任何构建步骤、无 npm 依赖**。
- **项目历史**：全历史 97 提交 + reflog 均无 tailwind/postcss 痕迹；用户记忆中「前几天做过」经核实不存在（实际在 `cc-switch` v3.4.17 与 `monthly-log-web` v4.3.3 两个其它项目）。本项目是从零引入。
- **硬约束（MV3）**：CSP `script-src 'self'`，**禁止 CDN 版 `<script src>`**；因此 Tailwind 只能走本地 CLI 构建成静态 CSS 产物，不能用浏览器构建。
- **硬约束（现有 CSS 变量）**：设计系统 spec（`.trellis/spec/frontend/design-system.md`）已确立「三层 token（primitive → semantic → component）」+ 29 个 CSS 变量 + `[data-theme="dark"]` 主题。这些必须保留，Tailwind 通过 `theme` 读取它们作为 source，不推翻。
- **不可 utility 化的部分（实测）**：
  - 时间线/周历/热力图大量 `style.top/height/left` 是**运行时 JS 计算定位**（`scheduleHeight()` = `(mins - viewStartMin) / 15 * SLOT_HEIGHT`），34 处 `style.*` 中 14 处 `style.top`、9 处 `style.height`、4 处 `style.left` 属此类。
  - 周视图 7 列网格、15 分钟网格线、短/长卡片三态布局、日历格子着色，均是复杂组件 CSS。
  - 设计系统 spec 明确「功能图标 = SVG、内容 emoji = emoji」「禁止硬编码 hex、禁止内联 style 控制视觉」等反模式，迁移不得破坏这些。
- **可 utility 化的高频属性实测密度**（sidepanel.css）：padding 103、border-radius 95、font-size 93、color 91、display 86、border 79、gap 60、cursor 48、align-items 43。集中在按钮/chip/徽标/间距/空状态等简单区域。
- **回归手段**：`dev-loop`（Playwright 多宽度截图 + 断言 + console 检查）是本项目 UI 改动的既有质量门；`npx eslint extension/` 是静态门。

## Requirements

### R1 构建链（核心交付）
- 引入 `tailwindcss@4`（v4 零 config，CSS-first，用 `@import "tailwindcss"` + `@theme`），devDependency 装在扩展侧构建作用域。
- 提供构建命令产出静态 CSS 产物（建议 `extension/dist/sidepanel.css`），**产物提交进仓库**（Chrome 加载 unpacked 目录，不跑 npm 也能用）。
- 构建命令幂等、可重复执行；不改动 `manifest.json`（无需新权限）。
- **回退开关**：HTML 仍可一键切回原 `sidepanel.css`（保留原文件不动）。

### R2 Token 桥接（保 spec 不被破坏）
- Tailwind `theme` 读取现有 CSS 变量作为 source（颜色/字体/间距/圆角/阴影/动效），使 `bg-surface`、`text-muted`、`r-md`、`shadow-1` 之类 utility 解析到既有 token，**不新增硬编码 hex**。
- `[data-theme="dark"]` 主题切换继续生效（Tailwind utility 必须跟随 token 变化，而非写死 light 值）。
- 反模式清单（设计系统 spec §8）继续作为迁移硬门。

### R3 第一批迁移范围（高频简单区域）
- 仅迁移「按钮、筛选 chip、状态徽标、间距/对齐、空状态、Toast」这类简单高频区。
- 复杂组件（时间线画布、周视图网格、日历、热力图、卡片编辑弹窗主体）**本轮不迁移**，保留现有组件类。
- 每迁移一处，从 `sidepanel.css` 删除对应冗余规则（不双份维护）。

### R4 质量门
- 每批改动后：`npm run lint`（不新增错误）；`node dev-loop/dev-loop.mjs --width 320,360,400,500` 回归全绿、无 console error。
- 多宽度（320/360/400/500）、亮/暗主题、reduced-motion 下无横向滚动/无内容截断。

## Acceptance Criteria

- [ ] `tailwindcss@4` 装为 devDependency，构建命令可产出与原样式视觉等价的 CSS（dev-loop 多宽度截图无回归）。
- [ ] 产物为本地静态 CSS，扩展在 `chrome://extensions` 重载后正常打开，console 无 error，manifest 未新增权限。
- [ ] Tailwind `theme` 桥接既有 CSS 变量；`[data-theme="dark"]` 下 utility 跟随 token 变暗色。
- [ ] 第一批区域（按钮/chip/徽标/空状态/Toast）已用 utility 表达，且对应冗余 CSS 规则已删除。
- [ ] 时间线画布、周视图网格、日历、热力图**行为完全未变**（回归全绿即证）。
- [ ] 34 处运行时 `style.*` 定位逻辑未被 utility 化破坏（`scheduleHeight` 等算法路径不变）。
- [ ] `npm run lint` 不新增错误（存量 23 处 unused-vars 见 Notes）。
- [ ] 提供回退方式（`git revert` 本次 commit 即可完整回退；原组件类规则在 HEAD 中可恢复）。

## Out of Scope

- 全量重写 594 条 CSS 规则为 utility class。
- 时间线/周历/日历/热力图等复杂组件的 utility 化（后续任务）。
- 引入 CSS-in-JS / 任何 UI 框架（React 等）——保持无框架纯 ES module。
- 引入 PostCSS 额外插件链（v4 原生足够）。
- 扩展 CSP/manifest 权限变更。

## Open Questions

- 构建工具选型：`tailwindcss@4` CLI 直接跑（最简）vs 引入 Vite 打包（更通用但更重）？——倾向 CLI 直接跑，因项目无打包需求、只要一个 CSS 产物。implement 阶段定。
- devDependency 装在哪：根 `package.json`（新建）vs `extension/package.json`（现有空壳）？——倾向 `extension/package.json` 复用现有文件。

## Notes

- 用户已确认「ok go」，同意建任务并按此方案开工。
- 关键判断：Tailwind 在本项目的价值在「高频简单区」而非「复杂网格/运行时定位」。因此渐进迁移优于大爆炸重写。
- 本轮已可完整回退（`git revert`），原组件类规则保留在提交历史中。

## 执行结果（2026-09-30 交付）

**已完成**：
- R1 构建链：`tailwindcss@4.3.3` + `@tailwindcss/cli`；`src/tailwind.css` → `dist/sidepanel.css`（产物提交，加载 unpacked 免构建）；脚本 `build:css` / `watch:css` / `build:css:min` / `lint`。
- 关键决策落地：**不引 preflight**（用 `@import "tailwindcss/theme" + "tailwindcss/utilities"` 两段式），避免全站 reset 与既有 594 条规则打架；加载顺序 `dist` 先 / `sidepanel.css` 后。
- R2 token 桥接：关键发现——普通 `@theme` 会产生 `--color-accent: var(--color-accent)` **循环引用**导致 utility 失效；必须用 **`@theme inline`**（内联右侧 var()，运行时由 `sidepanel.css :root` 提供真值），暗色切换自动跟随。颜色别名 canvas/surface/ink/muted/line/accent。
- R3 第一批迁移：`.section-label` `.section-header` `.section-badge` `.btn-primary` `.btn-secondary` `.chip` `.empty-state` `.toast` 共 8 个组件迁入 `@layer components`，对应 `sidepanel.css` 规则已删除（不双份维护），HTML 类名不变。toast 的 danger/warn/on-accent 提为语义 token（值与迁移前一致，零视觉变化）。
- R4 质量门：新增 dev-loop `tailwind-migrated` 场景（20 项 computed-style 断言：token 桥接、级联顺序、暗色跟随、圆角/边框/背景精确值、toast z-index/字号、toast danger/warn/on-accent token 解析）；三场景（smoke / tpl / tailwind-migrated）× 四宽度（320/360/400/500）全绿、无 console error；截图与迁移前像素级一致。运行时定位 27 处 `style.top/height/left` 未动。

**复盘修复（check 阶段发现并修正）**：
1. **`.toast` z-index 回归**：迁移时用了 Tailwind 默认 `z-50`，把原 `z-index: 200`（设计 token `--z-toast`）降到 50，会被抽屉（100）/模板弹层（120）盖住——改为 `z-[200]` 恢复。
2. **`.empty-state` 字号丢失**：原规则 `font-size: 12px` 未迁入，会退回浏览器默认字号——补 `text-[12px]`。
3. **toast danger/warn/on-accent 在 `src/tailwind.css` 写死 hex**（违反 §8 反模式）：把真值移到 `sidepanel.css :root` 语义层，`@theme inline` 只留 `var()` 引用（与 accent/surface 同一模式，避免 dist 自引用循环）。
4. **`--radius-lg` 与 design-system §1.1 不一致**（10px vs 12px）：对齐为 12px。
5. **dev-loop 断言缺口**：原场景未覆盖 z-index/字号/toast 变体，新增 7 项断言锁死上述回归。

**过程中发现并修复的问题**：
1. **Tailwind v4 无 `components` 子路径导入**（那是 v3）——改为直接用 `@layer components`。
2. **`@theme` 循环引用**——用 `@theme inline` 修正（否则 `bg-accent` 等全部失效）。
3. **dev-loop 场景返回契约不一致**——`runTpl/runSmoke` 返回 `{checks}`，新场景返回裸数组导致 harness 崩溃；统一为 `{checks}`。
4. **eslint 从未真正落地**——spec 要求 `npx eslint extension/`，但仓库无任何 eslint 配置/依赖；补齐 ESLint 9 flat config（`extension/eslint.config.js`）。

**已知遗留（非本任务引入，建议独立任务）**：
- `sidepanel.js` 有 23 处存量 `no-unused-vars`（死 import / 未用变量），本次未动以避免行为风险；已在 quality-guidelines.md 记录为基线缺口。
- 时间线画布、周视图网格、日历、热力图、卡片编辑器等复杂组件**未迁移**，保留原生 CSS（运行时定位无法 utility 化）；后续可逐块评估。

**回退**：`git revert b219cfc`（或 `git revert a43c86a..b219cfc`）即可完整回退，原组件类规则在历史中。
