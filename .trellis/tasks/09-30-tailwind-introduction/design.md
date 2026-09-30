# 引入 Tailwind CSS v4 构建链并渐进迁移 UI — 技术设计

## 1. 架构决策

### 1.1 构建方式：Tailwind v4 CLI 直接跑（不引 Vite）

- **选型理由**：项目零构建、零框架，唯一产物是静态 CSS。Tailwind v4 CLI（`npx @tailwindcss/cli`）零配置、一次命令出一个 css 文件，最贴合。
- **产出位置**：`extension/dist/sidepanel.css`（提交进仓库；Chrome 加载 unpacked 时无需任何构建即可用）。
- **输入**：`extension/tailwind.css`（源文件，含 `@import "tailwindcss"` + `@theme` + `@layer components` 组件类）。
- **命令**（写入 `extension/package.json` scripts）：
  ```
  npx @tailwindcss/cli -i src/tailwind.css -o dist/sidepanel.css --minify
  ```
- **回退开关**：`sidepanel.html` 的 `<link>` 指向 `dist/sidepanel.css`；原 `sidepanel.css` 保留在仓库，若要回退只需把 link 指回原文件（`<link rel="stylesheet" href="sidepanel.css">`），零代码改动。原文件仅在 R3 明确删除的冗余规则处被删。

### 1.2 CSP / manifest

- MV3 CSP 只限制 JS（`script-src 'self'`）；静态 `<link>` CSS 产物不受影响。manifest **零改动**。

### 1.3 依赖位置

- devDependency 放 `extension/package.json`（现有空壳，标注仅供构建）。类型 module 已设，CLI 调用用 `npx`，不受影响。

## 2. Token 桥接（Tailwind v4 CSS-first）

Tailwind v4 用 CSS 定义 theme，与项目既有 29 个 CSS 变量天然对齐。`extension/src/tailwind.css` 结构：

```css
@import "tailwindcss";

/* 1) 既有 token 原样保留（设计系统语义层，不新增 hex） */
:root {
  --color-bg: var(--gray-0);
  --color-surface: var(--gray-50);
  --color-text: var(--gray-800);
  --color-muted: var(--gray-400);
  --color-border: var(--gray-200);
  --color-accent: var(--green-500);
  ...
}

/* 2) Tailwind theme 从语义 token 取源 → utility 名 */
@theme {
  --color-bg: var(--color-bg);      /* bg-bg? 命名冲突 → 用命名空间 */
  --color-surface: var(--color-surface);
  --color-accent: var(--color-accent);
  --color-muted: var(--color-muted);
  --color-border: var(--color-border);
  --radius-md: var(--r-md);
  --shadow-1: var(--sh-1);
  --font-sans: var(--font);
}
```

- **命名冲突处理**：项目已有 `--color-text` 等变量，Tailwind v4 `@theme` 里 `--color-*` 命名空间会生成 `text-text` 这类难看 utility。方案：theme 里用**语义别名**（如 `--color-ink` → `text-ink` 指文字色、`--color-line` → `border-line` 指边框色），映射到既有 `--color-text`/`--color-border`。命名映射表在 §4。
- **暗色**：utility 值从 `@theme` 取**变量引用**（`var(--color-accent)`），而非字面值 → 暗色下 `[data-theme="dark"]` 覆盖变量后 utility 自动跟随，无需额外 CSS。

## 3. 渐进迁移策略（第一批）

### 3.1 迁移源文件组织

- `extension/src/tailwind.css`：Tailwind 入口 + `@theme` + 第一批迁移组件的 `@layer components` 组件类（用 `@apply` 组合 utility 表达原组件样式）。
- 迁移后删除 `sidepanel.css` 中对应规则（R3 明确清单，见 implement.md 的检查表）。
- HTML 里对应元素 class 改为 utility / 组件类组合。

### 3.2 第一批范围（简单高频区）

| 区域 | 迁移方式 |
|---|---|
| 按钮（cardpool-add-btn / btn-secondary / btn-primary / 图标按钮） | `@apply` 组件类 + 个别 utility |
| 筛选 chip（状态筛选 / 项目 / 标签） | utility 为主 |
| 状态徽标（section-badge / status 徽标） | utility |
| 间距 / 对齐（padding/gap 高频处） | utility |
| 空状态（时间线空状态 / 卡片池空状态） | utility + 组件类 |
| Toast | 组件类 |

### 3.3 第二批以后（明确不做，留待后续任务）

时间线画布、周视图网格、日历格子、热力图着色、卡片编辑弹窗主体、emoji picker。原因：
- 定位算法（`scheduleHeight` 等）产出的是**运行时可变的像素值**，utility 无法表达，仍需 `style.*`。
- 复杂选择器/状态（hover 收缩、短卡/长卡三态、拖拽选区）utility 化收益低、回归风险高。

### 3.4 双份维护禁止

每迁移完一处，必须删除 `sidepanel.css` 中对应规则。验收时 grep 确认无残留（`rg` 组件名）。

## 4. 命名映射表（theme → utility）

| 既有语义变量 | Tailwind theme 别名 | 生成 utility 示例 |
|---|---|---|
| `--color-bg` | `--color-canvas` | `bg-canvas` |
| `--color-surface` | `--color-surface` | `bg-surface` |
| `--color-text` | `--color-ink` | `text-ink` |
| `--color-muted` | `--color-muted` | `text-muted` |
| `--color-border` | `--color-line` | `border-line` |
| `--color-accent` | `--color-accent` | `bg-accent` / `text-accent` |
| `--r-md` | `--radius-md` | `rounded-md`（Tailwind 默认名） |
| `--sh-1` | `--shadow-1` | `shadow-1` |
| `--font` | `--font-sans` | `font-sans` |

> 注意：`rounded-md` 等是 Tailwind 默认命名空间，直接映射即可；颜色因与默认色名冲突需自定义别名。

## 5. 质量门与回滚

- **回归**：每批后 `node dev-loop/dev-loop.mjs --width 360,400,500` 全绿 + `npx eslint extension/` 0 error。
- **回滚**：`<link>` 指回 `sidepanel.css`（原文件保留）；Tailwind 产物提交可 git revert。
- **验收核对**：`rg "style\.(top|height|left)" sidepanel.js` 计数不变（34 处）→ 证明定位逻辑未被破坏。

## 6. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Tailwind v4 对 MV3 无构建环境（直接加载 unpacked） | 产物提交进仓库，运行时零依赖 |
| 迁移某组件出现视觉漂移 | dev-loop 多宽度截图 diff；该组件回退为组件类 |
| utility 与既有变量命名冲突 | §4 映射表统一别名，评审拦截 |
| 暗色主题失效 | theme 只存变量引用，不存字面值 |
| 迁移导致原 CSS 删除过多引发连锁 | 每批只删已验证组件的规则，分 commit |

## 7. 交付物清单

- `extension/src/tailwind.css`（Tailwind 入口 + @theme + 组件类）
- `extension/dist/sidepanel.css`（构建产物，提交）
- `extension/package.json`（+ devDependency tailwindcss@4 + scripts.build）
- `extension/sidepanel.html`（link 切到 dist + 第一批元素 class 改造）
- `extension/sidepanel.css`（删除第一批已迁移组件规则）
- 根/扩展 README 或 spec 更新：构建命令 + 回退说明
