# Component Guidelines

> How UI building blocks are structured in the extension.

---

## Overview

The extension uses a **side panel** as its main surface. There is **no component framework** (no React/Vue). "Components" are reusable DOM-building functions or partial HTML fragments rendered by plain JS. Keep rendering logic small, pure, and DOM-light.

---

## Component Structure

A reusable UI block is a plain function that takes state and returns a DOM node:

```js
// lib/ui/heatmap.js
export function renderHeatmap(container, entriesByDay) {
  container.replaceChildren();
  for (const [dayKey, count] of Object.entries(entriesByDay)) {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.dataset.day = dayKey;
    cell.title = `${dayKey}: ${count} entries`;
    if (count > 0) cell.classList.add('is-filled');
    container.append(cell);
  }
}
```

Rules:
- A "component" = one exported function, one responsibility.
- **Never** build HTML via `innerHTML` with user content (XSS risk). Use `createElement`/`textContent` for anything user-authored (journal text, todo titles).
- `innerHTML` is allowed only for **static, developer-controlled** markup.
- Rendering functions must be idempotent: calling twice with the same state gives the same DOM.

---

## Props Conventions

No framework props. Instead:

- Pass **plain data** (objects/arrays) into render functions; do not pass DOM nodes.
- Keep render functions **pure**: no storage reads, no side effects — the caller fetches state and passes it in.

```js
// bad — component reads storage itself
renderTodoList(); // reads chrome.storage internally

// good — caller owns data fetching
const todos = await loadTodos();
renderTodoList(todos, onToggle);
```

---

## Styling Patterns

- Plain CSS files per page (`sidepanel.css`, `options.css`).
- **CSS custom properties** for the theme palette, defined in `:root` in `sidepanel.css`:

```css
:root {
  --color-bg: #ffffff;
  --color-accent: #4caf50;   /* heatmap "filled" green */
  --color-muted: #9e9e9e;
}
```

- Class names prefixed by block name (`heatmap-cell`, `todo-item`, `todo-item--done`).
- Support `prefers-color-scheme: dark` via a `[data-theme="dark"]` attribute set on `<html>`.

---

## Accessibility

- All interactive elements are real `<button>` / `<input>` / `<textarea>` — no `div` with click handlers where a native control works.
- Side panel must be fully keyboard-navigable (Tab order, Enter/Space activation).
- `aria-label` on icon-only buttons (e.g. delete, toggle).
- The textarea for journal entry is a plain `<textarea>` with an explicit label.
- Focus states must be visible (don't strip `:focus-visible` outlines).

---

## Common Mistakes

- Concatenating user input into `innerHTML` → **XSS**. Always `textContent`.
- Rendering functions that secretly read storage → hard to test, re-render bugs.
- Multiple listeners attached on every render (leak) → attach once, use event delegation on the container.
- Styling with `!important` to fight specificity → restructure CSS instead.
- Debounce + 日期/上下文切换不同步 → 草稿丢失或写入错误目标（见下方 Gotcha）

---

## Gotcha: 防抖保存 + 上下文切换的竞态

**场景**：textarea 输入用 `debounce(500ms)` 保存，但用户可能在防抖窗口内切换编辑目标（如日历选另一天）。若不处理，待执行的防抖回调会用过期上下文保存，或新上下文内容被旧保存覆盖。

**处理模式（flush-before-switch）**：

1. `debounce()` 包装函数暴露 `cancel()` 方法，切换前取消未执行的定时器。
2. 切换函数先**立即落盘**当前内容（flush），再更新状态。
3. 用**序列号**防止并发切换：只有最后一次切换能提交，过期异步加载不覆盖 textarea。

```js
// debounce 需可 cancel
function debounce(fn, ms = 500) {
  let timer = null;
  const wrapped = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  wrapped.cancel = () => { clearTimeout(timer); timer = null; };
  return wrapped;
}

// 切换前先 flush（sidepanel.js switchToDate 模式）
let switchSeq = 0;
async function switchToDate(newDate) {
  if (newDate === selectedDate) return;
  const seq = ++switchSeq;
  debouncedSave.cancel();           // 1. 取消防抖
  await saveJournal(selectedDate, textarea.value);  // 2. 落盘当前上下文
  if (seq !== switchSeq) return;    // 3. 已被更新的切换取代
  selectedDate = newDate;
  const text = await getJournal(newDate);
  if (seq !== switchSeq) return;    // 防过期加载覆盖
  textarea.value = text;
}
```

**原则**：任何「异步写入 + 可切换上下文」的 UI 都必须先 flush 再切换；防抖包装器应支持 cancel。

## Gotcha: 短卡片悬停展开 + 拖拽的 CSS 互斥

**场景**：日程画布上时长 ≤ 30 分钟的卡片只有 30px 高，正文被 `overflow:hidden` 裁掉。做法是给这类卡片加 `.is-short`：紧凑布局（收缩 padding、折叠 footer）+ `:hover` 撑开显示完整内容。

**互斥要点**：
1. **悬停展开必须用 `:not(.is-dragging)` 门控**，否则拖拽中指针停在卡片上会让卡片涨高，拖动定位全乱。因为 `pointerdown` 就加 `.is-dragging`（早于任何移动），整个拖拽期间该选择器被排除；`pointerup/pointercancel` 移除后才允许再展开。
2. **过渡抑制规则要两条都写**：`.is-short { transition: height .2s }` 是 0,2,0；`.timeline-card.is-dragging { transition:none }` 也是 0,2,0 且更靠前 —— 拖拽类的抑制会被短的等权重规则覆盖。必须补一条更高特异性的 `body.is-dragging .timeline-card.is-short { transition:none }`（0,3,1），否则拖拽结束卡片会从槽位高度"动画"回弹而非瞬时收起。
3. **撑开靠 `height:auto !important`**：卡片高度由内联 `style.height`（槽位 px）决定，CSS 必须 `!important` 才能覆盖内联样式。这是唯一合理的 `!important` 用法（覆盖内联布局值）。
4. 收缩 `padding-bottom` 时 resize 手柄（`position:absolute; bottom:0`）不受影响 —— 它绘制在流内内容之上。

**原则**：给"靠状态类互斥的交互"（拖拽/缩放/悬停展开）写 CSS 时，逐条核对同特异性规则的出现顺序，并用更高特异性的门控规则显式关掉不需要的过渡。

## Field Registry（字段注册表）

所有卡片字段（内建必选 title/content/tags、内建可选 status/priority/progress/assignedDate/project/schedule、属性库自定义）**统一为一条 `FieldDef`**。真相源 = `extension/lib/field-registry.js`（纯函数模块，无 DOM/storage）。禁用 `BUILTIN_DEFS`/`findPropDef` 分叉；读取一律 `getFieldDef(key)`。

### 三维度解耦（各管一件事）
| 维度 | 回答 | 消费者 |
|---|---|---|
| `type` | 值怎么存、用什么控件 | `buildTplDefaultEditor` / `buildPropControl` |
| `behavior` | 引擎拿到值后做什么（渲染/联动/归一化） | 卡片池徽标、时间线、建卡落位 |
| `storage` | 值落卡片哪个字段 | `createFromTemplate` / `readValueFromCard` |

`FieldDef = {key,label,icon,type,behavior,required,source,locked,options?,storage,empty}`。`source:'builtin'|'user'` 只决定可删改权限；`required:true` = 每卡必有的锁定行。behavior 取值：`none|tags|status|priority|progress|date|project|schedule`。

### 签名
```js
initFieldRegistry({ getUserFields: () => propLibrary })  // loadPropLibrary() 之后调一次
getFieldDef(key)                       // → FieldDef|null（替代 findPropDef）
listFieldDefs({source?,behavior?,required?})  // → FieldDef[]（供下拉/渲染遍历）
isReservedKey(key, RESERVED_PROPS)     // 内建 key + 保留字统一判定
writeValueToCard(card,key,value)       // 按 storage 落位（建卡）
readValueFromCard(card,key)            // 按 storage 读回
```

### 契约：writeValueToCard 语义
- `storage.kind==='card'`：`fields.value` 存在则写一级字段 `v = value ?? empty`（无条件写）；`fields` 无 value（schedule）则按 `{start,end,duration}` 展开写 `startTime/endTime/duration`。
- `storage.kind==='props'`（用户字段默认）：**仅当 value 非 undefined/null/'' 才写** `card.props[key]`。
- **未登记 key**（旧模板里属性库已删除的字段）：`getFieldDef` 返回 null → 退化为 `props` 写入，保持旧 `default:` 分支行为，不得丢值。

### 行为分发取代硬编码 key
卡片池徽标按 `def.behavior` 遍历（**seed 数组顺序 = 渲染顺序**，改动顺序即改视觉顺序）；建卡用 `writeValueToCard` 取代 `switch(key)`。业务规则（如状态筛选 `statusMatches`、时间线布局）**不属于字段分发，不动**。

## Gotcha: 显式 null 与 `??` 的陷阱

**场景**：注册表 `empty` 可能是显式 `null`（progress/assignedDate 等“空即无值”的字段）。

**陷阱**：`const empty = st.empty ?? def?.empty ?? defaultEmpty(type)` —— `??` 把显式 `null` 当“缺失”跳过，继续回退到 `defaultEmpty('number')`（`''`），于是建卡时空进度被写成空串而非 null。

**正解**：用 `hasOwnProperty` 判断“属性是否存在”，而非 nullish 判断。
```js
const empty = Object.prototype.hasOwnProperty.call(st, 'empty') ? st.empty : defaultEmpty(def?.type);
```

**原则**：注册表/配置里的“可能为 null 的显式默认值”不能用 `??` 兜底，只能用属性存在性判断。

## Gotcha: 共享 document 的 Esc 监听器竞争

**场景**：多个浮层（属性行右键菜单 `propRowMenuEl`、行内图标 `rowIconPop`、字段选择 `fieldPickerEl`）各自在 `document` 上注册 keydown，且有一个全局 Esc handler 会关掉整个构建器/编辑器。

**陷阱**：浮层自己的 `onKey`(Esc→close) 与全局 handler 同挂在 document；`stopPropagation` 无效（同节点，stopPropagation 不阻止兄弟监听器；只有 `stopImmediatePropagation` 有效但会破坏全局语义）。若浮层用 `setTimeout(0)` 注册，监听器顺序在全局之后 → Esc 先关浮层再关整个构建器。

**正解**：全局 Esc handler 必须把每个浮层变量列入 early-return 列表，Esc 只关最上层浮层。
```js
if (propRowMenuEl && e.key==='Escape') { e.preventDefault(); closePropRowMenu(); return; }
if (fieldPickerEl  && e.key==='Escape') { e.preventDefault(); closeFieldPicker();  return; }
if (rowIconPop     && e.key==='Escape') { e.preventDefault(); closeRowIconPicker(); return; }
// 都不开时才落到：关整个构建器/编辑器
```

**原则**：新增同域浮层时，三件事成套做——① 声明模块级 `xxxEl` 变量；② 全局 Esc handler 加一行 early-return；③ 重建宿主（`render*()`）时先 `closeXxx()`。

## Unified Card Pool (统一卡片池，阶段 B)

- **待办不是独立区块**：卡片池是唯一主视图，`status ∈ {todo,doing}` 即「待办」筛选（`statusMatches(c,'active')`），与其他筛选（标签/项目）AND 叠加。
- **渲染纯函数**：`renderCardPool()` 从 `allCardsCache`（非 `getPoolCards`）过滤；`statusMatches` / `chipSpan` 为纯辅助。
- **状态着色**：`.cardpool-item.status-{todo|doing|done|none}` 用左侧色条区分；done 卡降透明度。
- **布局**：`.is-list`（列表，隐藏 chips/进度，显示只读元数据行 `.cardpool-sysmeta` = 修改时间 + 🤖AI/👤人工）；默认卡片视图（两行）。
- **只读元数据**：修改时间/来源来自 `card.meta.updatedBy`，仅文本展示不可编辑。
- **命名视图 / 模板 / 属性库** 存 host `meta`（经 `getHostMeta/setHostMeta`），不入 chrome.storage；本机不跨端同步。
- **进度↔状态联动**：`editorStatus.value==='done' ⇒ progress=100`；`progress>=100 ⇒ status='done'`，回退 `doing/todo`。时长↔起止双向：`updateEditorDuration`（起止→时长）+ `onEditorDurationInput`（时长→结束）。
- **保留字保护**：自定义属性 key 必须过 `RESERVED_PROPS`（`title/status/…` 不可用作属性名）。

## Gotcha: 行内编辑（原位替换）+ 数据标识（key）语义

**场景**：模板构建器属性行要支持「双击属性名 → 原位变 input → 回车/失焦确认、Esc 取消」，且新建属性时按属性名自动推断 type/icon/options、key 取属性名。

**行内编辑要点**（`openNameEditor` 模式，sidepanel.js）：
1. **原位替换而非弹窗**：把 `<span>` 用 `replaceWith(input)` 换掉，`input.focus()+select()`；提交/取消后整块 `renderTemplateBuilder()` 重建。
2. **Enter 提交 / blur 提交 / Esc 取消**：`keydown` 里 Enter→`finish(true)`、Esc→`finish(false)`；`blur`→`finish(true)`。`finish` 用局部 `done` 防重入（blur+Enter 连发）。
3. **拒绝提交要能保持编辑态**：`onCommit` 返回 `false` 时（如保留字拦截），`finish` 把 `done` 复位、不重建列表、焦点留在 input —— 用户可继续改。这是「校验失败不吞输入」的关键。
4. **实时推断不能重建列表**：输入过程中要按名字改图标/类型，只能**局部替换** `.tpl-prop-icon` 文本和 `.tpl-prop-value` 的 `replaceChildren()`，重建整棵列表会打断输入焦点。

**数据标识（key）语义**（模板/属性库通用）：
- **key = 数据身份，label = 显示名**：创建时 key 取属性名（自动去重 `(2)`、`(3)`），改名**只改 `def.label`，key 永不变** —— 否则已填卡片数据按旧 key 存、改名即断链。
- **新建属性必须过 `RESERVED_PROPS`**：自定义属性 key 不得撞一等字段（`title/status/priority/project/…`）。注意 `dedupeKey` 会给保留字加后缀绕过，所以**先判原始名、再 dedupe**。
- 图标/显示名覆盖允许，类型锁定（内置三件套）时右键菜单不出现「修改类型/移除」。

**原则**：凡「原地编辑 + 校验失败重来」的交互，onCommit 必须支持「返回 false 拒绝且不丢焦点」；凡「名字即数据标识」的字段，改名路径与 dedupe 路径必须分开，防止校验被去重绕过。
