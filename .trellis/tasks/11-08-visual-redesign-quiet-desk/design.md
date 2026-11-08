# 技术设计 — Quiet Desk（BoardUI 基线）

> **方向已定：B「Quiet Desk」。** 2026-11-08 用户从 P0 三方向样张中选定 B：
> BoardUI 字面基线（纯白面板 / 蓝主色 / 大圆角 / 极弱投影）+ HeroUI 的组件状态矩阵与无障碍语义。
> 纸感材质（纸纹/胶带/图钉/手绘）**全部不进本轮**，改用「结构严谨 + 材质克制」建立品质感。
> 样张：`docs/design/directions/b-quiet-desk.html`（亮/暗 × 320/400/500 截图见同目录 `shots/`）。

## 0. 一句话架构

**用「语义 token → 控制件基元 → 组件」三层替换现有的「散落类名 + 各写一套控件」**；
层级由 **三层表面（canvas / surface / sunken）+ 发丝描边 + 一档极弱投影** 表达，
不再用「灰底盒子套白盒子」。零运行时依赖，全部产物仍是手写 CSS + 原生 JS。

```
styles/tokens.css        ← 唯一 hex 定义处（表面/墨/蓝/语义色/尺寸标尺）
components/icon.js       ← inline SVG sprite（无外部请求、CSP 安全）
components/button.js     ← 4 变体 × 3 尺寸 的按钮基元
src/tailwind.css         ← @theme inline 只做 var() 别名 + 少量稳定组件
sidepanel.css            ← 布局型/运行时计算型组件（时间线、周/月网格、日历、热力图）
select.css / options.css ← 两页共享控件 + 附属页
```

不新增构建步骤（沿用现有 `build:css` / `build:js`），产物照旧提交进仓库，
Chrome load unpacked 免构建。

---

## 1. 色彩系统（全部实测对比度）

### 1.1 亮色

```css
/* 三层表面 */
--canvas:  #FBFBFC;  /* 页面底（不是纯白，让白卡站起来） */
--surface: #FFFFFF;  /* 卡片、面板、弹窗 */
--sunken:  #F1F3F6;  /* 输入框、dock 轨道、hover 底 */
/* 文字 */
--ink:      #14161A;  /* 17.5:1 / 17.5:1 / 16.3:1（canvas/surface/sunken） */
--ink-soft: #5A616D;  /* 5.9:1  */
--ink-weak: #696F7C;  /* 4.87 / 5.04 / 4.54 —— 最差 4.54，达标 */
/* 描边 */
--line:   #E9EAEF;    /* 发丝分隔 */
--line-2: #DCDFE6;    /* 控件/卡片描边 */
/* 主色（唯一） */
--accent:      #2563EB;  /* 白字 5.17:1 */
--accent-hover:#1D4ED8;  /* 白字 6.5:1 */
--accent-soft: #EFF4FF;  /* accent 字 6.08:1 */
--on-accent:   #FFFFFF;
/* 语义 */
--danger: #DC2626; --warn: #B45309; --success: #12805C;
```

### 1.2 暗色（深石板，非纯黑）

```css
[data-theme="dark"] {
  --canvas:#0F1115; --surface:#171A20; --sunken:#1F232A;
  --ink:#EDEFF3;      /* 16.4 / 15.1 / 13.7 */
  --ink-soft:#A2A8B4; /* 7.9 / 7.3 / 6.6 */
  --ink-weak:#8B93A1; /* 6.1 / 5.6 / 5.1 */
  --line:#262A32; --line-2:#333945;
  --accent:#5B8DFF; --accent-hover:#7FA8FF; --accent-soft:#1B2740;
  --on-accent:#0B1220;  /* 深字压亮蓝 5.97:1 */
  --danger:#F87171; --warn:#FBBF24; --success:#4ADE80;
}
```

### 1.3 数据色（只编码数据，不参与 UI 层级）

- 移交给**日历五色系**（`--cc-{red,green,blue,purple,gray}-{bg,line,text}`），全部重调为冷调低饱和，
  文字对比：亮色 5.91–7.07、暗色 7.52–8.35（实测）。色键仍由 `shared/format.js:cardColorKey` 决定。
- 热力图/进度条用 `--accent` 的单色阶（`--heat-0..3`），**不再用绿色**——绿色退出 UI 语义。

| 族 | 亮 bg / line / text | 暗 bg / line / text |
|---|---|---|
| red | `#FDECEC` `#F5C2C2` `#A32B2B` | `#3A2225` `#6B3A3E` `#FFA3A3` |
| green | `#E9F7EF` `#B7E4C9` `#186B41` | `#17322A` `#2F5A46` `#7FDCAC` |
| blue | `#EAF1FE` `#BFD3F8` `#1D4ED8` | `#1B2740` `#33507F` `#9DC0FF` |
| purple | `#F1EDFD` `#D2C4F7` `#5B33B5` | `#2A2440` `#4A3F73` `#C4AEF5` |
| gray | `#F1F3F6` `#DDE1E8` `#4B5563` | `#22262E` `#3A404A` `#B9BEC7` |

### 1.4 圆角（来自实测：`r ≈ 0.3 × h`）

| token | 值 | 用在 |
|---|---|---|
| `--r-chip` | 6px | chip / badge |
| `--r-ctl` | 7px | 24 高控件（图标按钮） |
| `--r-ctl-md` | 8px | 28 高控件（默认按钮/输入） |
| `--r-ctl-lg` | 10px | 32 高控件（弹窗主操作）、select 触发器 |
| `--r-card` | 12px | 卡片、时间线块 |
| `--r-pane` | 14px | 面板/弹窗/抽屉 |
| `--r-full` | 999px | 胶囊（dock 项、筛选 chip） |

> 依据：HeroUI 32→12（.375）、BoardUI 36→10（.28）、Solid Glass 32→8.4（.26）。
> 取 `.3` 并向下取整到偶数半档；**禁止在 24 高控件上用 ≥10**（会成胶囊，显廉价）。

### 1.5 投影（只有三档，卡片默认近乎无影）

```css
--shadow-1: 0 1px 2px rgba(16,24,40,.05);              /* 卡片常态 */
--shadow-2: 0 8px 24px rgba(16,24,40,.08);             /* 卡片 hover / popover */
--shadow-3: 0 16px 40px rgba(16,24,40,.16);            /* dialog / 抽屉 */
/* 暗色：以 --line 描边替代，不叠黑影 */
```

BoardUI 实测其 footer 用 `0 -2px 13px rgba(0,0,0,.043)`（负 Y，向上投影）——
本项目的固定底栏/dock 沿用这个思路：**向上投，不向下投**，避免与内容阴影打架。

---

## 2. 尺寸标尺

| 维度 | 值 | 说明 |
|---|---|---|
| 间距 | 4 / 8 / 12 / 16 / 20 / 24 | 现状 3/5/6/7/9/10/14 全部归位 |
| 字号 | 10.5 / 11.5 / 12.5 / 14 / 17 | 10.5 只给时间轨数字；正文最小 11.5 |
| 行高 | 1.25 / 1.45 / 1.6 | 数据行 1.25，正文 1.45 |
| 控件高 | 24 / 28 / 32 | 24=dense（工具条/日历）、28=默认、32=弹窗主操作 |
| 图标 | 20px（24 viewBox, stroke 1.75） | 24 高控件内 16px |
| 动效 | 120ms 微反馈 / 180ms 浮层 / 240ms 视图切换 | 全部 `prefers-reduced-motion` 降级 |

字体栈（不引 webfont，MV3 与离线都要能跑）：
`-apple-system, "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`
数字一律 `font-variant-numeric: tabular-nums`。

---

## 3. 图标与按钮基元

### 3.1 `components/icon.js`

```js
export function icon(name, { size = 20, stroke = 1.75, cls = '' } = {}) -> SVGElement
export const ICONS = { menu, status, settings, plus, expand, range, calendar, week, month, timeline,
  chevronLeft, chevronRight, search, filter, template, save, copy, tag, folder, close, check, more, pin, sparkle, trash }
```

- 单一 `viewBox="0 0 24 24"`、`fill="none"`、`stroke="currentColor"`、`stroke-linecap="round"`。
- 内联字符串 → 无网络请求、CSP 安全、无字体依赖。
- 装饰性图标 `aria-hidden="true"`；图标按钮由调用方给 `aria-label`。

### 3.2 `components/button.js`

```js
export function button({ label, icon, variant='quiet', size='sm', title, onClick }) -> HTMLButtonElement
export function iconButton({ name, label, size='sm', variant='ghost' }) -> HTMLButtonElement
```

| variant | 底 | 边 | 字 | 用在 |
|---|---|---|---|---|
| `solid` | `--accent` | 无 | `--on-accent` | 每屏唯一主操作（新建/保存） |
| `outline` | `--surface` | 1px `--line-2` + `--shadow-1` | `--ink` | 次要动作（今天/取消） |
| `quiet` | 透明 | 透明 | `--ink-soft` | 工具条常规按钮 |
| `ghost` | 透明 | 透明（仅图标） | `--ink-soft` | header / section 图标按钮 |

状态矩阵（缺一不可）：
`hover`（`--sunken` 底 / solid 提亮 6%）、
`active`（`scale(.985)` + 内阴影 `inset 0 1px 2px rgba(16,24,40,.12)`，**按下挤压**）、
`focus-visible`（`outline: 2px solid var(--accent); outline-offset: 2px`）、
`disabled`（`opacity:.45; cursor:not-allowed`）、
`aria-pressed="true"`（`--sunken` 底 + `--ink` 字 + 600）。

> DOM 契约：保留现有类名（`.btn-primary` / `.btn-secondary` / `.cal-nav-btn` / `.view-wide-btn` /
> `.pool-tool-btn` / `.skills-toggle-btn` / `.cardpool-add-btn`），基元负责渲染，样式在 CSS 里映射，
> 避免一次性改 HTML 造成 dev-loop 断言全面失效。

---

## 4. 布局规格（320–500px 侧栏）

```
┌ header 44px：Journal(13/600) · 2026年11月8日(11.5/weak)   [menu][status][settings]
├ 视图头（两行布局，≤420px）
│   行1：‹  11月8日 周日 · 1 条记录  ›  [今天]
│   行2：[＋ 新建]  [范围 08–22]  [⛶]
├ 时间线/周/月（flex-1, overflow-y auto）
└ dock（sticky, 居中胶囊）：日程 | 周视图 | 月视图   ← 唯一视图切换入口
```

- **删除** `.view-modes`（emoji 三键）；`data-mode` 只由 dock 驱动，绑定改容器级委托。
- 视图头 ≤420px 强制两行（现状 6 控件挤一行）。
- 面板抽屉（`#sidebar`）保持右侧抽屉，不并排（320px 无空间）。
- header 三个功能按钮全部换 SVG（现状 `☰ ⚪️ ⚙️`）。

---

## 5. 视图规格

### 5.1 时间线
- 小时轨 44px，标签 10.5px `tabular-nums` `--ink-weak`；小时线 **1px 实线 `--line`**（去掉虚线）。
- 当前时间：`--accent` 2px 线 + 8px 圆点（带 3px 光环）+ `现在 16:55` 胶囊（白字）。
- 卡片：`--surface` + `box-shadow: inset 0 0 0 1px var(--line)`（不占布局宽度）+ `--shadow-1`，
  左 3px 色条走 `--cc-*`，padding 8/10，标题 12.5/600 单行省略，元信息 10.5 `--ink-weak`，
  hover 升 `--shadow-2` 并将内描边转 `--line-2`（**不位移**）。
- 空槽：`+ 在此添加` 仅 hover/focus 出现。

### 5.2 周视图（重点修 bug）
- `grid-template-columns: 44px repeat(7, minmax(0,1fr))`；卡片 `min-width:0`。
- 文本 `display:-webkit-box; -webkit-line-clamp:2; overflow:hidden; overflow-wrap:anywhere;`
  **禁止**宽度被压到 1 字导致按字竖排。
- 叠影根因（现役）：同列多卡 `position:absolute` + 半透明底叠加。
  改为**列内 flex 竖排 + 每卡不透明 `--surface` + 2px 间距**，跨时段高度由 `scheduleHeight()` 给，
  真重叠时横向并排（最多 2 列，超出折叠 `+N`）。
- 色条 3px，文字左内距 6px。

### 5.3 月视图
- 格高 `aspect-ratio: 1 / .92`，日期号 11.5，事件 pill 高 14px、10.5px 字、单行省略。
- 今日：`--accent` 实心圆角标（白字），非整格染色。

---

## 6. 质感与签名（Quiet Desk 版，纯结构）

纸感细节全部取消。品质感只由四件小事承担，且**每件都必须全站一致**：

| 细节 | 规格 | 预算 |
|---|---|---|
| 三档表面 | canvas / surface / sunken，一屏内不超过两层嵌套 | 全局 |
| 发丝描边 | 1px `--line`；卡片用 `inset` 阴影实现，控件用 border | 全局 |
| 单一主色 | 蓝只出现在「主操作 + 选中 + 焦点环 + 当前时间」四处 | 全局 |
| 数据色条 | 3px `--cc-*` 竖条，仅卡片/日历块 | 全局 |
| 空状态 | 24px 线稿图标（`icon()` 生成，套 `--accent-soft` 圆底）+ 一句原因 + 一个行动按钮 | ≤3 处 |

**不再有**：纸纹、胶带、图钉、手写字体、装饰性 emoji、`feTurbulence`、`backdrop-filter`。

---

## 7. 性能与工程约束

| 项 | 约束 | 验证 |
|---|---|---|
| 运行时依赖 | 0 新增 | `package.json` diff |
| CSS 产物 | `dist/sidepanel.css` 增量 <30KB | 构建前后 `wc -c` |
| 渲染 | 时间线 200 卡 <50ms | dev-loop 新增计时断言 |
| 合成层 | `backdrop-filter` **0** 处；`will-change` 0 | `rg -c` |
| 阴影 | 只用三档 token，禁止就地写 rgba | 代码审查 |
| 选择器 | 新增规则无 `!important`（reduced-motion 兜底除外） | `rg` |
| token 顺序 | `dist/*.css` → `select.css` → `styles/tokens.css` → `sidepanel.css` | 见 `styles/README.md` 已知坑 |
| Tailwind | 继续 `@theme inline` 只做 var() 别名；不引 preflight | `tailwind-migrated` 场景 |
| 图标 | 全部 `icon()` 生成，HTML 里不出现 emoji 功能图标 | DOM 断言 |

---

## 8. 兼容与回滚

- **DOM 契约不动**：`.seg` + `data-<key>` + `is-active`、`#view-dock [data-mode]`、
  `.calendar-grid`、`#cardpool-list` 结构与属性保持；新增结构一律「追加」。
- **每阶段一个 commit**，`dev/local` 顺序推进，任一阶段可 `git revert` 单点回滚。
- **部署隔离**：只在 dev-loop 临时构建 + dev host 8766 验证；不部署到 prod。
- **回滚成本最低的边界**：P1 只换 token（改配色/圆角/阴影），不改布局与 DOM，出问题 revert 一文件即可。

---

## 9. 阶段依赖

```
P0 样张（已完成，方向 B）
 └─ P1 token + icon + button（基元；不改布局）
     ├─ P2 外壳（header/工具条/dock/表面层级）
     │   ├─ P3 三视图
     │   └─ P4 面板 + 卡片池
     └─ P5 弹窗 + options + select（依赖 P1，串行合并）
         └─ P6 收口：暗色/对比度/键盘/性能/design-system.md v1.0
```

---

## 10. 数值校准（2026-11-08 实测，Playwright computed style）

> 方法：Playwright/chromium 打开各站首页 → `getComputedStyle` 读盒模型/字体/阴影 +
> 遍历同源 `document.styleSheets` 收集 `--*` 自定义属性。仅校准数值，不复制其值。

| 源 | 控件高 | 圆角 | 字体/内距 | 阴影·材质 | 备注 |
|---|---|---|---|---|---|
| HeroUI | 32 | 12px | 12–14/20 | 近无阴影 | 圆角 ≈ .375 × 高 |
| BoardUI | 36–40 | 10px / ∞胶囊 | 14/20, p 8 | `0 -2px 13px rgba(0,0,0,.043)`（负 Y） | 234 var，**深色优先** |
| Looseleaf | 36 | 1–3px | 16–17/24 手写 | 10 档 1–2px 微影 | 本轮不采用 |
| Inkra | 30 / 44 | 0 / 6px | 全手写 15/21.75 | 无 | 本轮不采用 |
| Solid Glass | 32 | 11.2（控件 8.4） | 14/20, p 0 10 | `oklch(.31 0 0/.46)` + blur 26，rim `0 0 0 1px` | 只借 rim 思路 |
| affectUI | 28 / 32 | 6 / 999 / 16 | 13/18.6 | 卡片 1px 边框、无阴影 | 只借组件级 token 命名 |

**由此落定的三条**：

1. **圆角 = 0.3 × 控件高**（见 §1.4），卡片/面板单独两档。
2. **描边用内阴影**：`box-shadow: inset 0 0 0 1px`，不占布局宽度（320px 下每卡省 2px），暗色沿用它承载 rim。
3. **投影只有三档 + 底栏负 Y**：卡片常态近乎无影，靠描边立住；只有 hover/浮层才出现大扩散阴影。
