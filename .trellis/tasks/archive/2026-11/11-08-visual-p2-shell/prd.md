# P2 外壳重构：header / 视图工具条 / dock 唯一化 / 表面层级

## 背景

P1 已换掉配色与圆角，但界面仍「丑」在三处结构性问题上（`dev-loop/out/2026-11-08T14-56-16-341Z/shot-400.png` 为证）：

1. header 三个按钮仍是 emoji（`☰ ⚪️ ⚙️`），Windows 下尺寸/基线各异，且违反自家 §5。
2. 视图头一样挤了 6 个控件，`08–22` 与 3 个 emoji 模式键互相压；而这些模式键与底部 dock 是同一功能的两套入口。
3. 层级仍靠「灰面板 + 白卡 + 描边」堆叠；`.section-label` 用 `uppercase + letter-spacing` 对中文无效，只增噪。

## 需求

| # | 需求 |
|---|---|
| R1 | header 高 44px，标题 13/600 + 日期 11.5/weak；右侧三个按钮改用 `components/icon.js` 的 `menu` / `status` / `settings`，28px ghost |
| R2 | **删除** `.view-modes` 三个 emoji 按钮；`data-mode` 只由 `#view-dock` 驱动；底部 dock 成为唯一视图切换入口 |
| R3 | 视图头改两行：行 1 = `‹ 11月8日 周日 · N 条记录 › [今天]`；行 2 = `[＋ 新建] [08–22] [⛶]`；≤420px 不换行挤压 |
| R4 | 卡片池/日历/热力图/Skills 四个 section header 统一结构（SVG 图标 + 标题 11.5/600 + 计数徽标 + 工具位）；`.section-label` 去 `uppercase`/`letter-spacing` |
| R5 | 层级改为三层表面：页面 = `--canvas`，面板/卡片 = `--surface` + 1px `--line`，轨道/hover = `--sunken`；不再出现「灰底盒子套白盒子」 |
| R6 | dock 改 Quiet Desk 形态：`--sunken` 轨道 + 选中项 `--surface` 胶囊 + `--shadow-1` + `--accent` 文字；sticky 吸底、向上投影（BoardUI 负 Y 思路） |
| R7 | 离线横幅从硬编码琥珀色改为语义 token（`--warn` 派生），暗色跟随 |
| R8 | HTML 里通过 `data-icon="name"` 占位，由 `icon()` 在初始化时注入；DOM 中不残留功能 emoji |

## 非目标

- 不改三视图内部渲染逻辑（P3）、不改侧栏面板内容结构（P4）、不改弹窗（P5）。
- 不改 `views/` 的渲染函数签名与 DOM 契约（`.seg`/`data-*`/`#view-dock [data-mode]`/`.calendar-grid`/`#cardpool-list`）。

## 验收标准

- [ ] `document.querySelectorAll('#header button, .view-header button, .section-header button, .view-dock button')` 的 `textContent` 无 emoji（已由 P2 新增 dev-loop 断言覆盖）
- [ ] `document.querySelector('.view-modes') === null`；`#view-dock` 存在且唯一驱动 `data-mode`
- [ ] 320/360/400/500 四宽度：无横向滚动、视图头两行不溢出、dock 不遮挡最后一条内容
- [ ] 键盘：header 三按钮与 dock 三按钮 Tab 可达、`:focus-visible` 环可见（2px accent）
- [ ] `npm run lint` / `npm test` / dev-loop `smoke`、`tailwind-migrated`、`calendar-visual --seed`（亮暗）全绿
- [ ] 暗色下 header/视图头/dock 与亮色同构（只有 token 差异，无额外覆盖规则堆叠）
