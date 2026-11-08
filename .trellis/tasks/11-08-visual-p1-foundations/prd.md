# P1 设计基元：token 体系 + SVG 图标 + 按钮组件

## 背景

方向已定 B「Quiet Desk」。本阶段**只换基元，不动布局与 DOM 结构**：
让现役界面在"不改一行 HTML"的前提下先变成新配色/新圆角/新投影，作为后续阶段的稳定地基。
数值依据见父任务 `design.md` §1（色彩/圆角/投影）与 §10（实测校准）。

## 需求

| # | 需求 |
|---|---|
| R1 | `styles/tokens.css` 重写为「新语义 token（canvas/surface/sunken/ink/ink-soft/ink-weak/line/line-2/accent…）+ 旧变量别名」，旧名全部保留并指向新值，确保 `sidepanel.css` 不改也能正常工作 |
| R2 | 亮/暗两套；月历五色系换成新的冷调低饱和值（design.md §1.3），`--cc-*` 名称不变 |
| R3 | 新增尺寸 token：间距 4/8/12/16/20/24、字号 10.5/11.5/12.5/14/17、控件高 24/28/32、圆角 6/7/8/10/12/14、投影 3 档（design.md §1.4/§1.5/§2） |
| R4 | 新增 `components/icon.js`：26 个 inline SVG，统一 24 viewBox / stroke 1.75 / currentColor；导出 `icon(name, opts)` 与 `ICONS` |
| R5 | 新增 `components/button.js`：`button({label,icon,variant,size})` / `iconButton({name,label,size,variant})`，4 变体 × 3 尺寸，含 hover/active/focus-visible/disabled/aria-pressed 五态 |
| R6 | `src/tailwind.css` 的 `@theme inline` 补齐新 token 别名（canvas/surface/sunken/ink/soft/weak/line/accent…），`@layer components` 里的既有组件改用新 token，不写 hex |
| R7 | 重建 `dist/sidepanel.css` 并提交（`npm run build:css`） |

## 约束

- **不改** `sidepanel.html`、`views/`、`features/`、`entries/`（本阶段零结构变更）。
- 不新增运行时依赖；不引 Tailwind preflight。
- `styles/tokens.css` 是唯一允许出现 hex 的文件。
- 保留既有 token 顺序契约：`dist/sidepanel.css` → `select.css` → `styles/tokens.css` → `sidepanel.css`。
- 旧 token 名（`--color-bg` `--color-text` `--color-muted` `--color-border` `--color-accent` `--color-accent-strong` `--color-accent-light` `--color-surface` `--color-card-bg` `--color-card-border` `--color-cell-*` `--color-timeline` `--color-scroll-thumb` `--color-scrim` `--color-danger` `--color-warn` `--color-on-accent` `--color-on-accent-ink` `--color-focus` `--color-hover` `--color-hover-strong` `--prio-*` `--cc-*` `--r-sm/md/lg` `--font` `--font-emoji` `--panel-max-h` `--select-*` `--dur-1/2/3`）**必须全部仍可解析**。

## 验收标准

- [ ] `npm run lint` 0 error；`npm --prefix extension test` 全绿（含新增 `components/icon.test.js`、`components/button.test.js`）
- [ ] `npm --prefix extension run build:css` 成功，`dist/sidepanel.css` 有更新
- [ ] dev-loop `tailwind-migrated` / `smoke` 在 320/360/400/500 全绿、console error = 0
- [ ] 抽查 computed style：`#header` 的 `background-color` 解析为 `--canvas` 的 rgb；`.cardpool-item` 圆角为 12px；`--color-accent` 解析为 `rgb(37,99,235)`
- [ ] 断网/无网络请求：`icon()` 产出的 SVG 不含外链
- [ ] 暗色下对比度断言不回归（`calendar-visual` 场景全绿）
