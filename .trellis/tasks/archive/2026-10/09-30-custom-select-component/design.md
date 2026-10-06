# Design — 自建下拉框组件（BoardUI 风格）

## 1. 架构决策

### 1.1 保留原生 select（核心决策）

组件**不移除**原生 `<select>`，而是把它做 visually-hidden，并以其为唯一数据源：

```html
<div class="js-select" data-size="sm">      ← 包裹层（搬运原生 select 的布局属性）
  <select class="js-select-native" tabindex="-1" aria-hidden="true">…</select>
  <button class="js-select-trigger" role="combobox" aria-expanded aria-haspopup="listbox" aria-controls>
      <span class="js-select-value">已选文本</span>
      <svg class="js-select-chevron" aria-hidden="true">…</svg>
  </button>
</div>
<!-- 浮层首次打开时懒挂到 document.body，不进包裹层 -->
<div class="js-select-pop" role="listbox" hidden>
  <div class="js-select-item" role="option" aria-selected>
    <span class="js-select-check" aria-hidden="true"></span>
    <span class="js-select-label">…</span>
  </div>
</div>
```

收益：
- `.value` 读写、`change` 事件、表单语义、`selectedOptions` 全部原生可用 → **6 处调用点零改动**
- `new Option(...)` / `sel.append(...)` 由 `MutationObserver` 捕获 → 动态选项自动重绘
- `.multiple = true` 原生生效
- 无 JS / 读屏异常时降级为原生控件

### 1.2 为什么不放 `src/tailwind.css`

`src/tailwind.css` 编译进 `dist/sidepanel.css`，而 `options.html` **不加载**该产物。
让设置页引入整个侧栏产物会污染它（`body` flex 布局、header 样式串入）。
→ 组件样式写独立 `extension/select.css`，被两个页面同时引入。
（`component-guidelines.md` §Styling Patterns 允许"Plain CSS files per page"，此处是每组件一个文件。）

## 2. 模块与 API

新增 `extension/lib/select.js`（ES module，与 `lib/*.js` 一致）：

```js
export function enhanceSelect(selectEl, opts = {})  // 幂等：registry 命中直接返回
export function autoEnhance(root = document)        // 扫描 + 启动全局 observer（页面 init 调一次）
```

`opts`：
| 字段 | 默认 | 说明 |
|---|---|---|
| `size` | `'sm'` | `'sm'` 紧凑(11px) / `'md'` 标准(12–13px)。**也可用 `data-select-size` 属性声明**（如设置页 `#sync-provider`）。不用 font-size 探测——视觉规则已迁移到 select.css，原生 select 只剩 UA 默认字号，会把紧凑档误判为 md |
| `placeholder` | `'请选择'` | 无选中项（或选中项文本为空）时的触发器文案 |

启动时机：两个页面在 `init()` 开头调用 `autoEnhance()` 扫描 `select:not([data-no-enhance])`。
动态创建的 select 走 `MutationObserver`（观察 `document.documentElement` 子树中新增的 `select`）自动增强 —— 这样 `sidepanel.js` 的 5 处 `createElement('select')` **完全不用改**。

> **已检测的坑（实现修正）**：不能用「监听 `option[selected]` 属性变化」感知外部选中态变更。实测 `option.selected = true` / `select.value = x` 只改内部选中态，**不反映**到 `selected` 内容属性（该属性对应的是 `defaultSelected`）。本项目大量使用 `sel.value = x`（8 处）。故在实例上重定义 `value` 访问器（`patchValueAccessor`）拦截外部赋值并触发重绘；插入 DOM 前的 `opt.selected` 批量预选（2 处）则由增强时的首次全量 `render` 覆盖。

## 3. 定位算法（P1 核心难点）

弹窗动画 `.card-editor` 的 `ce-pop` 关键帧含 `transform: translateY(12px) scale(.97)`，
`.overlay` 也有 `animation`。**带 transform 的祖先会让 `position:fixed` 相对该祖先定位** → popover 必须
`document.body.appendChild`，不能挂在 dialog 内部。

```js
function position(trigger, pop) {
  const r = trigger.getBoundingClientRect();
  const vh = window.innerHeight, vw = window.innerWidth;
  const GAP = 6, MARGIN = 8;

  pop.style.maxHeight = '';                       // 先量自然高度
  const natural = pop.scrollHeight;
  const below = vh - r.bottom - GAP - MARGIN;
  const above = r.top - GAP - MARGIN;
  const openUp = below < Math.min(natural, 120) && above > below;

  const avail = openUp ? above : below;
  const maxH = Math.max(96, Math.min(natural, avail));
  pop.style.maxHeight = maxH + 'px';

  const h = pop.offsetHeight;                     // 限高后实测
  const top = openUp ? r.top - GAP - h : r.bottom + GAP;

  // 水平：默认左对齐 trigger；溢出右缘则右对齐 trigger 右缘；再 clamp 到视口
  let left = r.left;
  if (left + pop.offsetWidth > vw - MARGIN) left = r.right - pop.offsetWidth;
  left = Math.max(MARGIN, Math.min(left, vw - pop.offsetWidth - MARGIN));

  pop.style.top = top + 'px';
  pop.style.left = left + 'px';
  pop.style.minWidth = r.width + 'px';
}
```

- 打开时定位一次；`window` 的 `scroll`（capture 模式，覆盖侧栏内滚动容器）与 `resize` 触发重定位。
- 320px 侧栏 + 6–7 个选项场景下，`below` 约 150–250px，足够；`prop-type` 7 项在弹窗底部时会走 `openUp`。
- z-index：**150**（> 属性弹窗 140 与模板构建器 120，< toast 200）。

## 4. 焦点与键盘模型

采用 `aria-activedescendant`：**焦点始终在触发器**，不移动到列表项。

- 好处：无焦点陷阱、不会因 focus 引起侧栏滚动跳动、Esc 语义天然。
- `trigger.setAttribute('aria-activedescendant', itemId)`；`item.id = `${uid}-${index}``。
- 打开时 active = 当前选中项（无则 0）；关闭时清空该属性。

| 键 | 行为 |
|---|---|
| `Enter` / `Space` / `↓` | 打开（Space 需 preventDefault 防页面滚动） |
| `↑` `↓` | 移动 active，首尾 clamp |
| `Home` / `End` | 跳首/末 |
| `Enter`（已开） | 选中 active，单选则关闭 |
| `Space`（已开） | 选中 active；**多选时不清空、不关闭** |
| `Esc` | 关闭 |
| `Tab` | 关闭（不阻止焦点转移） |
| 可打印字符 | typeahead：500ms 内累加前缀匹配，循环 |

active 项滚入可视区：`el.scrollIntoView({block:'nearest'})`。
hover 同步 active（mouseenter），点击选中；`pointerdown` 捕获阶段判外部点击关闭（早于 blur）。

## 5. 多选

- 触发器文案：0 项 → placeholder；≥1 项 → `已选 N 项 · ${首项}…`（truncate）。
- item 选中态：`accent-soft` 底 + 左侧 accent 对勾。
- 底部固定"清除"行 → 全部取消选中。
- 选中后**保持 popover 打开**，焦点不动。
- 通过原生多选 select 写回 `selected`，`change` 事件照常触发，`selectedOptions` 自动同步。

## 6. 样式与 token

新增 `extension/select.css`。颜色全部走两套页面各自提供的语义变量，**不写 hex**：

```css
.js-select-trigger {
  border: 1px solid var(--color-border);
  border-radius: var(--select-radius);
  background: var(--color-bg);
  box-shadow: var(--select-shadow);
  transition: background-color var(--select-dur), border-color var(--select-dur);
}
```
在 `sidepanel.css` / `options.css` 的 `:root` 各自补（`var()` 引用而非字面值，暗色自动跟随）：

| token | 侧栏 | 设置页 |
|---|---|---|
| `--select-radius-sm` | 8px | 10px |
| `--select-radius-md` | 10px | 12px |
| `--select-h-sm` | 24px | 32px |
| `--select-h-md` | 32px | 38px |
| `--select-shadow` | `0 1px 2px rgba(0,0,0,.04)` | `0 1px 2px rgba(31,42,37,.05)` |
| `--select-pop-shadow` | `0 6px 20px rgba(0,0,0,.14)` | `0 6px 20px rgba(31,42,37,.10)` |
| `--select-hover-border` | `var(--color-muted)` | `var(--color-border-strong)` |
| `--select-dur` / `--select-ease` | 200ms / `cubic-bezier(.2,.8,.2,1)` | 同 |
| `--color-focus` | `color-mix(in srgb, var(--color-accent) 70%, #000)` | 同 |

> 圆角取值说明：BoardUI `rounded-2lg` 视觉约 12–14px，但那是 14px/36px 高的桌面控件。
> 本项目侧栏控件 11px 字号、约 24px 高，12px 圆角会呈胶囊状，故 sm 取 8px、md 取 10px。
> 两个 `*-shadow` 的 rgba 是本组件新增的仅有的两个字面量，集中定义在两处 `:root`（不在组件里内联），
> 符合 design-system §8「基础层值只出现在 :root」。

关键规则：
- `.js-select-native` 用 visually-hidden（clip + 1px）配合 `tabindex=-1` + `aria-hidden=true`（JS 设置）：
  保留数据源/表单语义/无 JS 降级，同时不占 tab 序与无障碍树。
- 展开动画 200ms；select.css 自带 `@media (prefers-reduced-motion: reduce)` 降级（不依赖 sidepanel.css 兜底，因为 options 页不加载它）。
- chevron 展开 `transform: rotate(180deg)`。
- **尺寸搬运**：`copyLayout()` 读原生 select 的 computed `display`/`max-width`/`flex-*`/是否撑满父容器，搬到包裹层（`.js-select`）上，保证在既有 flex 行 / 100% 宽布局中不破版。因此原生 select 上仍需保留**纯布局占位**声明（如 `.pool-view-select{max-width:96px}`、`.pool-project-select{max-width:140px}`），视觉声明则已全部删除。

## 7. 删除清单（P3，已执行）

`sidepanel.css`：全局 `select` 块（含 `appearance:none`/渐变箭头/outline 焦点）、`.pool-view-select` 视觉、`.pool-project-select` 视觉、`.card-editor-workflow select`、`.prop-form-row select` 分支、`.prop-field > select`。
`options.css`：`.field select` 块与 `.field input, .field select` 联合声明中的 select 分支（input 保留）、媒体查询里的 `.field select`。

> 保留：`max-width` 布局占位（`.pool-view-select` 96px / `.pool-project-select` 140px）供 `copyLayout` 搬运；`.prop-input` 共享类（仍用于 text/checkbox 类型的自定义属性控件）。
> 满宽字段规则改为直接作用于包裹层：`.prop-field > .js-select` / `.js-select-trigger { width:100% }`。

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| 弹窗内 `position:fixed` 被 transform 劫持 | popover portal 到 `document.body` |
| 320px 内 popover 溢出 | 翻转 + 限高内滚 + 视口 clamp + dev-loop 多宽度断言 |
| 读屏回归 | 原生 select 保留 + 完整 listbox 语义 |
| 动态 option 变化不重绘 | MutationObserver（`childList` + `subtree`） |
| 多个增强实例互相干扰（Esc/外部点击） | 模块级单例"当前打开实例"，同一时刻只允许一个 popover |
| 与既有 `change` 监听重复触发 | 组件只在用户交互（choose/clear）时写回原生 select 并补发一次 `change`；渲染/同步路径不 dispatch |
| 焦点丢失（popover 打开时列表重建） | 列表 DOM 复用，仅更新 class/aria |

## 9. 涉及文件

| 文件 | 动作 |
|---|---|
| `extension/lib/select.js` | 新增 |
| `extension/select.css` | 新增 |
| `extension/sidepanel.html` | 引 select.css |
| `extension/options.html` | 引 select.css |
| `extension/sidepanel.js` | 仅加 1 行 import + 1 行启动扫描（不改既有逻辑） |
| `extension/options.js` | 同上 |
| `extension/sidepanel.css` | 补 :root token + 删旧 select 规则 |
| `extension/options.css` | 补 :root token + 删旧 select 规则 |
| `dev-loop/scenarios/select.mjs` + `dev-loop.mjs` | 新增回归场景 |
| `.trellis/spec/frontend/design-system.md` | §6 补 Select 行 |
