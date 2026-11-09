# State Management

> 状态放哪里、怎么读、怎么写。分层见 [`directory-structure.md`](./directory-structure.md)。

---

## Overview

无 Redux / MobX / Zustand。状态分四类，**各有唯一归属地**：

| 类别 | 归属 | 例子 | 生命周期 |
|---|---|---|---|
| **权威数据** | host SQLite | 卡片、日志、待办 | 永久 |
| **内存真源** | `state/repository.js` | 卡片数组（UI 读取的唯一入口） | 页面存活期 |
| **本地缓存** | `platform.storage`（`cards` 键） | 镜像，供 host 离线时降级 | 永久 |
| **视图状态** | `state/view-state.js` 的 `vs` | 选中日期、视图模式、筛选、布局 | 页面存活期（部分小偏好持久化） |

> **双真源是禁止的。** 卡片数据只有一条写入路径（`repository`），storage 只是它的镜像。

---

## 数据流（三条路径合一）

```
        ┌─────────────── entries/app.js（组合根） ───────────────┐
        │  ① 启动 pullFromHost()  → ② startHostSync(20s 轮询)     │
        └────────────────────────┬───────────────────────────────┘
                                 ▼
   host REST ◀── state/host-client.js ──▶ state/sync-bridge.js
                                 │  pull / 轮询内容签名去重
                                 ▼
                    repository.hydrate(cards)  →  notify()
                                 ▼
                 entries/app.js 的订阅回调 → refreshAll()

   用户写入：views/features → repository.create/update/delete
                → host 落库（权威）→ 更新内存 → 写 storage 镜像 → notify()
```

要点：
- **写入是"先 host 后内存"**（不做乐观 UI，避免重构期新增竞态面）。host 失败 → 抛错 → 调用方 toast + 不改内存。
- **轮询用内容签名去重**：签名未变不通知、不重渲染。首轮只建基线不通知。
- **通知 ≠ 重渲染**：`repository.subscribe` 只负责"数据变了"；何时重渲染由 UI 层决定
  （拖拽/缩放中会被 `entries/app.js` 主动跳过，避免打断手势）。

---

## repository（内存真源）

`state/repository.js` —— **卡片读写的唯一入口**。

```js
import * as repo from '../state/repository.js';

repo.getAllCards();              // 全部（同步，内存）
repo.getCardsByDay('2026-10-06');// 某天，按 time 升序、null time 最后
repo.subscribe(cb);              // 变更通知，返回退订函数
repo.hydrate(cards);             // 由 sync-bridge 调用（不要从视图调）

await repo.createCardEntry(patch);
await repo.updateCardEntry(id, patch);
await repo.deleteCardEntry(id);
await repo.hydrateFromCache();   // host 离线时回填（含旧 journals/todos 迁移）
```

- 查询是**同步**的（读内存），不要 `await`。
- `updateCardEntry` 会把 patch 合并回 host 响应，防止旧版 host 忽略字段导致界面回弹。
- 订阅者抛错被隔离（`try/catch` + `console.error`），不会中断其他订阅者。

---

## view-state（视图状态）

```js
import { vs } from '../state/view-state.js';

vs.selectedDate = '2026-10-06';
vs.viewMode = 'week';
vs.poolStatusFilter = 'active';
```

- `vs` 是**普通可变对象**，不是响应式 store：**改完要显式调渲染**（保持"显式调用渲染"的现有模型）。
- 持久化的小偏好走端口同步接口：`getPort().prefGet/prefSet('journal.viewMode')`。
- 新增字段 → 直接加进 `vs` 并补 `@type`；**不要再新建模块级 `let`**。
- 派生值（`heatmapCache` `allCardsCache`）是渲染缓存，由渲染流程刷新。

---

## actions（反向调用通道）

`state/actions.js` 存放由**组合根注入**的回调，用于打破 `views → entries → views` 循环：

```js
import { actions } from '../state/actions.js';
actions.refreshAll();          // 全量重渲染
actions.openEditor(card, time, date, assignedDate);
actions.updateEditorDuration();
```

默认实现是 **no-op**，所以模块加载顺序无关，单测不必启动整个应用。

---

## prop-library / settings（host meta 与本地设置）

- **属性库、命名视图、模板** 存 host `meta`（`getHostMeta/setHostMeta`），**不跨端同步**、不进 storage。
- **设置**（同步配置、AI、主题）走 `state/settings.js`。

---

## Read / Write Patterns

```js
// ✅ 读：内存真源
const today = repo.getCardsByDay(vs.selectedDate);

// ✅ 写：host 权威优先；失败不改内存
try { await repo.updateCardEntry(id, { done: true }); }
catch { showToast('保存失败', 'warn'); }

// ❌ 绕过 repository 直接写缓存 → 双真源、订阅者收不到通知
await getPort().storageSet({ cards: [...] });

// ❌ 视图里直接读 storage
const { cards } = await getPort().storageGet('cards');
```

---

## When to Promote to Storage

只有满足其一才提升为持久状态：
1. 必须跨 Service Worker 休眠 / 页面重载存活；
2. 必须被其他上下文（background / options）读到。

其余一律留内存。**不要**把 `vs` 里的字段随手写进 storage。

---

## Common Mistakes

- ❌ 读 storage 当"真源" → 与 repository 内存态不一致（本重构已消除）。
- ❌ 在视图里 `hydrate()` 覆盖真源 → 会把并发写入冲掉；只有 sync-bridge 能 hydrate。
- ❌ 改 `vs` 后忘了调渲染 → 界面不更新（无响应式）。
- ❌ 在 `views/` 里 `import` `entries/` 拿函数 → 用 `actions`。
- ❌ 新建一个模块级 `let` 当缓存 → 归 `vs` 或 `repository`。
- ❌ `storageGet`/`storageSet` 在视图层出现 → 违反分层，lint 不会报但架构评审会拦。

---

## 状态机与全局标志（2026-11-10 起）

历史上有 15 台「隐式状态机」：状态散落在模块级 `let`、`body` class、事件处理器 if 链里。
现在它们有四个零依赖原语 + 一张登记表：**登记表见 [`docs/state-machines.md`](../../../docs/state-machines.md)**，
改任何带状态的交互前先查表（所有者 / 状态 / 事件 / 观测点）。

| 原语 | 位置 | 用途 | 硬约定 |
|---|---|---|---|
| `fsm` | `shared/fsm.js` | 纯函数转移表 | 非法转移不抛（原状态 + `console.debug`），目标 `null` = 显式自环；shared 层零依赖 |
| `layer-stack` | `features/layer-stack.js` | 浮层唯一所有者（Esc / 外点 / z 阶梯） | **新浮层必须** `pushLayer` + 关闭函数里 `popLayer`，z 取 `LAYER_Z`；禁止再自挂 document Esc |
| `gesture` | `views/gesture.js` | 拖拽全局标志唯一写者 | `body.dataset.gesture` + 迁移期旧 class（`is-dragging` 等）同写；禁止新代码直接 `classList.add('is-dragging')` |
| `busy` | `features/busy.js` | 写操作 in-flight 去重 | 会落 host 的**用户触发入口**（按钮 + 快捷键两条路径）套 `withBusy(key, fn)`；按钮 disabled 只能挡鼠标 |

### 为什么（不是银弹清单，是踩过的坑）

- **Esc 穿透**：每个浮层各自抢 Esc + `bind-editor.js` 手写优先级链，新浮层漏插队 = Esc 直接关掉编辑器丢表单。
  现在 `layer-stack` 在 `window` capture 层只关栈顶；栈空时不拦截（旧逻辑兜底）。
- **`is-dragging` 泄漏 = 界面永久冻结**：`entries/app.js` 的轮询回调靠 body class 决定跳过重渲染；
  任何一次手势没收尾（回调抛错 / pointercancel 漏挂）都会让外部变化永远不可见。
  `gesture.endGesture` 在 `finally` 里执行，标志自愈。
- **双击重复建卡**：`editorSave.disabled` 挡不住 `⌘⏎`（`bind-editor.js` 直调 `saveEditor`）。
  去重必须落在**函数入口**，不是按钮状态。
- **pref 漂移**：`setPanels` 之外再写一遍 body class 就会出现「Esc 关了抽屉但 pref 还是 1」。
  全局 UI 标志一律**单一写入口**（class + aria + pref 一起写）。

### 观测约定（DX / AX）

| 观测点 | 值 |
|---|---|
| `body.dataset.gesture` | `drag` / `resize` / `tpl-drag` / `pool-drag`（在途手势，结束时清空） |
| `#host-status-btn[data-host-state]` | `unknown` / `online` / `offline` / `starting` |
| `getHostState()` | 与 `data-host-state` 同源（模块内单一真源） |
| `getSyncState()` | `idle` / `baseline` / `syncing` / `offline`（sync-bridge 只读快照） |

dev-loop 场景可以直接断言这些属性，不必反推 class 组合。

### 迁移未完成的部分（保持现状，别顺手改）

- `tpl-drag` / `pool-drag` 历史上不阻断轮询渲染（`app.js` 只跳过 `drag`/`resize`）。
- `body.is-dragging` / `.is-resizing` / `.tpl-dragging` 的 CSS 选择器仍在：`gesture` 迁移期双写，
  删旧 class 需要同时改 CSS 与 `app.js` 的兼容读，属于独立任务。
- 卡片编辑器生命周期（`editorSnapshot` 脏检查）尚未换成 `fsm` 定义：它是「表单快照比对」，
  和事件驱动的转移表不是一类问题，登记表里标为 ➖ 保持现状。
