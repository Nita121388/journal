# 样式收敛：token 单源 + 分段 CSS

> 父任务：`.trellis/tasks/10-06-package-boundaries-refactor/`
> 前置：`ui-split`（已完成）

## Goal

消除 `sidepanel.css`/`options.css` 与 Tailwind 产物的**双轨心智**：
设计 token 收敛到单一来源，Tailwind 只做别名引用，并把顺序约束固化为契约。

## Requirements

### R1 token 单一来源
- 新增 `extension/styles/tokens.css`：侧栏 `:root` 变量 + `[data-theme="dark"]` 覆盖（唯一来源）。
- 新增 `extension/styles/tokens-options.css`：设置页 token（页面身份不同，值独立、命名契约一致）。
- `sidepanel.css` / `options.css` 不再内联定义 `:root` token。

### R2 Tailwind 只做别名
- `src/tailwind.css` 的 `@theme inline` 全部为 `var()` 引用，不写死值。
- 圆角基础层（`--r-sm/--r-md/--r-lg`）纳入 tokens.css，Tailwind 端 `--radius-*` 引用。

### R3 引入顺序契约
- 固化顺序：`dist/*.css` → `select.css` → `styles/tokens*.css` → 手写组件 CSS。
- 在 `styles/README.md` 与 `design-system.md` 记录「Tailwind 产物 `:root` 自引用」陷阱。

### R4 视觉零漂移
- dev-loop 多宽度截图 + `tailwind-migrated` 的 computed-style 断言全绿（20/20）。

## Acceptance Criteria

- [ ] `styles/tokens.css` / `styles/tokens-options.css` 存在且为唯一 token 定义处
- [ ] `sidepanel.css` / `options.css` 无 `:root` 块
- [ ] `npm run build:css` 通过；`dist/sidepanel.css` 已更新
- [ ] dev-loop `tailwind-migrated` **20/20**（拆分前基线为 18/20，含 2 项既有不符设计系统）
- [ ] dev-loop `smoke` / `select` / `options` / `tpl` 全绿
- [ ] `npm run lint` 0 errors

## Out of scope

- 视觉重设计（只做 token 对齐与来源收敛）。
- 把 3000 行 `sidepanel.css` 按视图物理拆分（记录为后续可选）。
