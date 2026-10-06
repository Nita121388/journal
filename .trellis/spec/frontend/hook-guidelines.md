# Module Guidelines

> 各层 ES module 的写法约定（本项目没有 React hook，"hook 层"的对应物就是 `shared/` 与 `state/` 的模块）。
> 分层与依赖方向见 [`directory-structure.md`](./directory-structure.md)。

---

## Overview

Journal 无 React hooks。功能等价物是分层的原生 ES module：

- `shared/` —— **纯函数**，同输入同输出，无副作用（可 Node 直测）。
- `state/` —— **有状态模块**，对外暴露读写函数 + 订阅，内部持有内存真源。
- `views/` `features/` —— **渲染与交互**，函数式渲染 + 事件委托。

文件头必须写清这个模块"有没有副作用"。

---

## Module Sizing

| 层 | 上限 | 超过时 |
|---|---|---|
| `shared/` `state/` | **200 行** | 按子概念拆分（如 `template-{builder,rows,fields,menu}`） |
| `views/` `features/` | **400 行** | 拆出子视图 / 子功能模块 |
| `entries/` | 组合根 **<120 行**；bind-* 无硬限但保持"只绑定不实现" | 逻辑下沉到 views/features |

实测：当前最大 UI 模块 353 行，入口 13 行。**新增代码不得突破上表。**

---

## Function Conventions

```js
// shared/model.js
/**
 * @param {Card[]} cards
 * @returns {Record<string, number>} dayKey → 卡片数
 */
export function aggregateHeatmap(cards) { /* 纯函数：无副作用、不读存储 */ }
```

- **默认纯函数**：同输入同输出。有副作用的模块要在文件头声明。
- 异步函数返回 Promise，调用方 `await`。
- 前缀语义：

| 前缀 | 含义 |
|---|---|
| `get*` / `list*` | 读（可能命中存储/内存真源） |
| `save*` / `set*` | 写 |
| `merge*` / `diff*` | 同步/变更合并 |
| `aggregate*` / `count*` / `filter*` | 纯派生 |
| `render*` / `build*` | 建 DOM（`render*` 第一个参数必须是容器） |
| `bind*` | 只挂事件、不含业务实现 |
| `init*` / `load*` | 启动期一次性装配/拉取 |

- **禁止**导出"既读存储又渲染 DOM"的函数 → 拆成 `load*` + `render*`。
- 每个导出函数必须有 JSDoc（`@param` / `@returns`）；核心数据形状用 `@typedef`（见 [`type-safety.md`](./type-safety.md)）。

---

## State: 只有两个地方能放可变状态

```js
// ✅ 视图状态 → state/view-state.js 的 vs 对象（显式字段）
import { vs } from '../state/view-state.js';
vs.viewMode = 'week';

// ✅ 数据状态 → state/repository.js 的内存真源
import { getAllCards, subscribe } from '../state/repository.js';

// ❌ 在 views/features 里新建模块级可变变量
let selectedDate = today();     // 禁止：跨模块不可见、无法统一重置
```

**判断标准**：这个值在视图切换 / 重新渲染后还要存活吗？
- 要 → `vs`（视图状态）或 host（持久数据）。
- 不要 → 用函数内局部变量，或直接读 DOM。

---

## 打破循环：`state/actions.js` 反向调用通道

视图需要触发"全量重渲染 / 打开编辑器"时**不要** import `entries/`（会形成
`views → entries → views` 循环）。改为：

```js
// entries/app.js —— 组合根注入
import { actions } from '../state/actions.js';
actions.refreshAll = refreshAll;
actions.openEditor = openEditor;
actions.updateEditorDuration = updateEditorDuration;

// views/*.js —— 业务方调用
import { actions } from '../state/actions.js';
actions.refreshAll();
```

`actions.js` 的默认实现是 **no-op**，因此模块加载顺序无关、单测无需启动整个应用。

---

## Platform: 只用端口，不碰实现

```js
// ✅
import { getPort } from '../platform/index.js';
const cache = await getPort().storageGet('journal.llmCache');
getPort().prefSet('journal.viewMode', 'week');

// ❌ 只有 entries/ 才允许 import 具体实现
import { createChromePort } from '../platform/chrome.js';
```

新端口能力的落地步骤：`platform/index.js` 加 `@property` → `chrome.js` 实现 →
`web.js` 实现 → 测试用 `test-helpers.mjs` 的 `makePort()` 补上 → 消费方调用。

---

## DOM: 元素引用集中在 `components/dom-refs.js`

```js
// components/dom-refs.js
export const els = {
  headerDate: document.getElementById('header-date'),
  // …
};
```

理由：全部 `getElementById` 收敛到一处，视图只读 `els.xxx`，避免 37 个模块各自查 DOM。
**新增元素 → 在这里加一行**，不要在视图里就地 `document.getElementById`。

---

## 事件绑定

- **挂一次**：在 `entries/bind-*.js` 或模块初始化时绑定，不要在 render 里重复 `addEventListener`（泄漏）。
- **委托优先**：列表类容器用事件委托（`e.target.closest()`），不要给每一项各挂一个。
- **`innerHTML` 仅限开发者自控的静态片段**；任何用户内容一律 `textContent` / `createElement`。

---

## Common Mistakes

- ❌ "纯派生"函数里读存储 → 不可测、渲染时序难推理。
- ❌ 一个模块既读存储又写 DOM → 拆成 `load*` + `render*`。
- ❌ `render*` 函数每次调用都新建并缓存 DOM 引用 → 用 `els` 一次取好。
- ❌ 视图里 `import` 另一个视图的私有变量 → 提取到 `vs` 或 `shared/`。
- ❌ 为图方便在 `views/` 里 `fetch()` → 走 `hostFetch` 端口（否则桌面版要改 UI 代码）。
- ❌ 把模块级 `let` 当"缓存" → 与 `repository` 的内存真源形成双真源，触发数据不一致。
