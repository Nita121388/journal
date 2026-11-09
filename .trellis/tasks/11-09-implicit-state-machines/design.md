# Design — 隐式状态机收敛

## 0. 总原则

- **行为等价优先**：每台机器迁移前后 DOM 表现逐项一致（hidden class、aria、body class/data-attr、焦点）。这是「不破坏现有功能」的可验证定义。
- **原语小而可测**：`fsm` 纯函数进 `shared/`；`layer-stack` / `busy` 是 `features/` 模块（可碰 DOM）；`gesture` 是 `views/` 模块。
- **并行期双保险**：layer-stack 先与旧链共存（两边都关浮层 = 幂等），全量回归绿了再删旧链，减小一步的风险面。

## 1. `shared/fsm.js`（纯函数）

```js
defineMachine({ id, initial, states: { s: { EVENT: 's2' | null } } })
transition(m, event) -> { state, changed, from }   // 事件未定义 → {changed:false} + console.debug
currentState(m)                                   // 供可观测性（存放在模块外，由调用方持有）
```

- 状态值恒为字符串；`null` 目标 = 显式自环（无操作，合法）。
- 非法转移**不抛**（UI 永不因状态库崩），dev 期 `console.debug` 留痕。
- 单测：合法转移 / 非法返回原态 / 事件名打错有 debug 不抛。

## 2. `features/layer-stack.js`（浮层唯一所有者）

- `pushLayer({ id, el, close, onKeydown? })` → 栈顶；`popLayer(id?)`；`layers()`（只读快照）。
- 统一语义（迁移后全部浮层走这里）：
  - **Esc**：`document` capture keydown，只调栈顶的 `close`，`stopPropagation`（消灭 bind-editor.js:35-58 手写优先级链）。
  - **外点**：mousedown 在 `el` 外 → 关闭（anchor 元素可作为 `ignore` 传入，兼容「点触发器重开」语义）。
- 每层自带 `zIndex` 阶梯常量表（沿用现有 100/120/130/140/300），从 CSS 注释里的 ladder 抄成单一来源，导出给样式对齐用。
- 迁移对象（P2）：appDialog、卡片编辑器 overlay、模板构建器 overlay、tpl-prop overlay、字段选择浮层 ×2、emoji picker、右键菜单、select 下拉。**每层的 close 回调直接复用现有 closeX 函数**（不重写关闭逻辑，只统一派发）。
- 注意 dialog.js 现有 Esc 是自己 capture 抢先 —— 迁移后由栈统一派发，dialog 的 onKey 删除（避免双关）。
- app.js 拖拽跳过渲染逻辑不受影响（P4 才动）。

## 3. `views/gesture.js`（手势内核）

- `bindDragGesture(el, { onStart, onMove, onEnd, thresholdPx = 4, bodyFlag })`：
  - `press → drag(过阈值) → commit(pointerup) | cancel(pointercancel/leave 视需要)`。
  - 内部统一 `suppressClick`（capture 一次 click）；统一 `document.body.dataset.gesture`（替代 `is-dragging`/`is-resizing` 两个 class；**P4 迁移期同时写旧 class 保 CSS 兼容**，最后一步删）。
  - pointerup/cancel 兜底清标志（自愈：哪怕回调抛错，finally 清）。
- 迁移对象：timeline-card move、timeline-card resize、range-select、pool DnD（HTML5 DnD 保留原生事件，只收编 `is-dragging`/suppressClick 语义）、template-rows 排序拖拽。
- **range-select 例外**：它的公共 API（`bindRangeSelect` 签名）保持不变，内部换内核；两个调用方（timeline.js / week.js）零改动。
- `app.js:50` 改读 `document.body.dataset.gesture`（迁移期兼容读旧 class，最后删）。

## 4. `features/busy.js` → `withBusy(key, fn)`

- 模块内 `Map<string, Promise>`；in-flight 时直接返回进行中的 promise（同 key 幂等，不加队列）。
- `isBusy(key)` 供按钮 disabled / 文案「保存中…」。
- P1 接入点：
  - `saveEditor`：入口 `return withBusy('editor.save', doSave)`；保存中 `editorSave.disabled = true` + 文案「保存中…」（finally 复原）。**修缺陷 1**。
  - `startHost`：`withBusy('host.start', ...)`（替代裸 `btn.disabled`，双保险保留 disabled）。
- 单测：并发两次调用只执行一次 fn；fn reject 后 key 释放、下次可再执行。

## 5. panels-open 收口（P3，修缺陷 2）

- bind-shell.js：`setPanels(open)` 内统一 `prefSet('journal.panelsOpen', open?'1':'0')`（Esc / 点 board / 点按钮 / 初始化全部过这一条路径）。改动 ~3 行，无新原语。

## 6. host 状态机 + 同步桥（P5）

- host-status.js：`HOST_MACHINE = defineMachine({...})`，状态 `unknown/online/offline/starting`；`setHostStatus` 改为 `sendHostEvent('ONLINE'|...)` 后渲染。btn 加 `data-host-state`（dev-loop 断言点）。行为等价：类名/文案/disabled 逻辑原样搬。
- sync-bridge.js：**只加观测不改行为**——`writeSeq` 守卫与 lastSig 逻辑不动，导出 `getSyncState()`（idle/first-baseline/syncing…）供 dev-loop/console.debug。避免动这台最敏感的机器。

## 7. `docs/state-machines.md`（登记表）

每台机器一节：所有者模块 / 状态 / 事件 / 不变量 / DOM 观测点 / 迁移状态（✅ 已收编 / ➖ 保持现状）。15 台 + 1 联动规则全登记；未迁移的也登记（登记 ≠ 迁移）。

## 8. 验证策略（每 P 通用）

```
cd extension && npx vitest run          # 全量单测
npm run lint                            # 根 eslint（含 dev-loop）
node dev-loop/dev-loop.mjs --scenario smoke --width 320,400,500
node dev-loop/dev-loop.mjs --scenario editor --width 320,400,500
node dev-loop/dev-loop.mjs --scenario select --width 320,400
```

- 每个 P 一个 commit（`feat/refactor(fsm): P1 ...`），可独立 revert。
- 最终 `git push origin dev/local`。

## 9. 风险与回滚

| 风险 | 缓解 |
|---|---|
| layer-stack 双派发导致浮层关两次 | close 幂等（现有 closeX 全部幂等，实测过）|
| dialog Esc capture 冲突 | P2 迁移 dialog 时删其内部 onKey，只留栈派发 |
| 手势阈值差异 | 原阈值逐个抄进配置（move 4px / range 3px），不改数值 |
| app.js 跳过渲染漏判 | 迁移期 data-gesture 与旧 class 同写同读，最后一 P 删旧 |
| dev-loop 场景对旧 DOM 细节有断言 | 每步跑全量场景，断言失败即回滚该步 |
