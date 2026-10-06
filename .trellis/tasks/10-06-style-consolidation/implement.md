# Implement — 样式收敛：token 单源 + 分段 CSS

> 状态：**已完成**（2026-10-06）

## 执行记录

### S6-1 token 抽取
- [x] `sidepanel.css` 的 `:root`（39 行）+ `[data-theme="dark"]`（14 行）→ `styles/tokens.css`
- [x] `options.css` 的 `:root` + `[data-theme="dark"]` → `styles/tokens-options.css`
- [x] 两个页面 HTML 引入对应 token 文件；原文件删除 `:root` 块

### S6-2 圆角纳入 token 单源
- [x] `styles/tokens.css` 新增 `--r-sm/--r-md/--r-lg`
- [x] `src/tailwind.css` 的 `--radius-*` 改为 `var(--r-*)` 引用，并 `npm run build:css` 重建产物

### S6-3 修正既有不符设计系统的按钮基样式
| 规则 | 原 | 改 |
|---|---|---|
| `.btn-primary` border-radius | `9px` | `var(--r-sm)`（6px） |
| `.btn-secondary` background | `var(--color-surface)` | `var(--color-bg)`（canvas） |

（依据 `src/tailwind.css` 的 `.btn-primary/.btn-secondary` 组件定义 = 设计系统真相源）

### S6-4 顺序契约与文档
- [x] `styles/README.md`：引入顺序 + 自引用陷阱说明
- [x] `.trellis/spec/frontend/design-system.md`：新增「Tailwind 产物 `:root` 自引用」Gotcha

## 关键发现：顺序错误导致 9 项 computed-style 断言失败

第一次把 `styles/tokens.css` 放在 `dist/sidepanel.css` **之前**，`tailwind-migrated` 从 18/20 掉到 **11/20**：

```
btn-primary 背景=accent        ❌ rgba(0,0,0,0)   （应为 rgb(76,175,80)）
btn-secondary 背景=canvas      ❌ rgba(0,0,0,0)
section-badge 背景=cell-empty  ❌ rgba(0,0,0,0)
toast-error/warn/success 背景  ❌ rgba(0,0,0,0)
chip.is-active 背景=accent     ❌ rgba(0,0,0,0)
```

**根因**：`dist/sidepanel.css` 含 `:root, :host { --color-accent: var(--color-accent); … }`（自引用）。
原顺序中 `sidepanel.css` 在产物之后、覆盖了自引用；token 前置后自引用生效 → 变量成环 → `var()` 全部回落透明。

**修正**：tokens 放到 `dist` 与 `sidepanel.css` **之间**，恢复原级联位置。同时用 `git stash` 对比确认基线为 18/20，
从而区分「我引入的 9 项」与「既有 2 项」。

## 验证

| 门禁 | 结果 |
|---|---|
| `sidepanel.css` / `options.css` 无 `:root` | ✅ |
| `npm run build:css` | ✅ 通过，产物已更新 |
| dev-loop `tailwind-migrated` 360/500 | ✅ **20/20**（基线 18/20 → 全绿） |
| dev-loop `smoke` / `select` / `options` / `tpl` | ✅ 15/15 · 46/46 · 10/10 · 17/17 |
| `npm run lint` | ✅ 0 errors |

## 回滚

单次提交即可回滚；token 文件为新增，删除后恢复原内联 `:root` 即回到 S5 状态。
