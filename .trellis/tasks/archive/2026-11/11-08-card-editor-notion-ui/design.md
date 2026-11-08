# Design — 卡片编辑器 Notion 化

## 1. 结构对照

参考原型（暗色）与 journal 编辑器（亮/暗双主题）的映射，只照抄结构与层级，色值走本地 token。

```
参考 .props                      journal 现状                      journal 目标
grid: 104px 1fr                  .ce-section ×6 (border+surface)    .ce-props grid: 76px 1fr
.pkey  muted 11.5 + icon         .ce-section-label 大写+分隔线      .prop-key muted 11.5 + icon
.pval  正文 12 + inline chips    .seg 高饱和实底胶囊                .prop-val 正文 + .seg 弱底胶囊
.divider 1px border-soft         .ce-section 之间的 gap 10px        单条 .ce-divider
```

属性行清单（顺序 = Notion 阅读顺序，越常用越靠上）：

| # | key | 控件 | 备注 |
|---|---|---|---|
| 1 | 状态 | `.seg` ×4 + 自定义输入 | 自定义输入改为「选中态下的行内输入」，不再常驻一行 |
| 2 | 进度 | range + number | 仅 `type==='task'` 显示（见 §5） |
| 3 | 优先级 | `.seg` ×3 + 圆点 | 圆点承载颜色 |
| 4 | 日期 | `<input type=date>` | 从头部下沉到属性区 |
| 5 | 排程 | start/end/duration | id 全保留 |
| 6 | 标签 | chip 容器 + 输入 | 复用 `components/chip.js` |
| 7 | 项目 | input + datalist | 从「更多属性」上提 |
| 8+ | 自定义属性 | `.prop-row` | 与内建同一结构 |

## 2. 组件设计

### 2.1 `components/seg.js`

现状两份重复：`updateStatusSeg(value)` 与 `updatePrioritySeg(value)` 逻辑完全相同，
只是 `dataset` 键名不同（`status` / `priority`）；`bind-editor.js` 也写了两段相同的 click 委托。

```js
/**
 * @param {HTMLElement} container  role=radiogroup 的容器
 * @param {string} dataKey         子按钮上的 dataset 键（'status' | 'priority'）
 * @param {string} value           当前值
 * @param {(v:string)=>void} onPick 点击回调
 */
export function createSegGroup(container, dataKey, value, onPick) → { setValue(v), getValue() }
```

实现要点：
- `setValue` 只切 `.is-active` + `aria-checked`，不重建 DOM（幂等）。
- click 用**一次**事件委托（容器级），`e.target.closest('.seg')`。
- 回调只上报值，不写状态 —— 状态归属仍在 `card-editor.js`（保持 features 层职责）。

调用侧：`card-editor.js` 的 `updateStatusSeg/updatePrioritySeg` 保留为**导出薄包装**（`bind-editor.js` 与
`template-*` 仍按名引用），内部改为委托 `createSegGroup` 实例。这样导出面不变、DOM 契约不变。

### 2.2 `components/chip.js`

```js
export function createChip({ label, onRemove, removable, active, title })
  → HTMLButtonElement   // class="chip-atom [is-active]"
```
- 删除按钮用 `×` 文本 + `aria-label="移除标签 ${label}"`，**不**把 × 拼进 textContent（现状 `name + ' ×'`
  导致读屏把 × 念成「乘号」，且点击整块就删除，无法只选中）。
- `removable` 时 hover 才显示 ×（Notion 行为），键盘 focus 也显示。
- 输出类名保持 `tag-chip`（`views/timeline-card.js` 与既有 CSS 复用），新增 `.chip-atom` 作为行为钩子。

### 2.3 `components/property-row.js`

```js
export function createPropRow({ icon, label, key })
  → { row, val }   // row.className='prop-row'; 内含 .prop-key 与 .prop-val
```
内建属性由静态 HTML 直接写成同一结构（不再由 JS 生成），自定义属性由 `editor-props.js` 用此函数构建。
两者 DOM 完全同构 → CSS 只写一套。

## 3. 样式改造（sidepanel.css）

替换区块：`2323-2560` 的编辑器视觉段 + `2635-2665` 的补丁段。逐条映射：

| 现有规则 | 处置 |
|---|---|
| `.card-editor-accent` 渐变条 | **删除**（HTML 两处也删） |
| `.ce-section` border+surface+radius | 删除；新增 `.ce-props { display:grid; grid-template-columns:76px 1fr; gap:2px 10px; align-items:center }` |
| `.ce-section-label` 大写 + `::after` 分隔线 | 删除；`.prop-key` 承担 |
| `.status-seg .seg[data-status=*].is-active` 四色实底 | 删除；改 `.seg.is-active { background: var(--color-hover); color: var(--color-text) }` |
| `.prio-seg .seg[data-priority=*].is-active` 三色实底 | 删除；圆点 `.seg-dot[data-priority]` 用 `--prio-*` |
| `.card-editor-title` 底部 2px 边框常驻 | 改 1px transparent，`:focus` 才显示 |
| `.ce-emoji-tile` 渐变 + 阴影 | 改透明底，hover 弱底 + 1px border |
| `.card-editor-tags input` 独立框 | 并入 `.prop-val` 内联输入（无边框，`border-bottom` on focus） |
| `.ce-section:focus-within` 整段描边 | 删除 |
| `.card-editor-footer .btn-primary` 渐变 | 已去渐变，保留 `--color-accent-strong` |

新增 token（`styles/tokens.css`，亮/暗各一套或 color-mix 共用）：

```css
--color-hover: color-mix(in srgb, var(--color-text) 6%, transparent);   /* 弱底：seg 选中 / 图标 hover */
--color-hover-strong: color-mix(in srgb, var(--color-text) 10%, transparent);
--prio-high: #c62828; --prio-medium: #b8860b; --prio-low: #2e7d32;      /* 只用于 8px 圆点 */
```
圆点色只做装饰（3:1 图形对比），文字始终用 `--color-text`，因此不受 4.5:1 约束。

## 4. 交互不变式

- 点击 `.seg` → 写 hidden input → `onStatusClicked` / `updatePrioritySeg` 流程完全不变。
- 状态「已完成」↔ 进度 100% 的联动保留（属逻辑，本任务不动）。
- 标签回车添加、点击 chip 删除、`#card-editor-tag-input` 保留。
- Esc / ⌘⏎ / 遮罩点击关闭语义不变（`bind-editor.js` 现有 handler 全部保留）。

## 5. 渐进披露（可选增强，受控）

进度行仅在 `type === 'task'` 时可见：`#card-editor-type` change 时切换 `.ce-props` 上的 `data-type` 属性，
CSS 用 `.ce-props[data-type="text"] .prop-row[data-key="progress"] { display: none }`。
**风险**：`smoke.mjs` 未断言进度行可见性，但 `probe.mjs` 未涉；若实现后发现 dev-loop 有隐藏依赖则回退此项。
因此列为**可选**，默认实现。

## 6. 兼容与回滚

- 纯 CSS + 三个新组件文件，无数据结构变更 → 回滚 = `git revert` 单个 commit。
- 不改 host / 不改 storage → 无数据迁移风险。
- DOM 契约保留 → dev-loop 既有断言无需修改（若必须改断言，说明违反了 R3，应回退改法）。

## 7. 风险清单

| 风险 | 应对 |
|---|---|
| 320px 下两列网格挤爆值列 | 值列 `min-width:0`；键列 `76px` 固定；`@media (max-width:360px)` 降为 `64px` |
| 弱底胶囊在暗色下几乎不可见 | `--color-hover` 用 color-mix 对 text 提亮，暗色自动变成白 6% |
| `.seg` 从实底改弱底后，dev-loop 的 `.is-active` 断言仍绿（只查类名） | 已确认 `smoke.mjs:198` 只取 `data-priority` 属性 |
| 删 `.ce-section` 后 `editor-props.js` 的 `props-empty` 提示位置失效 | `.prop-val` 内保留空态行 |
| 状态四色圆点（📝📌🔥✅ emoji）与优先级圆点并存造成视觉噪音 | 状态保留 emoji（它是内容语义），优先级用纯色圆点 + 文字「高/中/低」 |
