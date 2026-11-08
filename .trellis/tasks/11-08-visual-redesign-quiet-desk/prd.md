# 视觉重构：Quiet Desk（BoardUI 基线）

## 背景（实测证据）

现役 sidepanel 的「丑」不是缺组件库，而是缺体系。取证自 `dev-loop/out/2026-11-08T08-54-55-115Z/shot-400.png`
与 `2026-11-08T03-25-03-412Z/cal-week-400.png`，以及 `extension/sidepanel.html`：

1. **功能图标几乎全是 emoji**：`☰ ⚪️ ⚙️ 🃏 📅 🔥 🧠 ⊞ 💾 ⛁ 🗂️ 📋 📅 📆 ⏱ ⛶`。
   既违反自家 `spec/frontend/design-system.md §5`，在 Windows 上渲染尺寸/基线也各不相同。
2. **导航重复**：顶部 `.view-modes`（emoji 三键）与底部 `#view-dock`（SVG 三键）是同一功能的两套入口。
3. **层级只靠灰**：页面底 + `--color-surface` 灰面板 + 白卡 + 1px 灰描边，三层嵌套全是灰盒，无材质、无留白节奏。
4. **控件不统一**：同一行内 `‹ / 今天 / ＋ / ⛶ / 08–22 / 📅📆⏱` 六种尺寸、圆角、字重（`.cal-nav-btn`、
   `.cal-today-btn`、`.view-wide-btn`、`.view-span-btn`、`.view-mode-btn` 各自为政）。
5. **周视图不可读**：卡片标题按字竖排、色块半透明叠影（截图已复现），320–400px 下信息为零。
6. **字号/标签扁平**：`11px` 通杀；`.section-label` 用 `uppercase + letter-spacing`——对中文无效，只增噪。

对照参考源（均已实际打开截图核对）后的结论：本项目缺的是
**① 统一控制件体系 ② 一个视觉主张 ③ 材质层级**，而不是再引入一个 UI 库。

## 目标

在不引入任何运行时依赖的前提下，把 sidepanel / options / select 三页重构为
**方向 B「Quiet Desk」——BoardUI 字面基线 + HeroUI 的组件状态矩阵**（P0 用户已拍板）：

- 结构：一套尺寸/间距/字号/圆角标尺（圆角 = 0.3 × 控件高），一套按钮与图标基元。
- 材质：三层表面（canvas / surface / sunken）+ 发丝描边 + 三档极弱投影；深色为深石板，非纯黑。
- 主色：单一蓝（#2563EB）只用于「主操作 / 选中 / 焦点环 / 当前时间」。
- 禁止：纸纹、胶带、图钉、手写字体、装饰性 emoji、`backdrop-filter`。
- 可读：周视图/时间线在 320px 下必须正常阅读。

## 需求

| # | 需求 |
|---|---|
| R1 | 三个候选方向先出静态样张（P0），用户目视拍板后才动代码 |
| R2 | 重建分层 token：间距/字号/控件高度/圆角/阴影/主色/语义色/表面与描边；组件只允许用语义层 |
| R3 | 全部功能图标改 inline SVG（24 viewBox / stroke 1.75 / currentColor）；DOM 中不残留功能 emoji |
| R4 | 视图切换唯一入口：删顶部 `.view-modes`，保留并重做底部 dock |
| R5 | 按钮收敛为 4 变体（ghost / quiet / outline / solid）× 3 尺寸（24 / 28 / 32），全部走同一基元 |
| R6 | 视觉层级改为「三层表面 + 发丝描边 + 三档投影」，不再用灰底盒子表达层级 |
| R7 | 周视图在 320/360/400px 下标题单行省略、无按字竖排、无叠影 |
| R11 | 一号主色纪律：蓝色出现位置 ≤4 类（主操作/选中/焦点环/当前时间），不得用于装饰 |
| R8 | 亮/暗两套完整；`prefers-reduced-motion` 降级；焦点环与对比度硬门不放宽 |
| R9 | options 页与 select 页同步换皮，三页视觉一致 |
| R10 | 零新增运行时依赖；CSS 产物增量 <30KB；时间线 200 卡渲染 <50ms |

## 决策记录

- **2026-11-08 方向定稿：B「Quiet Desk」。** 依据：P0 三方向样张（`docs/design/directions/`）目视对比，
  用户选定 B。放弃 A（纸感）与 C（手绘）的理由：A 的暖纸+墨线在窄侧栏低对比环境下偏软；
  C 的手绘边需要 SVG 描边变形才能成立，暗色维护成本翻倍。
- 主色：单蓝 `#2563EB`（亮）/ `#5B8DFF`（暗）；绿退出 UI 语义，只留作日历数据色系之一。

## 非目标

- 不引入 React/Vue/运行时 Tailwind/动画库；不购买任何 Pro 组件。
- 不改 host、存储、同步、协议层；不改卡片数据模型与既有 DOM 契约（`.seg`、`data-mode` 等 dev-loop 依赖）。
- 不重做交互逻辑与信息架构（那是 `10-06-quality-sprint` 的范围）。
- 不在 prod（8765 / `E:\primary\data\journal`）环境验证：一律走 dev host 8766 + dev-loop 隔离环境。

## 参考源判定（抄什么 / 为什么不抄）

| 源 | 采纳 | 拒绝理由 |
|---|---|---|
| BoardUI | 主结构基线：间距标尺、卡片三段式（标题/元信息/右对齐数字）、三档控件高度、极弱描边、自建 select | React/Aria/TanStack 依赖无法复用；蓝色主色与「日志」气质不符 |
| HeroUI | 四态齐全的组件状态矩阵、chip/badge 克制配色、无障碍语义 | 只是组件清单，无版式主张；Pro 部分不碰 |
| Inkra | **纸面材质主张**：整页一张纸、墨线分隔、无阴影、暖白+墨黑 | 楷体正文在 11px 数据界面不可读；仅浅色，暗色需自行衍生 |
| Looseleaf | 纸纹、胶带、图钉、便利贴——**限量签名细节** | 全站手写字体+手绘边框在数据密集界面噪音爆炸；暗色不可维护 |
| Solid Glass | 暗色烟熏 pane 的分层方式；「待决策卡 / Agent run」信息结构 | 纯黑 + 大量 backdrop-filter 在窄侧栏吃 GPU 且发糊 |
| affectUI | trace/工具步骤/审批卡的信息结构（仅用于 AI 生成属性一处） | 多数 Pro 付费；黑白极简与纸感冲突 |
| Prestige UI | 仅「动效只做 hover/入场」的尺度 | 落地页营销动效对工具无用 |
| goopUI | 仅「点阵画布」纹理思路（暗色纸纹备选） | 黏液/粘滞交互与「记录」目标相反，输入延迟感 |
| PlopUI | 仅「按下 1px 挤压位移」微反馈 | 手写字体 Windows 缺失；贴纸头像与 Inkra 重复且更吵 |

## 验收标准（整体）

1. **方向已拍板**：`docs/design/directions/` 有 3 方向 × 亮暗 × 320/400 样张，用户选定其一并记入本任务 notes。
2. **零功能 emoji**：`document.querySelectorAll('#header button, .view-header button, .section-header button, .view-dock button')`
   的 `textContent` 不含 emoji 字符；卡片内容图标不受限。
3. **单一导航**：`#view-dock` 存在且唯一驱动 `data-mode`；`.view-modes` 从 DOM 移除。
4. **token 纪律**：`git diff` 中 `sidepanel.css` / `options.css` 无新增 hex（`styles/tokens.css` 除外）；
   无新增内联 `style.*` 控制视觉。
5. **周视图可读**：dev-loop 新增断言在 320/360/400 下——卡片标题 `white-space` 非逐字换行（元素宽 > 4 字宽）、
   同列卡片 `getBoundingClientRect()` 无重叠、容器无横向溢出。
6. **对比度**：正文 ≥4.5:1、大字/图形 ≥3:1（沿用 `calendar-visual` 场景断言），亮暗各跑一遍。
7. **键盘**：所有新控件 Tab 可达、`:focus-visible` 环可见；dock 与日历网格保留 roving tabindex。
8. **回归**：`npm run lint`、`npm test`、dev-loop `smoke / calendar-visual / tailwind-migrated / options / select / tpl / llm`
   全部 exit 0 且 console error = 0。
9. **性能**：`extension/dist/sidepanel.css` 体积增量 <30KB；时间线 200 卡渲染 <50ms（dev-loop 计时断言）；
   `backdrop-filter` 出现次数 ≤1。
