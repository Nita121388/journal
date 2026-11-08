# 卡片编辑器 UI Notion 化重构（组件封装）

## Goal

把卡片编辑弹窗从「六段带边框卡片 + 高饱和实底胶囊」改为 **Notion 属性网格风格**：
左侧一列弱化属性名（图标 + 11.5px muted 文字），右侧一列值（chip / 弱底分段 / 纯文本），
整块只有一条分隔线，没有卡片边框与底色。同时把重复的 UI 片段抽成 `components/` 可复用原子。

参考范式：`E:/code/snorkeling/design/prototypes/commontext-cloud-sync-notion/index.html`
（`.props` = `grid-template-columns: 104px 1fr`，`.pkey` muted + 图标，`.pval` 正文色 + 内联 chip，无卡片）。

## Requirements

### R1 视觉风格（本任务唯一目标）

- 属性区改为两列网格：键列弱化（muted 色、图标、11.5px），值列正文色。
- 取消每个分区独立卡片（`.ce-section` 的 border + surface 底 + 大写标签 + 分隔线）。
- 状态 / 优先级分段改为 Notion 式「弱底胶囊」：未选 = 透明底 + 无边框；选中 = `--color-hover` 弱底 + 文字色不变。
  彩色只出现在 **8px 圆点**上，不再整块高饱和实底。
- 标题改为无边框大标题（22px，focus 时才出现 1px 底边）。
- 图标瓦片改为透明底 + hover 弱底（去掉绿色渐变方块与阴影）。
- 删除顶部 4 色渐变装饰条（`.card-editor-accent`）。
- 主按钮去掉渐变，改 accent-strong 实底（当前已去渐变，保持）。
- 标签 chip 改为 Notion 式小方 chip（`--r-sm` 而非胶囊），hover 才出现删除 ×。
- 焦点：取消 `.ce-section:focus-within` 整段描边，只保留控件自身 `:focus-visible` 环。

### R2 组件封装复用（用户明确要求）

新增 3 个 `components/` 原子，替换现有重复实现：

| 组件 | 替换掉的重复 |
|---|---|
| `components/seg.js` | `card-editor.js` 的 `updateStatusSeg` / `updatePrioritySeg` 两份近乎相同的遍历；`bind-editor.js` 两段相同的 click 委托 |
| `components/chip.js` | `card-editor.js` 的 `renderEditorTags` 与 `views/timeline-card.js` 的 `.tag-chip` 构建（两处手写） |
| `components/property-row.js` | 编辑器内建属性（静态 HTML）与自定义属性（`editor-props.js` 动态构建）两套不一致的行结构 |

复用边界：`.prop-row` / `.prop-key` / `.prop-val` 三件套同时服务「内建属性行」与「自定义属性行」，
使两者在视觉与 DOM 上完全一致（现在内建是卡片、自定义是 flex 行，风格割裂）。

### R3 不变约束（硬门）

- **DOM 契约不变**：`dev-loop/scenarios/smoke.mjs:186-198` 依赖
  `#card-editor-priority-seg .seg[data-priority]` 与 `.seg.is-active`；
  `smoke.mjs:383-399` 依赖 `#card-editor-type|start|end|duration-min|duration` 的 id 与不溢出；
  `dev-loop/probe.mjs:40` 依赖 `#card-editor-overlay` `#card-editor-cancel` `#card-editor-priority-seg .seg`。
  因此 **id 全保留、`.seg` 类名保留、`.is-active` 语义保留**，只换样式与布局容器。
- 不改任何状态机逻辑（自定义状态覆盖、进度反写等已知缺陷另开任务）。
- 不改 `views/timeline-card.js` 的视觉（只让它复用 chip 组件，输出 DOM 等价）。
- 模板构建器（`.template-builder` / `.tpl-*`）本次不动，避免 diff 混层。

### R4 设计系统合规

- 新增颜色一律进 `styles/tokens.css` 语义层（`:root` + 暗色覆盖），组件里不写 hex。
- 暗色自动跟随：新 token 用 `color-mix(in srgb, var(--color-text) N%, transparent)` 形式，两套主题共用。
- 对比度：所有文字仍 ≥4.5:1（弱底胶囊的文字色 = `--color-text` / `--color-muted`，本身已达标）。
- 保留 `prefers-reduced-motion` 兜底；动效只用 150ms ease-out。

## Acceptance Criteria

- [ ] 属性区渲染为两列网格，键列宽度在 320/360/400/500 四档下一致且不换行错位
- [ ] 编辑器内不再存在 `.ce-section` 卡片；`.card-editor-accent` 已从 HTML 移除
- [ ] 状态/优先级选中态为弱底 + 文字色，彩色只出现在圆点上；状态「未开始」与优先级「中」不再同色同形
- [ ] `#card-editor-status-seg .seg[data-status]` ×4、`#card-editor-priority-seg .seg[data-priority]` ×3 全部保留，点击后 `.is-active` 唯一
- [ ] `components/seg.js` `components/chip.js` `components/property-row.js` 存在，`components/README.md` 已更新
- [ ] `card-editor.js` 不再有重复的分段遍历实现；`bind-editor.js` 只有一处 seg 点击委托
- [ ] 自定义属性行与内建属性行使用同一套 `.prop-row/.prop-key/.prop-val` 结构
- [ ] `npm --prefix extension run lint` 0 error（含 `eslint-boundaries.test.js` 分层断言）
- [ ] `npm --prefix extension run test` 全绿
- [ ] `node dev-loop/dev-loop.mjs --scenario smoke --width 320,360,400,500` 全绿（含既有「类型选择器 ≥90px」「排程不溢出」断言）
- [ ] 亮/暗两套主题下截图人工确认：无卡片边框、无渐变条、无整段绿色焦点框
- [ ] 无新增硬编码 hex（`grep` 校验 sidepanel.css 的编辑器段）

## Notes

- 本任务只做**视觉层 + 组件抽取**。逻辑缺陷（自定义状态覆盖预设、进度反写状态、时长三重真源）留待后续任务。
- 参考文件是暗色原型；本仓库是亮/暗双主题，色值不照抄，只照抄**结构与层级**。
