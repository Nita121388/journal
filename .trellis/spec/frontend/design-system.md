# Journal 设计系统

> 定位：Journal Chrome MV3 侧边栏（真实宽度 320–500px）的设计 token 与组件规范。
> 状态：v0.2（2026-11-08 方向定稿 Quiet Desk）。**权威取值以
> `.trellis/tasks/11-08-visual-redesign-quiet-desk/design.md` 为准**，P6 收口时升到 v1.0。
> 依据：UX 审计（`../research/ux-audit.md`）+ WCAG 2.2 AA + P0 三方向样张实测
> （`docs/design/directions/`，用户选定 B）。

## 0. 设计原则

1. **今日优先**：首屏必须能看到「今天」的主工作区（日程/日志）。次要面板让位。
2. **窄栏优先**：320px 起可用；功能图标化替代文字堆叠；渐进披露。
3. **克制**：单主色（蓝 `#2563EB` / 暗 `#5B8DFF`），且**只允许**出现在「主操作 / 选中 / 焦点环 / 当前时间」四处；
   绿不再是 UI 语义色（只保留为月历数据色系之一）。层级靠三层表面 + 发丝描边表达。
4. **可降级**：一切动效支持 `prefers-reduced-motion`；主题支持系统偏好。
5. **可访问**：对比度、焦点可见、键盘可达为验收硬门。

## 1. 设计 Token（三层）

### 1.1 基础层（primitive）—— 原始值，不直接用于组件
```css
:root {
  /* 表面（三层） */
  --canvas:#fbfbfc; --surface:#ffffff; --sunken:#f1f3f6;
  /* 墨（文字） */
  --ink:#14161a; --ink-soft:#5a616d; --ink-weak:#696f7c;
  /* 描边 */
  --line:#e9eaef; --line-2:#dcdfe6;
  /* 主色（唯一） */
  --accent:#2563eb; --accent-hover:#1d4ed8; --accent-soft:#eff4ff; --on-accent:#fff;
  /* 语义（状态用，不做品牌色） */
  --danger:#dc2626; --warn:#b45309; --success:#12805c;
  /* 暗色基线 */
  [data-theme="dark"]: canvas:#0f1115; surface:#171a20; sunken:#1f232a;
    ink:#edeff3; ink-soft:#a2a8b4; ink-weak:#8b93a1; line:#262a32; line-2:#333945;
    accent:#5b8dff; on-accent:#0b1220;
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
  /* ⚠️ 2026-11 起这些旧名只是**别名**：真值在 extension/styles/tokens.css，
     全部指向新 token（--canvas/--surface/--ink/--ink-weak/--line/--accent…）。 */
  --color-bg:var(--canvas);
  --color-surface:var(--surface);
  --color-text:var(--ink);
  --color-muted:var(--ink-weak);
  --color-border:var(--line);
  --color-accent:var(--accent);
  --color-accent-strong:var(--accent-hover);
  --color-accent-soft:var(--accent-soft);
  --color-on-accent:var(--on-accent);
  --color-danger:#c62828; --color-warn:#ef6c00;
  --color-card-bg:var(--gray-0); --color-card-border:var(--gray-200);
  /* 热力阶：单色（蓝）阶梯，绿色已退出 UI 语义 */
  --color-cell-empty:var(--sunken); --color-cell-mid:var(--heat-3); --color-cell-filled:var(--accent);
  --heat-0:var(--sunken); --heat-1..5: accent 16%/32%/50%/accent/accent-hover
    （真值见 tokens.css；count-1..3 用 --ink 字，count-4/5 用 --on-accent 字）
  --color-focus:color-mix(in srgb, var(--color-accent) 70%, #000); /* 焦点环 */
}
/* 暗色：CSS 兜底 + JS 显式覆盖 */
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* 映射到 --dark-* / 提亮 accent */ } }
[data-theme="dark"] { /* 同上映射 */ }
```
> 迁移规则：任何新增颜色必须走语义层；基础层 hex 只允许出现在 `:root` 定义处。

### 1.3 组件层（component）—— 组件私有
仅在组件内部使用，如 `--tl-card-h-min`、`--pool-chip-h`。

### 1.4 日历色系（`--cc-*`，亮/暗两套）
`styles/tokens.css` 里定义五组 `--cc-{color}-{bg,border,text}` + `--cc-today`。
组件侧**只写一次映射**（`sidepanel.css` 的 `.cc-color-*` 把 `--cc-bg/--cc-border/--cc-fg`
指向对应色组），新增色系只改这两处。文字色对各自底色实测 ≥ 4.5:1（dev-loop `calendar-visual` 断言）。

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

- **功能图标 = SVG**：统一 24×24 viewBox、stroke **1.75**、currentColor；尺寸档 16/20；提供 hover/focus/active/disabled 四态。
  唯一实现：`extension/components/icon.js` 的 `icon(name, {size, stroke})`（`createElementNS` 构建，禁 `innerHTML`，全部 `aria-hidden`）。
  按钮：`extension/components/button.js` 的 `button()` / `iconButton()`（4 变体 × 3 尺寸，样式由 `.btn[data-variant][data-size]` 承担）。
- **内容 emoji = emoji**：卡片 emoji、氛围装饰保留（Twitter 系质感，契合产品调性）。
- 禁止把 emoji 用于：设置、视图切换、布局切换、保存/加载等**功能**入口。

## 6. 组件规范（首批）

| 组件 | 要点 |
|---|---|
| 顶栏 Header | 高 **44px**；标题 13/600 + 今日日期 11.5/weak + 三个 **SVG 图标按钮**（menu/status/settings）；固定 `z-header` |
| 面板 Section | 圆角 `--r-lg`、1px border、surface 底；标题 11px 大写 letter-spacing .5（沿用现状） |
| 卡片 Card | 最小高 64px（内容自适应）；左边框色=状态；hover 抬升 `--sh-1` |
| 时间线卡片 | 高度随内容；空槽显示弱「+ 在此添加」 |
| 筛选 Chip | 高 24px、`--r-full`；默认≤5 个，多余进「筛选」弹层；active=accent 实心 |
| 标签 chip（`components/chip.js`） | 小方角 `--r-sm`（非胶囊）、`--color-hover` 底 + 1px 边框；`×` 只在 hover/focus-visible 显示且必须是独立 `.chip-x` 元素（不得拼进文本，否则读屏念「乘号」）；只读态加 `is-static` |
| 分段胶囊 `.seg`（`components/seg.js`） | **弱底语义**：常态透明底 + 透明边框；hover = `--color-hover`；选中 `is-active` = `--color-hover-strong` + 1px 边框 + 文字色（**不整块染高饱和色**）。彩色只能出现在 `.seg-dot`（8px 圆点，`--prio-*`）。DOM 契约：`button.seg` + `data-<key>` + `is-active`（dev-loop 依赖） |
| 属性行 `.prop-row`（`components/property-row.js`） | Notion 式两列：`.ce-props { grid-template-columns: 76px minmax(0,1fr) }`，`.prop-row { display: contents }` 让 `.prop-key`/`.prop-val` 直接落进网格列。键列 muted 11.5px + 图标；值列正文色、`min-height:26px`、hover 弱底。内建属性与自定义属性**共用同一结构**。**可见性由字段集驱动**（见 §10） |
| 状态徽标 | 文字+色（不只色）；尺寸 11px |
| 进度条 | 高 3–4px、`--r-full`；轨道 surface；值 accent；旁标百分比 |
| 空状态 | 图标/emoji + 一句原因 + **一个行动按钮**（如「新建卡片」「清除筛选」） |
| 骨架屏 | 卡片池/时间线各 3 行，>300ms 显示 |
| 下拉框 Select | 自建组件（`extension/select.css` + `extension/features/select.js`，BoardUI 风格）：隐藏原生 select 作数据源 + 代理触发器 + **自绘非模态 popover**（portal 到 body、z 150）。触发器：1px 弱描边 + 大圆角（sm 8px / md 10-12px）+ 极弱投影 `--select-shadow` + 200ms 过渡 + SVG chevron 展开旋转 + ring-offset 焦点环（`--color-focus`）。键盘：↑↓ Home End Enter Esc Tab + 字符 typeahead；`aria-activedescendant` 焦点不离开触发器；multiple 触发器显示「已选 N 项」。样式走两页各自 `:root` 的 `--select-*` token，不写 hex |
| Toast | 顶部/底部居中，停留 3–5s，可关闭，z-toast |
| 行级浮层（右键菜单/图标选择器） | 构建器弹窗之上、属性编辑弹窗之下：构建器 overlay=120、行级浮层=130、属性定义弹窗=140（高于通用 overlay=100）。浮层定位贴右边界防溢出，`max-width: calc(100vw - 16px)` |
| 日历格（左栏小日历） | 32–36px；today=accent 底+高对比字；日志日=cell 色阶；hover 显示日期+计数 |
| 日历事件 pill | 高 ~16px、圆角 5px；底色/描边/文字走 `--cc-{red,green,blue,purple,gray}-*` 五色系；标题单行截断；时间只在 ≥620px 显示 |
| 日历日期头 | 日号 13px 加粗 + 节日/节气副标 9px + 今天圆角标（红底白字，`compact` 时显示「今」） |
| 日历展开详情 | sticky 吸底、左侧 3px 色条、正文 Milkdown（`max-height:40vh` 内滚动） |
| 视图切换 dock | 底部 sticky 胶囊 dock，SVG 图标 + 文字，`aria-pressed` 同步顶部按钮组 |

## 7. 主题（暗色）

- 默认跟随系统：`@media (prefers-color-scheme: dark)` 映射暗色 token；用户显式选择时 `[data-theme]` 覆盖（JS 现状已支持）。
- 暗色 today 单元格：accent 提亮 + 深字或白字，确保 ≥4.5:1。
- 暗色下阴影改用更深的 `--sh`（或以边框替代），避免「黑上加黑」。

## 10. 编辑器属性集（模板驱动，2026-11 起）

**产品原则**：默认只给少量必要属性，其余由用户自建模板按需引入。

| 概念 | 位置 | 说明 |
|---|---|---|
| 默认最小集 | `features/editor-fields.js: BASE_FIELDS` | `status` / `tags` —— 状态供卡片池筛选，标签在注册表是 `required`（搜索依赖） |
| 固定顺序 | `features/editor-fields.js: FIELD_ORDER` | 模板只能决定「显示哪些」，**不能**打乱顺序 |
| 解析 | `resolveFields(templateKeys)` | 默认集 ∪ 模板字段；过滤属性库已删 key；自定义属性不进属性区 |
| 应用 | `applyFields(container, keys)` | 只改可见性 + 顺序，**不重建节点**（`dom-refs` 的 id 必须存活） |
| 编辑已有卡 | `fieldsWithValues(card)` | 把已填字段拉出来，避免模板收敛把旧数据藏掉 |
| 入口 | `openEditor(card, time, date, assignedDate, { templateId, templateName, fields })` | 第 5 参缺省 = 默认集 |

**DOM 契约**：`.prop-row[data-field="<key>"]`；隐藏用 `hidden` 属性，**禁止内联 style**。
必须显式写 `.prop-row[hidden] { display: none }` —— `.prop-row` 的 `display: contents`
会盖过 UA 的 `[hidden]` 规则（这条已踩过）。

**逃生口**：模板下拉末项「显示全部属性」一次性展开全部内建属性（不建模板、不改数据）。
无模板时用户仍能填优先级/排程，不必先造一个模板。

## 13. 自定义属性交互（卡片编辑器 = 模板构建器，2026-11-09）

卡片编辑器的自定义属性区**复用模板构建器的行结构与交互**，不再有自己的表单语言：

- 行结构 `.tpl-prop-row`：`[图标][名称][值控件][pencil][trash]`，图标与动作按钮一律 SVG。
- 「添加属性」是**分割按钮**：主体 = 立刻新建一行并进入行内命名；caret = 从属性库选择。
- 图标点击走 emoji 选择器；名称双击行内改名；pencil 打开**同一个**属性定义弹窗
  （`features/template-menu.js:openPropDefDialog({key,def,submit})`，用 submit 回调隔离构建器状态）；
  trash 只从当前卡移除，保留属性库定义。
- 旧的 `#prop-form`（名称/图标文本框/类型/选项）与 `.ce-more` 折叠区已删除，不留双份实现。

### Gotcha A：blur 会吞掉同一次点击

`openNameEditor` 的 blur 回调若**同步**重渲染列表，用户点行尾 ✎/✕ 时 blur 先触发，
被点的按钮在 click 派发前脱离文档 → 处理器永远不执行（实测「点编辑属性没反应」）。
**正解**：`blur` 里 `setTimeout(() => finish(true), 0)`，让本次点击序列先落定。

### Gotcha B：ESM 的 import 绑定是只读视图

跨模块给 `export let x` 直接赋值（`tplEditKey = key` / `tplBuilderState = {...}`）会在运行时抛
`TypeError: Assignment to constant variable`，且这类错误常被上层 try/catch 或竞态掩盖。
**正解**：模块内提供 setter（`setTplEditKey` / `setTplBuilderState`），外部一律走 setter。

## 12. 状态词唯一真值（2026-11-09）

卡片状态只有 4 个 key：`none|todo|doing|done`（`shared/card-schema.js:STATUSES`），
中文名同样只在那里定义：`STATUS_LABELS` / `statusLabel(v)` / `statusOptions()`。

- 编辑器状态胶囊由 `features/card-editor.js:ensureStatusButtons()` 从 `statusOptions()`
  渲染，**HTML 里不再硬编码标签**。
- 卡片池筛选与徽标（`views/pool.js`）用同一个 `statusLabel()`，不再自带文案。
- 模板构建器的默认值下拉对 `behavior === 'status'` 用中文显示、值仍存 key
  （否则模板里看到 `none`、编辑器里看到「纯记录」）。
- `shared/prop-infer.js` 的「状态/阶段」关键词推断也取同一组 4 项。

**Gotcha：`''` 不是 `nullish`。** `writeValueToCard` 曾用 `value ?? empty`，
模板字段默认值留空（`''`）会被原样写进 `card.status`，于是卡片池
`statusMatches(card,'none')` 匹配不到 —— 卡在「纯记录」筛选下凭空消失，
而编辑器又把它显示成「纯记录」。一级字段现在把 `''` 视为未填、走 `empty` 兜底。

## 11. 两个页面共用一套 token 值（2026-11-09）

`styles/tokens.css`（侧栏）与 `styles/tokens-options.css`（设置页）**值必须逐项同源**，
只册因为 options.html 不加载 `dist/sidepanel.css` 才物理分开，不是两套视觉语言。
「设置页 = 成长绿独立身份」的旧主张已作废。
旧变量名（`--color-text-2` / `--color-border-strong` / `--color-accent-deep` / `--color-code-bg`）
作为别名保留，新增样式一律用新 token。改一处必须同步另一处，并跑 `options` 场景验收。

## 14. 卡片类型退场（2026-11-09）

`type`（`text | task | idea`）是**模板出现之前的分类手段**。模板上线后卡片形态由模板决定，
编辑器里再让用户选一次类型属重复分类，已整体退出 UI。**数据字段保留**（零迁移）。

| 层 | 契约 |
|---|---|
| 编辑器 | 无「类型」下拉；头部子行只有「模板：<名>」入口。保存时 `type = 编辑中原值`（旧任务卡不降级），新建恒 `'text'` |
| 时间线卡片页脚 | 无「切换类型」按钮；「标记完成 / 撤销完成」**常驻**，写 `status`（+ `done`、`progress` 同步） |
| 完成态判定 | 一律 `status === 'done'`（正文删除线 / 日历 pill `.is-done`）；不再看 `type`/`done` |
| 日历 pill 可访问名 | 用 `statusLabel(card.status)`（单真值），不再输出「任务/记录/想法」，也不再生成 `type-*` 类名（原先无 CSS 消费） |
| 卡片图标 | `components/card-icon.js: cardIconEl(card,{cls,size})`：有 `card.emoji` 用 emoji，否则 `note` 线稿 SVG |
| `shared/format.js:typeIcon` | **deprecated**：视图层零调用，保留一个版本供历史数据/第三方使用 |

**为什么保留 `type` 字段**：它牵动 SQLite 列、Markdown 同步格式、Todoist 导入与
`host/lib/storage.js:statusFromTypeDone()` 的历史数据推导。删除的收益（省一个字段）
远小于迁移风险。`statusFromTypeDone` 只在 `status` 缺失时兜底，UI 已不再触发 `patch.type`。

**Gotcha**：`patch { status, done }` 同时存在时，`applyCardPatch` 的显式 `status` 优先
（`else if` 分支只对「只改 done/type」的老客户端生效）——所以完成/撤销可以安全地同时写两个字段。

## 8. 反模式（Code Review 拦截项）

- ❌ 硬编码 hex（必须语义 token）
- ❌ 用高饱和实底胶囊编码状态/优先级（同色不同义、视觉噪音大）→ ✅ 弱底胶囊 + 8px 圆点承载颜色
- ❌ 同一弹窗里两种属性行样式（内建卡片 vs 自定义 flex 行）→ ✅ 统一走 `components/property-row.js`
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

## 8.0 构建与 Milkdown（esbuild）

- 入口：`extension/build/milkdown-entry.js` → `npm run build:js` → `extension/dist/milkdown.bundle.js`（**产物提交进仓库**，Chrome load unpacked 免构建）。
- 只导出四个 API：`mountReadonly` / `unmount` / `liveCount` / `version`，**不暴露 Milkdown 内部对象**（便于整体替换实现）。
- 只读渲染必须走 `views/milkdown-mount.js`：它维护实例池（`MAX_MOUNTED = 2`，LRU 淘汰）、懒加载产物、失败降级到 `shared/md-lite.js`。
- 实现要点（踩过的坑）：
  - `define: { 'process.env.NODE_ENV': '"production"' }` 必须加，否则浏览器里 `process is not defined`。
  - 用 `new URL('../../dist/milkdown.bundle.js', import.meta.url)` + `import(/* @vite-ignore */ ...)` 而不是字面量动态 import：否则 vitest/vite 会尝试静态解析 370KB minified 产物而报错。
  - 测试通过 `__setLoaderForTest(fn)` 注入假加载器，不依赖真实产物。
  - 不启用 HTML preset：用户 Markdown 里的原始 HTML 按文本渲染，杜绝注入面。
- 重渲染前必须 `releaseAll()`：`renderRightView` 会把承载 ProseMirror 的 DOM 一起扔掉，不销毁就是泄漏。

## 8.1 构建与 Tailwind（v4）

- 样式入口：`extension/src/tailwind.css` → `npm run build:css` → `extension/dist/sidepanel.css`（**产物提交进仓库**，Chrome 加载 unpacked 免构建）。
- 加载顺序：`dist/sidepanel.css` 先、`sidepanel.css` 后。前者承载已迁移组件（`@layer components`）与 utility；后者承载未迁移的复杂组件与设计 token 定义。
- **token 桥接**：`@theme inline` 把既有语义变量映射为 Tailwind utility，右侧用 `var()` 引用而非字面值，使暗色切换自动跟随。颜色别名：`canvas`（页面底）/`surface`（卡片面）/`ink`（文字）/`muted`（次要文字）/`line`（描边）/`accent`（主色）。**必须用 `@theme inline`**：普通 `@theme` 会产生 `--color-accent: var(--color-accent)` 循环引用而失效。
- **组件迁移规则**：简单高频区（按钮/chip/徽标/空状态/Toast）迁入 `@layer components` 并删除 `sidepanel.css` 对应规则（不双份维护）；复杂组件（时间线画布、周视图网格、日历、热力图、卡片编辑器）保留原生 CSS，因大量运行时计算定位（`scheduleHeight()` 等）无法 utility 化。
- **迁移验收**：`node dev-loop/dev-loop.mjs --scenario tailwind-migrated --width 320,360,400,500` 全绿（校验 computed-style + 暗色跟随）。
- **跨页共享组件样式**：`extension/select.css` 被 `sidepanel.html` 与 `options.html` 同时引入（自建下拉框组件）。不用 `src/tailwind.css`——其产物 `dist/sidepanel.css` 未被 options 页加载，引入会串入侧栏专属样式；组件样式在两页各自 `:root` 提供 `--select-*` token（含 `--color-focus`），暗色自动跟随。`data-select-size="md"` 显式指定标准尺寸档，其余默认 sm。

## 9. 验收清单（每轮改造后）

- [ ] dev-loop 回归多宽度全绿、无 console error
- [ ] 无新增硬编码 hex / 内联 style
- [ ] 新交互可键盘操作、焦点可见
- [ ] 亮暗主题 + reduced-motion 下均正常
- [ ] 320/360/400/500 宽度下无横向滚动、无内容截断

## Gotcha: Tailwind 产物的 `:root` 自引用与 token 文件顺序

**场景**：Tailwind v4 构建产物 `dist/sidepanel.css` 中含自引用声明
`:root, :host { --color-accent: var(--color-accent); … }`（由 `@theme inline` 别名映射产生）。

**陷阱**：该声明自身是循环引用。它**只有被后加载的手写 CSS `:root` 覆盖时才无害**。
一旦把 token 定义挪到产物**之前**（例如新建 `styles/tokens.css` 并放在 `<head>` 更靠前的位置），
自引用因级联靠后而生效，`--color-accent` 解析为「无效值」，
所有 `var(--color-accent)` 背景回落为 `transparent` —— 症状是「一批组件突然全透明」。

**正解**：token 文件必须满足 **`dist/*.css` → `select.css` → `styles/tokens.css` → `sidepanel.css`** 的顺序。
新增样式文件时先在 `styles/README.md` 记录顺序约束。

**原则**：凡「构建产物 + 手写覆盖」共存的项目，覆盖顺序是契约的一部分；
改动 `<link>` 顺序必须跑带 computed-style 断言的门禁（本项目为 dev-loop `tailwind-migrated` 场景）。
