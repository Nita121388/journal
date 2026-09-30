# Journal 设计系统

> 定位：Journal Chrome MV3 侧边栏（真实宽度 320–500px）的设计 token 与组件规范。
> 状态：v0.1（第一轮）。与现有 `sidepanel.css` 29 个 CSS 变量**增量映射**，不推倒重来。
> 依据：UX 审计（`../research/ux-audit.md`）+ WCAG 2.2 AA。

## 0. 设计原则

1. **今日优先**：首屏必须能看到「今天」的主工作区（日程/日志）。次要面板让位。
2. **窄栏优先**：320px 起可用；功能图标化替代文字堆叠；渐进披露。
3. **克制**：单主色（成长绿），其余靠层级与留白；不做多色编码状态。
4. **可降级**：一切动效支持 `prefers-reduced-motion`；主题支持系统偏好。
5. **可访问**：对比度、焦点可见、键盘可达为验收硬门。

## 1. 设计 Token（三层）

### 1.1 基础层（primitive）—— 原始值，不直接用于组件
```css
:root {
  /* 色板 */
  --green-50:#e8f5e9; --green-100:#c8e6c9; --green-300:#9ccc65;
  --green-500:#4caf50; --green-600:#3d8b41; --green-700:#2e6b31;
  --gray-0:#ffffff; --gray-50:#f8f9fa; --gray-100:#f1f3f5; --gray-200:#e5e7eb;
  --gray-300:#cfd3da; --gray-400:#9e9e9e; --gray-600:#5b6470; --gray-800:#1f2328;
  /* 暗色基线 */
  --dark-0:#1e1e1e; --dark-50:#252525; --dark-100:#2d2d2d; --dark-200:#3a3a3a; --dark-800:#e0e0e0;
  /* 排版 */
  --font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  --fs-11:11px; --fs-12:12px; --fs-13:13px; --fs-14:14px; --fs-16:16px;
  --lh-tight:1.25; --lh-normal:1.5;
  /* 间距（4 基准） */
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:20px; --sp-6:24px;
  /* 圆角 / 阴影 */
  --r-sm:6px; --r-md:8px; --r-lg:12px; --r-full:999px;
  --sh-1:0 1px 2px rgba(0,0,0,.06); --sh-2:0 4px 12px rgba(0,0,0,.10);
  /* 动效 */
  --dur-1:150ms; --dur-2:200ms; --dur-3:300ms;
  --ease-out:cubic-bezier(.2,.8,.2,1); --ease-in:cubic-bezier(.4,0,1,1);
  /* 布局 */
  --z-header:10; --z-sticky:20; --z-popup:100; --z-toast:200;
}
```

### 1.2 语义层（semantic）—— 组件只允许用这层
```css
:root {
  --color-bg:var(--gray-0);
  --color-surface:var(--gray-50);
  --color-text:var(--gray-800);
  --color-muted:var(--gray-400);
  --color-border:var(--gray-200);
  --color-accent:var(--green-500);
  --color-accent-strong:var(--green-600);
  --color-accent-soft:var(--green-50);
  --color-on-accent:#fff;
  --color-danger:#c62828; --color-warn:#ef6c00;
  --color-card-bg:var(--gray-0); --color-card-border:var(--gray-200);
  --color-cell-empty:var(--gray-100); --color-cell-mid:var(--green-300); --color-cell-filled:var(--green-500);
  --color-focus:color-mix(in srgb, var(--color-accent) 70%, #000); /* 焦点环 */
}
/* 暗色：CSS 兜底 + JS 显式覆盖 */
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* 映射到 --dark-* / 提亮 accent */ } }
[data-theme="dark"] { /* 同上映射 */ }
```
> 迁移规则：任何新增颜色必须走语义层；基础层 hex 只允许出现在 `:root` 定义处。

### 1.3 组件层（component）—— 组件私有
仅在组件内部使用，如 `--tl-card-h-min`、`--pool-chip-h`。

## 2. 布局与响应式（侧栏专项）

| 断点 | 布局策略 |
|---|---|
| 320–359 | 单栏；工具条图标化；时间线卡片全宽 |
| 360–439 | 单栏（默认）；侧栏收起为可展开 |
| 440–559 | 单栏 + 侧栏可并排（若用户开启） |
| ≥560 | 可选双栏 |

- **默认单栏**：`#board { grid-template-columns: 1fr }`；侧栏（卡片池/日历/热力图/技能）默认收起为「面板抽屉」，首屏只留今日工作区 + 顶栏。
- 媒体查询必须置于文件**末尾**或提升特异性，避免被后续同特异性规则覆盖（审计 A-1 教训）。

## 3. 动效

| 场景 | 时长 | 缓动 |
|---|---|---|
| hover/press 微反馈 | 150ms | ease-out |
| 弹窗/抽屉入场 | 200–300ms | ease-out |
| 列表项进出 | 200ms | ease-out / ease-in |
| 视图切换（时间线↔周↔月） | 300ms | ease-out |

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration:.01ms !important; transition-duration:.01ms !important; }
}
```

## 4. 可访问性规范（硬门）

- 正文对比 ≥4.5:1，大字/图标 ≥3:1（WCAG 1.4.3 / 1.4.11）。
- 焦点：所有可交互元素 `:focus-visible` 显示 2px 焦点环（`--color-focus`），不得 `outline:none`。
- 键盘：日历网格、卡片池用 **roving tabindex**（容器 `tabindex=0`，子项 `tabindex=-1`，方向键移动，`Enter` 选中）。列表/工具条可纯 Tab。
- 语义：图标按钮必须有 `aria-label`；装饰性 SVG/emoji 加 `aria-hidden="true"`；状态不只靠颜色（配图标/文字）。
- 表单：label 与控件关联；提交不意外跳转。
- 新增区块用语义标签（`section[aria-label]`、`nav`、`main`）划分地标。

## 5. 图标规范

- **功能图标 = SVG**：统一 24×24 viewBox、stroke 1.5–2px、currentColor；尺寸档 16/20/24；提供 hover/focus/active/disabled 四态。
- **内容 emoji = emoji**：卡片 emoji、氛围装饰保留（Twitter 系质感，契合产品调性）。
- 禁止把 emoji 用于：设置、视图切换、布局切换、保存/加载等**功能**入口。

## 6. 组件规范（首批）

| 组件 | 要点 |
|---|---|
| 顶栏 Header | 高 48px；标题+今日日期+设置；固定 `z-header` |
| 面板 Section | 圆角 `--r-lg`、1px border、surface 底；标题 11px 大写 letter-spacing .5（沿用现状） |
| 卡片 Card | 最小高 64px（内容自适应）；左边框色=状态；hover 抬升 `--sh-1` |
| 时间线卡片 | 高度随内容；空槽显示弱「+ 在此添加」 |
| 筛选 Chip | 高 24px、`--r-full`；默认≤5 个，多余进「筛选」弹层；active=accent 实心 |
| 状态徽标 | 文字+色（不只色）；尺寸 11px |
| 进度条 | 高 3–4px、`--r-full`；轨道 surface；值 accent；旁标百分比 |
| 空状态 | 图标/emoji + 一句原因 + **一个行动按钮**（如「新建卡片」「清除筛选」） |
| 骨架屏 | 卡片池/时间线各 3 行，>300ms 显示 |
| Toast | 顶部/底部居中，停留 3–5s，可关闭，z-toast |
| 日历格 | 32–36px；today=accent 底+高对比字；日志日=cell 色阶；hover 显示日期+计数 |

## 7. 主题（暗色）

- 默认跟随系统：`@media (prefers-color-scheme: dark)` 映射暗色 token；用户显式选择时 `[data-theme]` 覆盖（JS 现状已支持）。
- 暗色 today 单元格：accent 提亮 + 深字或白字，确保 ≥4.5:1。
- 暗色下阴影改用更深的 `--sh`（或以边框替代），避免「黑上加黑」。

## 8. 反模式（Code Review 拦截项）

- ❌ 硬编码 hex（必须语义 token）
- ❌ 内联 `style.*` 控制视觉（改 class/变量）
- ❌ `!important`（除 reduced-motion 兜底）
- ❌ emoji 当功能图标
- ❌ 空状态只说「无数据」无行动
- ❌ 状态只靠颜色
- ❌ `outline:none` 去焦点环
- ❌ 媒体查询被后续同特异性规则覆盖
- ❌ 无 reduced-motion 降级的动画
- ❌ 在 `src/tailwind.css` 的组件里写死 hex（与全站一样必须走语义 token）
- ❌ 把 `@import "tailwindcss"`（含 preflight）引入——会全站 reset 漂移，必须用 `theme/utilities` 两段式
- ❌ 通过 CDN `<script>` 引入 Tailwind——MV3 CSP 禁止（`script-src 'self'`），只能本地 CLI 构建

## 8.1 构建与 Tailwind（v4）

- 样式入口：`extension/src/tailwind.css` → `npm run build:css` → `extension/dist/sidepanel.css`（**产物提交进仓库**，Chrome 加载 unpacked 免构建）。
- 加载顺序：`dist/sidepanel.css` 先、`sidepanel.css` 后。前者承载已迁移组件（`@layer components`）与 utility；后者承载未迁移的复杂组件与设计 token 定义。
- **token 桥接**：`@theme inline` 把既有语义变量映射为 Tailwind utility，右侧用 `var()` 引用而非字面值，使暗色切换自动跟随。颜色别名：`canvas`（页面底）/`surface`（卡片面）/`ink`（文字）/`muted`（次要文字）/`line`（描边）/`accent`（主色）。**必须用 `@theme inline`**：普通 `@theme` 会产生 `--color-accent: var(--color-accent)` 循环引用而失效。
- **组件迁移规则**：简单高频区（按钮/chip/徽标/空状态/Toast）迁入 `@layer components` 并删除 `sidepanel.css` 对应规则（不双份维护）；复杂组件（时间线画布、周视图网格、日历、热力图、卡片编辑器）保留原生 CSS，因大量运行时计算定位（`scheduleHeight()` 等）无法 utility 化。
- **迁移验收**：`node dev-loop/dev-loop.mjs --scenario tailwind-migrated --width 320,360,400,500` 全绿（校验 computed-style + 暗色跟随）。

## 9. 验收清单（每轮改造后）

- [ ] dev-loop 回归多宽度全绿、无 console error
- [ ] 无新增硬编码 hex / 内联 style
- [ ] 新交互可键盘操作、焦点可见
- [ ] 亮暗主题 + reduced-motion 下均正常
- [ ] 320/360/400/500 宽度下无横向滚动、无内容截断
