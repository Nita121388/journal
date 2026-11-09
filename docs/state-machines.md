# 状态机登记表（state-machines.md）

> **谁拥有这个状态？** 改任何一段交互代码前，先在这张表里找到对应机器：
> 状态列表、事件、不变量、DOM 观测点。登记 ≠ 收编 —— 有的机器保持现状（标 ➖），
> 但「保持现状」也必须在这里能查到，不许靠考古 if 链。
>
> 勘察来源：2026-11-10 全量清单（`docs/answers/implicit-state-machines.html`）；
> 本表逐台核对当前代码维护，与源稿冲突时**以本表 + 代码为准**。

## 观测约定（dev-loop / 调试可断言的点）

| 观测点 | 写者 | 取值 |
|---|---|---|
| `document.body.dataset.gesture` | `views/gesture.js`（唯一写者） | `drag` / `resize` / `tpl-drag` / `pool-drag`（无手势时属性删除） |
| `layers()`（`features/layer-stack.js`） | 浮层栈 | 栈底 → 栈顶的只读快照；Esc/外点只关栈顶 |
| `#btn-host-status[data-host-state]` | `features/host-status.js` | `unknown` / `online` / `offline` / `starting` |
| `getHostState()`（`features/host-status.js`） | 同上 | 同上（JS 侧真源，DOM 是镜像） |
| `getSyncState()`（`state/sync-bridge.js`） | 同步桥 | `idle` / `syncing` / `baseline` / `offline` |

迁移期兼容：`app.js` 同时读 `dataset.gesture` 与旧 body class（`is-dragging`/`is-resizing`）；
CSS 侧也仍消费旧 class。删除旧 class 前两者保持双写（见 `views/gesture.js` 头注释）。

## 四个原语（一台机器只允许有一个「所有者」）

| 原语 | 位置 | 收编谁 |
|---|---|---|
| `defineMachine` / `transition` / `availableEvents` / `assertMachine` | `shared/fsm.js`（纯函数，零 DOM/storage/chrome） | 转移表的定义处；非法转移不抛、返回原态 + `console.debug` |
| `pushLayer` / `popLayer` / `layers` + `LAYER_Z` | `features/layer-stack.js` | 全部浮层（Esc 只关栈顶、外点统一派发、z 阶梯单一来源） |
| `beginGesture` / `endGesture` / `bindPointerDrag` / `suppressNextClick` | `views/gesture.js` | 四份拖拽复制的 body 标志 + suppressClick（pointerup/cancel 兜底自愈） |
| `withBusy` / `isBusy` | `features/busy.js` | 写操作 in-flight 去重（同 key 返回同一个 promise） |

---

## 一、生命周期与浮层（7 台）

### 1. 卡片编辑器 —— ✅ 已收编（withBusy + layer-stack）

- **所有者**：`features/card-editor.js`
- **状态**：`closed` → `open·clean` → `dirty` → `confirming`（脏关闭确认）→ `closed`；`saving` 由 `withBusy('editor.save')` 表达（进行中 = `isBusy`，无独立 UI 态）
- **事件/触发**：`openEditor`（open）、任意输入（dirty，由 `editorSnapshot` 快照比对 `isEditorDirty()`）、Esc/遮罩/取消（统一走 `requestCloseEditor` → 脏则 `confirmDialog`）、`saveEditor`（saving → closed）
- **不变量**：脏检查快照必须在**所有预填完成之后**取（`openEditorRange` 的教训）；保存去重必须在函数入口（⌘⏎ 绕过按钮 disabled）
- **观测点**：`#card-editor-overlay` 的 `hidden` class；`#editor-save` 的 `disabled` + 文案「保存中…」

### 2. 浮层栈 —— ✅ 已收编（P2，layer-stack）

- **所有者**：`features/layer-stack.js`（唯一所有者；各浮层只贡献 `close` 回调，全部幂等）
- **状态**：任意深度的层栈；同 id 视为同一浮层（重复 push 先静默出栈旧的）
- **事件/触发**：`pushLayer`（打开浮层时）、`popLayer`（关闭函数里）、Esc（window capture，只关栈顶 + `preventDefault` + `stopPropagation`）、外点（document capture mousedown，只关栈顶且 `dismissOnOutsideClick` 的层）
- **迁移成员**：appDialog、卡片编辑器、模板构建器、tpl-prop 弹窗、字段浮层 ×2、emoji picker、右键菜单、select 下拉（`select-pop`）
- **不变量**：`close` 回调幂等（双派发安全）；栈只决定「谁被关闭」，不决定「怎么关闭」；z-index 只从 `LAYER_Z` 取
- **观测点**：`layers()` 快照；各浮层 DOM 自身的 `hidden` class / `aria-expanded`

### 3. 模板构建器 —— ➖ 保持现状（多 let，已用 setter 收口）

- **所有者**：`features/template-builder.js` + `template-rows.js`
- **状态**：`closed` / `create` / `edit`（`tplEditingId` 区分）+ 子状态 `tplEditKey`（属性定义弹窗开在哪个 key 上）、`tplDragKey`（排序拖拽中）、`tplBuilderState`（表单内容）、`tplBuilderCleanup`（列表事件解绑）
- **不变量**：跨模块写这些变量必须走 setter（ESM import 绑定只读，直接赋值抛 `TypeError`）；重建列表前先 `closeXxx()` 清子浮层
- **观测点**：`#template-builder-overlay` 的 `hidden` class；拖拽中 `.tpl-extra-row.is-dragging`

### 4. 下拉选择 —— ➖ 保持现状（openState 单例，已并入浮层栈）

- **所有者**：`features/select-view.js`（`openState` 单例：同一时刻只允许一个 popover 打开）
- **状态**：`closed` → `open` →（typeahead 窗口 / active item 移动）→ `closed`
- **事件/触发**：触发器点击 / ↑↓ Home End Enter / 字符 typeahead（`TYPEAHEAD_MS` 窗口）/ Esc / 外点 / Tab
- **不变量**：`st.open === true` 必须先于 `render`（`aria-activedescendant` 依赖）；关闭必须同时 `popLayer('select-pop')`
- **观测点**：触发器 `aria-expanded`；popover `hidden` 属性

### 5. Toast + 撤销窗口 —— ➖ 保持现状

- **所有者**：`features/toast.js`（`toastTimer` / `toastAction` 两个模块级 let）
- **状态**：`hidden` → `shown` →（有撤销按钮时 `undo-window`，默认 6s / 错误 12s）→ `hidden`
- **事件/触发**：`showToast`（重置计时器）、点撤销（执行一次后立即失效 + 隐藏）、超时 `hideToast`
- **不变量**：`toastAction` 点击即置空（单次守卫）；有撤销时 `tabIndex=0`（键盘可达）
- **观测点**：`#toast` 的 `hidden` class 与 `has-action` class

### 6. 主面板开合 —— ✅ 已收编（P3，单一写入口）

- **所有者**：`entries/bind-shell.js` 的 `setPanels(open)`（唯一写入口）
- **状态**：`panels-open` ∈ {true, false}（body class + pref `journal.panelsOpen` + `aria-expanded` 三处由它同步）
- **事件/触发**：点抽屉按钮（toggle）、点 board 空白（关）、Esc（关）、初始化（pref 是真源，只读一次）
- **不变量**：**一切路径（含 Esc/遮罩）都写 pref**（缺陷 2 的修复：此前 Esc 路径不写，下次启动回到旧状态）
- **观测点**：`body.panels-open` class；`journal.panelsOpen` pref

### 7. 展开卡 —— ➖ 保持现状（勘察时已自觉）

- **所有者**：`views/card-expand.js` + `state/view-state.js` 的 `vs.expandedCardId`
- **状态**：`null`（未展开）⇄ 某个 `cardId`（全局唯一）
- **事件/触发**：点 pill/时间块（toggle）、点关闭按钮（关）、卡片被删/改期（静默清空）
- **不变量**：展开态全局唯一；渲染前先 `release()` 旧 Milkdown 实例（防 ProseMirror 悬挂）
- **观测点**：`vs.expandedCardId`；`.cc-detail` 是否存在于容器末尾

---

## 二、手势（4 台 + 1 全局耦合点）

### 8/9. 时间线卡片移动 / 缩放 —— ✅ 已收编（P4，gesture 内核）

- **所有者**：`views/timeline-card.js`（交互细节：吸附/钳制/patchCard）+ `views/gesture.js`（body 标志 + suppressClick + 兜底自愈）
- **状态**：`press` → `drag`（过阈值）→ `commit`（pointerup）/ `cancel`（pointercancel）
- **不变量**：阈值/吸附数值是各手势本地实现细节，**不**收进内核（行为等价优先）；`pointerup/pointercancel` 兜底清标志 —— 即使回调抛错，`finally` 里也清（class 泄漏 = app.js 轮询渲染被永久跳过）
- **观测点**：`document.body.dataset.gesture` = `drag` / `resize`

### 10. 框选时间范围 —— ✅ 已收编（P4，gesture 内核；对外 API 不变）

- **所有者**：`views/range-select.js`（`bindRangeSelect` 签名不变，两个调用方 timeline.js / week.js 零改动）
- **状态/不变量**：同 8/9；额外不变量：grid-label 上不触发框选（复制引导的教训）
- **观测点**：`document.body.dataset.gesture` = `drag`；框选框 `.range-select-box`

### 11. 卡片池 DnD + 模板行排序拖拽 —— ✅ 已收编（P4，body 标志部分）

- **所有者**：`views/pool.js`（HTML5 DnD 保留原生事件）+ `features/template-rows.js`（同）+ `views/gesture.js`（`pool-drag` / `tpl-drag` 两个 kind）
- **状态**：原生 `dragstart` → `dragover` → `drop`/`dragend`；body 标志统一由 `beginGesture`/`endGesture` 写
- **不变量**：DnD 用原生事件，手势内核只收编 body 标志与 suppressClick 语义
- **观测点**：`document.body.dataset.gesture` = `pool-drag` / `tpl-drag`

**全局耦合点**：`entries/app.js:50` 轮询回调读 `dataset.gesture`（迁移期兼容读旧 body class）跳过重渲染 —— 手势进行中不打断定位。

---

## 三、数据同步与降级（4 台）

### 12. host 连接 —— ✅ 已收编（P5，fsm 定义 + data-host-state）

- **所有者**：`features/host-status.js`（`HOST_MACHINE` + 模块内 `hostState` 单一真源）
- **状态**：`unknown`（初始，绝不能默认渲染成在线 —— 半死 host 会静默吞数据）/ `online` / `offline` / `starting`
- **转移表**（事件 `ONLINE` / `OFFLINE` / `STARTING`，自环合法）：

| | ONLINE | OFFLINE | STARTING |
|---|---|---|---|
| unknown | online | offline | starting |
| online | online | offline | starting |
| offline | — | offline | starting |
| starting | online | offline | — |

- **事件来源**：`checkHostHealth`（任何状态都可能 ONLINE/OFFLINE —— host 可被外部杀掉/拉起，UI 无条件跟随）、`startHost`（STARTING；状态灯点击不判当前状态，所以 online 也允许 STARTING）
- **不变量**：`setHostStatus` 对外签名不变（传状态名）；渲染只有 `renderHostStatus` 一个 DOM 写入口；`withBusy('host.start')` 防重入；模块加载即 `assertMachine` 自检
- **观测点**：`#btn-host-status[data-host-state]`；`getHostState()`

### 13. 同步桥 —— ➖ 只加观测，不改转移（P5）

- **所有者**：`state/sync-bridge.js`（闭包内 `lastSig` + `repo.getWriteSeq()` 守卫；**本机最敏感的一台**，陈旧响应必须丢弃）
- **状态**：`idle`（首次 pull 前）/ `syncing`（一轮 fetch 在途）/ `baseline`（基线已建立、真源与 host 一致的稳态）/ `offline`（host 不可达：pull 已回退缓存 / tick 保留当前真源）
- **事件/触发**：`pullFromHost()`（启动 pull）、`startHostSync` 的 tick（20s 轮询：内容签名去重，签名未变不通知；首轮只建基线不通知）
- **不变量**：`writeSeq` 守卫语义零改动 —— 请求在途期间发生过本地写入，本次响应就是陈旧快照，不能覆盖真源；`getSyncState()` 是纯只读快照，不参与任何判定
- **观测点**：`getSyncState()`

### 14. Milkdown 加载 —— ➖ 保持现状

- **所有者**：`views/milkdown-mount.js`（`bundlePromise` / `bundleFailed` / `warned` + 实例池 `active`）
- **状态**：`idle` → `loading` → `ready` / `failed`（终态，失败后不再重试，避免每次展开都等一次超时）；实例池另有 LRU 淘汰（`MAX_MOUNTED = 2`）
- **不变量**：重渲染前必须 `releaseAll()`（DOM 一起被扔掉，不销毁就是泄漏）；降级到 `shared/md-lite.js`，视图渲染不因 Milkdown 不可用而失败
- **观测点**：`mountedCount()`；降级时 DOM 是 `.md-lite`（而非 Milkdown 的 prose 结构）

### 15. 一次性守卫 —— ➖ 保持现状（持久化设计正确，不迁移）

- **所有者**：`shared/reminders.js`（`journal.reminded`：{day, ids[]}，跨 SW 重启不重复提醒）+ `features/prop-llm.js`（`ai.inferCache` LRU，存 storage）
- **状态**：per-key 布尔（已提醒过 / 已缓存过）+ LRU 容量淘汰
- **不变量**：守卫值必须持久化（不能靠内存 —— SW 会休眠重启）；只在「开始时间落入刚刚过去的这一分钟」提醒一次
- **观测点**：storage 键 `journal.reminded` / `ai.inferCache`

---

## 四、联动规则（半台机器）

### 进度 ↔ 状态（onEditorProgressChange / onEditorStatusChange）

- **所有者**：`features/card-editor.js`（无独立状态，是两条联动规则）
- **规则**：状态胶囊选 `done` ⇒ 进度写 100；选 `none` 且进度 100 ⇒ 进度清 0；进度拖到 ≥100 ⇒ 状态 `done`；从 100 回退 ⇒ 状态 `doing`（>0）或 `todo`（=0）
- **不变量**：保存时 `status === 'done'` 强制 `progress = 100`（`doSaveEditor`）；卡片完成态判定一律 `status === 'done'`
- **不改行为**：只登记，不迁移。改这两条规则前先读 `card-editor.js` 内的联动函数。

---

## 新增状态时的检查单

1. 先查这张表：状态归谁？是已有机器的事件，还是真的新机器？
2. 视图可变状态 → `state/view-state.js` 的 `vs`（不要新建模块级 `let`）。
3. 浮层 → `pushLayer` 一行登记（Esc/外点/z 阶梯自动正确）。
4. 拖拽类交互 → `beginGesture`/`endGesture` 或 `bindPointerDrag`（body 标志唯一写者）。
5. 写操作防重入 → `withBusy(key, fn)`。
6. 转移表复杂的机器 → `shared/fsm.js` 定义 + 关键 DOM 节点暴露 `data-state` 属性。
7. 登记进本表（一节：所有者 / 状态 / 事件 / 不变量 / 观测点 / 迁移状态）。
