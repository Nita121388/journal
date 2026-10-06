# `styles/` — 样式层

**职责**：设计 token 的**唯一定义处**，以及按层组织的基础样式与视图样式。

## 文件

| 文件 | 职责 |
|---|---|
| `tokens.css` | **侧栏（主界面）** `:root` 设计变量唯一来源（颜色/圆角/字体/尺寸）+ `[data-theme="dark"]` 覆盖 |
| `tokens-options.css` | **设置页** token 唯一来源（不同"页面身份"：成长绿 palette） |

## 引入顺序（不可随意调整）

```html
<!-- sidepanel.html -->
<link rel="stylesheet" href="dist/sidepanel.css">   <!-- Tailwind 产物（utility + 迁移组件） -->
<link rel="stylesheet" href="select.css">
<link rel="stylesheet" href="styles/tokens.css">    <!-- ← 必须紧贴 sidepanel.css 之前 -->
<link rel="stylesheet" href="sidepanel.css">        <!-- 手写组件与视图样式 -->
```

### ⚠️ Gotcha：token 不能放到 Tailwind 产物之前

`dist/sidepanel.css` 由 Tailwind 生成，其中含**自引用**声明：

```css
:root, :host { --color-accent: var(--color-accent); /* … */ }
```

它自身是循环引用（无效）。原先 `sidepanel.css` 在产物**之后**加载，其 `:root` 定义覆盖了自引用，
变量才有值。若把 token 文件挪到产物**之前**，自引用会因级联靠后而生效 →
`--color-accent` 变成「无效值」→ 所有 `var(--color-accent)` 背景回落为 `transparent`。

**实测表现**（dev-loop `tailwind-migrated` 场景从 20/20 掉到 11/20）：
`btn-primary 背景`、`btn-secondary 背景`、`section-badge 背景`、`toast-* 背景`、`chip.is-active 背景` 全部变透明。

**结论**：token 文件必须**晚于** `dist/*.css`、**早于**手写组件 CSS。

## 与 Tailwind 的关系

- Tailwind 的 `@theme inline` 只做 **var() 别名映射**（`--color-canvas: var(--color-bg)`），不重复定义值。
- 圆角 `--r-sm/--r-md/--r-lg` 的真值在 `tokens.css`，Tailwind 端 `--radius-*: var(--r-*)` 引用。
- 复杂组件（时间线画布、周历网格、日历、热力图）保留原生 CSS，不 utility 化。

规范见 `.trellis/spec/frontend/design-system.md`。
