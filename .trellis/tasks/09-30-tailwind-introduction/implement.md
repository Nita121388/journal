# 引入 Tailwind CSS v4 构建链并渐进迁移 UI — 实施清单

## 阶段 0：确认基线（前置）

- [ ] `git status` 干净（当前有 host 修复 + UI 改动的未提交变更，先 commit 或 stash 到干净基线；本次任务独立 commit）
- [ ] 记录基线截图：`node dev-loop/dev-loop.mjs --width 360,400,500` → 保存 out 目录路径，作为后续 diff 参照
- [ ] `npx eslint extension/` 0 error 基线
- [ ] 记录 `rg "style\.(top|height|left)" extension/sidepanel.js` 计数（当前 34 处），后续不得增加

## 阶段 1：构建链落地（R1）

- [ ] 在 `extension/package.json` 加 devDependency `tailwindcss@^4` + scripts：
  ```json
  "scripts": {
    "build:css": "npx @tailwindcss/cli -i src/tailwind.css -o dist/sidepanel.css --minify"
  }
  ```
- [ ] `extension/src/tailwind.css`：`@import "tailwindcss";` + 既有语义 token（从 sidepanel.css :root 复制，不新增 hex）+ `@theme` 桥接（§4 映射表）+ 首批组件 `@layer components`
- [ ] 先以**空 @theme / 无组件类**的最小文件跑通构建，产出 `dist/sidepanel.css` 验证 CLI 可用
- [ ] 验证产物 CSS 可加载（临时 link 指向 dist），dev-loop 截图与基线无 diff（此时应等于 base CSS + Tailwind preflight？—— 注意：**preflight 会重置样式，必须评估**）
  - **关键决策点**：Tailwind v4 `@import "tailwindcss"` 自带 preflight（CSS reset），会与现有 594 条规则打架。选择：a) 保留 preflight 并适配（风险高） vs b) `@layer base` 内跳过 preflight（`@import "tailwindcss/theme"` + `@import "tailwindcss/utilities"` 不带 preflight，推荐，保持与现状视觉等价）
  - **结论（设计约定）**：用 `@import "tailwindcss/theme"; @import "tailwindcss/utilities"; @import "tailwindcss/components";` 三段式导入，**不引 preflight**，避免全站 reset 漂移。若 components 段导入触发 preflight，用 `@config`/`@layer` 隔离。

## 阶段 2：Token 桥接验证（R2）

- [ ] `@theme` 按 §4 映射表建立别名（canvas/surface/ink/muted/line/accent/radius/shadow/font）
- [ ] 写一个临时验证元素：`<div class="bg-accent text-ink rounded-md shadow-1">` 放侧栏里，dev-loop 截图确认 utility 生效且暗色切换跟随
- [ ] 验证 `[data-theme="dark"]`：utility 颜色随 token 变（theme 只存 var 引用）
- [ ] 删除验证元素，跑基线回归

## 阶段 3：第一批迁移（R3，按组件分批，每批一个 commit）

按「风险低 → 高」排序：

### 3.1 筛选 chip 与状态徽标
- [ ] HTML class → utility（bg/rounded-full/text-muted/active 状态）
- [ ] 删 `sidepanel.css` 对应 `.pool-filter-*`、`.status-badge` 规则
- [ ] dev-loop 回归 + eslint

### 3.2 按钮（cardpool-add-btn / btn-secondary / btn-primary / 图标按钮）
- [ ] `@layer components` 里用 `@apply` 表达组件类，HTML 复用类名（类名不变，样式来源变为构建产物）——**此策略下 HTML 改动最小**
- [ ] 删 `sidepanel.css` 对应规则
- [ ] dev-loop 回归 + eslint

### 3.3 间距 / 对齐高频 utility
- [ ] 只改**验证过无复杂状态的**简单元素（如 `.section-header` 内部 gap/padding）
- [ ] dev-loop 回归 + eslint

### 3.4 空状态 + Toast
- [ ] utility 化，删旧规则
- [ ] dev-loop 回归 + eslint

### 阶段 3 全程护栏
- [ ] 每批跑 `rg "<组件class>" extension/sidepanel.css` 确认已删除
- [ ] 每批跑 dev-loop 三宽度全绿 + eslint 0 error
- [ ] `rg "style\.(top|height|left)"` 仍 34 处

## 阶段 4：收尾（Phase 3）

- [ ] **回退验证**：临时把 HTML link 指回 `sidepanel.css`，dev-loop 截图确认可回退（产物与源可切换）
- [ ] 更新 `.trellis/spec/frontend/design-system.md`：新增「构建与 Tailwind」小节（构建命令、token 桥接、@theme 命名映射、preflight 决策、反模式补充「禁止 CDN tailwind」）
- [ ] 更新 `.trellis/spec/frontend/index.md`：概述段补「存在可选构建步骤（纯 CSS 产物，运行时零依赖）」
- [ ] 全量回归：`npx eslint extension/` + `node dev-loop/dev-loop.mjs --width 320,360,400,500`（含 320）
- [ ] 提交（独立 commit 按组件拆分，spec 更新单独 commit）
- [ ] `task.py finish` + `trellis archive`

## 验证命令速查

```bash
cd extension && npx @tailwindcss/cli -i src/tailwind.css -o dist/sidepanel.css --minify
npx eslint extension/
node dev-loop/dev-loop.mjs --width 320,360,400,500
rg "style\.(top|height|left)" extension/sidepanel.js   # 期望 34
```

## 回滚点

- **P0**：HTML `<link>` 指回 `sidepanel.css`（原文件保留，除已删规则外）——5 秒回退
- **P1**：git revert 对应 commit
- **P2**：产物 `dist/` 不提交即可弃用（仅本地构建需要）
