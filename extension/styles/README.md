# `styles/` — 样式层

**职责**：设计 token 的**唯一**定义处，以及按层组织的基础样式与视图样式。

## 规划内容
| 文件 | 职责 |
|---|---|
| `tokens.css` | `:root` 设计变量唯一来源（颜色/间距/圆角/阴影/字体） |
| `base.css` | reset + 布局骨架 |
| `views/*.css` | 时间线/周历/日历/热力图（保留原生 CSS，运行时定位无法 utility 化） |

Tailwind：`../src/tailwind.css` 的 `@theme` 改为读 token 别名，不重复定义值。

详见 `design.md` §6 与 `.trellis/spec/frontend/design-system.md`。
